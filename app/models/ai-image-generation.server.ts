import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { checkAndIncrementAiGeneration } from "~/models/ai-generation-usage.server";
import { checkAndIncrementCustomerAi } from "~/models/customer-ai-quota.server";
import { uploadToR2 } from "~/lib/r2.server";
import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getUploadsDir } from "~/lib/storage.server";
import { checkAndIncrementIpQuota } from "~/models/ip-quota.server";
import { logAiPrompt } from "~/models/ai-prompt-logs.server";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const IMAGE_MODEL = "wavespeed-ai/z-image/turbo";
const PROMPT_OPTIMIZER_MODEL = "wavespeed-ai/prompt-optimizer";
const POLL_MAX_MS = 42_000;
const POLL_INTERVAL_MS = 1_200;

function buildConceptHints(prompt: string): string[] {
  const p = prompt.toLocaleLowerCase("tr-TR");
  const hints = new Set<string>();

  if (/(turk|türk|turkish flag|bayrak|hilal|yildiz|yıldız)/.test(p)) {
    hints.add("Turkish flag crescent and star used as core emblem elements");
  }
  if (/(kartal|eagle)/.test(p)) {
    hints.add("powerful eagle mascot with fierce forward energy");
  }
  if (/(ic ice|iç içe|birles|birleş|merged|entwined|fused)/.test(p)) {
    hints.add("requested symbols fused into one single integrated emblem, not separate floating objects");
  }
  if (/(amblem|emblem|logo|crest|badge|arma)/.test(p)) {
    hints.add("badge or crest composition with strong centered hierarchy");
  }
  if (/(heyecan|enerji|power|guclu|güçlü|dramatic|aggressive)/.test(p)) {
    hints.add("high-adrenaline motion, victory mood, emotionally charged impact");
  }
  if (/(streetwear|sokak giyimi|urban)/.test(p)) {
    hints.add("premium streetwear graphic treatment for apparel");
  }

  return [...hints];
}

export function buildPrintPrompt(userPrompt: string, styleHint?: string): string {
  const conceptHints = buildConceptHints(userPrompt);
  return [
    `Primary concept: ${userPrompt.trim()}`,
    styleHint ? `style direction: ${styleHint}` : "",
    ...conceptHints,
    "create a print-ready t-shirt graphic, not a photo, not a mockup",
    "single strong central composition",
    "premium apparel artwork, streetwear emblem / poster graphic energy",
    "clear focal subject with readable silhouette",
    "integrate requested symbols into one coherent design",
    "subject should fill most of the canvas",
    "one dominant subject, one visual story, no clutter",
    "bold clean outlines",
    "high contrast",
    "limited strong color palette",
    "sharp crisp edges",
    "vector-like illustration quality",
    "isolated on pure white background",
    "no scenery, no room, no frame, no border",
    "no text unless explicitly requested",
    "no collage, no multiple disconnected icons, no stock illustration look",
    "no photorealistic animal photo, no waving flag scene, no background environment",
    "suitable for DTF and screen print",
    "professional apparel graphic design",
  ].filter(Boolean).join(", ");
}

async function pollJob(apiKey: string, jobId: string, maxMs = POLL_MAX_MS, intervalMs = POLL_INTERVAL_MS): Promise<string[]> {
  const deadline = Date.now() + maxMs;
  let status = "pending";
  let outputs: string[] = [];

  while (status !== "completed" && status !== "failed" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const res = await fetch(`${WAVESPEED_BASE}/predictions/${jobId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json() as { data: { id: string; status: string; outputs: string[] } };
      status = data.data.status;
      outputs = data.data.outputs ?? [];
    }
  }

  if (status !== "completed" || !outputs.length) {
    throw new Error("İş tamamlanamadı veya zaman aşımına uğradı");
  }
  return outputs;
}

async function optimizePrompt(apiKey: string, userPrompt: string): Promise<string> {
  const res = await fetch(`${WAVESPEED_BASE}/${PROMPT_OPTIMIZER_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: userPrompt }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Prompt optimizer failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (body.code !== 200) throw new Error(`Optimizer error code: ${body.code}`);

  const job = body.data;
  if (job.status === "completed" && job.outputs?.length) return job.outputs[0];
  const outputs = await pollJob(apiKey, job.id, 20_000, 800);
  return outputs[0];
}

async function generateImage(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${WAVESPEED_BASE}/${IMAGE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      aspect_ratio: "1:1",
      output_format: "png",
      enable_sync_mode: false,
      enable_base64_output: false,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Model baslatilamadi (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (body.code !== 200) throw new Error(`Model hata kodu: ${body.code}`);

  const job = body.data;
  if (job.status === "completed" && job.outputs?.length) return job.outputs[0];
  const outputs = await pollJob(apiKey, job.id);
  return outputs[0];
}

async function persistRemoteImage(imageUrl: string, requestUrl: string, prefix: string): Promise<string> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Gorsel indirilemedi (${imageRes.status})`);
  const contentType = (imageRes.headers.get("content-type") || "image/png").split(";")[0].trim();
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  try {
    return await uploadToR2(buffer, ext, prefix);
  } catch (r2Err) {
    console.warn("[ai-generate] R2 upload failed, falling back to local storage:", r2Err);
    const filename = `${prefix.replace(/[^a-z0-9/_-]/gi, "-")}-${randomBytes(8).toString("hex")}.${ext}`;
    await writeFile(path.join(getUploadsDir(), path.basename(filename)), buffer);
    const baseUrl = process.env.SHOPIFY_APP_URL || new URL(requestUrl).origin;
    return `${baseUrl}/uploads/${path.basename(filename)}`;
  }
}

export async function handleAiImageGeneration(request: Request, shop: string): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let userPrompt = "";
  let sessionId = "";
  let styleHint = "";
  try {
    const body = await request.json() as { prompt?: string; sessionId?: string; styleHint?: string };
    userPrompt = String(body.prompt ?? "").trim();
    sessionId = String(body.sessionId ?? "").trim();
    styleHint = String(body.styleHint ?? "").trim();
  } catch {
    return json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  if (!userPrompt) return json({ error: "Prompt boş olamaz" }, { status: 400 });

  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(shop),
  ]);

  // ① Shop plan + abonelik kontrolü (trial + active değil = engelle)
  const shopQuota = await checkAndIncrementAiGeneration(shop);
  if (!shopQuota.allowed) {
    const messages: Record<string, string> = {
      trial: "Yapay zeka görseli üretimi ücretsiz deneme döneminde kullanılamaz. Lütfen bir plan seçin.",
      no_subscription: "Yapay zeka görseli üretimi için aktif bir abonelik gereklidir.",
      quota_exceeded: `Bu ay için yapay zeka görsel kotanız doldu (${shopQuota.count}/${shopQuota.quota}). Bir sonraki ayda yenilenir.`,
    };
    return json({ error: messages[shopQuota.reason ?? "quota_exceeded"] ?? "İzin verilmiyor." }, { status: 429 });
  }

  // ② Müşteri session bazlı kota (sipariş vermeden max N adet)
  if (sessionId) {
    const customerLimit = shopSettings.customerAiLimit ?? 3;
    const customerQuota = await checkAndIncrementCustomerAi(shop, sessionId, customerLimit);
    if (!customerQuota.allowed) {
      // Shop kotasını geri al (henüz API çağrısı yapmadık)
      // Not: Basit yaklaşım — gerçekte decrement de eklenebilir
      return json({
        error: `Yapay zeka görsel limitinize ulaştınız (${customerQuota.count}/${customerQuota.limit}). Sipariş verdikten sonra limitiniz sıfırlanır.`,
        code: "customer_quota_exceeded",
      }, { status: 429 });
    }

    const ipQuota = await checkAndIncrementIpQuota(shop, "ai_generate", request, customerLimit);
    if (!ipQuota.allowed) {
      return json({
        error: "Bu ag uzerinden yapay zeka kullanim sinirina ulasildi. Lutfen daha sonra tekrar deneyin.",
        code: "ip_quota_exceeded",
      }, { status: 429 });
    }
  }

  const apiKey = (shopSettings.wavespeedApiKey || process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();

  if (!apiKey) {
    return json({ error: "Yapay zeka servisi yapılandırılmamış." }, { status: 503 });
  }

  let enhancedPrompt: string;
  try {
    const optimized = await optimizePrompt(apiKey, userPrompt);
    // Optimizer çıktısına baskı kritik kısıtlamalarını ekle
    enhancedPrompt = [
      optimized,
      styleHint ? `style: ${styleHint}` : "",
      "isolated on pure white background",
      "no scenery, no background environment, no frame",
      "suitable for DTF and screen printing",
    ].filter(Boolean).join(", ");
    console.log(`[ai-generate] optimized prompt: ${optimized.slice(0, 120)}...`);
  } catch (optErr) {
    console.warn("[ai-generate] prompt optimizer failed, using manual build:", optErr instanceof Error ? optErr.message : optErr);
    enhancedPrompt = buildPrintPrompt(userPrompt, styleHint);
  }

  try {
    // Timeout'u dusurmek icin otomatik arka plan kaldirma bu akistan cikartildi.
    // Gerekirse kullanici sonradan normal remove-background akisini kullanabilir.
    const rawUrl = await generateImage(apiKey, enhancedPrompt);
    const finalUrl = await persistRemoteImage(rawUrl, request.url, "ai-gen");

    logAiPrompt({ shop, userPrompt, finalPrompt: enhancedPrompt, resultUrl: finalUrl, success: true })
      .catch((e) => console.error("[ai-log]", e));

    // Müşteri kalan kotasını hesapla (response'a ekle)
    let customerRemaining: number | null = null;
    if (sessionId) {
      const countRes = await query<{ count: number }>(
        "SELECT count FROM customer_ai_quota WHERE shop = $1 AND session_id = $2",
        [shop, sessionId],
      ).catch(() => null);
      const count = countRes?.rows[0]?.count ?? 0;
      const limit = shopSettings.customerAiLimit ?? 3;
      customerRemaining = Math.max(0, limit - count);
    }

    return json({ url: finalUrl, enhancedPrompt, shopRemaining: shopQuota.quota - shopQuota.count, customerRemaining });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[ai-generate]", message);
    logAiPrompt({ shop, userPrompt, finalPrompt: enhancedPrompt, success: false, errorMsg: message })
      .catch((e) => console.error("[ai-log]", e));
    return json({ error: `Görsel oluşturulamadı: ${message}` }, { status: 500 });
  }
}
