import { writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDesignByToken, saveDesign } from "~/models/designs.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { checkAndIncrementBgRemoval } from "~/models/bg-removal-usage.server";
import { getUploadsDir } from "~/lib/storage.server";
import { uploadToR2 } from "~/lib/r2.server";

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";
const WAVESPEED_MODEL = "wavespeed-ai/image-background-remover";
const POLL_MAX_MS = 60_000;
const POLL_INTERVAL_MS = 1_500;

async function removeBackground(apiKey: string, imageUrl: string): Promise<Buffer> {
  // Fetch source image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Could not fetch image (${imgRes.status}): ${imageUrl}`);
  const bytes = await imgRes.arrayBuffer();
  const b64 = Buffer.from(bytes).toString("base64");
  const mime = imgRes.headers.get("content-type") || "image/png";
  const dataUrl = `data:${mime};base64,${b64}`;

  // Submit job
  const submitRes = await fetch(`${WAVESPEED_BASE}/${WAVESPEED_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!submitRes.ok) {
    const detail = await submitRes.text().catch(() => "");
    throw new Error(`WaveSpeed submit failed (${submitRes.status}): ${detail.slice(0, 200)}`);
  }
  const submitJson = await submitRes.json() as { code: number; data: { id: string; status: string; outputs: string[] } };
  if (submitJson.code !== 200) throw new Error(`WaveSpeed error: ${submitJson.code}`);

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
    throw new Error("WaveSpeed job failed or timed out");
  }

  const outRes = await fetch(job.outputs[0]);
  if (!outRes.ok) throw new Error(`Could not download result (${outRes.status})`);
  return Buffer.from(await outRes.arrayBuffer());
}

function isProcessableImageUrl(src: string | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("data:")) return false;       // embedded data URL — skip
  if (src.endsWith(".svg")) return false;           // SVG — no BG to remove
  if (src.includes("auto-bg-")) return false;       // already processed
  return src.startsWith("http://") || src.startsWith("https://");
}

async function saveProcessedImage(buffer: Buffer, appUrl: string): Promise<string> {
  const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);
  if (useR2) {
    return uploadToR2(buffer, "png", "uploads/auto-bg");
  }
  const filename = `auto-bg-${randomBytes(10).toString("hex")}.png`;
  const uploadsDir = getUploadsDir();
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `${appUrl}/uploads/${filename}`;
}

function replaceImageSrcs(
  designJson: unknown,
  replacements: Map<string, string>,
): unknown {
  const json = JSON.parse(JSON.stringify(designJson)) as Record<string, unknown>;

  for (const side of ["front", "back"] as const) {
    let canvas = json[side] as { objects?: Record<string, unknown>[] } | string | undefined;
    if (typeof canvas === "string") {
      try { canvas = JSON.parse(canvas) as { objects?: Record<string, unknown>[] }; } catch { continue; }
    }
    if (!canvas || typeof canvas !== "object") continue;
    const objects = (canvas as { objects?: Record<string, unknown>[] }).objects ?? [];
    for (const obj of objects) {
      if (obj.type === "image" && typeof obj.src === "string" && replacements.has(obj.src)) {
        obj.src = replacements.get(obj.src);
      }
    }
    json[side] = canvas;
  }

  return json;
}

export async function processOrderBgRemoval(shop: string, designToken: string): Promise<void> {
  if (!shop || !designToken) return;

  const design = await getDesignByToken(shop, designToken);
  if (!design?.designJson) return;

  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(shop),
  ]);
  const apiKey = (shopSettings.wavespeedApiKey || process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey)?.trim();
  if (!apiKey) {
    console.warn("[auto-bg] No WaveSpeed API key configured — skipping");
    return;
  }

  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "") ?? "";

  // Collect all unique image URLs in the design (front + back)
  const allObjects = [
    ...collectImages(design.designJson, "front"),
    ...collectImages(design.designJson, "back"),
  ];
  const uniqueUrls = [...new Set(allObjects.filter(isProcessableImageUrl))] as string[];

  if (uniqueUrls.length === 0) {
    console.log(`[auto-bg] No processable images in design ${designToken}`);
    return;
  }

  const replacements = new Map<string, string>();

  for (const url of uniqueUrls) {
    // Check + deduct quota
    const quota = await checkAndIncrementBgRemoval(shop);
    if (!quota.allowed) {
      console.warn(`[auto-bg] Quota exhausted for ${shop} — stopping after ${replacements.size} images`);
      break;
    }

    try {
      const resultBuffer = await removeBackground(apiKey, url);
      const newUrl = await saveProcessedImage(resultBuffer, appUrl);
      replacements.set(url, newUrl);
      console.log(`[auto-bg] Processed ${url} → ${newUrl}`);
    } catch (err) {
      console.error(`[auto-bg] Failed to process ${url}:`, err);
      // Continue with other images
    }
  }

  if (replacements.size === 0) return;

  // Update design JSON with new URLs and save
  const updatedJson = replaceImageSrcs(design.designJson, replacements);
  await saveDesign(shop, { ...design, designJson: updatedJson });
  console.log(`[auto-bg] Design ${designToken} updated with ${replacements.size} processed image(s)`);
}

function collectImages(designJson: unknown, side: "front" | "back"): string[] {
  try {
    const json = designJson as Record<string, unknown>;
    let canvas = json[side] as { objects?: Record<string, unknown>[] } | string | undefined;
    if (typeof canvas === "string") canvas = JSON.parse(canvas) as { objects?: Record<string, unknown>[] };
    return ((canvas as { objects?: Record<string, unknown>[] })?.objects ?? [])
      .filter((o) => o.type === "image" && typeof o.src === "string")
      .map((o) => o.src as string);
  } catch {
    return [];
  }
}
