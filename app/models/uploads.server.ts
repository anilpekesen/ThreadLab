import { json } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getUploadsDir } from "~/lib/storage.server";
import { uploadToR2 } from "~/lib/r2.server";

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024; // 120MB — 300 DPI print dosyaları için
const MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const RESPONSE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function sanitizeName(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value : "design";
  return raw.replace(/[^a-z0-9_-]/gi, "") || "design";
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "size" in value &&
      "type" in value,
  );
}

const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);

export async function handleDesignerUpload(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return json({ error: "Image is too large" }, { status: 422 });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image") ?? null;
  if (!form || !isUploadedFile(image)) {
    return json({ error: "Image is required" }, { status: 422 });
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return json({ error: "Image is too large" }, { status: 422 });
  }

  const ext = MIME_TYPES[image.type];
  if (!ext) {
    return json({ error: "PNG, JPG or WEBP required" }, { status: 422 });
  }

  let buffer = Buffer.from(await image.arrayBuffer());
  const side = sanitizeName(form.get("side"));

  // Print dosyaları için PNG optimizasyonu (lossless, daha küçük dosya).
  // front/back print çıktılarında DPI metadata'sını da doğru yazıyoruz.
  if (ext === "png") {
    try {
      let pipeline = sharp(buffer, { limitInputPixels: false }).png({ compressionLevel: 6 });
      if (side === "front-print" || side === "back-print") {
        pipeline = pipeline.withMetadata({ density: 300 });
      }
      buffer = Buffer.from(await pipeline.toBuffer());
    } catch { /* optimizasyon başarısız olursa orijinali kullan */ }
  }

  if (useR2) {
    const url = await uploadToR2(buffer, ext, `uploads/${side}`);
    return json({ url });
  }

  // Fallback: local disk
  const filename = `${side}-${randomBytes(12).toString("hex")}.${ext}`;
  const uploadDir = getUploadsDir();
  await writeFile(path.join(uploadDir, filename), buffer);
  const baseUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  return json({ url: `${baseUrl}/uploads/${filename}` });
}

export function serveUploadedFile(filename: string) {
  const safeName = path.basename(filename);
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
  const filePath = path.join(getUploadsDir(), safeName);
  if (!existsSync(filePath) || !RESPONSE_TYPES[ext]) {
    return json({ error: "Not found" }, { status: 404 });
  }

  return new Response(createReadStream(filePath) as unknown as BodyInit, {
    headers: {
      "Content-Type": RESPONSE_TYPES[ext],
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
