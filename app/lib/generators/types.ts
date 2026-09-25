/**
 * Hazır tasarım üreticileri — müşterinin birkaç bilgi girdiği (şarkı, tarih,
 * baş harf...) ve sunucunun baskıya hazır bir PNG çizdiği şablonlar.
 *
 * Hepsi tek bir yerleşim yöntemini (`layout_mode = 'generator'`) ve tek bir
 * ayar kolonunu (`generator_config`) paylaşır; ayarın `kind` alanı hangi
 * üreticinin çalışacağını söyler. Yeni bir üretici eklemek ortak dosyalara
 * dokunmayı gerektirmez: `GENERATOR_KINDS` listesine bir satır, kendi
 * klasöründe bir modül, yönetim ekranında bir ayar bileşeni ve tasarımcıda
 * bir pencere yeter.
 *
 * Bu dosya sunucuda, yönetim ekranında ve (kopyası) tasarımcıda kullanılır;
 * bağımlılığı yok.
 */

export type GeneratorKind = "song" | "monogram" | "starmap" | "citymap" | "birthflower" | "calendar" | "wordsearch" | "moonphase" | "qrcode";

export interface GeneratorKindMeta {
  kind: GeneratorKind;
  /** Yönetim ekranındaki ad ve açıklama */
  label: string;
  description: string;
  tags: string[];
  /** Yeni şablon sihirbazında şablon adı için örnek */
  namePlaceholder: string;
  /** İngilizce yönetim ekranı için karşılıklar */
  labelEn: string;
  descriptionEn: string;
  tagsEn: string[];
  namePlaceholderEn: string;
}

export const GENERATOR_KINDS: GeneratorKindMeta[] = [
  {
    kind: "song",
    label: "Şarkı / Spotify tasarımı",
    description: "Müşteri şarkısını, fotoğrafını ve Spotify bağlantısını girer; çalar görünümlü, okutulabilir Spotify kodlu tasarım üretilir.",
    tags: ["Spotify kodu", "Fotoğraf"],
    namePlaceholder: "Örn: Bizim şarkımız çerçeve",
    labelEn: "Song / Spotify design",
    descriptionEn: "The customer enters their song, a photo and a Spotify link; a player-style design with a scannable Spotify code is created.",
    tagsEn: ["Spotify code", "Photo"],
    namePlaceholderEn: "e.g. Our song frame",
  },
  {
    kind: "monogram",
    label: "Monogram / baş harf",
    description: "İki-üç baş harf, çerçeve ve yazı tipiyle zarif bir monogram.",
    tags: ["Baş harf", "Çerçeve"],
    namePlaceholder: "Örn: Çift monogramı",
    labelEn: "Monogram / initials",
    descriptionEn: "An elegant monogram with two or three initials, a frame and a typeface.",
    tagsEn: ["Initials", "Frame"],
    namePlaceholderEn: "e.g. Couple monogram",
  },
  {
    kind: "starmap",
    label: "Yıldız haritası",
    description: "Seçilen tarih, saat ve şehirde gökyüzünün gerçek görünümü; altında isim ve not.",
    tags: ["Tarih ve şehir", "Gerçek gökyüzü"],
    namePlaceholder: "Örn: Tanıştığımız gece",
    labelEn: "Star map",
    descriptionEn: "The real night sky on the chosen date, time and city, with a name and note below.",
    tagsEn: ["Date and city", "Real sky"],
    namePlaceholderEn: "e.g. The night we met",
  },
  {
    kind: "citymap",
    label: "Şehir haritası",
    description: "Seçilen şehrin ya da noktanın sokak haritası, başlık ve koordinatlarla poster tarzında.",
    tags: ["Şehir", "Poster"],
    namePlaceholder: "Örn: Memleketim haritası",
    labelEn: "City map",
    descriptionEn: "A poster-style street map of the chosen city or place, with a title and coordinates.",
    tagsEn: ["City", "Poster"],
    namePlaceholderEn: "e.g. Hometown map",
  },
  {
    kind: "birthflower",
    label: "Doğum çiçeği ve isim",
    description: "Her kişinin doğum ayının çiçeği ve adı; tek kişi ya da aile buketi.",
    tags: ["Doğum ayı", "Aile"],
    namePlaceholder: "Örn: Anneme aile buketi",
    labelEn: "Birth flower and name",
    descriptionEn: "Each person's birth month flower and name; a single person or a family bouquet.",
    tagsEn: ["Birth month", "Family"],
    namePlaceholderEn: "e.g. Mom's family bouquet",
  },
  {
    kind: "calendar",
    label: "Özel gün takvimi",
    description: "Seçilen ayın takvimi; özel gün kalp, daire ya da yıldızla işaretlenir, üstünde başlık ve isimler.",
    tags: ["Tarih", "İşaretli gün"],
    namePlaceholder: "Örn: Evlilik yıldönümü takvimi",
    labelEn: "Special date calendar",
    descriptionEn: "A calendar of the chosen month with the special day marked by a heart, circle or star, plus a title and names.",
    tagsEn: ["Date", "Marked day"],
    namePlaceholderEn: "e.g. Anniversary calendar",
  },
  {
    kind: "wordsearch",
    label: "Kelime avı bulmacası",
    description: "Müşterinin kelimeleri (isimler, anılar) harf tablosuna gizlenir; istenirse bulunmuş hâliyle işaretli basılır.",
    tags: ["Kelimeler", "Bulmaca"],
    namePlaceholder: "Örn: Bizim kelimelerimiz",
    labelEn: "Word search puzzle",
    descriptionEn: "The customer's words (names, memories) are hidden in a letter grid; optionally printed with the words circled.",
    tagsEn: ["Words", "Puzzle"],
    namePlaceholderEn: "e.g. Our words",
  },
  {
    kind: "moonphase",
    label: "Ay evresi",
    description: "Seçilen gecenin gerçek ay evresi; tek tarih ya da üç özel günün ayları yan yana, altında tarih ve yazı.",
    tags: ["Tarih", "Gerçek ay"],
    namePlaceholder: "Örn: Doğduğun gecenin ayı",
    labelEn: "Moon phase",
    descriptionEn: "The real moon phase on the chosen night; a single date or three special days side by side, with dates and text.",
    tagsEn: ["Date", "Real moon"],
    namePlaceholderEn: "e.g. The moon the night you were born",
  },
  {
    kind: "qrcode",
    label: "QR kod",
    description: "Müşterinin bağlantısı, mesajı ya da Wi-Fi bilgisi okutulabilir bir QR koda dönüşür; altında kısa yazı.",
    tags: ["Bağlantı", "Okutulabilir"],
    namePlaceholder: "Örn: Düğün videomuz QR",
    labelEn: "QR code",
    descriptionEn: "The customer's link, message or Wi-Fi details become a scannable QR code with a short caption.",
    tagsEn: ["Link", "Scannable"],
    namePlaceholderEn: "e.g. Our wedding video QR",
  },
];

export function isGeneratorKind(v: unknown): v is GeneratorKind {
  return GENERATOR_KINDS.some((k) => k.kind === v);
}

export function generatorMeta(kind: unknown): GeneratorKindMeta | undefined {
  return GENERATOR_KINDS.find((k) => k.kind === kind);
}

/**
 * Müşterinin penceresinden gelen girdi. `fields` serbest metinler (şarkı adı,
 * isim...), `choices` şablonun açtığı seçeneklerden seçilenler (stil, renk,
 * font kimliği...). Sunucu her ikisini de şablon ayarına göre süzer; istemciye
 * güvenilmez.
 */
export interface GeneratorInput {
  fields: Record<string, string>;
  choices: Record<string, string | number | boolean>;
  /** Yalnızca fotoğraf kullanan üreticilerde (şarkı) */
  photo?: Buffer | null;
}

/** Her üreticinin ayarı en az bunu taşır */
export interface GeneratorConfigBase {
  kind: GeneratorKind;
}

/**
 * Üreticinin istemci-güvenli parçası: varsayılanlar, normalize ve yönetim
 * önizlemesinde kullanılan örnek girdi. `config.ts` dosyalarında tanımlanır.
 */
export interface GeneratorConfigModule<C extends GeneratorConfigBase> {
  kind: GeneratorKind;
  defaults: C;
  normalize(raw: unknown): C;
  /** Yönetim ekranındaki "Örnekle önizle" düğmesinin kullandığı girdi */
  sampleInput: { fields: Record<string, string>; choices: Record<string, string | number | boolean> };
  /** Örnek girdi fotoğraf istiyorsa önizleme sunucuda bir yer tutucu üretir */
  samplePhoto?: boolean;
}

export interface GeneratorComposeResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Üretici hatası: mesaj müşteriye olduğu gibi gösterilir. İngilizce mağazada
 * müşteri Türkçe hata görmesin diye iki dilli; rota mağazanın diline göre seçer.
 */
export class GeneratorInputError extends Error {
  readonly en: string;
  constructor(tr: string, en?: string) {
    super(tr);
    this.en = en ?? tr;
  }
  messageFor(lang: "tr" | "en"): string {
    return lang === "en" ? this.en : this.message;
  }
}
