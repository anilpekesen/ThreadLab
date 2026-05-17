import { json } from "@remix-run/node";
import { findConfigForStorefront } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { checkAndIncrementBgRemoval } from "~/models/bg-removal-usage.server";

// WaveSpeed API — async job pattern
const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const WAVESPEED_MODEL = "wavespeed-ai/bria-rmbg-2.0";
const POLL_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 1_200;

interface WaveSpeedJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  outputs: string[];
  error?: string;
}

interface WaveSpeedResponse {
  code: number;
  message: string;
  data: WaveSpeedJob;
}

async function createJob(apiKey: string, imageBase64: string): Promise<WaveSpeedJob> {
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

  const json = await res.json() as WaveSpeedResponse;
  if (json.code !== 200) throw new Error(`WaveSpeed error: ${json.message}`);
  return json.data;
}

async function pollJob(apiKey: string, jobId: string): Promise<WaveSpeedJob> {
  const deadline = Date.now() + POLL_MAX_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${WAVESPEED_BASE}/predictions/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) continue;

    const body = await res.json() as WaveSpeedResponse;
    const job = body.data;

    if (job.status === "completed" || job.status === "failed") return job;
  }

  throw new Error("WaveSpeed job timed out after 30 s");
}

async function fetchOutputImage(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download WaveSpeed output (${res.status})`);
  return res.arrayBuffer();
}

export async function handleWaveSpeedRemoveBackground(
  request: Request,
  shop: string,
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const file = form.get("image_file");
  const productId = String(form.get("productId") || "");
  const handle = String(form.get("handle") || "");

  if (!(file instanceof File)) {
    return json({ error: "image_file is required" }, { status: 400 });
  }

  const [config, globalSettings] = await Promise.all([
    findConfigForStorefront(productId, handle),
    getGlobalSettings(),
  ]);

  const apiKey = globalSettings.wavespeedApiKey?.trim();

  if (!config?.settings?.removeBg || !apiKey) {
    return json({ error: "WaveSpeed API key is not configured" }, { status: 400 });
  }

  // Quota check — deducts from plan
  const quota = await checkAndIncrementBgRemoval(shop);
  if (!quota.allowed) {
    return json(
      {
        error: "Aylık arka plan kaldırma kotanız doldu",
        quota: quota.quota,
        count: quota.count,
        plan: quota.planKey,
      },
      { status: 429 },
    );
  }

  // Convert file to base64 data URL
  const bytes = await file.arrayBuffer();
  const b64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";
  const imageDataUrl = `data:${mimeType};base64,${b64}`;

  let job = await createJob(apiKey, imageDataUrl);

  // If not already completed, poll
  if (job.status !== "completed" && job.status !== "failed") {
    job = await pollJob(apiKey, job.id);
  }

  if (job.status === "failed" || !job.outputs?.length) {
    return json(
      { error: "WaveSpeed background removal failed", detail: job.error ?? "" },
      { status: 500 },
    );
  }

  const imageBytes = await fetchOutputImage(job.outputs[0]);

  return new Response(imageBytes, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    },
  });
}
