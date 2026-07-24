import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { checkAndIncrementBgRemoval } from "~/models/bg-removal-usage.server";
import { checkAndIncrementCustomerBg } from "~/models/customer-bg-quota.server";
import { getTestStoreLimits } from "~/models/test-store-limits.server";
import { checkAndIncrementIpQuota } from "~/models/ip-quota.server";
import { trackAnalyticsEvent } from "~/models/analytics.server";
import { cleanupCutoutEdges } from "~/lib/image-matting.server";

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

  const apiKey = (shopSettings.wavespeedApiKey || process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();
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
  const b64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";
  const imageDataUrl = `data:${mimeType};base64,${b64}`;

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
  const imageBytes = await cleanupCutoutEdges(rawBytes).catch((err) => {
    console.error("[remove-bg] cleanupCutoutEdges failed, ham çıktı kullanılıyor:", err);
    return rawBytes;
  });

  trackAnalyticsEvent({
    shop,
    eventType: "background_removed",
    productId: String(form.get("productId") || form.get("handle") || ""),
    sessionId,
    metadata: {
      filename: file.name,
      mimeType,
    },
  }).catch((err) => console.error("[analytics] background_removed failed:", err));

  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "image/png",
  };
  if (quotaRemaining !== null) {
    headers["X-BG-Quota-Remaining"] = String(quotaRemaining);
  }

  return new Response(new Uint8Array(imageBytes), { headers });
}
