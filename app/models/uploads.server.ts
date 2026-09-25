import { json } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getUploadsDir } from "~/lib/storage.server";
import { newR2Key, putR2Object, uploadToR2 } from "~/lib/r2.server";
import { schedulePrintJob } from "~/lib/print-jobs.server";
import { canWriteReservation, markReservationUploaded } from "~/lib/print-reservations.server";
import { publicAppUrl } from "~/lib/app-url.server";

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
  const startedAt = performance.now();
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
  const receivedMs = performance.now() - startedAt;

  const isPrintFile = ext === "png" && (side === "front-print" || side === "back-print");

  if (isPrintFile) {
    // Ağır işlemler (glow plaka + 300 DPI bilgisi) arka planda, kalıcı kuyrukla
    // yapılır — bkz. print-jobs.server.ts
    const inputBytes = buffer.length;
    const storeStart = performance.now();
    let url: string;
    if (useR2) {
      // Sepete ekleme dosyayı beklemeden yapıldıysa adres önceden ayrılmıştır
      // (bkz. print-reservations.server.ts); yalnızca geçerli rezervasyona yaz.
      const reservation = form.get("reservation");
      let key: string;
      if (typeof reservation === "string" && reservation) {
        if (!(await canWriteReservation(reservation, side))) {
          return json({ error: "Invalid or expired reservation" }, { status: 409 });
        }
        key = reservation;
      } else {
        key = newR2Key(`uploads/${side}`, ext);
      }
      // Ham sürüm önbelleğe girmesin — birazdan işlenmiş sürüm üzerine yazılacak
      url = await putR2Object(key, buffer, ext, "no-cache");
      if (key === reservation) await markReservationUploaded(key);
      await schedulePrintJob({ storage: "r2", location: key, side });
    } else {
      const filename = `${side}-${randomBytes(12).toString("hex")}.${ext}`;
      const filePath = path.join(getUploadsDir(), filename);
      await writeFile(filePath, buffer);
      const baseUrl = publicAppUrl(new URL(request.url).origin);
      url = `${baseUrl}/uploads/${filename}`;
      await schedulePrintJob({ storage: "disk", location: filePath, side });
    }
    console.log(
      `[upload] ${side} ${(inputBytes / 1e6).toFixed(1)}MB — ` +
      `form=${receivedMs.toFixed(0)}ms ham-kayıt=${(performance.now() - storeStart).toFixed(0)}ms ` +
      `yanıt=${(performance.now() - startedAt).toFixed(0)}ms`,
    );
    return json({ url, serverMs: Math.round(performance.now() - startedAt) });
  }

  // Önizleme ve kaynak görseller küçük; optimizasyon senkron kalabilir
  // (önizleme URL'si sepette hemen gösteriliyor ve kalıcı önbelleğe giriyor).
  if (ext === "png") {
    try {
      // Yeniden sıkıştırma iyi sıkıştırılmış PNG'yi büyütebiliyor; küçük olanı sakla
      const optimized = Buffer.from(await sharp(buffer, { limitInputPixels: false }).png({ compressionLevel: 6 }).toBuffer());
      if (optimized.length < buffer.length) buffer = optimized;
    } catch { /* optimizasyon başarısız olursa orijinali kullan */ }
  }

  if (useR2) {
    const url = await uploadToR2(buffer, ext, `uploads/${side}`);
    return json({ url, serverMs: Math.round(performance.now() - startedAt) });
  }

  // Fallback: local disk
  const filename = `${side}-${randomBytes(12).toString("hex")}.${ext}`;
  const uploadDir = getUploadsDir();
  await writeFile(path.join(uploadDir, filename), buffer);
  const baseUrl = publicAppUrl(new URL(request.url).origin);
  return json({ url: `${baseUrl}/uploads/${filename}`, serverMs: Math.round(performance.now() - startedAt) });
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
