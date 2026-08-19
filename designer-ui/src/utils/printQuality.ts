/**
 * Baskı çözünürlüğü değerlendirmesi.
 *
 * Üretim dosyası 300 DPI'da çıkıyor (CanvasArea.exportPrintFile), ama yüklenen
 * görselin bunu besleyip beslemediğine bakılmıyordu: müşteri 400x400 bir
 * görseli 25 cm'ye büyütünce ekranda düzgün, baskıda bulanık çıkıyor. Buradaki
 * hesap uyarıyı tasarım anında vermek için.
 *
 * Eşikler tekstil baskısına göre: 300 DPI ideal, 150 DPI kabul edilebilir,
 * 100'ün altı gözle görülür bozulma. Kağıt baskının aksine kumaş dokusu bir
 * miktar yumuşatma sağladığı için 150 sınırı fotoğraf baskısından düşük.
 */

export type PrintQuality = "good" | "warn" | "bad";

/** Bu değerin üstü sorunsuz kabul edilir */
export const QUALITY_GOOD_DPI = 150;
/** Bu değerin altı müşteriye açıkça bildirilir */
export const QUALITY_MIN_DPI = 100;

const MM_PER_INCH = 25.4;

/** Görselin basılacağı ölçüde kaç DPI'a denk geldiği */
export function effectiveDpi(naturalPx: number, printedMm: number): number {
  if (!(naturalPx > 0) || !(printedMm > 0)) return 0;
  return naturalPx / (printedMm / MM_PER_INCH);
}

export function qualityFor(dpi: number): PrintQuality {
  if (dpi >= QUALITY_GOOD_DPI) return "good";
  if (dpi >= QUALITY_MIN_DPI) return "warn";
  return "bad";
}

/**
 * Bir nesnenin en dar ekseninden kalite belirlenir — bir kenarı yeterli olsa
 * bile dar kenar bulanıklaşıyor.
 */
export function qualityForObject(
  natural: { width: number; height: number },
  printedMm: { width: number; height: number },
): { quality: PrintQuality; dpi: number } {
  const dpiX = effectiveDpi(natural.width, printedMm.width);
  const dpiY = effectiveDpi(natural.height, printedMm.height);
  const dpi = Math.min(dpiX || Infinity, dpiY || Infinity);
  if (!Number.isFinite(dpi) || dpi <= 0) return { quality: "good", dpi: 0 };
  return { quality: qualityFor(dpi), dpi };
}

/** Verilen fiziksel ölçüyü hedef DPI'da basmak için gereken piksel sayısı */
export function minPixelsFor(printedMm: number, dpi = QUALITY_GOOD_DPI): number {
  if (!(printedMm > 0)) return 0;
  return Math.ceil((printedMm / MM_PER_INCH) * dpi);
}
