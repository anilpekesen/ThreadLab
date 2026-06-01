import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { uploadToR2 } from "~/lib/r2.server";
import { randomBytes } from "node:crypto";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const FLUX_MODEL = "wavespeed-ai/flux-dev-ultra-fast";
const BG_MODEL = "wavespeed-ai/image-background-remover";
const POLL_MAX_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;

export function buildPrintPrompt(userPrompt: string): string {
  return [
    userPrompt.trim(),
    "t-shirt graphic design",
    "vector illustration style",
    "bold clean outlines",
    "solid vibrant colors",
    "pure white background",
    "high contrast",
    "centered composition",
    "isolated subject on white",
    "suitable for DTF screen printing",
    "professional graphic design quality",
    "sharp crisp edges",
    "no gradients",
  ].join(", ");
}

async function pollJob(apiKey: string, jobId: string): Promise<string[]> {
  const deadline = Date.now() + POLL_MAX_MS;
  let status = "pending";
  let outputs: string[] = [];

  while (status !== "completed" && status !== "failed" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${WAVESPEED_BASE}/predictions/${jobId}`, {
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

// Adım 1: Flux ile görsel üret → WaveSpeed CDN URL döner
async function generateWithFlux(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${WAVESPEED_BASE}/${FLUX_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      width: 1024,
      height: 1024,
      num_inference_steps: 8,
      guidance_scale: 3.5,
      num_outputs: 1,
      seed: -1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Flux başlatılamadı (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (body.code !== 200) throw new Error(`Flux hata kodu: ${body.code}`);

  const job = body.data;
  if (job.status === "completed" && job.outputs?.length) return job.outputs[0];
  const outputs = await pollJob(apiKey, job.id);
  return outputs[0];
}

// Adım 2: Arka planı kaldır (sync mode) → şeffaf PNG URL döner
async function removeBackground(apiKey: string, imageUrl: string): Promise<string> {
  // Görseli indirip base64 yap (WaveSpeed sync mode için)
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Görsel indirilemedi (${imgRes.status})`);
  const bytes = await imgRes.arrayBuffer();
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  const b64 = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

  const res = await fetch(`${WAVESPEED_BASE}/${BG_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: b64, enable_sync_mode: true }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`BG removal başlatılamadı (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (body.code !== 200) throw new Error(`BG removal hata kodu: ${body.code}`);

  const job = body.data;
  if (job.status === "completed" && job.outputs?.length) return job.outputs[0];
  const outputs = await pollJob(apiKey, job.id);
  return outputs[0];
}

export async function handleAiImageGeneration(request: Request, shop: string): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let userPrompt = "";
  try {
    const body = await request.json() as { prompt?: string };
    userPrompt = String(body.prompt ?? "").trim();
  } catch {
    return json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  if (!userPrompt) return json({ error: "Prompt boş olamaz" }, { status: 400 });

  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(shop),
  ]);
  const apiKey = (shopSettings.wavespeedApiKey || process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();

  if (!apiKey) {
    return json({ error: "Yapay zeka servisi yapılandırılmamış." }, { status: 503 });
  }

  const enhancedPrompt = buildPrintPrompt(userPrompt);

  try {
    // Adım 1: Görsel üret
    const rawUrl = await generateWithFlux(apiKey, enhancedPrompt);

    // Adım 2: Arka planı kaldır → şeffaf PNG
    let transparentUrl: string;
    try {
      transparentUrl = await removeBackground(apiKey, rawUrl);
    } catch (bgErr) {
      console.warn("[ai-generate] BG removal failed, using raw image:", bgErr);
      transparentUrl = rawUrl; // BG kaldırma başarısız olursa ham görseli kullan
    }

    // Adım 3: R2'ye şeffaf PNG olarak yükle
    let finalUrl: string;
    try {
      const pngRes = await fetch(transparentUrl);
      if (!pngRes.ok) throw new Error(`PNG indirilemedi (${pngRes.status})`);
      const pngBuffer = Buffer.from(await pngRes.arrayBuffer());
      const filename = `ai-gen/ai-${randomBytes(8).toString("hex")}.png`;
      finalUrl = await uploadToR2(pngBuffer, filename, "image/png");
    } catch (r2Err) {
      console.warn("[ai-generate] R2 upload failed, using WaveSpeed URL:", r2Err);
      finalUrl = transparentUrl; // R2 başarısız → WaveSpeed CDN URL kullan (birkaç saatliğine erişilebilir)
    }

    return json({ url: finalUrl, enhancedPrompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[ai-generate]", message);
    return json({ error: `Görsel oluşturulamadı: ${message}` }, { status: 500 });
  }
}
