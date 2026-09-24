/**
 * Hazır yazı tipi kütüphanesi.
 *
 * Mağaza sahibi kendi lisanslı fontunu da yükleyebiliyor (bkz.
 * `api.fonts.upload`), ama çoğu mağaza yüklemiyor ve font seçilmeyen bir metin
 * baskıda sunucunun kendi fontuna düşüyordu — tasarımdan sapan bir çıktı
 * ancak ürün elde basıldığında fark ediliyor. Bu kütüphane, kurulum
 * gerektirmeyen bir varsayılan seti veriyor.
 *
 * Dosyalar `public/fonts/library` altında depoyla birlikte geliyor; R2'ye,
 * ağa ya da sunucuya font kurulumuna bağımlılık yok. Hazırlanışları
 * `scripts/font-library.py` içinde: her biri tek bir ağırlığa sabitlenmiş,
 * GSUB tablosu atılmış ve Latin + Türkçe alt kümesine indirilmiş durumda.
 *
 * Hepsi SIL Open Font License 1.1 ile geliyor (lisans metni fontların yanında).
 * Ticari kullanım ve yeniden dağıtım serbest.
 */

export interface LibraryFont {
  /** Kalıcı kimlik — dosya adıyla aynı, şablon verisinde bu geçmiyor */
  id: string;
  /** Seçim kutusunda görünen ad */
  label: string;
  /** Ne işe yaradığı: mağaza sahibi 8 font arasından hızlı seçsin */
  role: string;
  /** `role` alanının İngilizcesi (yönetim ekranı İngilizceyken) */
  roleEn?: string;
  /** Fontun kendi aile adı — <text> yedeğinde ve @font-face adında kullanılıyor */
  family: string;
  /** Şablona yazılan değer; hem tarayıcı hem sunucu bunu okuyor */
  url: string;
}

/** Kütüphane fontlarının ortak yol öneki — sunucu bunu diskten okuyor */
export const LIBRARY_PREFIX = "/fonts/library/";

export const FONT_LIBRARY: LibraryFont[] = [
  {
    id: "montserrat",
    label: "Montserrat",
    role: "Modern, geniş sans — genel amaçlı başlık",
    roleEn: "Modern, wide sans — all-purpose headline",
    family: "Montserrat SemiBold",
    url: `${LIBRARY_PREFIX}montserrat.ttf`,
  },
  {
    id: "poppins",
    label: "Poppins",
    role: "Yuvarlak geometrik sans — sade ve okunaklı",
    roleEn: "Rounded geometric sans — clean and legible",
    family: "Poppins Medium",
    url: `${LIBRARY_PREFIX}poppins.ttf`,
  },
  {
    id: "quicksand",
    label: "Quicksand",
    role: "Yumuşak hatlı — bebek, çocuk, doğum günü",
    roleEn: "Soft shapes — baby, kids, birthdays",
    family: "Quicksand SemiBold",
    url: `${LIBRARY_PREFIX}quicksand.ttf`,
  },
  {
    id: "oswald",
    label: "Oswald",
    role: "Dar ve uzun — dar alana sığan güçlü başlık",
    roleEn: "Tall and condensed — a strong headline for narrow spaces",
    family: "Oswald Medium",
    url: `${LIBRARY_PREFIX}oswald.ttf`,
  },
  {
    id: "playfair",
    label: "Playfair Display",
    role: "Zarif serif — düğün, yıldönümü",
    roleEn: "Elegant serif — weddings, anniversaries",
    family: "Playfair Display SemiBold",
    url: `${LIBRARY_PREFIX}playfair.ttf`,
  },
  {
    id: "cormorant",
    label: "Cormorant Garamond",
    role: "Klasik serif — ince, kitabi bir hava",
    roleEn: "Classic serif — light, bookish feel",
    family: "Cormorant Garamond SemiBold",
    url: `${LIBRARY_PREFIX}cormorant.ttf`,
  },
  {
    id: "dancing-script",
    label: "Dancing Script",
    role: "El yazısı — samimi, okunaklı",
    roleEn: "Handwriting — friendly and legible",
    family: "Dancing Script",
    url: `${LIBRARY_PREFIX}dancing-script.ttf`,
  },
  {
    id: "great-vibes",
    label: "Great Vibes",
    role: "Kaligrafi — davetiye ve nikâh işleri",
    roleEn: "Calligraphy — invitations and weddings",
    family: "Great Vibes",
    url: `${LIBRARY_PREFIX}great-vibes.ttf`,
  },
  // Harf şekilli fotoğraflar için kalın aileler. Fotoğraf harfin gövdesinde
  // göründüğü için gövde ne kadar kalınsa fotoğraftan o kadar çok şey kalır.
  {
    id: "montserrat-black",
    label: "Montserrat Black",
    role: "Çok kalın geometrik — harf içi fotoğraf için önerilen",
    roleEn: "Extra-bold geometric — recommended for photos inside letters",
    family: "Montserrat Black",
    url: `${LIBRARY_PREFIX}montserrat-black.ttf`,
  },
  {
    id: "archivo-black",
    label: "Archivo Black",
    role: "Çok kalın, geniş harfler — LOVE, AŞKIM gibi kısa kelimeler",
    roleEn: "Extra-bold, wide letters — short words like LOVE",
    family: "Archivo Black",
    url: `${LIBRARY_PREFIX}archivo-black.ttf`,
  },
  {
    id: "anton",
    label: "Anton",
    role: "Kalın ve dar — uzun isimler dar alana sığar",
    roleEn: "Bold and condensed — long names fit narrow spaces",
    family: "Anton",
    url: `${LIBRARY_PREFIX}anton.ttf`,
  },
];

/** Şablondaki `font_url` bir kütüphane fontuna mı işaret ediyor? */
export function findLibraryFont(url: string | undefined): LibraryFont | undefined {
  if (!url) return undefined;
  return FONT_LIBRARY.find((f) => f.url === url);
}

export function isLibraryFontUrl(url: string | undefined): boolean {
  return typeof url === "string" && url.startsWith(LIBRARY_PREFIX);
}

/**
 * Müşterinin seçtiği fontu güvenle çözer.
 *
 * İki kapı var ve ikisi de gerekli: seçim önce kütüphanede tanınmalı (yoksa
 * istemci sunucuya istediği adresi indirtebilirdi), sonra o metin alanının
 * mağaza tarafından açtığı listede bulunmalı (yoksa kapalı bir alanın fontu
 * dışarıdan değiştirilebilirdi). Biri bile tutmazsa şablonun kendi fontuna
 * dönülüyor — geçersiz bir seçim yüzünden sipariş düşmemeli.
 */
export function resolveChosenFont(
  secim: string | undefined,
  izinliler: string[] | undefined,
): LibraryFont | undefined {
  if (!secim || !izinliler?.length) return undefined;
  if (!izinliler.includes(secim)) return undefined;
  return findLibraryFont(secim);
}
