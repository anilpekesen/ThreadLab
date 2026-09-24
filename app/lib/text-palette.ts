/**
 * Müşteriye açılabilecek yazı renkleri.
 *
 * Fontta olduğu gibi burada da izin listesi şablonda: mağaza sahibi hangi
 * renkleri açtığını işaretliyor, müşteri yalnızca onların arasından seçiyor.
 * Serbest renk kabul etmemenin sebebi baskı: müşteri açık sarı seçerse beyaz
 * paspartunun üstünde okunmaz bir yazı basılır ve bunu ancak ürün eline
 * geçtiğinde görür.
 *
 * Palet beş grupta toplandı; tek sıra hâlinde yirmi sekiz kutucuk panelde
 * okunmaz oluyordu. Gruplar yalnızca yönetim ekranını düzenliyor, müşteriye
 * mağazanın açtığı renkler düz bir sıra olarak gidiyor.
 *
 * Mağaza sahibi listede olmayan bir rengi de ekleyebiliyor; palet hızlı yol.
 */

export interface PaletteColor {
  hex: string;
  label: string;
  labelEn: string;
  /** Panelde renkleri satırlara ayırmak için; müşteri tarafına gitmiyor */
  group: PaletteGroup;
}

export type PaletteGroup = "notr" | "sicak" | "kirmizi" | "soguk" | "mor";

export const PALETTE_GROUPS: Array<{ id: PaletteGroup; label: string; labelEn: string }> = [
  { id: "notr", label: "Nötr", labelEn: "Neutral" },
  { id: "sicak", label: "Sıcak ve metalik", labelEn: "Warm and metallic" },
  { id: "kirmizi", label: "Kırmızı ve pembe", labelEn: "Red and pink" },
  { id: "soguk", label: "Mavi ve yeşil", labelEn: "Blue and green" },
  { id: "mor", label: "Mor", labelEn: "Purple" },
];

export const TEXT_PALETTE: PaletteColor[] = [
  { hex: "#1a1a1a", label: "Siyah", labelEn: "Black", group: "notr" },
  { hex: "#3d3d3d", label: "Antrasit", labelEn: "Anthracite", group: "notr" },
  { hex: "#6b6b6b", label: "Gri", labelEn: "Grey", group: "notr" },
  { hex: "#9e9e9e", label: "Açık gri", labelEn: "Light grey", group: "notr" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White", group: "notr" },
  { hex: "#f4ece1", label: "Krem", labelEn: "Cream", group: "notr" },
  { hex: "#8a7f6d", label: "Vizon", labelEn: "Taupe", group: "notr" },

  { hex: "#b08d57", label: "Altın", labelEn: "Gold", group: "sicak" },
  { hex: "#c9a227", label: "Hardal", labelEn: "Mustard", group: "sicak" },
  { hex: "#b87333", label: "Bakır", labelEn: "Copper", group: "sicak" },
  { hex: "#8c6239", label: "Bronz", labelEn: "Bronze", group: "sicak" },
  { hex: "#6b4423", label: "Kahve", labelEn: "Brown", group: "sicak" },
  { hex: "#d9b98a", label: "Bej", labelEn: "Beige", group: "sicak" },

  { hex: "#7b2d3b", label: "Bordo", labelEn: "Burgundy", group: "kirmizi" },
  { hex: "#a0522d", label: "Kiremit", labelEn: "Terracotta", group: "kirmizi" },
  { hex: "#c85a54", label: "Mercan", labelEn: "Coral", group: "kirmizi" },
  { hex: "#b76e79", label: "Rose gold", labelEn: "Rose gold", group: "kirmizi" },
  { hex: "#8c4a5f", label: "Gül kurusu", labelEn: "Dusty rose", group: "kirmizi" },
  { hex: "#d8a0a6", label: "Pudra", labelEn: "Powder pink", group: "kirmizi" },

  { hex: "#1f3a5f", label: "Gece mavisi", labelEn: "Midnight blue", group: "soguk" },
  { hex: "#2f4858", label: "Lacivert", labelEn: "Navy", group: "soguk" },
  { hex: "#3f7c9e", label: "Petrol", labelEn: "Petrol blue", group: "soguk" },
  { hex: "#7fa8c9", label: "Gök mavisi", labelEn: "Sky blue", group: "soguk" },
  { hex: "#2f5d50", label: "Çam", labelEn: "Pine", group: "soguk" },
  { hex: "#4a6741", label: "Zeytin", labelEn: "Olive", group: "soguk" },
  { hex: "#6b7f5e", label: "Adaçayı", labelEn: "Sage", group: "soguk" },

  { hex: "#5b3a5c", label: "Mürdüm", labelEn: "Plum", group: "mor" },
  { hex: "#9b8aa6", label: "Lavanta", labelEn: "Lavender", group: "mor" },
];

/** Yalnızca #rrggbb kabul ediliyor; kısa biçim genişletiliyor. */
export function normalizeHex(raw: unknown): string | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return undefined;
}

/**
 * Müşterinin seçtiği rengi güvenle çözer.
 *
 * Fonttaki iki kapının aynısı: renk geçerli bir hex olmalı ve o metin alanı
 * için mağazanın açtığı listede bulunmalı. Tutmazsa şablonun kendi rengine
 * dönülüyor — geçersiz bir seçim yüzünden sipariş düşmemeli.
 */
export function resolveChosenColor(
  secim: string | undefined,
  izinliler: string[] | undefined,
  /** Mağaza serbest renk seçimini açtıysa geçerli her renk kodu kabul edilir */
  serbest = false,
): string | undefined {
  const hex = normalizeHex(secim);
  if (!hex) return undefined;
  if (serbest) return hex;
  if (!izinliler?.length || !izinliler.includes(hex)) return undefined;
  return hex;
}

/** Beyaz gibi açık renkler için örnek kutusuna kenarlık gerekiyor */
export function isLightColor(hex: string): boolean {
  const h = normalizeHex(hex);
  if (!h) return false;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 200;
}

export function colorLabel(hex: string, lang: "tr" | "en" = "tr"): string {
  const c = TEXT_PALETTE.find((x) => x.hex === normalizeHex(hex));
  return (lang === "en" ? c?.labelEn : c?.label) ?? hex;
}
