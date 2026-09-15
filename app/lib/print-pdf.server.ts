import sharp from "sharp";
import { PDFDocument, StandardFonts, cmyk, type PDFPage } from "pdf-lib";

/**
 * Kesim çizgili baskı PDF'i.
 *
 * PNG baskı dosyası taşma payını içeriyor ama kesimin nereden yapılacağını
 * söylemiyor; operatör her dosyada ölçüyü elle hesaplıyordu. PDF'te sayfa
 * kutuları (TrimBox, BleedBox) matbaa yazılımının okuduğu kesim bilgisini
 * taşıyor, köşe çizgileri de basılı kâğıtta kesim yerini gösteriyor.
 *
 *   ┌──────────────── sayfa (işaret payı dahil) ────────────────┐
 *   │    │                                              │       │
 *   │ ── ┌──────────── BleedBox (baskı görseli) ────────┐ ──   │
 *   │    │  ┌─────────── TrimBox (kesim) ───────────┐   │      │
 *   │    │  │                                         │   │      │
 *
 * Görsel piksel olarak olduğu gibi gömülüyor; yeniden örneklenmiyor.
 */

export interface PrintPdfSpec {
  width_mm: number;
  height_mm: number;
  bleed_mm: number;
  dpi: number;
  /**
   * Tabakadan tek tek kesilen kart ürünlerinde iç kesim çizgilerinin kesim
   * kenarından mm konumu. Kenar payına işaret konuyor: operatör 12 kartı
   * nereden keseceğini ölçmek zorunda kalmıyor.
   */
  cuts?: { x: number[]; y: number[] };
}

const MM = 72 / 25.4;
/** Kesim işaretleri için taşma payının dışında bırakılan boşluk */
const SLUG_MM = 12;
/** İşaretin kesim çizgisinden uzaklığı taşma payından en az bu kadar fazla */
const MARK_GAP_MM = 1.5;
const MARK_LEN_MM = 6;

export async function buildCutMarkPdf(
  png: Buffer,
  spec: PrintPdfSpec,
  info: { title: string; subtitle?: string },
): Promise<Uint8Array> {
  const bleed = Math.max(0, spec.bleed_mm);
  const imageW = (spec.width_mm + bleed * 2) * MM;
  const imageH = (spec.height_mm + bleed * 2) * MM;
  const slug = SLUG_MM * MM;
  const pageW = imageW + slug * 2;
  const pageH = imageH + slug * 2;

  // Baskı dosyasının zemini opak; alfa kanalı PDF'te ayrı bir maske olarak
  // gömülüp dosyayı iki katına çıkarıyordu. Beyaza düzleştirip RGB veriyoruz.
  const rgb = await sharp(png, { limitInputPixels: false })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .png({ compressionLevel: 6 })
    .toBuffer();

  const doc = await PDFDocument.create();
  doc.setTitle(asciiOnly(info.title));
  doc.setCreator("PrintLab");
  doc.setProducer("PrintLab");

  const page = doc.addPage([pageW, pageH]);
  const image = await doc.embedPng(rgb);
  page.drawImage(image, { x: slug, y: slug, width: imageW, height: imageH });

  const trim = { x: slug + bleed * MM, y: slug + bleed * MM, w: spec.width_mm * MM, h: spec.height_mm * MM };
  page.setMediaBox(0, 0, pageW, pageH);
  page.setBleedBox(slug, slug, imageW, imageH);
  page.setTrimBox(trim.x, trim.y, trim.w, trim.h);

  drawCropMarks(page, trim, bleed);
  if (spec.cuts) drawCardCutMarks(page, trim, bleed, spec.cuts, spec.width_mm, spec.height_mm);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const line = [
    info.title,
    info.subtitle,
    `${fmt(spec.width_mm / 10)} x ${fmt(spec.height_mm / 10)} cm`,
    `bleed ${fmt(bleed)} mm`,
    `${spec.dpi} dpi`,
  ].filter(Boolean).map((v) => asciiOnly(String(v))).join("  |  ");
  page.drawText(line, {
    x: trim.x,
    y: Math.max(2 * MM, slug / 2 - 3),
    size: 6.5,
    font,
    color: cmyk(0, 0, 0, 1),
  });

  return doc.save({ useObjectStreams: true });
}

/**
 * Dört köşeye ikişer çizgi: kesim kenarının uzantısında, taşma payının
 * dışında başlıyor ki kesim bıçağı işaretin üstünden geçmesin. Renk tek
 * kanal siyah (K=100); dört renk "kayıt siyahı" ince çizgide renk kaymasıyla
 * bulanık görünüyor.
 */
function drawCropMarks(page: PDFPage, trim: { x: number; y: number; w: number; h: number }, bleedMm: number) {
  const offset = (bleedMm + MARK_GAP_MM) * MM;
  const len = MARK_LEN_MM * MM;
  const color = cmyk(0, 0, 0, 1);
  const thickness = 0.3;
  const left = trim.x;
  const right = trim.x + trim.w;
  const bottom = trim.y;
  const top = trim.y + trim.h;

  const corners: Array<{ x: number; y: number; sx: -1 | 1; sy: -1 | 1 }> = [
    { x: left, y: top, sx: -1, sy: 1 },
    { x: right, y: top, sx: 1, sy: 1 },
    { x: left, y: bottom, sx: -1, sy: -1 },
    { x: right, y: bottom, sx: 1, sy: -1 },
  ];
  for (const c of corners) {
    // Yatay çizgi: kesimin yatay kenarı hizasında, yana doğru dışarı
    page.drawLine({
      start: { x: c.x + c.sx * offset, y: c.y },
      end: { x: c.x + c.sx * (offset + len), y: c.y },
      thickness,
      color,
    });
    // Dikey çizgi: kesimin dikey kenarı hizasında, yukarı/aşağı dışarı
    page.drawLine({
      start: { x: c.x, y: c.y + c.sy * offset },
      end: { x: c.x, y: c.y + c.sy * (offset + len) },
      thickness,
      color,
    });
  }
}

/**
 * Tabaka içindeki kart kesimleri. Çizgiler kâğıdın üstüne çizilmiyor —
 * kartların arasından geçerlerdi; işaretler kesim kenarının dışında, köşe
 * işaretleriyle aynı mantıkta duruyor.
 */
function drawCardCutMarks(
  page: PDFPage,
  trim: { x: number; y: number; w: number; h: number },
  bleedMm: number,
  cuts: { x: number[]; y: number[] },
  widthMm: number,
  heightMm: number,
) {
  const offset = (bleedMm + MARK_GAP_MM) * MM;
  const len = MARK_LEN_MM * MM;
  const color = cmyk(0, 0, 0, 1);
  const thickness = 0.3;
  const kenarda = (v: number, tam: number) => v <= 0.2 || v >= tam - 0.2;

  for (const mm of cuts.x) {
    if (kenarda(mm, widthMm)) continue; // kenar zaten köşe işaretlerinde
    const x = trim.x + mm * MM;
    page.drawLine({ start: { x, y: trim.y - offset }, end: { x, y: trim.y - offset - len }, thickness, color });
    page.drawLine({ start: { x, y: trim.y + trim.h + offset }, end: { x, y: trim.y + trim.h + offset + len }, thickness, color });
  }
  // PDF'te y aşağıdan yukarı; kesim listesi tasarımdaki gibi üstten ölçülü
  for (const mm of cuts.y) {
    if (kenarda(mm, heightMm)) continue;
    const y = trim.y + trim.h - mm * MM;
    page.drawLine({ start: { x: trim.x - offset, y }, end: { x: trim.x - offset - len, y }, thickness, color });
    page.drawLine({ start: { x: trim.x + trim.w + offset, y }, end: { x: trim.x + trim.w + offset + len, y }, thickness, color });
  }
}

/** Standart PDF fontu Türkçe harfleri kodlayamıyor; bilgi satırı için sadeleştir */
function asciiOnly(text: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U",
    "×": "x", "—": "-", "–": "-", "·": "|",
  };
  return text.replace(/[^\x20-\x7E]/g, (ch) => map[ch] ?? "");
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
