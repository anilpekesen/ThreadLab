import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";
import { FONT_LIBRARY } from "../../font-library";

/**
 * Ay evresi — "doğduğun gecenin ayı", "tanıştığımız gece". Müşteri bir ya da
 * üç tarih girer; sunucu o gecenin (yerel 21:00) gerçek ay evresini hesaplar
 * ve baskıya hazır, şeffaf zeminli bir PNG çizer.
 *
 * Bu dosya istemci-güvenli: yönetim ekranı ve model katmanı da kullanır.
 */

export type MoonphaseLayout = "single" | "trio" | "cycle";
export type MoonphaseStyle = "ink" | "shadow" | "shaded";
export type MoonphaseDateFormat = "long" | "numeric" | "roman";

export const MOONPHASE_LAYOUTS: Array<{ id: MoonphaseLayout; label: string; labelEn: string; hint: string; hintEn: string }> = [
  { id: "single", label: "Tek ay", labelEn: "Single moon", hint: "Büyük tek ay; altında başlık, yazı ve tarih", hintEn: "One large moon with a title, text and the date below" },
  { id: "trio", label: "Üç özel gün", labelEn: "Three special days", hint: "Üç ay yan yana, her birinin altında etiket ve tarih (Tanıştık / Nişanlandık / Evlendik)", hintEn: "Three moons side by side, each with a label and date (Met / Engaged / Married)" },
  { id: "cycle", label: "Ay döngüsü", labelEn: "Lunar cycle", hint: "Seçilen gecenin ayı büyük; üstünde yay boyunca döngünün evreleri, o gecenin evresi halkayla işaretli", hintEn: "The chosen night's moon large, the cycle's phases along an arc above it with that night's phase circled" },
];

/**
 * Tek renkte iki gelenek: koyu üründe mürekkep ışıktır (aydınlık yüz dolu),
 * açık üründe mürekkep gölgedir (karanlık yüz dolu, 🌑 gibi). Müşteri penceresi
 * ürün rengine uyanı varsayılan seçer.
 */
export const MOONPHASE_STYLES: Array<{ id: MoonphaseStyle; label: string; labelEn: string; hint: string; hintEn: string }> = [
  { id: "ink", label: "Aydınlık yüz dolu", labelEn: "Lit side filled", hint: "Tek renk: ayın aydınlık kısmı mürekkep, denizler nokta dokulu; koyu ürünlerde en doğal", hintEn: "Single ink: the lit part is ink with dotted seas; most natural on dark products" },
  { id: "shadow", label: "Karanlık yüz dolu", labelEn: "Dark side filled", hint: "Tek renk: ayın gölgedeki kısmı mürekkep, aydınlık kısım ince çizgi; açık ürünlerde en doğal", hintEn: "Single ink: the shadowed part is ink, the lit part a thin outline; most natural on light products" },
  { id: "shaded", label: "Gerçekçi", labelEn: "Realistic", hint: "Gri tonlu, kraterli, yumuşak gölgeli ay (tam renkli baskı gerekir; koyu ürünlerde en iyi)", hintEn: "Grayscale moon with craters and a soft shadow (needs full-color printing; best on dark products)" },
];

export const MOONPHASE_DATE_FORMATS: Array<{ id: MoonphaseDateFormat; label: string; labelEn: string }> = [
  { id: "long", label: "12 Haziran 2020", labelEn: "June 12, 2020" },
  { id: "numeric", label: "12.06.2020", labelEn: "06.12.2020" },
  { id: "roman", label: "XII · VI · MMXX", labelEn: "VI · XII · MMXX" },
];

/** Hazır renkler: ayar ekranındaki örnekler ve bilinen renklerin adları */
export const MOONPHASE_SWATCHES: Array<{ hex: string; label: string; labelEn: string }> = [
  { hex: "#111111", label: "Siyah", labelEn: "Black" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White" },
  { hex: "#b8860b", label: "Altın", labelEn: "Gold" },
  { hex: "#c0c0c0", label: "Gümüş", labelEn: "Silver" },
  { hex: "#f3ead3", label: "Krem", labelEn: "Cream" },
  { hex: "#1e3a5f", label: "Lacivert", labelEn: "Navy" },
  { hex: "#7b1e2b", label: "Bordo", labelEn: "Burgundy" },
  { hex: "#b76e79", label: "Gül kurusu", labelEn: "Rose gold" },
];

/**
 * Evre adları, ay yaşına göre sırayla. Dört ana evre (yeni ay, ilk dördün,
 * dolunay, son dördün) o ana ±~0,75 gün uzaklıktaki gecelerde de o adla
 * anılır; aradakiler hilal/şişkin.
 */
export const MOON_PHASE_NAMES: Array<{ id: string; label: string; labelEn: string }> = [
  { id: "new", label: "Yeni Ay", labelEn: "New Moon" },
  { id: "waxing-crescent", label: "Hilal (büyüyen)", labelEn: "Waxing Crescent" },
  { id: "first-quarter", label: "İlk Dördün", labelEn: "First Quarter" },
  { id: "waxing-gibbous", label: "Şişkin Ay (büyüyen)", labelEn: "Waxing Gibbous" },
  { id: "full", label: "Dolunay", labelEn: "Full Moon" },
  { id: "waning-gibbous", label: "Şişkin Ay (küçülen)", labelEn: "Waning Gibbous" },
  { id: "last-quarter", label: "Son Dördün", labelEn: "Last Quarter" },
  { id: "waning-crescent", label: "Hilal (küçülen)", labelEn: "Waning Crescent" },
];

export const MOONPHASE_TITLE_MAX = 28;
export const MOONPHASE_LINE_MAX = 30;
export const MOONPHASE_LABEL_MAX = 14;
export const MOONPHASE_YEAR_FLOOR = 1900;
/** Üst sınır: bu yıl + 5 (ileri tarihli hediye: düğün, doğum beklentisi) */
export const moonphaseYearCeil = () => new Date().getUTCFullYear() + 5;

export interface MoonphaseConfig extends GeneratorConfigBase {
  kind: "moonphase";
  /** Müşteriye açılan düzenler; ilk eleman varsayılan */
  layouts: MoonphaseLayout[];
  /** Ay çizim stilleri; ilk eleman varsayılan */
  styles: MoonphaseStyle[];
  /** Başlık/etiket fontları (font-library kimlikleri); ilk eleman varsayılan */
  fonts: string[];
  /** Mürekkep renkleri (#rrggbb), en fazla 12; ilk eleman varsayılan */
  inks: string[];
  /** Tarih ve evre adlarının dili */
  language: "tr" | "en";
  dateFormat: MoonphaseDateFormat;
  titleEnabled: boolean;
  titlePlaceholder: string;
  lineEnabled: boolean;
  linePlaceholder: string;
  /** Evre adı (Dolunay, İlk Dördün...) ayın altında yazılsın mı */
  showPhaseName: boolean;
  /** Evre adının yanına aydınlanma yüzdesi (%87) */
  showIllumination: boolean;
  /** Güney yarımkürede ay aynalanmış görünür (büyüyen ay solda aydınlık) */
  hemisphere: "north" | "south";
  /** Evrenin hesaplandığı yerel saat 21:00'in UTC farkı (Türkiye +3) */
  utcOffset: number;
  /** Üç özel gün düzeninde etiketlerin varsayılanı */
  trioLabels: [string, string, string];
  yearMin: number;
  yearMax: number;
}

const LAYOUT_IDS = MOONPHASE_LAYOUTS.map((l) => l.id);
const STYLE_IDS = MOONPHASE_STYLES.map((s) => s.id);
const DATE_FORMAT_IDS = MOONPHASE_DATE_FORMATS.map((d) => d.id);
const FONT_IDS = FONT_LIBRARY.map((f) => f.id);

const defaults: MoonphaseConfig = {
  kind: "moonphase",
  layouts: ["single", "trio", "cycle"],
  styles: ["ink", "shadow", "shaded"],
  fonts: ["playfair", "great-vibes", "montserrat", "cormorant"],
  inks: ["#111111", "#ffffff", "#b8860b", "#f3ead3"],
  language: "tr",
  dateFormat: "long",
  titleEnabled: true,
  titlePlaceholder: "Doğduğun Gece",
  lineEnabled: true,
  linePlaceholder: "Ayşe & Mehmet",
  showPhaseName: true,
  showIllumination: false,
  hemisphere: "north",
  utcOffset: 3,
  trioLabels: ["Tanıştık", "Nişanlandık", "Evlendik"],
  yearMin: MOONPHASE_YEAR_FLOOR,
  yearMax: moonphaseYearCeil(),
};

// Yönetim ekranı her tuşta normalize ettiği için burada kırpma (trim) yapılmaz:
// yazılan son boşluk silinirdi. Kenar boşlukları çizimde cleanText ile atılır.
const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" ? Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return raw !== null && raw !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Tanınmayanlar düşer, tekrarlar atılır; liste boş kalırsa varsayılan */
function list<T extends string>(v: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(v)) return [...fallback];
  const out = [...new Set(v.filter((x): x is T => (allowed as readonly unknown[]).includes(x)))];
  return out.length ? out : [...fallback];
}

/** Renkler küçük harfli #rrggbb; en fazla 12 renk (pencerede tek sıra hap) */
function inks(v: unknown): string[] {
  if (!Array.isArray(v)) return [...defaults.inks];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const hex = x.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex) && !out.includes(hex)) out.push(hex);
  }
  return out.length ? out.slice(0, 12) : [...defaults.inks];
}

function normalize(raw: unknown): MoonphaseConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ceil = moonphaseYearCeil();
  const yearMin = int(r.yearMin, MOONPHASE_YEAR_FLOOR, ceil, defaults.yearMin);
  const yearMax = Math.max(yearMin, int(r.yearMax, MOONPHASE_YEAR_FLOOR, ceil, ceil));
  const labels = Array.isArray(r.trioLabels) ? r.trioLabels : [];
  return {
    kind: "moonphase",
    layouts: list(r.layouts, LAYOUT_IDS, defaults.layouts),
    styles: list(r.styles, STYLE_IDS, defaults.styles),
    fonts: list(r.fonts, FONT_IDS, defaults.fonts),
    inks: inks(r.inks),
    language: r.language === "en" ? "en" : "tr",
    dateFormat: (DATE_FORMAT_IDS as unknown[]).includes(r.dateFormat) ? (r.dateFormat as MoonphaseDateFormat) : defaults.dateFormat,
    titleEnabled: bool(r.titleEnabled, defaults.titleEnabled),
    titlePlaceholder: str(r.titlePlaceholder, MOONPHASE_TITLE_MAX, defaults.titlePlaceholder),
    lineEnabled: bool(r.lineEnabled, defaults.lineEnabled),
    linePlaceholder: str(r.linePlaceholder, MOONPHASE_LINE_MAX, defaults.linePlaceholder),
    showPhaseName: bool(r.showPhaseName, defaults.showPhaseName),
    showIllumination: bool(r.showIllumination, defaults.showIllumination),
    hemisphere: r.hemisphere === "south" ? "south" : "north",
    utcOffset: int(r.utcOffset, -12, 14, defaults.utcOffset),
    trioLabels: [0, 1, 2].map((i) => str(labels[i], MOONPHASE_LABEL_MAX, defaults.trioLabels[i])) as [string, string, string],
    yearMin,
    yearMax,
  };
}

export function moonphaseInkName(hex: string, en = false): string {
  const s = MOONPHASE_SWATCHES.find((c) => c.hex === hex.toLowerCase());
  return s ? (en ? s.labelEn : s.label) : hex;
}

export const moonphaseConfig: GeneratorConfigModule<MoonphaseConfig> = {
  kind: "moonphase",
  defaults,
  normalize,
  sampleInput: {
    fields: {
      title: "Doğduğun Gece",
      line: "Defne Yılmaz",
      date: "2024-02-19",
    },
    choices: { layout: "single", style: "shadow", font: "playfair", ink: "#111111" },
  },
};
