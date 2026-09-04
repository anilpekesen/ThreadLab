/**
 * Müşteriye açılabilecek yazı renkleri.
 *
 * Fontta olduğu gibi burada da izin listesi şablonda: mağaza sahibi hangi
 * renkleri açtığını işaretliyor, müşteri yalnızca onların arasından seçiyor.
 * Serbest renk kabul etmemenin sebebi baskı: müşteri açık sarı seçerse beyaz
 * paspartunun üstünde okunmaz bir yazı basılır ve bunu ancak ürün eline
 * geçtiğinde görür.
 *
 * Palet, bu ürün ailesinde gerçekten kullanılan renklerden derlendi (çerçeve
 * baskılarında koyu nötrler ve metalik tonlar). Mağaza sahibi listede olmayan
 * bir rengi de ekleyebiliyor; palet yalnızca hızlı yol.
 */

export interface PaletteColor {
  hex: string;
  label: string;
}

export const TEXT_PALETTE: PaletteColor[] = [
  { hex: "#1a1a1a", label: "Siyah" },
  { hex: "#6b6b6b", label: "Gri" },
  { hex: "#ffffff", label: "Beyaz" },
  { hex: "#b08d57", label: "Altın" },
  { hex: "#b76e79", label: "Rose gold" },
  { hex: "#8a7f6d", label: "Vizon" },
  { hex: "#2f4858", label: "Lacivert" },
  { hex: "#6b7f5e", label: "Adaçayı" },
  { hex: "#a0522d", label: "Kiremit" },
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
