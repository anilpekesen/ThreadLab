import { json } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getUploadsDir } from "~/lib/storage.server";
import { newR2Key, putR2Object, uploadToR2 } from "~/lib/r2.server";
import { applyGlowPlate } from "~/lib/glow-plate.server";

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

/**
 * Baskı dosyasının ağır işlemleri (glow plaka + PNG sıkıştırma) 28–38 MP'lik
 * görselde dosya başına 1,5–2,5 sn sürüyor ve müşteri sepete eklerken bunu
 * bekliyordu. Artık ham dosya hemen kaydedilip URL dönüyor; işlenmiş sürüm
 * arka planda AYNI adresin üzerine yazılıyor. Baskı dosyasını siparişten
 * önce okuyan bir akış yok, bu yüzden URL değişmeden kalması yeterli.
 *
 * Çözülmüş 38 MP RGBA görsel ~150 MB bellek tutuyor; aynı anda en fazla
 * PRINT_JOB_CONCURRENCY iş çalışsın ki yoğun anda sunucu şişmesin.
 */
const PRINT_JOB_CONCURRENCY = 2;
let activePrintJobs = 0;
const pendingPrintJobs: Array<() => Promise<void>> = [];

function enqueuePrintJob(job: () => Promise<void>) {
  pendingPrintJobs.push(job);
  drainPrintJobs();
}

function drainPrintJobs() {
  while (activePrintJobs < PRINT_JOB_CONCURRENCY && pendingPrintJobs.length > 0) {
    const job = pendingPrintJobs.shift()!;
    activePrintJobs++;
    job()
      .catch((err) => console.error("[upload] arka plan baskı işlemi başarısız:", err))
      .finally(() => {
        activePrintJobs--;
        drainPrintJobs();
      });
  }
}

async function processPrintFile(buffer: Buffer, side: string): Promise<{ buffer: Buffer; glowMs: number; sharpMs: number }> {
  let t = performance.now();
  // Işımalı tasarımlarda sanatın arkasına opak koyu plaka koy. Asıl karar
  // tasarımcıda müşteriye sorularak veriliyor; bu, o adımı atlayan siparişler
  // için güvenlik ağı (bkz. glow-plate.server.ts).
  try {
    const plated = await applyGlowPlate(buffer);
    if (plated.applied) {
      console.log(
        `[glow-plate] ${side} plaka uygulandı — ` +
        `yumuşak alfa %${(plated.measurement.softAlphaRatio * 100).toFixed(1)}, ` +
        `opak %${(plated.measurement.opaqueRatio * 100).toFixed(1)}, ` +
        `alan ${plated.rect?.width}x${plated.rect?.height} @ ${plated.rect?.left},${plated.rect?.top}`,
      );
      buffer = Buffer.from(plated.buffer);
    }
  } catch (err) {
    // Plaka uygulanamazsa dosya olduğu gibi geçsin; yükleme durmasın.
    console.error("[glow-plate] uygulanamadı, dosya değiştirilmeden geçiyor:", err);
  }
  const glowMs = performance.now() - t;

  t = performance.now();
  // Lossless PNG optimizasyonu + doğru 300 DPI metadata'sı.
  buffer = Buffer.from(
    await sharp(buffer, { limitInputPixels: false })
      .png({ compressionLevel: 6 })
      .withMetadata({ density: 300 })
      .toBuffer(),
  );
  return { buffer, glowMs, sharpMs: performance.now() - t };
}

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
    const inputBytes = buffer.length;
    const storeStart = performance.now();
    let url: string;
    let persist: (processed: Buffer) => Promise<unknown>;
    if (useR2) {
      const key = newR2Key(`uploads/${side}`, ext);
      // Ham sürüm önbelleğe girmesin — birazdan işlenmiş sürüm üzerine yazılacak
      url = await putR2Object(key, buffer, ext, "no-cache");
      persist = (processed) => putR2Object(key, processed, ext);
    } else {
      const filename = `${side}-${randomBytes(12).toString("hex")}.${ext}`;
      const filePath = path.join(getUploadsDir(), filename);
      await writeFile(filePath, buffer);
      const baseUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
      url = `${baseUrl}/uploads/${filename}`;
      persist = (processed) => writeFile(filePath, processed);
    }
    const storeMs = performance.now() - storeStart;
    console.log(
      `[upload] ${side} ${(inputBytes / 1e6).toFixed(1)}MB — ` +
      `form=${receivedMs.toFixed(0)}ms ham-kayıt=${storeMs.toFixed(0)}ms yanıt=${(performance.now() - startedAt).toFixed(0)}ms`,
    );

    enqueuePrintJob(async () => {
      const queuedMs = performance.now() - startedAt;
      const processed = await processPrintFile(buffer, side);
      const t = performance.now();
      await persist(processed.buffer);
      console.log(
        `[upload] ${side} arka plan bitti — kuyruk=${(queuedMs - storeMs - receivedMs).toFixed(0)}ms ` +
        `glow=${processed.glowMs.toFixed(0)}ms sharp=${processed.sharpMs.toFixed(0)}ms ` +
        `yeniden-kayıt=${(performance.now() - t).toFixed(0)}ms ` +
        `${(inputBytes / 1e6).toFixed(1)}MB→${(processed.buffer.length / 1e6).toFixed(1)}MB`,
      );
    });

    return json({ url, serverMs: Math.round(performance.now() - startedAt) });
  }

  // Önizleme ve kaynak görseller küçük; optimizasyon senkron kalabilir
  // (önizleme URL'si sepette hemen gösteriliyor ve kalıcı önbelleğe giriyor).
  if (ext === "png") {
    try {
      buffer = Buffer.from(await sharp(buffer, { limitInputPixels: false }).png({ compressionLevel: 6 }).toBuffer());
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
  const baseUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
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
