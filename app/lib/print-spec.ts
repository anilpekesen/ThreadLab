/**
 * Baskı ürünü tanımı — bir tasarımın fiziksel karşılığı.
 *
 * Şablon ile ebat bilinçli olarak ayrıldı. Şablon yerleşimi normalize (0–1)
 * koordinatla tutar; ebat, dpi ve taşma payı burada durur. Böylece aynı
 * yerleşim birden fazla ebatta satılabilir ve yeni bir ebat eklemek şablonları
 * kopyalamayı gerektirmez.
 *
 * ÖNEMLİ: Normalize koordinat ölçüden bağımsızdır, ORANDAN değil. 30x40 (0.750)
 * ile 50x70 (0.714) aynı şablonu paylaşamaz; esnetilirse daireler ovalleşir.
 * Bu yüzden şablon bir en-boy oranına aittir ve yalnızca aynı orandaki baskı
 * ürünleriyle eşleşebilir (bkz. `aspectMatches`).
 */

/** Kağıt ölçüsünü piksele çevirir. Yuvarlama TEK seferde yapılır: parça parça
 *  çevirip toplamak bir-iki piksellik kaymalar üretiyor. */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * 25.4;
}

/** Baskının nasıl giydirileceği. Düz ürünler dosyayı olduğu gibi kullanır. */
export type WrapKind = "flat" | "cylindrical";

export interface PrintProduct {
  id: string;
  shop: string;
  name: string;
  /** Kesim ölçüsü — müşteriye söylenen ebat */
  width_mm: number;
  height_mm: number;
  dpi: number;
  /** Her kenardan taşma payı; kesimdeki kaymayı tolere eder */
  bleed_mm: number;
  /** Kesimden içeride kalması gereken güvenli alan */
  safe_mm: number;
  wrap: WrapKind;
  /** Müşteriye gösterilecek ürün görseli */
  mockup_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Yerleşim hesaplarında kullanılan türetilmiş ölçüler */
export interface PrintCanvas {
  /** Taşma dahil tuval — üretilecek dosyanın gerçek boyutu */
  canvasWidth: number;
  canvasHeight: number;
  /** Kesim dikdörtgeni, tuval içindeki konumuyla */
  trim: { x: number; y: number; width: number; height: number };
  /** Güvenli alan dikdörtgeni */
  safe: { x: number; y: number; width: number; height: number };
  /** Kesim ölçüsünün en/boy oranı — şablon eşleşmesi bunun üzerinden yapılır */
  aspect: number;
}

export function printCanvas(p: Pick<PrintProduct, "width_mm" | "height_mm" | "dpi" | "bleed_mm" | "safe_mm">): PrintCanvas {
  const { dpi } = p;
  const bleed = Math.max(0, p.bleed_mm);
  const safe = Math.max(0, p.safe_mm);

  const canvasWidth = mmToPx(p.width_mm + bleed * 2, dpi);
  const canvasHeight = mmToPx(p.height_mm + bleed * 2, dpi);
  const bleedPx = mmToPx(bleed, dpi);
  const safePx = mmToPx(safe, dpi);

  return {
    canvasWidth,
    canvasHeight,
    trim: {
      x: bleedPx,
      y: bleedPx,
      width: canvasWidth - bleedPx * 2,
      height: canvasHeight - bleedPx * 2,
    },
    safe: {
      x: bleedPx + safePx,
      y: bleedPx + safePx,
      width: canvasWidth - (bleedPx + safePx) * 2,
      height: canvasHeight - (bleedPx + safePx) * 2,
    },
    aspect: p.width_mm / p.height_mm,
  };
}

/**
 * İki oranın aynı sayılıp sayılmayacağı.
 *
 * Tolerans yüzde bir: 20x20 ile 30x30 aynıdır, 30x40 (0.750) ile 50x70 (0.714)
 * değildir. Aradaki fark yüzde beştir ve gözle görülür bozulma üretir.
 */
export function aspectMatches(a: number, b: number, tolerance = 0.01): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerance;
}

/** Oranı gruplamak için kararlı bir anahtar; listeleme ve filtrelemede kullanılır */
export function aspectKey(aspect: number): string {
  return aspect.toFixed(3);
}

/** Yaygın oranların okunabilir adları — yönetici arayüzünde gösterilir */
export function aspectLabel(aspect: number): string {
  const known: Array<[number, string]> = [
    [1 / 1, "1:1"],
    [3 / 4, "3:4"],
    [2 / 3, "2:3"],
    [4 / 5, "4:5"],
    [5 / 7, "5:7"],
    [4 / 3, "4:3"],
    [3 / 2, "3:2"],
  ];
  for (const [value, label] of known) {
    if (aspectMatches(aspect, value)) return label;
  }
  return aspect.toFixed(3);
}

/**
 * Yeni kurulan mağazaya önerilen baskı ürünleri.
 *
 * Mağaza sahibi bunları silebilir ve kendi ebatlarını ekleyebilir; kod hiçbir
 * yerde bu kimliklere bağlı değildir. Amaç, boş bir panelle karşılaşmamasıdır.
 */
export interface PrintProductSeed {
  name: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  bleed_mm: number;
  safe_mm: number;
  wrap: WrapKind;
}

export const DEFAULT_PRINT_PRODUCTS: PrintProductSeed[] = [
  { name: "Yapışan çerçeve 20x20", width_mm: 200, height_mm: 200, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Yapışan çerçeve 30x30", width_mm: 300, height_mm: 300, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Yapışan çerçeve 20x30", width_mm: 200, height_mm: 300, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Yapışan çerçeve 30x40", width_mm: 300, height_mm: 400, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Kanvas tablo 20x25", width_mm: 200, height_mm: 250, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Poster 50x70", width_mm: 500, height_mm: 700, dpi: 300, bleed_mm: 3, safe_mm: 5, wrap: "flat" },
  { name: "Kupa 325 ml", width_mm: 200, height_mm: 90, dpi: 300, bleed_mm: 2, safe_mm: 4, wrap: "cylindrical" },
];
