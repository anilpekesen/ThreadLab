import sharp from "sharp";
import { createHash } from "node:crypto";
import { computeScatterLayout, DEFAULT_SCATTER, type ScatterConfig, type ReserveRect } from "~/lib/scatter-layout.server";
import { extractHeadCutout, applySoftOvalMask } from "~/lib/face-detect.server";
import { removeBackgroundFromBuffer } from "~/models/auto-bg-removal.server";
import type { TextFieldDef } from "~/models/personalizer.server";

/**
 * Dağıtımlı şablon kompoziti.
 *
 * Müşterinin fotoğrafından kafa kesilir, baskı alanına tohumlu bir yerleşimle
 * dağıtılır; süsleme ve düzenlenebilir yazı eklenir. Sonuç saydam zeminli tek
 * PNG'dir ve tasarımcıya normal bir görsel olarak verilir.
 */

export interface ScatterComposeOptions {
  photo: Buffer;
  /** Süsleme görseli (kalp vb.); yoksa yalnızca kafalar dağıtılır */
  decoration?: Buffer | null;
  areaWidth: number;
  areaHeight: number;
  config?: Partial<ScatterConfig>;
  textFields?: TextFieldDef[];
  textValues?: Record<string, string>;
  /** WaveSpeed anahtarı; yoksa arka plan silme atlanır */
  wavespeedKey?: string;
}

export interface ScatterComposeResult {
  buffer: Buffer;
  /** Kafa Vision ile mi bulundu, yoksa tahmine mi düşüldü */
  headDetected: boolean;
  placed: { faces: number; decorations: number };
  /**
   * Baskı kalitesi göstergesi. Fotoğrafın toplam çözünürlüğü yanıltıcı:
   * 5000 piksellik bir kalabalık fotoğrafında kafa 80 piksel olabilir.
   * Ölçüt, kesilen kafanın kaynaktaki piksel eninin basılacağı boya
   * yetip yetmediği.
   */
  quality: {
    /** Kaynak fotoğraftaki kafa kesitinin piksel eni */
    headSourcePx: number;
    /** Tasarımda kafanın yerleştirildiği en büyük piksel eni */
    placedPx: number;
    /** 1'in üstü büyütme demek; 1.15 üstü gözle görülür yumuşama */
    upscale: number;
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fieldText(field: TextFieldDef, values: Record<string, string>): string {
  return (values[field.id] ?? "").trim() || (field.default_value ?? "").trim();
}

function buildTextOverlay(
  fields: TextFieldDef[],
  values: Record<string, string>,
  width: number,
  height: number,
): Buffer | null {
  const lines = fields
    .map((f) => {
      const raw = fieldText(f, values);
      if (!raw) return "";
      const anchor = f.align === "left" ? "start" : f.align === "right" ? "end" : "middle";
      return `<text x="${f.x}" y="${f.y}" font-family="Georgia, serif" font-size="${f.font_size}"` +
        ` font-weight="${f.bold ? "bold" : "normal"}" fill="${f.color || "#000000"}"` +
        ` text-anchor="${anchor}">${escapeXml(raw)}</text>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!lines) return null;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines}</svg>`);
}

/**
 * Yazının kapladığı gerçek dikdörtgeni çıkarır.
 *
 * Rezerve alan eskiden tuvalin ortasında sabit oranlı bir kutuydu. Yazı
 * alanları mutlak koordinatlı olduğu için tuval oranı değişince yazı kutunun
 * dışına taşıyor ve üstüne parça biniyordu. Sınırı yazının kendisinden
 * türetmek bu bağı kalıcı olarak kesiyor.
 *
 * Genişlik ölçüsü kaba ama ölçülmüş: üretilen çıktıda kalın Georgia karakter
 * başına ~0.63 em, normalde ~0.52 em yer kaplıyor. Kalın için düşük katsayı
 * kullanmak sınırı dar bırakıp süslemeyi yazının son harfine değdiriyordu.
 */
function textReserveRect(
  fields: TextFieldDef[],
  values: Record<string, string>,
): ReserveRect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

  for (const field of fields) {
    const raw = fieldText(field, values);
    if (!raw) continue;
    const size = Number(field.font_size) || 0;
    if (size <= 0) continue;

    const emPerChar = field.bold ? 0.63 : 0.52;
    const width = raw.length * size * emPerChar;
    const anchorX = Number(field.x) || 0;
    const left = field.align === "left" ? anchorX
      : field.align === "right" ? anchorX - width
      : anchorX - width / 2;

    const baseline = Number(field.y) || 0;
    x0 = Math.min(x0, left);
    x1 = Math.max(x1, left + width);
    y0 = Math.min(y0, baseline - size * 0.80);   // üst çıkıntı
    y1 = Math.max(y1, baseline + size * 0.25);   // alt çıkıntı
  }

  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Kesilmiş kafa önbelleği.
 *
 * Müşteri yoğunluk/boyut/dizilim ayarlarıyla oynadığında aynı fotoğraf için
 * arka plan kaldırma (dış servis) ve yüz tespiti (Vision) yeniden çalışmamalı —
 * ayarların değiştirdiği tek şey yerleşim. Süreç içinde tutulur: pm2 iki worker
 * çalıştırdığı için isabet garanti değil, ama tekrar üretim maliyeti belirgin
 * düşer. Kalıcı önbellek gerekirse kesit R2'ye fotoğraf özetiyle yazılabilir.
 */
interface HeadCacheEntry {
  piece: Buffer;
  detected: boolean;
  /** Kaynak fotoğraftaki kafa kesitinin piksel eni — kalite uyarısı bunu kullanır */
  sourceWidth: number;
  at: number;
}

const HEAD_CACHE_MAX = 40;
const HEAD_CACHE_TTL_MS = 30 * 60_000;
const headCache = new Map<string, HeadCacheEntry>();

function readHeadCache(key: string): HeadCacheEntry | null {
  const hit = headCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > HEAD_CACHE_TTL_MS) {
    headCache.delete(key);
    return null;
  }
  // Map ekleme sırasını koruduğu için, dokunulanı sona almak LRU verir
  headCache.delete(key);
  headCache.set(key, hit);
  return hit;
}

function writeHeadCache(key: string, entry: HeadCacheEntry): void {
  headCache.set(key, entry);
  while (headCache.size > HEAD_CACHE_MAX) {
    const oldest = headCache.keys().next().value;
    if (oldest === undefined) break;
    headCache.delete(oldest);
  }
}

export async function composeScatterDesign(opts: ScatterComposeOptions): Promise<ScatterComposeResult> {
  const { photo, decoration, areaWidth, areaHeight } = opts;
  const config: ScatterConfig = { ...DEFAULT_SCATTER, ...(opts.config ?? {}) };

  // 1-2) Kafa kesitini hazırla (önbellekli). Bu iki adım dış servis çağırır;
  //      3-5 tamamen yerel. Müşteri ayarlarla oynadığında yalnızca yerelin
  //      tekrar çalışması gerekir.
  const cacheKey = createHash("sha256").update(photo).digest("hex");
  let cached = readHeadCache(cacheKey);

  if (!cached) {
    // Arka planı kaldır — kafa kesimi saydam zemin üzerinde çalışır
    let subject = photo;
    if (opts.wavespeedKey) {
      subject = await removeBackgroundFromBuffer(opts.wavespeedKey, photo, "scatter-photo")
        .catch((err) => {
          console.error("[scatter] arka plan kaldirilamadi, ham foto kullaniliyor:", err);
          return photo;
        });
    }

    // Kafayı kes ve oval maskele — kare kesitte kalan omuz/kazak artıkları
    // koyu üründe görünür dikdörtgen oluşturuyor
    const head = await extractHeadCutout(subject);
    const piece = await applySoftOvalMask(head.buffer).catch(() => head.buffer);
    cached = { piece, detected: head.detected, sourceWidth: head.box.width, at: Date.now() };
    writeHeadCache(cacheKey, cached);
  }

  const headPiece = cached.piece;

  // 3) Yerleşimi hesapla
  const reserve = textReserveRect(opts.textFields ?? [], opts.textValues ?? {});
  const items = computeScatterLayout(areaWidth, areaHeight, config, reserve);

  // 4) Parçaları yerleştir
  const composites: sharp.OverlayOptions[] = [];
  let faces = 0;
  let decorations = 0;

  for (const item of items) {
    if (item.kind === "decoration" && !decoration) continue;
    const source = item.kind === "face" ? headPiece : decoration!;
    const w = Math.max(4, Math.round(item.width));

    let piece = sharp(source).resize(w, w, { fit: "inside" });
    if (item.angle) piece = piece.rotate(item.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const buf = await piece.png().toBuffer();
    const meta = await sharp(buf).metadata();

    composites.push({
      input: buf,
      left: Math.round(item.x - (meta.width ?? w) / 2),
      top: Math.round(item.y - (meta.height ?? w) / 2),
    });
    if (item.kind === "face") faces++; else decorations++;
  }

  // 5) Yazılar en üstte
  const overlay = buildTextOverlay(opts.textFields ?? [], opts.textValues ?? {}, areaWidth, areaHeight);
  if (overlay) composites.push({ input: overlay });

  const buffer = await sharp({
    create: { width: areaWidth, height: areaHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().toBuffer();

  const placedPx = items
    .filter((item) => item.kind === "face")
    .reduce((max, item) => Math.max(max, item.width), 0);
  const headSourcePx = cached.sourceWidth;

  return {
    buffer,
    headDetected: cached.detected,
    placed: { faces, decorations },
    quality: {
      headSourcePx,
      placedPx: Math.round(placedPx),
      upscale: headSourcePx > 0 ? placedPx / headSourcePx : 0,
    },
  };
}
