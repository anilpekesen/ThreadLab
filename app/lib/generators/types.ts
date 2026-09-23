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

export type GeneratorKind = "song" | "monogram" | "starmap" | "citymap" | "birthflower";

export interface GeneratorKindMeta {
  kind: GeneratorKind;
  /** Yönetim ekranındaki ad ve açıklama */
  label: string;
  description: string;
  tags: string[];
  /** Yeni şablon sihirbazında şablon adı için örnek */
  namePlaceholder: string;
}

export const GENERATOR_KINDS: GeneratorKindMeta[] = [
  {
    kind: "song",
    label: "Şarkı / Spotify tasarımı",
    description: "Müşteri şarkısını, fotoğrafını ve Spotify bağlantısını girer; çalar görünümlü, okutulabilir Spotify kodlu tasarım üretilir.",
    tags: ["Spotify kodu", "Fotoğraf"],
    namePlaceholder: "Örn: Bizim şarkımız çerçeve",
  },
  {
    kind: "monogram",
    label: "Monogram / baş harf",
    description: "İki-üç baş harf, çerçeve ve yazı tipiyle zarif bir monogram.",
    tags: ["Baş harf", "Çerçeve"],
    namePlaceholder: "Örn: Çift monogramı",
  },
  {
    kind: "starmap",
    label: "Yıldız haritası",
    description: "Seçilen tarih, saat ve şehirde gökyüzünün gerçek görünümü; altında isim ve not.",
    tags: ["Tarih ve şehir", "Gerçek gökyüzü"],
    namePlaceholder: "Örn: Tanıştığımız gece",
  },
  {
    kind: "citymap",
    label: "Şehir haritası",
    description: "Seçilen şehrin ya da noktanın sokak haritası, başlık ve koordinatlarla poster tarzında.",
    tags: ["Şehir", "Poster"],
    namePlaceholder: "Örn: Memleketim haritası",
  },
  {
    kind: "birthflower",
    label: "Doğum çiçeği ve isim",
    description: "Her kişinin doğum ayının çiçeği ve adı; tek kişi ya da aile buketi.",
    tags: ["Doğum ayı", "Aile"],
    namePlaceholder: "Örn: Anneme aile buketi",
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

/** Üretici hatası: mesaj müşteriye olduğu gibi gösterilebilir */
export class GeneratorInputError extends Error {}
