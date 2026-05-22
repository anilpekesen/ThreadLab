import { json } from "@remix-run/node";
import { getGlobalSettings } from "~/models/global-settings.server";
import { checkAndIncrementBgRemoval } from "~/models/bg-removal-usage.server";
import { checkAndIncrementCustomerBg } from "~/models/customer-bg-quota.server";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const WAVESPEED_MODEL = "wavespeed-ai/image-background-remover";

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

async function removeBackground(apiKey: string, imageBase64: string): Promise<string> {
  const res = await fetch(`${WAVESPEED_BASE}/${WAVESPEED_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageBase64, enable_sync_mode: true }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WaveSpeed request failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  const body = await res.json() as WaveSpeedResponse;
  if (body.code !== 200) throw new Error(`WaveSpeed error: ${body.message}`);

  const job = body.data;
  if (job.status === "failed" || !job.outputs?.length) {
    throw new Error(`WaveSpeed job failed: ${job.error ?? "no output"}`);
  }

  return job.outputs[0];
}

export async function handleWaveSpeedRemoveBackground(
  request: Request,
  shop: string,
  options?: { sessionId?: string; customerBgLimit?: number },
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const file = form.get("image_file");

  if (!(file instanceof File)) {
    return json({ error: "image_file is required" }, { status: 400 });
  }

  const globalSettings = await getGlobalSettings();
  const apiKey = (process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();

  if (!apiKey) {
    return json({ error: "WaveSpeed API key is not configured" }, { status: 400 });
  }

  // Per-customer session quota check
  const sessionId = options?.sessionId ?? String(form.get("session_id") || "");
  if (sessionId) {
    const limit = options?.customerBgLimit ?? globalSettings.customerBgLimit ?? 5;
    const customerQuota = await checkAndIncrementCustomerBg(shop, sessionId, limit);
    if (!customerQuota.allowed) {
      return json(
        {
          error: `Arka plan kaldırma limitinize ulaştınız (${customerQuota.count}/${customerQuota.limit}). Sipariş verdikten sonra limitiniz sıfırlanır.`,
          code: "customer_quota_exceeded",
          count: customerQuota.count,
          limit: customerQuota.limit,
        },
        { status: 429 },
      );
    }
  }

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
  const imageBytes = await imageRes.arrayBuffer();

  return new Response(imageBytes, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    },
  });
}
