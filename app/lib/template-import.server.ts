import sharp from "sharp";
import { uploadToR2 } from "~/lib/r2.server";
import { importPsd, PsdImportError, type PsdWarning } from "~/lib/psd-import.server";
import { holeSlots } from "~/lib/hole-slots.server";
import { sortReadingOrder, type ImageSlot, type Slot, type TextSlot } from "~/lib/slots";
import { createPersonalizerTemplate, type PersonalizerCategory } from "~/models/personalizer.server";
import { createPrintProduct, listPrintProducts } from "~/models/print-product.server";

/**
 * Tasarım dosyasından kişiselleştirici şablonu kurar.
 *
 *   - PSD: katmanlar ayrıştırılır (bkz. psd-import.server) — arka plan, üst
 *     katman, şekilli fotoğraf alanları ve düzenlenebilir yazılar.
 *   - PNG/JPG (Canva vb.): fotoğraf alanları şeffaf bırakılmış ya da saf
 *     yeşil (#00FF00) şekille işaretlenmiş tasarım. Canva'da tasarımın içinde
 *     delik bırakmak zor; yeşil yer tutucu koymak kolay. Delikler alan olur,
 *     aynı görsel fotoğrafların üstüne biner.
 *
 * Baskı ebadı dosyanın piksel ölçüsü ve çözünürlüğünden çıkarılır; mağazada
 * aynı ölçüde bir ebat varsa o kullanılır, yoksa taşma payı olmadan yenisi
 * açılır (dosyanın kendisi baskı tuvalidir). Sonuç stüdyoda gözden geçirilir.
 */

/** PNG'de çözünürlük yazmıyorsa 300 DPI varsayılır; ebat stüdyoda kontrol edilmeli */
export type ImportWarning = PsdWarning | { code: "dpi_assumed"; dpi: number };

export class TemplateImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface ImportOptions {
  shop: string;
  name: string;
  category: PersonalizerCategory;
  en: boolean;
}

export interface ImportResult {
  id: string;
  photos: number;
  texts: number;
  size: { widthMm: number; heightMm: number; dpi: number; created: boolean };
  warnings: ImportWarning[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Dosyanın ölçüsündeki baskı ebadı: mağazada varsa o, yoksa yeni */
async function printProductFor(shop: string, widthPx: number, heightPx: number, dpi: number) {
  const widthMm = round1((widthPx / dpi) * 25.4);
  const heightMm = round1((heightPx / dpi) * 25.4);
  const existing = (await listPrintProducts(shop)).find((p) =>
    Math.abs(p.width_mm + p.bleed_mm * 2 - widthMm) <= 1
    && Math.abs(p.height_mm + p.bleed_mm * 2 - heightMm) <= 1
    && p.dpi === dpi);
  if (existing) return { id: existing.id, widthMm, heightMm, created: false };
  const cm = (mm: number) => String(round1(mm / 10)).replace(".", ",");
  const created = await createPrintProduct(shop, {
    name: `${cm(widthMm)}×${cm(heightMm)} cm`,
    width_mm: widthMm,
    height_mm: heightMm,
    dpi,
    bleed_mm: 0,
    safe_mm: 3,
  });
  return { id: created.id, widthMm, heightMm, created: true };
}

/** Katman adı anlamlıysa etiket olur; "Layer 3" gibi adlarda sıra numarası */
function labelFor(name: string, text: string, i: number, en: boolean) {
  const generic = !name.trim() || /^(layer|katman|text|metin|yazı)\s*\d*$/i.test(name.trim()) || name.trim() === text;
  if (!generic) return name.trim().slice(0, 40);
  return en ? `Text ${i + 1}` : `${i + 1}. Yazı`;
}

export async function importTemplateFile(file: { name: string; buffer: Buffer }, opts: ImportOptions): Promise<ImportResult> {
  const isPsd = /\.psd$/i.test(file.name) || file.buffer.subarray(0, 4).toString("latin1") === "8BPS";
  return isPsd ? fromPsd(file.buffer, opts) : fromPng(file.buffer, opts);
}

async function fromPsd(buffer: Buffer, opts: ImportOptions): Promise<ImportResult> {
  const { en } = opts;
  let psd;
  try {
    psd = await importPsd(buffer);
  } catch (err) {
    if (err instanceof PsdImportError) {
      const msg = {
        unreadable: en ? "The PSD file couldn't be read. Save it again from Photoshop (with \"Maximize compatibility\") and retry." : "PSD dosyası okunamadı. Photoshop'tan \"Uyumluluğu en üst düzeye çıkar\" açıkken yeniden kaydedip deneyin.",
        too_large: en ? "The canvas is too large (max 12,000 px on the long side)." : "Tuval çok büyük (uzun kenar en fazla 12.000 px).",
        no_photo: en ? "No photo layer found. Name the layers where photos go starting with \"photo\" (e.g. \"photo 1\")." : "Fotoğraf katmanı bulunamadı. Fotoğraf gelecek katmanların adını \"foto\" ile başlatın (örn. \"foto 1\").",
      }[err.code];
      throw new TemplateImportError(err.code, msg);
    }
    throw err;
  }
  const W = psd.width, H = psd.height;

  const templateUrl = await uploadToR2(psd.background, "png", "personalizer-template");
  const overlayUrl = psd.overlay ? await uploadToR2(psd.overlay, "png", "personalizer-overlay") : "";

  const draft: ImageSlot[] = [];
  for (const [i, p] of psd.photos.entries()) {
    const maskUrl = p.mask ? await uploadToR2(p.mask, "png", "personalizer-mask") : undefined;
    draft.push({
      id: `photo_${i + 1}`,
      kind: "image",
      source: `photo_${i + 1}`,
      rect: { x: p.rect.x / W, y: p.rect.y / H, w: p.rect.w / W, h: p.rect.h / H },
      ...(maskUrl ? { mask_url: maskUrl } : {}),
      fit: "cover",
      allow: { pan: true, zoom: true, rotate: true },
      label: "",
      order: i + 1,
    });
  }
  const photos = sortReadingOrder(draft).map((s) => ({
    ...s,
    id: `photo_${s.order}`,
    source: `photo_${s.order}`,
    label: en ? `Photo ${s.order}` : `${s.order}. Fotoğraf`,
  }));

  const texts: TextSlot[] = psd.texts.map((t, i) => ({
    id: `text_${i + 1}`,
    kind: "text",
    rect: { x: t.rect.x / W, y: t.rect.y / H, w: t.rect.w / W, h: t.rect.h / H },
    label: labelFor(t.name, t.text, i, en),
    order: 100 + i + 1,
    mode: "free",
    default_value: t.text,
    max_length: Math.min(80, Math.max(20, Math.ceil(Array.from(t.text).length * 1.5))),
    font_size: t.sizePx / H,
    font_family: t.font.family,
    font_url: t.font.url,
    color: t.color,
    bold: false,
    align: t.align,
    overflow: "shrink",
  }));

  const pp = await printProductFor(opts.shop, W, H, psd.dpi);
  const created = await createPersonalizerTemplate({
    shop: opts.shop,
    name: opts.name,
    description: "",
    template_url: templateUrl,
    overlay_url: overlayUrl,
    photo_x: 0, photo_y: 0, photo_width: 0, photo_height: 0,
    layout_mode: "mask",
    category: opts.category,
    slots: [...photos, ...texts] as Slot[],
    print_product_id: pp.id,
    expected_slots: photos.length,
  });
  return {
    id: created.id,
    photos: photos.length,
    texts: texts.length,
    size: { widthMm: pp.widthMm, heightMm: pp.heightMm, dpi: psd.dpi, created: pp.created },
    warnings: psd.warnings,
  };
}

async function fromPng(buffer: Buffer, opts: ImportOptions): Promise<ImportResult> {
  const { en } = opts;
  let png: Buffer;
  let dpi = 300;
  let assumed = true;
  try {
    const meta = await sharp(buffer).metadata();
    // Canva 96 DPI yazıyor; bu değerle ebat yanlış çıkar. 150 altı yok sayılır.
    if (meta.density && meta.density >= 150) { dpi = Math.round(meta.density); assumed = false; }
    const keyed = await keyGreen(buffer);
    if (!keyed && !meta.hasAlpha) {
      throw new TemplateImportError("no_alpha", en
        ? "No photo areas found. Mark where photos go with pure green (#00FF00) shapes, or leave them transparent in a PNG."
        : "Fotoğraf alanı bulunamadı. Fotoğraf gelecek yerleri saf yeşil (#00FF00) şekillerle işaretleyin ya da PNG'de şeffaf bırakın.");
    }
    png = keyed ?? await sharp(buffer).png().toBuffer();
  } catch (err) {
    if (err instanceof TemplateImportError) throw err;
    throw new TemplateImportError("unreadable", en ? "The image couldn't be read." : "Görsel okunamadı.");
  }
  const found = await holeSlots(png, en);
  if (!found.ok) throw new TemplateImportError("no_holes", found.message ?? found.error ?? "");

  const url = await uploadToR2(png, "png", "personalizer-template");
  const { width, height } = found.scanned;
  const pp = await printProductFor(opts.shop, width, height, dpi);
  const created = await createPersonalizerTemplate({
    shop: opts.shop,
    name: opts.name,
    description: "",
    // Delikli tasarımda aynı görsel hem alan kaynağı hem üst katman
    template_url: url,
    overlay_url: url,
    photo_x: 0, photo_y: 0, photo_width: 0, photo_height: 0,
    layout_mode: "mask",
    category: opts.category,
    slots: found.slots,
    print_product_id: pp.id,
    expected_slots: found.slots.length,
  });
  return {
    id: created.id,
    photos: found.slots.length,
    texts: 0,
    size: { widthMm: pp.widthMm, heightMm: pp.heightMm, dpi, created: pp.created },
    warnings: assumed ? [{ code: "dpi_assumed", dpi }] : [],
  };
}

/**
 * Saf yeşil (#00FF00) yer tutucuları şeffaf deliğe çevirir; yeşil yoksa null.
 *
 * Çekirdek: neredeyse saf yeşil pikseller (yaprak gibi olağan yeşiller
 * yakalanmasın diye dar). Kenar: çekirdeğe 3 piksel içindeki yeşilimsi
 * yumuşatma pikselleri — bırakılırsa fotoğrafın çevresinde yeşil hale kalır.
 */
async function keyGreen(buffer: Buffer): Promise<Buffer | null> {
  const { data, info } = await sharp(buffer, { limitInputPixels: false }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const core = new Uint8Array(N);
  let count = 0;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (data[i + 3] > 0 && data[i + 1] >= 200 && data[i] <= 90 && data[i + 2] <= 90) { core[p] = 1; count++; }
  }
  if (count < N * 0.001) return null;
  // Çekirdeğe yakınlık: 3 geçişlik genişletme
  let near = core;
  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(near);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (near[p]) continue;
        if ((x > 0 && near[p - 1]) || (x < W - 1 && near[p + 1]) || (y > 0 && near[p - W]) || (y < H - 1 && near[p + W])) next[p] = 1;
      }
    }
    near = next;
  }
  for (let p = 0; p < N; p++) {
    if (!near[p]) continue;
    const i = p * 4;
    const greenness = data[i + 1] - Math.max(data[i], data[i + 2]);
    if (core[p] || greenness > 30) data[i + 3] = 0;
  }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
