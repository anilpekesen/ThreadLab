import sharp from "sharp";

/**
 * Işımalı (neon / glow) baskı dosyaları için sunucu tarafı güvenlik ağı.
 *
 * DTF'de alfa aynı zamanda beyaz alt baskıyı belirliyor: %10 alfa, %10
 * yoğunlukta seyrek beyaz nokta demek. Toz yapıştırıcı o yoğunlukta tutunmadığı
 * için ışıma ya hiç transfer olmuyor ya da taneli bir hale olarak çıkıp ilk
 * yıkamada dökülüyor. Çalışan tek yol ışımayı kendi koyu zemininde, %100 opak
 * basmak (alfa eşikleme denendi: ışımadaki gren gürültüsü yüzünden tırtıklı
 * bir leke üretiyor, orijinalden kötü).
 *
 * Asıl karar tasarımcıda, müşteriye önizleme göstererek veriliyor
 * (designer-ui/src/utils/glowDetect.ts). Burası o adımı atlayan siparişler
 * için: eski bundle'la açılmış oturumlar, doğrudan yeniden üretilen dosyalar.
 * Tasarımcıda plaka zaten uygulanmışsa dosya opak olduğu için buradaki test
 * tetiklenmez — çift plaka riski yok.
 *
 * Tasarımcıdan farklı olarak plaka BURADA KIRPMADAN uygulanır: baskı
 * dosyasının ölçüsü ve sanatın içindeki konumu giysi üzerindeki yerleşimi
 * belirliyor, tuvali yeniden çerçevelemek baskıyı kaydırır.
 */

/** Neon tasarımlar neredeyse her zaman siyah zeminlidir. */
export const PLATE_COLOR = "#0b0b0f";

// Eşikler designer-ui/src/utils/glowDetect.ts ile aynı; ikisi de aynı gerçek
// sipariş dosyalarıyla kalibre edildi ve ayrışmamaları gerekiyor.
const SAMPLE_MAX_SIDE = 512;
const VISIBLE_MIN_ALPHA = 4;
const SOFT_ALPHA_MIN = 10;
const SOFT_ALPHA_MAX = 205;
/** Ölçüm: ışımalı siparişlerde %79 ve %86, sıradan kesimlerde en fazla %31. */
const SOFT_ALPHA_WARN_RATIO = 0.5;
/** Ölçüm: ışımalıda %5 ve %0.2, sıradan kesimlerde %52 ve %55. */
const OPAQUE_MAX_RATIO = 0.35;
const MIN_VISIBLE_RATIO = 0.005;

/** En dış saçak gözle seçilmiyor; sınıra katılınca plakaya boş kenar ekliyor. */
const PLATE_BBOX_MIN_ALPHA = 12;
const PLATE_PADDING_RATIO = 0.03;
const PLATE_RADIUS_RATIO = 0.05;

/** Bundan küçük bir içerik sınırında plaka anlamsız. */
const MIN_PLATE_SIDE_PX = 32;

export interface GlowMeasurement {
  softAlphaRatio: number;
  opaqueRatio: number;
  isGlow: boolean;
}

export interface GlowPlateResult {
  buffer: Buffer;
  applied: boolean;
  measurement: GlowMeasurement;
  /** Plakanın tuval içindeki yeri — uygulandıysa */
  rect?: { left: number; top: number; width: number; height: number };
}

/** Üretim dosyasını sessizce değiştiren bir adım; acil durumda kapatılabilsin. */
function disabled(): boolean {
  return process.env.GLOW_PLATE_DISABLED === "1";
}

/**
 * Yumuşak alfa oranını ve tam opak oranını ölçer. İkisi birlikte iki taraflı
 * bir test kuruyor: ışımada sanatın çoğu yarı saydam ve çok azı opak, sıradan
 * bir kesimde tam tersi.
 */
export async function measureGlow(input: Buffer): Promise<GlowMeasurement> {
  const none: GlowMeasurement = { softAlphaRatio: 0, opaqueRatio: 0, isGlow: false };
  const meta = await sharp(input, { limitInputPixels: false }).metadata().catch(() => null);
  if (!meta?.width || !meta.height) return none;

  const scale = Math.min(1, SAMPLE_MAX_SIDE / Math.max(meta.width, meta.height));
  const w = Math.max(1, Math.round(meta.width * scale));
  const h = Math.max(1, Math.round(meta.height * scale));

  const { data } = await sharp(input, { limitInputPixels: false })
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = w * h;
  let visible = 0;
  let soft = 0;
  let opaque = 0;
  for (let p = 0; p < total; p++) {
    const a = data[p * 4 + 3];
    if (a < VISIBLE_MIN_ALPHA) continue;
    visible++;
    if (a >= SOFT_ALPHA_MIN && a <= SOFT_ALPHA_MAX) soft++;
    if (a >= 250) opaque++;
  }

  if (!visible || visible / total < MIN_VISIBLE_RATIO) return none;

  const softAlphaRatio = soft / visible;
  const opaqueRatio = opaque / visible;
  return {
    softAlphaRatio,
    opaqueRatio,
    isGlow: softAlphaRatio >= SOFT_ALPHA_WARN_RATIO && opaqueRatio <= OPAQUE_MAX_RATIO,
  };
}

/** Sanatın tuval içindeki sınırlarını küçültülmüş kopyada bulur. */
async function contentBox(input: Buffer, fullW: number, fullH: number) {
  const scale = Math.min(1, SAMPLE_MAX_SIDE / Math.max(fullW, fullH));
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));
  const { data } = await sharp(input, { limitInputPixels: false })
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < PLATE_BBOX_MIN_ALPHA) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;

  // Küçültme kenarı bir örnek kaydırabilir; her yöne bir örnek pay bırak.
  const sx = fullW / w;
  const sy = fullH / h;
  return {
    left: Math.max(0, Math.floor((minX - 1) * sx)),
    top: Math.max(0, Math.floor((minY - 1) * sy)),
    right: Math.min(fullW, Math.ceil((maxX + 2) * sx)),
    bottom: Math.min(fullH, Math.ceil((maxY + 2) * sy)),
  };
}

/**
 * Işıma tespit edilirse sanatın arkasına opak koyu plaka yerleştirir. Tuval
 * ölçüsü ve sanatın konumu korunur. Tespit yoksa girdi olduğu gibi döner.
 */
export async function applyGlowPlate(input: Buffer): Promise<GlowPlateResult> {
  const measurement = await measureGlow(input).catch(() => ({
    softAlphaRatio: 0, opaqueRatio: 0, isGlow: false,
  }));
  if (!measurement.isGlow || disabled()) {
    return { buffer: input, applied: false, measurement };
  }

  const meta = await sharp(input, { limitInputPixels: false }).metadata();
  const fullW = meta.width ?? 0;
  const fullH = meta.height ?? 0;
  if (!fullW || !fullH) return { buffer: input, applied: false, measurement };

  const box = await contentBox(input, fullW, fullH);
  if (!box) return { buffer: input, applied: false, measurement };

  const boxW = box.right - box.left;
  const boxH = box.bottom - box.top;
  if (boxW < MIN_PLATE_SIDE_PX || boxH < MIN_PLATE_SIDE_PX) {
    return { buffer: input, applied: false, measurement };
  }

  const pad = Math.max(16, Math.round(Math.min(boxW, boxH) * PLATE_PADDING_RATIO));
  const left = Math.max(0, box.left - pad);
  const top = Math.max(0, box.top - pad);
  const width = Math.min(fullW - left, boxW + pad * 2);
  const height = Math.min(fullH - top, boxH + pad * 2);
  const radius = Math.round(Math.min(width, height) * PLATE_RADIUS_RATIO);

  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${PLATE_COLOR}"/></svg>`,
  );

  // Plaka altta, sanat üstünde. Tuval boyutu değişmiyor.
  let pipeline = sharp({
    create: { width: fullW, height: fullH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    limitInputPixels: false,
  })
    .composite([
      { input: plate, left, top },
      { input, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 6, adaptiveFiltering: true });

  // Baskı çözünürlüğü metadata'sı kaybolmasın.
  if (meta.density) pipeline = pipeline.withMetadata({ density: meta.density });

  return {
    buffer: await pipeline.toBuffer(),
    applied: true,
    measurement,
    rect: { left, top, width, height },
  };
}
