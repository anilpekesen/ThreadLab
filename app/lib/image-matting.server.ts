import sharp from "sharp";

/** AI çıktısındaki çok düşük alfa halesini, saçı ve ince çizgileri ezmeden temizler. */
export async function cleanupCutoutEdges(
  input: Buffer,
  opts: { transparentCutoff?: number; contrast?: number } = {},
): Promise<Buffer> {
  const { transparentCutoff = 8, contrast = 1.08 } = opts;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4) return input; // alfa kanalı yoksa dokunma

  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * channels + 3;
    const alpha = data[offset];
    if (alpha <= transparentCutoff) {
      data[offset] = 0;
      continue;
    }
    if (alpha >= 247) {
      data[offset] = 255;
      continue;
    }
    // Eski blur + threshold işlemi kenarı yeniden örnekleyerek özellikle yazı
    // ve küçük logolarda bulanıklık üretiyordu. Bu eğri yalnızca alfa değerini
    // düzenler; RGB piksellerine ve kenarın geometrisine dokunmaz.
    const normalized = (alpha - transparentCutoff) / (255 - transparentCutoff);
    const shaped = normalized < 0.5
      ? 0.5 * Math.pow(normalized * 2, contrast)
      : 1 - 0.5 * Math.pow((1 - normalized) * 2, contrast);
    data[offset] = Math.max(0, Math.min(255, Math.round(shaped * 255)));
  }

  return sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Kenarlarının veya alanının önemli bölümü saydamsa görsel zaten kesilmiştir.
 * Böyle bir PNG'yi tekrar AI segmentasyonuna göndermek detay ve çözünürlük
 * kaybettirir.
 */
export async function hasMeaningfulTransparency(input: Buffer): Promise<boolean> {
  const { data, info } = await sharp(input, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 4 || width < 2 || height < 2) return false;

  let transparent = 0;
  let borderTransparent = 0;
  let borderCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha < 245) transparent++;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        borderCount++;
        if (alpha < 245) borderTransparent++;
      }
    }
  }

  const total = width * height;
  return borderTransparent / Math.max(1, borderCount) > 0.25
    || transparent / total > 0.15;
}

export interface HighResolutionCutoutResult {
  buffer: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  modelWidth: number;
  modelHeight: number;
  rebuiltFromOriginal: boolean;
}

/**
 * AI servisinin RGB çıktısını baskı kaynağı olarak kullanmak yerine yalnızca
 * alfa maskesini alır ve onu orijinal, tam çözünürlüklü RGB piksellerine
 * uygular. Böylece servis görüntüyü küçültse bile tasarımın iç detayları ve
 * keskinliği korunur.
 */
export async function rebuildCutoutAtSourceResolution(
  sourceInput: Buffer,
  modelOutput: Buffer,
): Promise<HighResolutionCutoutResult> {
  const sourceMeta = await sharp(sourceInput, { limitInputPixels: false }).metadata();
  const source = await sharp(sourceInput, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanedModel = await cleanupCutoutEdges(modelOutput);
  const modelMeta = await sharp(cleanedModel, { limitInputPixels: false }).metadata();

  const sourceWidth = source.info.width;
  const sourceHeight = source.info.height;
  const modelWidth = modelMeta.width ?? 0;
  const modelHeight = modelMeta.height ?? 0;
  const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
  const modelRatio = modelWidth / Math.max(1, modelHeight);

  // Servis resmi kırpmış veya oranını değiştirmişse maskeyi zorla esnetme.
  // Bu nadir durumda temizlenmiş servis çıktısı daha güvenlidir.
  if (!modelWidth || !modelHeight || Math.abs(sourceRatio - modelRatio) / sourceRatio > 0.02) {
    return {
      buffer: cleanedModel,
      sourceWidth,
      sourceHeight,
      modelWidth,
      modelHeight,
      rebuiltFromOriginal: false,
    };
  }

  const mask = await sharp(cleanedModel, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .extractChannel(3)
    .resize(sourceWidth, sourceHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();

  const output = Buffer.from(source.data);
  const channels = source.info.channels;
  const pixelCount = sourceWidth * sourceHeight;
  for (let i = 0; i < pixelCount; i++) {
    const alphaOffset = i * channels + 3;
    output[alphaOffset] = Math.round((output[alphaOffset] * mask[i]) / 255);
  }

  let pipeline = sharp(output, {
    raw: { width: sourceWidth, height: sourceHeight, channels },
    limitInputPixels: false,
  }).png({ compressionLevel: 6, adaptiveFiltering: true });
  if (sourceMeta.density) pipeline = pipeline.withMetadata({ density: sourceMeta.density });

  return {
    buffer: await pipeline.toBuffer(),
    sourceWidth,
    sourceHeight,
    modelWidth,
    modelHeight,
    rebuiltFromOriginal: true,
  };
}
