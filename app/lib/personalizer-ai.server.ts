const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const POLL_MAX_MS = 120_000;
const POLL_INTERVAL_MS = 3_000;

const STYLE_PROMPTS: Record<string, string> = {
  caricature:
    "Transform this person into a cartoon caricature illustration. Exaggerate facial features in a fun way. Vibrant colors, clean bold outlines, comic book style, white background. Keep the person's likeness recognizable.",
  watercolor:
    "Transform this portrait into a beautiful watercolor painting style. Soft blended colors, artistic brush strokes, slightly abstract, painterly texture. Keep the person recognizable.",
  sketch:
    "Transform this portrait into a detailed pencil sketch illustration. Hatching, cross-hatching shading, clean lines, black and white, professional artistic sketch style.",
  pop_art:
    "Transform this portrait into a bold pop art illustration. Ben-Day dots, flat bright colors, bold black outlines, Andy Warhol comic book style. High contrast.",
  none: "",
};

async function pollJob(apiKey: string, jobId: string): Promise<string> {
  const deadline = Date.now() + POLL_MAX_MS;
  let status = "pending";
  let output = "";

  while (status !== "completed" && status !== "failed" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${WAVESPEED_BASE}/predictions/${jobId}/result`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json() as { data: { id: string; status: string; outputs: string[] } };
      status = data.data.status;
      output = data.data.outputs?.[0] ?? "";
    }
  }

  if (status !== "completed" || !output) {
    throw new Error(`AI dönüşümü tamamlanamadı (status: ${status})`);
  }
  return output;
}

export async function transformPhoto(
  photoUrl: string,
  aiStyle: string,
): Promise<string> {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) throw new Error("WAVESPEED_API_KEY tanımlı değil");

  if (aiStyle === "none" || !aiStyle) return photoUrl;

  const prompt = STYLE_PROMPTS[aiStyle] ?? STYLE_PROMPTS["caricature"];

  const res = await fetch(`${WAVESPEED_BASE}/wavespeed-ai/flux-kontext-pro`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WaveSpeed img2img başlatılamadı (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (body.code !== 200) throw new Error(`WaveSpeed hata kodu: ${body.code}`);

  const job = body.data;
  if (job.status === "completed" && job.outputs?.[0]) return job.outputs[0];

  return pollJob(apiKey, job.id);
}
