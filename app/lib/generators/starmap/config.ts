import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";
import { FONT_LIBRARY } from "../../font-library";
import { findStarmapCity } from "./data/cities";

/**
 * Yıldız haritası — "tanıştığımız gece gökyüzü". Müşteri tarih, saat ve
 * şehir seçer; sunucu o an o yerden görünen gerçek gökyüzünü (yıldızlar,
 * isteğe bağlı takımyıldız çizgileri) daireye çizer, altına başlık, not,
 * tarih ve koordinat yazar.
 *
 * Bu dosya istemci-güvenli: yönetim ekranı ve tasarımcı da kullanır.
 */

export type StarmapThemeId = "navy" | "black" | "transparent-light" | "transparent-dark";

export const STARMAP_THEMES: Array<{
  id: StarmapThemeId;
  label: string;
  labelEn: string;
  /** Yönetim ekranında ve pencerede küçük örnek: daire zemini + yıldız rengi */
  swatch: { bg: string; ink: string };
  hint: string;
  hintEn: string;
}> = [
  { id: "navy", label: "Lacivert", labelEn: "Navy", swatch: { bg: "#13234a", ink: "#ffffff" }, hint: "Lacivert dolgulu daire, beyaz yıldızlar", hintEn: "Navy filled circle, white stars" },
  { id: "black", label: "Siyah", labelEn: "Black", swatch: { bg: "#0b0b0d", ink: "#ffffff" }, hint: "Siyah dolgulu daire, beyaz yıldızlar", hintEn: "Black filled circle, white stars" },
  { id: "transparent-light", label: "Beyaz mürekkep", labelEn: "White ink", swatch: { bg: "#1f1f1f", ink: "#ffffff" }, hint: "Şeffaf zemin, beyaz baskı — siyah/koyu tişört", hintEn: "Transparent background, white print — black/dark shirts" },
  { id: "transparent-dark", label: "Siyah mürekkep", labelEn: "Black ink", swatch: { bg: "#ffffff", ink: "#111111" }, hint: "Şeffaf zemin, siyah baskı — beyaz/açık tişört", hintEn: "Transparent background, black print — white/light shirts" },
];

export type StarmapDateFormat = "long" | "long-time" | "numeric" | "numeric-time";

export const STARMAP_DATE_FORMATS: Array<{ id: StarmapDateFormat; label: string; labelEn: string }> = [
  { id: "long", label: "12 Haziran 2020", labelEn: "June 12, 2020" },
  { id: "long-time", label: "12 Haziran 2020 · 21:00", labelEn: "June 12, 2020 · 21:00" },
  { id: "numeric", label: "12.06.2020", labelEn: "06/12/2020" },
  { id: "numeric-time", label: "12.06.2020 · 21:00", labelEn: "06/12/2020 · 21:00" },
];

export const STARMAP_TITLE_MAX = 40;
export const STARMAP_SUBTITLE_MAX = 80;
export const STARMAP_YEAR_MIN = 1900;
export const STARMAP_YEAR_MAX = 2100;

export interface StarmapConfig extends GeneratorConfigBase {
  kind: "starmap";
  /** Müşteriye açılan temalar; ilk eleman varsayılan */
  themes: StarmapThemeId[];
  /** Başlık fontları (font-library kimlikleri); ilk eleman varsayılan */
  fonts: string[];
  /**
   * Dolgulu temalarda (lacivert/siyah) zemin tüm tuvale yayılsın mı: poster
   * ve çerçeve ürünleri için. Kapalıyken yalnız daire dolgulu, yazılar
   * zemin renginde şeffafın üstüne basılır (açık renk tişört).
   */
  fillCanvas: boolean;
  /** Takımyıldız çizgileri: müşteri açıp kapatabilir mi, varsayılan açık mı */
  allowConstellationToggle: boolean;
  constellationsDefault: boolean;
  /** Yükseklik halkaları ızgarası */
  allowGridToggle: boolean;
  gridDefault: boolean;
  defaultTitle: string;
  defaultSubtitle: string;
  /** Varsayılan şehir (pencere bununla açılır) */
  defaultCity: string;
  dateFormat: StarmapDateFormat;
  /** Tarih satırındaki ay adı ve koordinat harfleri (K/D ya da N/E) */
  language: "tr" | "en";
  showCoordinates: boolean;
}

const THEME_IDS = STARMAP_THEMES.map((t) => t.id);
const DATE_FORMAT_IDS = STARMAP_DATE_FORMATS.map((d) => d.id);
const FONT_IDS = FONT_LIBRARY.map((f) => f.id);

const defaults: StarmapConfig = {
  kind: "starmap",
  themes: ["navy", "black", "transparent-light", "transparent-dark"],
  fonts: ["montserrat", "playfair", "great-vibes"],
  fillCanvas: false,
  allowConstellationToggle: true,
  constellationsDefault: true,
  allowGridToggle: true,
  gridDefault: false,
  defaultTitle: "Tanıştığımız Gece",
  defaultSubtitle: "",
  defaultCity: "istanbul",
  dateFormat: "long",
  language: "tr",
  showCoordinates: true,
};

// Yönetim ekranı her tuşta normalize ettiği için burada kırpma (trim) yapılmaz:
// yazılan son boşluk silinirdi. Kenar boşlukları çizimde cleanText ile atılır.
const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" ? Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Tanınmayanlar düşer, tekrarlar atılır; liste boş kalırsa varsayılan */
function list<T extends string>(v: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(v)) return [...fallback];
  const out = [...new Set(v.filter((x): x is T => (allowed as readonly unknown[]).includes(x)))];
  return out.length ? out : [...fallback];
}

function normalize(raw: unknown): StarmapConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    kind: "starmap",
    themes: list(r.themes, THEME_IDS, defaults.themes),
    fonts: list(r.fonts, FONT_IDS, defaults.fonts),
    fillCanvas: bool(r.fillCanvas, defaults.fillCanvas),
    allowConstellationToggle: bool(r.allowConstellationToggle, defaults.allowConstellationToggle),
    constellationsDefault: bool(r.constellationsDefault, defaults.constellationsDefault),
    allowGridToggle: bool(r.allowGridToggle, defaults.allowGridToggle),
    gridDefault: bool(r.gridDefault, defaults.gridDefault),
    defaultTitle: str(r.defaultTitle, STARMAP_TITLE_MAX, defaults.defaultTitle),
    defaultSubtitle: str(r.defaultSubtitle, STARMAP_SUBTITLE_MAX, defaults.defaultSubtitle),
    defaultCity: findStarmapCity(r.defaultCity)?.id ?? defaults.defaultCity,
    dateFormat: (DATE_FORMAT_IDS as unknown[]).includes(r.dateFormat) ? (r.dateFormat as StarmapDateFormat) : defaults.dateFormat,
    language: r.language === "en" ? "en" : "tr",
    showCoordinates: bool(r.showCoordinates, defaults.showCoordinates),
  };
}

export const starmapConfig: GeneratorConfigModule<StarmapConfig> = {
  kind: "starmap",
  defaults,
  normalize,
  sampleInput: {
    fields: {
      title: "Tanıştığımız Gece",
      subtitle: "Ayşe & Oğuz — her şeyin başladığı gökyüzü",
      date: "2020-06-12",
      time: "21:30",
      city: "istanbul",
    },
    choices: { theme: "navy", font: "playfair", constellations: true, grid: false },
  },
};
