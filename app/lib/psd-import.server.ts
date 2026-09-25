import sharp from "sharp";
import { initializeCanvas, readPsd, type Layer, type Psd } from "ag-psd";
import { FONT_LIBRARY, type LibraryFont } from "~/lib/font-library";

/**
 * Photoshop dosyasından kişiselleştirici şablonu.
 *
 * Katmanlar adlarına göre ayrılır; tasarımcıdan bir tek şey isteniyor:
 *   - Fotoğraf gelecek katman ya da grubun adı "photo", "foto" ya da
 *     "fotoğraf" ile başlar ("photo 1", "Foto - anne"). Katmanın kendi
 *     pikselleri alanın şeklidir: dikdörtgen, daire, kalp, harf...
 *   - Yazı katmanları müşteriye açık yazı alanı olur; adında "sabit" ya da
 *     "fixed" geçenler tasarımın parçası olarak basılır.
 *   - Geri kalan görünür katmanlar birleştirilir: ilk fotoğraf katmanının
 *     altındakiler arka plan, üstündekiler fotoğrafların üstüne binen katman.
 *
 * Katman efektleri, maskeleri, karışım modları ve ayar katmanları
 * aktarılmaz; bulunduklarında uyarı döner (tasarımcı o katmanı rasterize
 * eder). Metin boyutları ve konumları Photoshop'taki çizime göre alınır.
 */

export type PsdWarning =
  | { code: "effects" | "mask" | "blend" | "adjustment" | "clipping"; layer: string }
  | { code: "font"; layer: string; font: string }
  | { code: "multiline"; layer: string }
  | { code: "between"; layer: string }
  | { code: "lowres"; dpi: number };

export interface PsdPhoto {
  name: string;
  /** Tuval pikseli */
  rect: { x: number; y: number; w: number; h: number };
  /** Şekil maskesi (alan kutusu boyutunda, beyaz + alfa); dikdörtgense null */
  mask: Buffer | null;
}

export interface PsdText {
  name: string;
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  /** Em yüksekliği, tuval pikseli */
  sizePx: number;
  color: string;
  align: "left" | "center" | "right";
  font: LibraryFont;
  bold: boolean;
}

export interface PsdTemplate {
  width: number;
  height: number;
  dpi: number;
  background: Buffer;
  overlay: Buffer | null;
  photos: PsdPhoto[];
  texts: PsdText[];
  warnings: PsdWarning[];
}

export class PsdImportError extends Error {
  constructor(readonly code: "unreadable" | "too_large" | "no_photo", message: string) {
    super(message);
  }
}

// Sunucuda tuval yok: ag-psd yalnız ham piksel dizisi üretsin
initializeCanvas(
  () => { throw new Error("canvas yok"); },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: "srgb" }) as ImageData,
);

const PHOTO_NAME = /^\s*(photo|foto|fotoğraf|fotograf|image|resim|görsel|gorsel)\b/i;
const FIXED_TEXT = /(sabit|fixed|static)/i;
/** Tuvalin uzun kenarı bundan büyükse bellek taşar */
const MAX_SIDE = 12000;

type Leaf = { layer: Layer; kind: "photo" | "text" | "pixels"; name: string };

export async function importPsd(buffer: Buffer): Promise<PsdTemplate> {
  let psd: Psd;
  try {
    psd = readPsd(buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true, skipLinkedFilesData: true });
  } catch (err) {
    console.error("[psd-import] okunamadı:", err);
    throw new PsdImportError("unreadable", "PSD okunamadı");
  }
  const W = psd.width;
  const H = psd.height;
  if (Math.max(W, H) > MAX_SIDE) throw new PsdImportError("too_large", "PSD çok büyük");

  const warnings: PsdWarning[] = [];
  const dpi = resolutionOf(psd);
  if (dpi < 150) warnings.push({ code: "lowres", dpi });

  // Katman ağacı alttan üste düzleştirilir; gizli katman ve gruplar atlanır.
  // Adı fotoğraf olan grup tek bir alan sayılır.
  const leaves: Leaf[] = [];
  const walk = (layers: Layer[] | undefined) => {
    for (const layer of layers ?? []) {
      if (layer.hidden) continue;
      const name = String(layer.name ?? "");
      if (PHOTO_NAME.test(name)) { leaves.push({ layer, kind: "photo", name }); continue; }
      if (layer.children) { walk(layer.children); continue; }
      if (layer.adjustment) { warnings.push({ code: "adjustment", layer: name }); continue; }
      if (layer.text && !FIXED_TEXT.test(name)) { leaves.push({ layer, kind: "text", name }); continue; }
      if (layer.imageData) leaves.push({ layer, kind: "pixels", name });
    }
  };
  walk(psd.children);

  const firstPhoto = leaves.findIndex((l) => l.kind === "photo");
  const lastPhoto = leaves.map((l) => l.kind).lastIndexOf("photo");
  if (firstPhoto < 0) throw new PsdImportError("no_photo", "Fotoğraf katmanı yok");

  const below: Layer[] = [];
  const above: Layer[] = [];
  const photos: PsdPhoto[] = [];
  const texts: PsdText[] = [];
  leaves.forEach((leaf, i) => {
    if (leaf.kind === "pixels") {
      note(leaf.layer, warnings);
      if (i < firstPhoto) below.push(leaf.layer);
      else {
        // Fotoğraflar arasında kalan katman üste alınır; sıralama bozulabilir
        if (i < lastPhoto) warnings.push({ code: "between", layer: leaf.name });
        above.push(leaf.layer);
      }
    }
  });

  for (const leaf of leaves) {
    if (leaf.kind === "photo") {
      const photo = await photoOf(leaf, W, H);
      if (photo) photos.push(photo);
    } else if (leaf.kind === "text") {
      const t = textOf(leaf, W, H, warnings);
      if (t) texts.push(t);
    }
  }
  if (!photos.length) throw new PsdImportError("no_photo", "Fotoğraf katmanı boş");

  const background = await flatten(below, W, H, true);
  const overlay = above.length ? await flatten(above, W, H, false) : null;
  return { width: W, height: H, dpi, background, overlay, photos, texts, warnings };
}

function resolutionOf(psd: Psd): number {
  const r = psd.imageResources?.resolutionInfo;
  if (!r?.horizontalResolution) return 300;
  const v = r.horizontalResolutionUnit === "PPCM" ? r.horizontalResolution * 2.54 : r.horizontalResolution;
  return Math.round(Math.min(1200, Math.max(36, v)));
}

function note(layer: Layer, warnings: PsdWarning[]) {
  const name = String(layer.name ?? "");
  if (layer.effects && Object.values(layer.effects).some((e) => e && (Array.isArray(e) ? e.some((x) => x?.enabled !== false) : (e as { enabled?: boolean }).enabled !== false)))
    warnings.push({ code: "effects", layer: name });
  if (layer.mask && !layer.mask.disabled && layer.mask.imageData) warnings.push({ code: "mask", layer: name });
  if (layer.blendMode && layer.blendMode !== "normal" && layer.blendMode !== "pass through") warnings.push({ code: "blend", layer: name });
  if (layer.clipping) warnings.push({ code: "clipping", layer: name });
}

/** Katmanın tuval içinde kalan kısmı: sharp tuvalden taşan katmanı reddediyor */
function clipped(layer: Layer, W: number, H: number, opacity = 1) {
  const img = layer.imageData;
  if (!img || !img.width || !img.height) return null;
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(W, left + img.width), y1 = Math.min(H, top + img.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const w = x1 - x0, h = y1 - y0;
  const out = Buffer.alloc(w * h * 4);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const srow = ((y + y0 - top) * img.width + (x0 - left)) * 4;
    const drow = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      out[drow + x] = src[srow + x];
      out[drow + x + 1] = src[srow + x + 1];
      out[drow + x + 2] = src[srow + x + 2];
      out[drow + x + 3] = Math.round(src[srow + x + 3] * opacity);
    }
  }
  return { data: out, left: x0, top: y0, width: w, height: h };
}

async function flatten(layers: Layer[], W: number, H: number, opaque: boolean): Promise<Buffer> {
  const parts = layers
    .map((l) => clipped(l, W, H, l.opacity ?? 1))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ input: p.data, raw: { width: p.width, height: p.height, channels: 4 as const }, left: p.left, top: p.top }));
  // Arka plan hiç yoksa beyaz zemin: şablon görseli boş kalmasın
  const base = sharp({ create: { width: W, height: H, channels: 4, background: opaque && !parts.length ? "#ffffff" : { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite(parts).png({ compressionLevel: 9 }).toBuffer();
}

/** Fotoğraf katmanı ya da grubu: pikselleri birleştirilip şekli çıkarılır */
async function photoOf(leaf: Leaf, W: number, H: number): Promise<PsdPhoto | null> {
  const layers: Layer[] = [];
  const collect = (l: Layer) => {
    if (l.hidden) return;
    if (l.children) l.children.forEach(collect);
    else if (l.imageData) layers.push(l);
  };
  collect(leaf.layer);
  if (!layers.length) return null;
  const alpha = await sharp(await flatten(layers, W, H, false)).ensureAlpha().extractChannel(3).raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const a = alpha.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (a[y * W + x] > 127) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // Kutunun %98'i doluysa dikdörtgen alan; maske gereksiz
  let filled = 0;
  const mask = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[(y + y0) * W + (x + x0)] <= 127) continue;
      filled++;
      const i = (y * w + x) * 4;
      mask[i] = mask[i + 1] = mask[i + 2] = mask[i + 3] = 255;
    }
  }
  const rect = { x: x0, y: y0, w, h };
  if (filled / (w * h) >= 0.98) return { name: leaf.name, rect, mask: null };
  return { name: leaf.name, rect, mask: await sharp(mask, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer() };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** PostScript adından ("PlayfairDisplay-Italic") kütüphane fontu */
function matchFont(psName: string): LibraryFont | null {
  const base = norm(psName.split("-")[0] ?? psName);
  if (!base) return null;
  return FONT_LIBRARY.find((f) => norm(f.family) === base)
    ?? FONT_LIBRARY.find((f) => norm(f.family).startsWith(base) || base.startsWith(norm(f.family)))
    ?? FONT_LIBRARY.find((f) => norm(f.label) === base)
    ?? null;
}

function textOf(leaf: Leaf, W: number, H: number, warnings: PsdWarning[]): PsdText | null {
  const t = leaf.layer.text;
  if (!t?.text?.trim()) return null;
  let text = t.text.replace(/\r\n?|\n/g, "\n").trim();
  if (text.includes("\n")) {
    warnings.push({ code: "multiline", layer: leaf.name });
    text = text.split("\n").map((s) => s.trim()).filter(Boolean).join(" ");
  }
  const style = t.style ?? t.styleRuns?.[0]?.style ?? {};
  const fontName = String(style.font?.name ?? "");
  const font = matchFont(fontName) ?? FONT_LIBRARY[0];
  if (fontName && !matchFont(fontName)) warnings.push({ code: "font", layer: leaf.name, font: fontName });

  const left = leaf.layer.left ?? 0, top = leaf.layer.top ?? 0;
  const right = leaf.layer.right ?? left, bottom = leaf.layer.bottom ?? top;
  const inkH = Math.max(1, bottom - top);
  // Metnin punto değeri dönüşüm ölçeğiyle piksele çevrilir; çizimle çok
  // tutarsızsa (eski dosya, bozuk motor verisi) mürekkep yüksekliğinden tahmin
  const scale = Math.abs(t.transform?.[3] ?? 1) || 1;
  const fromStyle = Number(style.fontSize ?? 0) * scale;
  const sizePx = fromStyle > inkH * 0.6 && fromStyle < inkH * 3 ? fromStyle : inkH * 1.3;

  const j = t.paragraphStyle?.justification ?? t.paragraphStyleRuns?.[0]?.style?.justification ?? "left";
  const align: PsdText["align"] = j === "center" ? "center" : j === "right" ? "right" : "left";
  // Alan, çizilen metinden geniş tutulur: müşteri daha uzun bir isim yazabilsin
  const inkW = Math.max(1, right - left);
  const w = Math.min(W, inkW * 1.4 + sizePx);
  const x = align === "left" ? left : align === "right" ? right - w : (left + right) / 2 - w / 2;
  const h = Math.min(H, sizePx * 1.25);
  const y = (top + bottom) / 2 - h / 2;
  const c = style.fillColor as { r?: number; g?: number; b?: number } | undefined;
  const hex = c && typeof c.r === "number"
    ? `#${[c.r, c.g ?? 0, c.b ?? 0].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`
    : "#111111";
  return {
    name: leaf.name,
    text,
    rect: { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(w, W - Math.max(0, x)), h },
    sizePx,
    color: hex,
    align,
    font,
    bold: Boolean(style.fauxBold) || /bold|black|heavy/i.test(fontName),
  };
}
