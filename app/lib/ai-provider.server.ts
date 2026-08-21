import sharp from "sharp";
import { AI_PROVIDERS, type AiTemplateConfig } from "~/lib/ai-styles";

/**
 * Görsel düzenleme sağlayıcıları için tek giriş noktası.
 *
 * Çağıran taraf hangi sağlayıcının kullanıldığını bilmez; şablonun `ai_config`
 * kaydı belirler. Model kimlikleri `ai-styles.ts` kataloğundan gelir, buraya
 * gömülü değildir.
 */

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const POLL_MAX_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;
/** Cloudflare girdi görsellerini 512x512'den küçük istiyor */
const CF_MAX_INPUT = 504;

export class AiProviderError extends Error {
  /** true ise sorun fotoğrafta/promptta; tekrar denemek düzeltmez */
  readonly rejected: boolean;
  constructor(message: string, rejected = false) {
    super(message);
    this.name = "AiProviderError";
    this.rejected = rejected;
  }
}

// ── WaveSpeed ───────────────────────────────────────────────────────────────

async function pollWaveSpeed(apiKey: string, jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${WAVESPEED_BASE}/predictions/${jobId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const data = await res.json() as { data: { status: string; outputs: string[]; error?: string } };
    if (data.data.status === "failed") {
      const detail = data.data.error ?? "";
      // Filtre reddi tekrar denemekle düzelmez; çağıran yedeğe geçebilsin
      throw new AiProviderError(
        `WaveSpeed reddetti: ${detail || "sebep bildirilmedi"}`,
        /flag|sensitive|nsfw|policy/i.test(detail),
      );
    }
    const out = data.data.outputs?.[0];
    if (out) return out;
  }
  throw new AiProviderError("WaveSpeed zaman aşımı");
}

async function runWaveSpeed(model: string, photoUrl: string, prompt: string): Promise<Buffer> {
  const apiKey = process.env.WAVESPEED_API_KEY?.trim();
  if (!apiKey) throw new AiProviderError("WAVESPEED_API_KEY tanımlı değil");

  const res = await fetch(`${WAVESPEED_BASE}/wavespeed-ai/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      image: photoUrl,
      prompt,
      guidance_scale: 3.5,
      num_inference_steps: 30,
      output_format: "png",
      enable_sync_mode: false,
      enable_base64_output: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await res.json().catch(() => null) as
    { code?: number; data?: { id: string; status: string; outputs: string[] } } | null;
  if (!res.ok || !body || body.code !== 200 || !body.data) {
    throw new AiProviderError(`WaveSpeed başlatılamadı (${res.status})`);
  }

  const url = body.data.status === "completed" && body.data.outputs?.[0]
    ? body.data.outputs[0]
    : await pollWaveSpeed(apiKey, body.data.id);

  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new AiProviderError(`Üretilen görsel indirilemedi (${img.status})`);
  return Buffer.from(await img.arrayBuffer());
}

// ── Cloudflare Workers AI ───────────────────────────────────────────────────

async function runCloudflare(
  model: string,
  photo: Buffer,
  prompt: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const accountId = process.env.Cloudflare_AI_Account_ID?.trim();
  const token = process.env.Cloudflare_AI_API_TOKEN?.trim();
  if (!accountId || !token) throw new AiProviderError("Cloudflare AI anahtarları tanımlı değil");

  // Girdi 512x512'den küçük olmalı — model bunu şart koşuyor
  const small = await sharp(photo).resize(CF_MAX_INPUT, CF_MAX_INPUT, { fit: "inside" }).png().toBuffer();

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(Math.min(width, 2048)));
  form.append("height", String(Math.min(height, 2048)));
  // Alan adı input_image_0..3 olmak zorunda; başka isim sessizce yok sayılır
  form.append("input_image_0", new Blob([new Uint8Array(small)], { type: "image/png" }), "in.png");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/${model}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      signal: AbortSignal.timeout(POLL_MAX_MS) },
  );

  const body = await res.json().catch(() => null) as
    { success?: boolean; result?: { image?: string }; errors?: Array<{ message?: string }> } | null;
  if (!body?.success || !body.result?.image) {
    const msg = body?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new AiProviderError(`Cloudflare reddetti: ${msg}`, /flag|sensitive|nsfw/i.test(msg));
  }
  return Buffer.from(body.result.image, "base64");
}

// ── Ortak giriş ─────────────────────────────────────────────────────────────

export interface GenerateInput {
  config: AiTemplateConfig;
  prompt: string;
  /** Ham fotoğraf; Cloudflare için doğrudan, WaveSpeed için URL gerekir */
  photo: Buffer;
  /** WaveSpeed görseli URL'den okur — çağıran R2 adresini verir */
  photoUrl: string;
}

export async function generateStyledPhoto(input: GenerateInput): Promise<Buffer> {
  const { config, prompt, photo, photoUrl } = input;
  const known = AI_PROVIDERS[config.provider]?.models.some((m) => m.id === config.model);
  if (!known) throw new AiProviderError(`Tanınmayan model: ${config.provider}/${config.model}`);

  if (config.provider === "cloudflare") {
    return runCloudflare(config.model, photo, prompt, config.canvasWidth, config.canvasHeight);
  }
  if (!photoUrl) throw new AiProviderError("WaveSpeed için fotoğrafın genel adresi gerekli");
  return runWaveSpeed(config.model, photoUrl, prompt);
}
