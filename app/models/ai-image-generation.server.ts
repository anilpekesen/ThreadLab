import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { uploadToR2 } from "~/lib/r2.server";
import { randomBytes } from "node:crypto";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const FLUX_MODEL = "wavespeed-ai/flux-dev-ultra-fast";
const POLL_MAX_MS = 90_000;
const POLL_INTERVAL_MS = 2_000;

// Kullanıcının prompt'unu baskı için optimize eder
export function buildPrintPrompt(userPrompt: string): string {
  return [
    userPrompt.trim(),
    "t-shirt graphic design",
    "vector illustration style",
    "bold clean outlines",
    "solid vibrant colors",
    "white background",
    "no gradients",
    "high contrast",
    "centered composition",
    "isolated subject",
    "suitable for DTF screen printing",
    "professional graphic design quality",
    "sharp crisp edges",
  ].join(", ");
}

async function generateImage(apiKey: string, prompt: string): Promise<Buffer> {
  const submitRes = await fetch(`${WAVESPEED_BASE}/${FLUX_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

  if (!submitRes.ok) {
    const detail = await submitRes.text().catch(() => "");
    throw new Error(`WaveSpeed Flux submit failed (${submitRes.status}): ${detail.slice(0, 300)}`);
  }

  const submitJson = await submitRes.json() as {
    code: number;
    data: { id: string; status: string; outputs: string[] };
  };
  if (submitJson.code !== 200) throw new Error(`WaveSpeed error code: ${submitJson.code}`);

  let job = submitJson.data;
  const deadline = Date.now() + POLL_MAX_MS;

  while (job.status !== "completed" && job.status !== "failed" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${WAVESPEED_BASE}/predictions/${job.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (pollRes.ok) {
      const pollJson = await pollRes.json() as { data: typeof job };
      job = pollJson.data;
    }
  }

  if (job.status !== "completed" || !job.outputs?.length) {
    throw new Error("Görsel oluşturulamadı veya zaman aşımına uğradı");
  }

  const imgRes = await fetch(job.outputs[0]);
  if (!imgRes.ok) throw new Error(`Sonuç görseli indirilemedi (${imgRes.status})`);
  return Buffer.from(await imgRes.arrayBuffer());
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

  if (!userPrompt) {
    return json({ error: "Prompt boş olamaz" }, { status: 400 });
  }

  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(shop),
  ]);
  const apiKey = (shopSettings.wavespeedApiKey || process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();

  if (!apiKey) {
    return json({ error: "Yapay zeka servisi yapılandırılmamış. Lütfen yöneticiyle iletişime geçin." }, { status: 503 });
  }

  const enhancedPrompt = buildPrintPrompt(userPrompt);

  try {
    const imageBuffer = await generateImage(apiKey, enhancedPrompt);

    // R2'ye yükle — kalıcı URL için
    const filename = `ai-gen/ai-${randomBytes(8).toString("hex")}.png`;
    let url: string;
    try {
      url = await uploadToR2(imageBuffer, filename, "image/png");
    } catch {
      // R2 başarısız olursa base64 data URL döndür
      url = `data:image/png;base64,${imageBuffer.toString("base64")}`;
    }

    return json({ url, enhancedPrompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[ai-generate]", message);
    return json({ error: `Görsel oluşturulamadı: ${message}` }, { status: 500 });
  }
}
