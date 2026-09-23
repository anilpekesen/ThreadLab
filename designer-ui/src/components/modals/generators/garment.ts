/**
 * Tişört rengine göre mürekkep seçimi.
 *
 * Pencere önizlemesi açık zeminde gösterildiği için siyah mürekkepli bir
 * yıldız haritası orada kusursuz duruyor, siyah tişörte konunca kayboluyordu.
 * Pencereler artık tişört rengini biliyor: varsayılanı görünür olan
 * seçenekten başlatıyor, görünmeyecek bir seçimde uyarıyor ve önizlemeyi
 * tişört renginde gösteriyor.
 */

export interface Garment {
  /** Tişörtün rengi (#rrggbb) */
  hex: string;
  /** Koyu tişört mü (siyah, lacivert, antrasit...) */
  dark: boolean;
}

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function garmentFromHex(hex: string | null | undefined): Garment | null {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex.trim())) return null;
  const h = hex.trim().startsWith('#') ? hex.trim() : `#${hex.trim()}`;
  return { hex: h, dark: luminance(h) < 0.35 };
}

/**
 * Mürekkep bu tişörtte görünür mü? Kontrast oranı 1.8'in altındaysa
 * (ör. siyah üstüne lacivert) görünmez sayılır. Mürekkep bilinmiyorsa
 * (kendi zemini olan poster/kart stilleri) her zaman görünür.
 */
export function inkVisible(ink: string | null | undefined, garment: Garment | null | undefined): boolean {
  if (!ink || !garment) return true;
  const a = luminance(ink);
  const b = luminance(garment.hex);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio >= 1.8;
}

/**
 * Varsayılan seçim: daha önce seçilen geçerliyse o; yoksa tişörtte görünen
 * ilk seçenek; hiçbiri görünmüyorsa listenin ilki.
 */
export function pickForGarment<T extends { id: string }>(
  list: T[],
  prev: unknown,
  inkOf: (o: T) => string | null | undefined,
  garment: Garment | null | undefined,
): string {
  if (typeof prev === 'string' && list.some((o) => o.id === prev)) return prev;
  const visible = list.find((o) => inkVisible(inkOf(o), garment));
  return (visible ?? list[0])?.id ?? '';
}

/** Çok renkli palet: renklerin en az %60'ı görünüyorsa görünür sayılır */
export function paletteVisible(colors: string[], garment: Garment | null | undefined): boolean {
  if (!garment || colors.length === 0) return true;
  return colors.filter((c) => inkVisible(c, garment)).length / colors.length >= 0.6;
}

/** Uyarı metni: seçilen mürekkep tişörtte görünmüyorsa */
export function garmentWarning(isTurkish: boolean, garment: Garment | null | undefined): string {
  const tone = garment?.dark ? (isTurkish ? 'koyu' : 'dark') : (isTurkish ? 'açık' : 'light');
  return isTurkish
    ? `Bu renk ${tone} renkli tişörtte zor görünür; önizlemede kontrol edin ya da başka bir renk seçin.`
    : `This colour is hard to see on a ${tone} shirt; check the preview or pick another colour.`;
}
