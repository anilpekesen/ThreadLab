import { json } from "@remix-run/node";
import { findConfigForStorefront } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";

const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";

function getFileName(file: File) {
  return file.name || "design-image.png";
}

function getMimeType(file: File) {
  return file.type || "image/png";
}

export async function handlePhotoroomRemoveBackground(request: Request) {
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

  const apiKey = globalSettings.photoroomApiKey || String(config?.settings?.photoroomApiKey || "").trim();

  if (!config?.settings?.removeBg || !apiKey) {
    return json({ error: "Photoroom API key is not configured" }, { status: 400 });
  }

  const outbound = new FormData();
  outbound.append(
    "image_file",
    new Blob([await file.arrayBuffer()], { type: getMimeType(file) }),
    getFileName(file),
  );
  outbound.append("format", "png");
  outbound.append("channels", "rgba");
  outbound.append("size", "full");

  const response = await fetch(PHOTOROOM_SEGMENT_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: outbound,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    return json(
      { error: "Photoroom background removal failed", detail: message.slice(0, 500) },
      { status: response.status },
    );
  }

  const result = await response.arrayBuffer();
  return new Response(result, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") || "image/png",
    },
  });
}
