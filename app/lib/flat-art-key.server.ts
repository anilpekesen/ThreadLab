import sharp from "sharp";

/**
 * Düz zeminli vektör/çizim görselleri için renk anahtarlama (keying).
 *
 * AI arka plan kaldırma (ideogram-ai/remove-background) fotoğraflar için
 * eğitilmiş bir ÖZNE SEGMENTASYON modeli: "konuyu bul, dış hattını kes"
 * mantığıyla çalışıyor. Yazı ve line-art tasarımlarda bu yanlış araç —
 * harflerin içindeki boşlukları (B, d, e, o gözleri) öznenin parçası sanıp
 * dolduruyor, ince script çizgilerini aşındırıyor.
 *
 * Oysa bu görsellerde arka plan zaten tek düz renk (çoğunlukla tam beyaz).
 * Renk uzaklığına göre alfa üretmek hem harf gözlerini kendiliğinden doğru
 * deliyor (onlar da arka plan rengi), hem anti-aliasing'i koruyor, hem de
 * anında ve ücretsiz çalışıyor.
 */

export interface FlatArtAnalysis {
  /** Kenarlardan ölçülen baskın arka plan rengi */
  bg: [number, number, number];
  /** Kenar piksellerinin bu renge ne kadar yakın olduğu (0-1) */
  uniformity: number;
  /**
   * Arka plan ile sanat arasındaki "kararsız" bölgede kalan piksel oranı.
   * Düz işlerde yalnızca anti-aliasing kenarı buraya düşer (<%1); yumuşak
   * gölgeli fotoğraflarda gölge rampası burayı doldurur (>%5). Anahtarlamanın
   * temiz sonuç verip vermeyeceğini belirleyen asıl ölçüt bu.
   */
  ambiguousRatio: number;
  /** Kenarlar zaten saydamsa görselin kesilmiş olduğu anlaşılır */
  alreadyCutout: boolean;
  /** Yerel anahtarlamanın uygun olduğu değerlendirmesi */
  isFlatArt: boolean;
}

// Eşikler gerçek müşteri dosyalarıyla kalibre edildi. Yanlış pozitif (gölgeli
// fotoğrafı anahtarlamak) kaliteyi bozacağı için muhafazakâr tutuldu.
const UNIFORMITY_MIN = 0.97;    // kenarların neredeyse tamamı aynı renk olmalı
const AMBIGUOUS_MAX = 0.02;     // gölge rampası olan görselleri eler
const BORDER_TOLERANCE = 12;    // aynı renk sayılma yarıçapı

// Yumuşak eşik sınırları. Analiz ve anahtarlama aynı değerleri kullanmalı —
// aksi halde "temiz ayrışıyor" kararı, uygulanan kesimle uyuşmaz.
const DEFAULT_SOFT_START = 24;
const DEFAULT_SOFT_END = 68;

export async function analyzeFlatArt(input: Buffer): Promise<FlatArtAnalysis | null> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  if (channels < 4 || W < 8 || H < 8) return null;

  const coords: Array<[number, number]> = [];
  const step = Math.max(1, Math.floor(Math.min(W, H) / 200));
  for (let x = 0; x < W; x += step) coords.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y += step) coords.push([0, y], [W - 1, y]);

  let sr = 0, sg = 0, sb = 0, opaque = 0, transparent = 0;
  for (const [x, y] of coords) {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 250) { transparent++; continue; }
    sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
    opaque++;
  }

  // Kenarların çoğu zaten saydamsa görsel kesilmiş demektir — dokunma
  const alreadyCutout = transparent > coords.length * 0.5;
  if (!opaque) {
    return { bg: [255, 255, 255], uniformity: 0, ambiguousRatio: 0, alreadyCutout: true, isFlatArt: false };
  }

  const bg: [number, number, number] = [
    Math.round(sr / opaque),
    Math.round(sg / opaque),
    Math.round(sb / opaque),
  ];

  let within = 0;
  for (const [x, y] of coords) {
    const i = (y * W + x) * 4;
    if (data[i + 3] < 250) continue;
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    if (d < BORDER_TOLERANCE) within++;
  }
  const uniformity = within / opaque;

  // Kararsız bölge oranı — anahtarlama eşikleriyle aynı sınırları kullanır
  let ambiguous = 0, counted = 0;
  const stride = 4 * Math.max(1, Math.floor((W * H) / 300000));
  for (let i = 0; i < data.length; i += stride) {
    if (data[i + 3] < 250) continue;
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    counted++;
    if (d > DEFAULT_SOFT_START && d < DEFAULT_SOFT_END) ambiguous++;
  }
  const ambiguousRatio = counted ? ambiguous / counted : 1;

  const isFlatArt =
    !alreadyCutout &&
    uniformity >= UNIFORMITY_MIN &&
    ambiguousRatio <= AMBIGUOUS_MAX;

  return { bg, uniformity, ambiguousRatio, alreadyCutout, isFlatArt };
}

export interface KeyOutOptions {
  /** Bu uzaklığın altı tamamen saydam */
  softStart?: number;
  /** Bu uzaklığın üstü tamamen opak; arası anti-aliasing rampası */
  softEnd?: number;
}

/**
 * Arka plan rengini saydamlaştırır.
 *
 * Kenar piksellerinde "unpremultiply" uygulanır: gözlenen renk, sanat ile
 * arka planın karışımıdır (gözlenen = sanat*a + bg*(1-a)). Sanatın gerçek
 * rengini geri sökmezsek beyaz zeminden gelen kenar pikselleri koyu tişörtte
 * soluk bir hale bırakır — müşteri şikayetlerinin bir kısmı tam olarak budur.
 */
export async function keyOutBackground(
  input: Buffer,
  bg: [number, number, number],
  opts: KeyOutOptions = {},
): Promise<Buffer> {
  const { softStart = DEFAULT_SOFT_START, softEnd = DEFAULT_SOFT_END } = opts;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  if (channels < 4) return input;

  const out = Buffer.alloc(W * H * 4);
  const [bgR, bgG, bgB] = bg;
  const span = Math.max(1, softEnd - softStart);

  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a0 = data[i + 3];

    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    let a = dist <= softStart ? 0 : dist >= softEnd ? 1 : (dist - softStart) / span;
    a *= a0 / 255;

    if (a <= 0.002) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      continue;
    }

    out[i]     = clamp255((r - bgR * (1 - a)) / a);
    out[i + 1] = clamp255((g - bgG * (1 - a)) / a);
    out[i + 2] = clamp255((b - bgB * (1 - a)) / a);
    out[i + 3] = Math.round(a * 255);
  }

  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export interface FlatArtResult {
  buffer: Buffer;
  analysis: FlatArtAnalysis;
  /** Saydamlaşan piksel oranı — sonucun makul olup olmadığını denetlemek için */
  transparentRatio: number;
}

/**
 * Görsel düz zeminli bir çizim/yazı ise yerel olarak anahtarlar.
 * Uygun değilse veya sonuç şüpheliyse null döner — çağıran taraf AI'a düşer.
 */
export async function tryFlatArtKeying(input: Buffer): Promise<FlatArtResult | null> {
  const analysis = await analyzeFlatArt(input).catch(() => null);
  if (!analysis || !analysis.isFlatArt) return null;

  const buffer = await keyOutBackground(input, analysis.bg);

  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 8) transparent++;
  const transparentRatio = transparent / (info.width * info.height);

  // Neredeyse her şey silindiyse ya da hiçbir şey silinmediyse anahtarlama
  // yanlış karar vermiştir; AI yoluna bırak.
  if (transparentRatio > 0.995 || transparentRatio < 0.02) return null;

  return { buffer, analysis, transparentRatio };
}
