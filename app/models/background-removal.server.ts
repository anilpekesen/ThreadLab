import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { checkAndIncrementBgRemoval } from "~/models/bg-removal-usage.server";
import { checkAndIncrementCustomerBg } from "~/models/customer-bg-quota.server";
import { getTestStoreLimits } from "~/models/test-store-limits.server";
import { checkAndIncrementIpQuota } from "~/models/ip-quota.server";
import { trackAnalyticsEvent } from "~/models/analytics.server";
import sharp from "sharp";
import { hasMeaningfulTransparency, rebuildCutoutAtSourceResolution } from "~/lib/image-matting.server";
import { tryFlatArtKeying } from "~/lib/flat-art-key.server";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const WAVESPEED_MODEL = "ideogram-ai/remove-background";

interface WaveSpeedJob {
  id: string;
  status: "created" | "pending" | "processing" | "completed" | "failed";
  outputs: string[];
  error?: string;
  urls?: { get: string };
}

interface WaveSpeedResponse {
  code: number;
  message: string;
  data: WaveSpeedJob;
}

function detectLang(request: Request): "tr" | "en" {
  const accept = request.headers.get("Accept-Language") ?? "";
  if (accept.toLowerCase().startsWith("tr")) return "tr";
  if (accept.toLowerCase().includes("tr")) return "tr";
  return "en";
}

async function removeBackground(apiKey: string, imageBase64: string): Promise<string> {
  const res = await fetch(`${WAVESPEED_BASE}/${WAVESPEED_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WaveSpeed request failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  const body = await res.json() as WaveSpeedResponse;
  if (body.code !== 200) throw new Error(`WaveSpeed error: ${body.message}`);

  const resultUrl = body.data.urls?.get ?? `${WAVESPEED_BASE}/predictions/${body.data.id}/result`;
  const job = await pollWaveSpeedResult(apiKey, resultUrl);

  if (job.status === "failed" || !job.outputs?.length) {
    throw new Error(`WaveSpeed job failed: ${job.error ?? "no output"}`);
  }

  return job.outputs[0];
}

async function pollWaveSpeedResult(apiKey: string, resultUrl: string): Promise<WaveSpeedJob> {
  const maxAttempts = 30;
  const intervalMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(resultUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`WaveSpeed poll failed (${res.status}): ${detail.slice(0, 400)}`);
    }

    const body = await res.json() as WaveSpeedResponse;
    if (body.code !== 200) throw new Error(`WaveSpeed error: ${body.message}`);

    const job = body.data;
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
  }

  throw new Error("WaveSpeed job timed out");
}

export async function handleWaveSpeedRemoveBackground(
  request: Request,
  shop: string,
  options?: { sessionId?: string; customerBgLimit?: number },
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const lang = detectLang(request);
  const form = await request.formData();
  const file = form.get("image_file");

  if (!(file instanceof File)) {
    return json({ error: "image_file is required" }, { status: 400 });
  }

  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(shop),
  ]);

  // Sunucu ortam anahtarı operasyon ekibi tarafından döndürülen kanonik
  // anahtardır. Veritabanında kalmış eski mağaza anahtarı bunu ezmemeli.
  const apiKey = (process.env.WAVESPEED_API_KEY || shopSettings.wavespeedApiKey || globalSettings.wavespeedApiKey)?.trim();
  if (!apiKey) {
    return json({ error: "WaveSpeed API key is not configured" }, { status: 400 });
  }

  // Per-customer session quota check
  const sessionId = options?.sessionId ?? String(form.get("session_id") || "");
  let quotaRemaining: number | null = null;

  if (sessionId) {
    const testLimits = getTestStoreLimits(shop);
    const limit = testLimits?.bgSessionLimit ?? options?.customerBgLimit ?? shopSettings.customerBgLimit;
    const customerQuota = await checkAndIncrementCustomerBg(shop, sessionId, limit);

    if (!customerQuota.allowed) {
      const errTr = `Arka plan kaldırma limitinize ulaştınız (${customerQuota.count}/${customerQuota.limit}). Sipariş verdikten sonra limitiniz sıfırlanır.`;
      const errEn = `You've reached your background removal limit (${customerQuota.count}/${customerQuota.limit}). Your limit will reset after placing an order.`;
      return json(
        {
          error: lang === "tr" ? errTr : errEn,
          code: "customer_quota_exceeded",
          count: customerQuota.count,
          limit: customerQuota.limit,
        },
        { status: 429 },
      );
    }
    const ipQuota = await checkAndIncrementIpQuota(shop, "bg_remove", request, limit);
    if (!ipQuota.allowed) {
      const errTr = "Bu ag uzerinden arka plan kaldirma sinirina ulasildi. Lutfen daha sonra tekrar deneyin.";
      const errEn = "This network has reached the background removal limit. Please try again later.";
      return json(
        {
          error: lang === "tr" ? errTr : errEn,
          code: "ip_quota_exceeded",
        },
        { status: 429 },
      );
    }
    quotaRemaining = customerQuota.remaining;
  }

  const quota = await checkAndIncrementBgRemoval(shop);
  if (!quota.allowed) {
    const errTr = "Aylık arka plan kaldırma kotanız doldu";
    const errEn = "Monthly background removal quota exceeded";
    return json(
      {
        error: lang === "tr" ? errTr : errEn,
        quota: quota.quota,
        count: quota.count,
        plan: quota.planKey,
      },
      { status: 429 },
    );
  }

  const bytes = await file.arrayBuffer();
  const sourceBytes = Buffer.from(bytes);
  const mimeType = file.type || "image/png";

  // Düz zeminli yazı/çizim tasarımlarında AI segmentasyonu harflerin içindeki
  // boşlukları dolduruyor ve ince çizgileri aşındırıyor. Bu görselleri yerel
  // renk anahtarlamayla işliyoruz: harf gözleri doğru deliniyor, kenarda hale
  // kalmıyor, üstelik anında ve API çağrısı olmadan.
  let imageBytes: Buffer | null = null;
  let method: "already-transparent" | "flat-art-key" | "ai" | "ai-original-resolution" = "ai";
  let sourceSize = "";
  let modelSize = "";

  const alreadyTransparent = await hasMeaningfulTransparency(sourceBytes).catch(() => false);
  const flatArt = alreadyTransparent ? null : await tryFlatArtKeying(sourceBytes).catch((err) => {
    console.error("[remove-bg] flat-art anahtarlama denemesi başarısız:", err);
    return null;
  });

  if (alreadyTransparent) {
    const meta = await sharp(sourceBytes, { limitInputPixels: false }).metadata();
    sourceSize = `${meta.width ?? 0}x${meta.height ?? 0}`;
    imageBytes = await sharp(sourceBytes, { limitInputPixels: false })
      .rotate()
      .png({ compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();
    method = "already-transparent";
  } else if (flatArt) {
    imageBytes = flatArt.buffer;
    method = "flat-art-key";
    const meta = await sharp(sourceBytes, { limitInputPixels: false }).metadata();
    sourceSize = `${meta.width ?? 0}x${meta.height ?? 0}`;
    console.log(
      `[remove-bg] flat-art keying: bg=${flatArt.analysis.bg.join(",")} ` +
      `uniformity=${flatArt.analysis.uniformity.toFixed(3)} ` +
      `ambiguous=${(flatArt.analysis.ambiguousRatio * 100).toFixed(2)}% ` +
      `transparent=${(flatArt.transparentRatio * 100).toFixed(1)}%`,
    );
  } else {
    const imageDataUrl = `data:${mimeType};base64,${sourceBytes.toString("base64")}`;
    let outputUrl: string;
    try {
      outputUrl = await removeBackground(apiKey, imageDataUrl);
    } catch (err) {
      console.error("[remove-bg]", err);
      return json({ error: String(err) }, { status: 500 });
    }

    const imageRes = await fetch(outputUrl);
    if (!imageRes.ok) {
      return json({ error: "Could not download result image" }, { status: 502 });
    }
    const rawBytes = Buffer.from(await imageRes.arrayBuffer());
    const rebuilt = await rebuildCutoutAtSourceResolution(sourceBytes, rawBytes).catch((err) => {
      console.error("[remove-bg] high-resolution matte rebuild failed, model çıktısı kullanılıyor:", err);
      return rawBytes;
    });
    if (Buffer.isBuffer(rebuilt)) {
      imageBytes = rebuilt;
    } else {
      imageBytes = rebuilt.buffer;
      sourceSize = `${rebuilt.sourceWidth}x${rebuilt.sourceHeight}`;
      modelSize = `${rebuilt.modelWidth}x${rebuilt.modelHeight}`;
      method = rebuilt.rebuiltFromOriginal ? "ai-original-resolution" : "ai";
    }
  }

  trackAnalyticsEvent({
    shop,
    eventType: "background_removed",
    productId: String(form.get("productId") || form.get("handle") || ""),
    sessionId,
    metadata: {
      filename: file.name,
      mimeType,
      method,
      sourceSize,
      modelSize,
    },
  }).catch((err) => console.error("[analytics] background_removed failed:", err));

  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "image/png",
    "X-BG-Method": method,
  };
  if (sourceSize) headers["X-BG-Source-Size"] = sourceSize;
  if (modelSize) headers["X-BG-Model-Size"] = modelSize;
  if (quotaRemaining !== null) {
    headers["X-BG-Quota-Remaining"] = String(quotaRemaining);
  }

  return new Response(new Uint8Array(imageBytes), { headers });
}
