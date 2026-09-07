/**
 * Işımalı (neon / glow) tasarımların baskı öncesi tespiti.
 *
 * DTF'de alfa aynı zamanda beyaz alt baskıyı belirliyor: %10 alfa, %10
 * yoğunlukta seyrek beyaz nokta demek. Toz yapıştırıcı o yoğunlukta tutunmadığı
 * için ışıma ya hiç transfer olmuyor ya da taneli bir hale olarak çıkıp ilk
 * yıkamada dökülüyor. Gerçek bir sipariş dosyasında ölçüldü: görünür
 * piksellerin yalnızca %17'si tam opak, yarısı %25 mürekkep yoğunluğunun
 * altındaydı.
 *
 * Alfayı eşikleyip altını kesmek çözüm DEĞİL — ışımadaki gren gürültüsü
 * yüzünden tırtıklı, sert kenarlı bir leke oluşuyor ve orijinalden kötü
 * duruyor. Çalışan tek yol ışımayı kendi koyu zemininde, %100 opak basmak.
 *
 * Burada iki ayrı durum yakalanıyor:
 *
 *  - `soft-alpha`: görsel zaten kesilmiş ve ışıma alfaya gömülü. Koyu plaka
 *    önerilir (bkz. buildDarkPlate).
 *  - `dark-source`: görsel hâlâ kendi koyu zemininde ve opak — bu haliyle
 *    sorunsuz basar. Burada yapılacak şey arka plan kaldırmayı ÖNERMEMEK,
 *    çünkü kaldırma ışımayı yumuşak alfaya çevirip sorunu üretiyor.
 */

export type GlowKind = 'none' | 'soft-alpha' | 'dark-source';

export interface GlowAnalysis {
  kind: GlowKind;
  /** Görünür piksellerin yumuşak alfa bandındaki payı (0-1) */
  softAlphaRatio: number;
  /** Görünür piksellerin tam opak payı (0-1) */
  opaqueRatio: number;
  /** `dark-source` ise kenarlardan ölçülen zemin rengi */
  background: [number, number, number] | null;
}

/** Analiz bu genişliğe küçültülmüş kopyada yapılır — tam çözünürlük gereksiz. */
const SAMPLE_MAX_SIDE = 512;

/** Bu alfanın altı baskıda zaten kaybolur; "görünür" saymıyoruz. */
const VISIBLE_MIN_ALPHA = 4;

/**
 * Plakanın içerik sınırı için daha yüksek eşik. Işımanın en dış saçağı gözle
 * seçilmiyor ama sınıra dahil olunca plakaya boş kenar ekliyor.
 */
const PLATE_BBOX_MIN_ALPHA = 12;

/** Baskıda sorun çıkaran yumuşak alfa bandı. */
const SOFT_ALPHA_MIN = 10;
const SOFT_ALPHA_MAX = 205;

/**
 * Görünür sanatın bu kadarı yumuşak alfadaysa uyarılır.
 *
 * Gerçek dosyalarla kalibre edildi: iki neon siparişinde %79 ve %86 ölçüldü,
 * arka planı kaldırılmış sıradan tasarımlarda en yüksek değer %31'di. Eşik
 * ikisinin ortasında.
 */
const SOFT_ALPHA_WARN_RATIO = 0.5;

/**
 * Işımalı tasarımda sanatın çok azı tam opaktır (ölçülen: %5 ve %0.2); sıradan
 * bir kesimde yarıdan fazlası opaktır (%52, %55). Yumuşak alfa oranıyla
 * birlikte iki taraflı bir test kuruyor.
 */
const OPAQUE_MAX_RATIO = 0.35;

/** Bunun altında görünür piksel varsa görsel boş sayılır. */
const MIN_VISIBLE_RATIO = 0.005;

/** `dark-source` için zemin bu parlaklığın altında olmalı (0-255). */
const DARK_BG_MAX_LUMA = 70;

/** Kenar piksellerinin zemin rengine bu oranda uyması beklenir. */
const DARK_BG_MIN_UNIFORMITY = 0.85;

/** Aynı renk sayılma yarıçapı. */
const BG_TOLERANCE = 26;

/**
 * Opak kaynakta ışımanın imzası: zemin ile en parlak içerik arasındaki ara
 * tonlar. Keskin bir tasarımda buraya yalnızca anti-aliasing düşer, ışımada
 * ise sanatın büyük bölümü. Uzaklık, en parlak içeriğe oranlanarak ölçülür.
 */
const MID_TONE_LO = 0.06;
const MID_TONE_HI = 0.55;

/**
 * İçeriğin (ara ton + parlak) bu kadarı ara tondaysa ışıma kabul edilir.
 * Ölçüm: neon kaynak 0.73; keskin beyaz-yazı/siyah-zemin 0.29, düz zeminli
 * tasarımlar 0.20-0.23.
 *
 * Renk doygunluğuna bakmıyoruz bilerek — beyaz veya tek renk ışımalar da
 * aynı sorunu yaşıyor ve doygunluk testi onları kaçırıyordu.
 */
const MID_TONE_WARN_RATIO = 0.5;

/** Zeminden ayrışan içerik görselin bu kadarını kaplamalı. */
const MIN_CONTENT_RATIO = 0.01;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Sunucu URL'lerinde getImageData'nın tuvali kirletmemesi için gerekli.
    // data: URL'lerde zararsız.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function sampleContext(img: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  return { ctx, w, h };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Kenar piksellerinden baskın zemin rengini ve kenarların ona ne kadar uyduğunu
 * çıkarır. Ortalama yerine kanal medyanı kullanılıyor: tasarım kenara değdiğinde
 * birkaç parlak piksel ortalamayı kaydırıyor, medyan baskın zemini koruyor.
 */
function measureBorder(data: Uint8ClampedArray, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
  const coords: Array<[number, number]> = [];
  for (let x = 0; x < w; x += step) coords.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y += step) coords.push([0, y], [w - 1, y]);

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const [x, y] of coords) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 250) continue;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  }
  if (!rs.length) return null;

  const bg: [number, number, number] = [median(rs), median(gs), median(bs)];
  let within = 0;
  for (let k = 0; k < rs.length; k++) {
    const d = Math.hypot(rs[k] - bg[0], gs[k] - bg[1], bs[k] - bg[2]);
    if (d < BG_TOLERANCE) within++;
  }
  return { bg, uniformity: within / rs.length };
}

export async function analyzeGlow(src: string): Promise<GlowAnalysis> {
  const empty: GlowAnalysis = { kind: 'none', softAlphaRatio: 0, opaqueRatio: 0, background: null };
  let sample;
  try {
    const img = await loadImage(src);
    sample = sampleContext(img, SAMPLE_MAX_SIDE);
  } catch {
    // CORS ya da çözülemeyen dosya — uyarı vermeden geç, akışı durdurma.
    return empty;
  }
  if (!sample) return empty;

  const { ctx, w, h } = sample;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return empty;
  }

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

  if (visible / total < MIN_VISIBLE_RATIO) return empty;

  const softAlphaRatio = soft / visible;
  const opaqueRatio = opaque / visible;

  // Kesilmiş ve ışıması alfaya gömülü
  const hasTransparency = visible / total < 0.98;
  if (hasTransparency) {
    if (softAlphaRatio >= SOFT_ALPHA_WARN_RATIO && opaqueRatio <= OPAQUE_MAX_RATIO) {
      return { kind: 'soft-alpha', softAlphaRatio, opaqueRatio, background: null };
    }
    return { kind: 'none', softAlphaRatio, opaqueRatio, background: null };
  }

  // Hâlâ kendi koyu zemininde ve opak
  const border = measureBorder(data, w, h);
  if (!border) return { kind: 'none', softAlphaRatio, opaqueRatio, background: null };

  const luma = 0.2126 * border.bg[0] + 0.7152 * border.bg[1] + 0.0722 * border.bg[2];
  if (luma > DARK_BG_MAX_LUMA || border.uniformity < DARK_BG_MIN_UNIFORMITY) {
    return { kind: 'none', softAlphaRatio, opaqueRatio, background: null };
  }

  // Her pikselin zeminden uzaklığı; ölçek en parlak içeriğe göre normalize
  // ediliyor ki soluk ve parlak ışımalar aynı eşiği paylaşsın.
  const distances = new Float32Array(total);
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    distances[p] = Math.hypot(data[i] - border.bg[0], data[i + 1] - border.bg[1], data[i + 2] - border.bg[2]);
  }
  // Tepe değer için 99.9. persentil — tek tük aykırı piksel ölçeği kaçırmasın.
  const peak = Float32Array.from(distances).sort()[Math.floor(total * 0.999)] || 1;

  let mid = 0;
  let bright = 0;
  for (let p = 0; p < total; p++) {
    const t = distances[p] / peak;
    if (t > MID_TONE_LO && t < MID_TONE_HI) mid++;
    else if (t >= MID_TONE_HI) bright++;
  }

  const content = mid + bright;
  if (content / total >= MIN_CONTENT_RATIO && mid / content >= MID_TONE_WARN_RATIO) {
    return { kind: 'dark-source', softAlphaRatio, opaqueRatio, background: border.bg };
  }

  return { kind: 'none', softAlphaRatio, opaqueRatio, background: null };
}

export interface DarkPlateOptions {
  /** Plaka rengi (CSS). Neon tasarımlar neredeyse her zaman siyah zeminlidir. */
  color?: string;
  /**
   * Sanatın çevresinde bırakılacak boşluk, kısa kenarın oranı olarak.
   * %1.5'te ışımanın dış halkası kenardan kesiliyor, %6'da gözle görülür
   * ölçüde boş kenar kalıyor; %3 ikisinin arasında dengeleniyor.
   */
  paddingRatio?: number;
  /** Köşe yuvarlaklığı, kısa kenarın oranı olarak. */
  radiusRatio?: number;
  /**
   * Çıktının en uzun kenar sınırı. compressImage ile aynı tavan: 300 DPI'da
   * 30 cm'in üstünü besliyor, dataURL'i de taşınabilir boyutta tutuyor.
   */
  maxSide?: number;
}

export const DEFAULT_PLATE_COLOR = '#0b0b0f';

function roundedRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

/**
 * Işımalı sanatı kendi koyu zeminine oturtur.
 *
 * Sonuçta her piksel %100 opak olduğu için halftone ve alt baskı sorunu ortadan
 * kalkar, ışımanın tamamı korunur. Sanatın sınırları küçültülmüş kopyada
 * bulunur — kenar payı zaten bırakıldığı için piksel hassasiyeti gerekmiyor.
 */
export async function buildDarkPlate(src: string, opts: DarkPlateOptions = {}): Promise<string> {
  const { color = DEFAULT_PLATE_COLOR, paddingRatio = 0.03, radiusRatio = 0.05, maxSide = 4000 } = opts;
  const img = await loadImage(src);
  const fullW = img.naturalWidth;
  const fullH = img.naturalHeight;
  if (!fullW || !fullH) return src;

  // İçerik sınırlarını küçük kopyada bul
  let box = { left: 0, top: 0, width: fullW, height: fullH };
  const sample = sampleContext(img, SAMPLE_MAX_SIDE);
  if (sample) {
    try {
      const { ctx, w, h } = sample;
      const data = ctx.getImageData(0, 0, w, h).data;
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
      if (maxX >= minX && maxY >= minY) {
        const sx = fullW / w;
        const sy = fullH / h;
        // Küçültme kenarı bir piksel kaydırabilir; her yöne bir örnek pay ver.
        const left = Math.max(0, Math.floor((minX - 1) * sx));
        const top = Math.max(0, Math.floor((minY - 1) * sy));
        const right = Math.min(fullW, Math.ceil((maxX + 2) * sx));
        const bottom = Math.min(fullH, Math.ceil((maxY + 2) * sy));
        if (right > left && bottom > top) {
          box = { left, top, width: right - left, height: bottom - top };
        }
      }
    } catch {
      // getImageData engellendiyse tüm görseli kullan
    }
  }

  const pad = Math.max(16, Math.round(Math.min(box.width, box.height) * paddingRatio));
  const plateW = box.width + pad * 2;
  const plateH = box.height + pad * 2;
  const fit = Math.min(1, maxSide / Math.max(plateW, plateH));
  const outW = Math.max(1, Math.round(plateW * fit));
  const outH = Math.max(1, Math.round(plateH * fit));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;

  ctx.fillStyle = color;
  roundedRectPath(ctx, outW, outH, Math.round(Math.min(outW, outH) * radiusRatio));
  ctx.fill();
  ctx.drawImage(
    img,
    box.left, box.top, box.width, box.height,
    Math.round(pad * fit), Math.round(pad * fit),
    outW - Math.round(pad * fit) * 2, outH - Math.round(pad * fit) * 2,
  );

  // PNG şart: bu dosya doğrudan baskıya gidiyor ve JPEG'in blok artefaktları
  // tam da burada, koyu zemin üstündeki parlak neon kenarlarında en görünür
  // halde çıkıyor. Boyut sorunu galeriye küçük kopya koyarak çözülüyor.
  return canvas.toDataURL('image/png');
}

/** dataURL'i yüklenebilir bir dosyaya çevirir. */
export function dataUrlToFile(dataUrl: string, name: string): File | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) return null;
  const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png';
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime, lastModified: Date.now() });
  } catch {
    return null;
  }
}
