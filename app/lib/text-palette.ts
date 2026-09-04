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
  /** Panelde renkleri satırlara ayırmak için; müşteri tarafına gitmiyor */
  group: PaletteGroup;
}

export type PaletteGroup = "notr" | "sicak" | "kirmizi" | "soguk" | "mor";

export const PALETTE_GROUPS: Array<{ id: PaletteGroup; label: string }> = [
  { id: "notr", label: "Nötr" },
  { id: "sicak", label: "Sıcak ve metalik" },
  { id: "kirmizi", label: "Kırmızı ve pembe" },
  { id: "soguk", label: "Mavi ve yeşil" },
  { id: "mor", label: "Mor" },
];

export const TEXT_PALETTE: PaletteColor[] = [
  { hex: "#1a1a1a", label: "Siyah", group: "notr" },
  { hex: "#3d3d3d", label: "Antrasit", group: "notr" },
  { hex: "#6b6b6b", label: "Gri", group: "notr" },
  { hex: "#9e9e9e", label: "Açık gri", group: "notr" },
  { hex: "#ffffff", label: "Beyaz", group: "notr" },
  { hex: "#f4ece1", label: "Krem", group: "notr" },
  { hex: "#8a7f6d", label: "Vizon", group: "notr" },

  { hex: "#b08d57", label: "Altın", group: "sicak" },
  { hex: "#c9a227", label: "Hardal", group: "sicak" },
  { hex: "#b87333", label: "Bakır", group: "sicak" },
  { hex: "#8c6239", label: "Bronz", group: "sicak" },
  { hex: "#6b4423", label: "Kahve", group: "sicak" },
  { hex: "#d9b98a", label: "Bej", group: "sicak" },

  { hex: "#7b2d3b", label: "Bordo", group: "kirmizi" },
  { hex: "#a0522d", label: "Kiremit", group: "kirmizi" },
  { hex: "#c85a54", label: "Mercan", group: "kirmizi" },
  { hex: "#b76e79", label: "Rose gold", group: "kirmizi" },
  { hex: "#8c4a5f", label: "Gül kurusu", group: "kirmizi" },
  { hex: "#d8a0a6", label: "Pudra", group: "kirmizi" },

  { hex: "#1f3a5f", label: "Gece mavisi", group: "soguk" },
  { hex: "#2f4858", label: "Lacivert", group: "soguk" },
  { hex: "#3f7c9e", label: "Petrol", group: "soguk" },
  { hex: "#7fa8c9", label: "Gök mavisi", group: "soguk" },
  { hex: "#2f5d50", label: "Çam", group: "soguk" },
  { hex: "#4a6741", label: "Zeytin", group: "soguk" },
  { hex: "#6b7f5e", label: "Adaçayı", group: "soguk" },

  { hex: "#5b3a5c", label: "Mürdüm", group: "mor" },
  { hex: "#9b8aa6", label: "Lavanta", group: "mor" },
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
): string | undefined {
  if (!izinliler?.length) return undefined;
  const hex = normalizeHex(secim);
  if (!hex || !izinliler.includes(hex)) return undefined;
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

export function colorLabel(hex: string): string {
  return TEXT_PALETTE.find((c) => c.hex === normalizeHex(hex))?.label ?? hex;
}
