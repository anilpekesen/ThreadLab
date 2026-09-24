import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";
import { CITYMAP_CITIES, findCitymapCity } from "./cities";

/**
 * Şehir haritası ("Memleketim", "Tanıştığımız şehir") üreticisinin ayarı.
 *
 * Harita OpenStreetMap verisinden sunucuda çizilir (bkz. `overpass.server`).
 * Mağaza sahibi müşteriye açılacak stilleri, kırpma şekillerini, yakınlık
 * seçeneklerini ve fontları seçer; ilk işaretlenen varsayılan olur.
 *
 * İstemci-güvenli: node modülü import etmez.
 */

export type CitymapStyleId = "ink-dark" | "ink-light" | "poster-light" | "poster-dark";
export type CitymapShapeId = "circle" | "square" | "heart";
export type CitymapMarker = "none" | "heart" | "pin";

export interface CitymapStyleMeta {
  id: CitymapStyleId;
  label: string;
  labelEn: string;
  hint: string;
  hintEn: string;
  /** Pencere ve ayar ekranındaki küçük örnek: zemin (boşsa şeffaf) ve yol rengi */
  bg: string;
  ink: string;
}

export const CITYMAP_STYLES: CitymapStyleMeta[] = [
  { id: "ink-dark", label: "Siyah çizgi", labelEn: "Black ink", hint: "Şeffaf zemin, siyah yollar — beyaz ve açık renk ürünler", hintEn: "Transparent background, black roads — white and light products", bg: "", ink: "#161616" },
  { id: "ink-light", label: "Beyaz çizgi", labelEn: "White ink", hint: "Şeffaf zemin, beyaz yollar — siyah ve koyu renk ürünler", hintEn: "Transparent background, white roads — black and dark products", bg: "", ink: "#ffffff" },
  { id: "poster-light", label: "Krem poster", labelEn: "Cream poster", hint: "Krem zemin, koyu yollar, mavi su, yeşil park — çerçeve/poster", hintEn: "Cream background, dark roads, blue water, green parks — frame/poster", bg: "#f3eee4", ink: "#23262b" },
  { id: "poster-dark", label: "Lacivert poster", labelEn: "Navy poster", hint: "Lacivert zemin, açık yollar — çerçeve/poster", hintEn: "Navy background, light roads — frame/poster", bg: "#15233a", ink: "#ece4d3" },
];

export const CITYMAP_SHAPES: Array<{ id: CitymapShapeId; label: string; labelEn: string; path: string }> = [
  { id: "circle", label: "Daire", labelEn: "Circle", path: "M50 2a48 48 0 1 0 0.01 0Z" },
  { id: "square", label: "Kare", labelEn: "Square", path: "M4 4H96V96H4Z" },
  { id: "heart", label: "Kalp", labelEn: "Heart", path: "M50 92C22 70 4 54 4 32 4 16 16 6 29 6c9 0 16 5 21 12 5-7 12-12 21-12 13 0 25 10 25 26 0 22-18 38-46 60Z" },
];

/** İzinli yakınlık (yarıçap, km) seçenekleri */
export const CITYMAP_RADII = [1, 2, 3.5, 5] as const;

export const CITYMAP_FONT_IDS = [
  "montserrat", "poppins", "quicksand", "oswald", "playfair", "cormorant",
  "dancing-script", "great-vibes", "montserrat-black", "archivo-black", "anton",
] as const;

export const CITYMAP_TITLE_MAX = 30;
export const CITYMAP_SUBTITLE_MAX = 40;

export interface CitymapConfig extends GeneratorConfigBase {
  kind: "citymap";
  /** Müşteriye açılan stiller; ilki varsayılan */
  styles: CitymapStyleId[];
  shapes: CitymapShapeId[];
  /** Yakınlık seçenekleri (km) */
  radii: number[];
  defaultRadius: number;
  /** Başlık fontları; ilki varsayılan */
  fonts: string[];
  /** Harita merkezine konan işaret */
  marker: CitymapMarker;
  /** Müşteri listede olmayan bir nokta için enlem/boylam girebilir */
  allowCustomPoint: boolean;
  /** Listede yalnız Türkiye mi, dünya şehirleri de mi */
  cityScope: "all" | "tr";
  defaultCity: string;
  /** Baskıdaki sabit metinlerin dili: koordinat yönleri (K/D ↔ N/E), ülke adı, atıf */
  labelLanguage: "tr" | "en";
  showCoordinates: boolean;
  /** Poster stillerinde parklar yeşil boyanır (mürekkep stillerinde çizilmez) */
  showParks: boolean;
}

const DEFAULTS: CitymapConfig = {
  kind: "citymap",
  styles: ["ink-dark", "ink-light", "poster-light", "poster-dark"],
  shapes: ["circle", "heart", "square"],
  radii: [1, 2, 3.5],
  defaultRadius: 2,
  fonts: ["montserrat", "playfair", "oswald", "great-vibes"],
  marker: "heart",
  allowCustomPoint: false,
  cityScope: "all",
  defaultCity: "istanbul",
  labelLanguage: "tr",
  showCoordinates: true,
  showParks: true,
};

/** Listeyi izinli kümeye süzer, tekrarları atar; boşsa varsayılan döner */
function pickList<T extends string | number>(raw: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out: T[] = [];
  for (const v of raw) {
    const hit = allowed.find((a) => a === v || (typeof a === "number" && Number(v) === a));
    if (hit !== undefined && !out.includes(hit)) out.push(hit);
  }
  return out.length ? out : [...fallback];
}

function normalize(raw: unknown): CitymapConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof CitymapConfig, unknown>>;
  const styles = pickList(r.styles, CITYMAP_STYLES.map((s) => s.id), DEFAULTS.styles);
  const shapes = pickList(r.shapes, CITYMAP_SHAPES.map((s) => s.id), DEFAULTS.shapes);
  const radii = pickList<number>(r.radii, CITYMAP_RADII, DEFAULTS.radii).sort((a, b) => a - b);
  const fonts = pickList(r.fonts, CITYMAP_FONT_IDS, DEFAULTS.fonts);
  const defaultRadius = radii.includes(Number(r.defaultRadius)) ? Number(r.defaultRadius)
    : radii.includes(DEFAULTS.defaultRadius) ? DEFAULTS.defaultRadius : radii[0];
  const cityScope = r.cityScope === "tr" ? "tr" : "all";
  const city = findCitymapCity(r.defaultCity);
  const defaultCity = city && (cityScope === "all" || city.country === "TR") ? city.id : DEFAULTS.defaultCity;
  return {
    kind: "citymap",
    styles,
    shapes,
    radii,
    defaultRadius,
    fonts,
    marker: r.marker === "none" || r.marker === "pin" ? r.marker : r.marker === "heart" ? "heart" : DEFAULTS.marker,
    allowCustomPoint: r.allowCustomPoint === true,
    cityScope,
    defaultCity,
    labelLanguage: r.labelLanguage === "en" ? "en" : "tr",
    showCoordinates: r.showCoordinates !== false,
    showParks: r.showParks !== false,
  };
}

/** Şablon ayarına göre müşteriye gösterilecek şehirler (Türkiye önce) */
export function citymapCitiesFor(config: Pick<CitymapConfig, "cityScope">) {
  return config.cityScope === "tr" ? CITYMAP_CITIES.filter((c) => c.country === "TR") : CITYMAP_CITIES;
}

export const citymapConfig: GeneratorConfigModule<CitymapConfig> = {
  kind: "citymap",
  defaults: DEFAULTS,
  normalize,
  sampleInput: {
    fields: { city: "istanbul-kadikoy", title: "", subtitle: "Tanıştığımız şehir · 14.02.2021" },
    choices: {},
  },
};
