import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";

/**
 * Özel gün takvimi — seçilen tarihin ayı, o gün kalp/daire/yıldızla
 * işaretli; üstünde başlık ("Evlendiğimiz Gün"), altında isimler. Çift ve
 * yıldönümü tişörtleri, çerçeve ve kupalar için tek renk mürekkep, şeffaf zemin.
 *
 * Ay ve gün adlarının dili ile haftanın ilk günü mağazanın ayarıdır (müşteri
 * seçmez); düzen, işaret, yazı tipleri ve renk müşteriye açılan listelerdir,
 * her listenin ilki varsayılan. Bu dosya istemci-güvenli.
 */

export const CALENDAR_LAYOUTS = [
  { id: "classic", label: "Klasik", labelEn: "Classic", hint: "Başlık üstte, ay-yıl, gün adları ve çizgili tablo", hintEn: "Title on top, month-year, weekday row and a lined grid" },
  { id: "minimal", label: "Sade", labelEn: "Minimal", hint: "Çizgisiz, iri rakamlar", hintEn: "No grid lines, large numerals" },
  { id: "poster", label: "Poster", labelEn: "Poster", hint: "Büyük ay adı, tablo, başlık ve isimler altta", hintEn: "Large month name, grid, title and names at the bottom" },
] as const;
export type CalendarLayout = (typeof CALENDAR_LAYOUTS)[number]["id"];

export const CALENDAR_MARKERS = [
  { id: "heart", label: "Kalp", labelEn: "Heart", hint: "Dolu kalp, gün rakamı içinde boş", hintEn: "Filled heart with the day cut out" },
  { id: "circle", label: "Daire", labelEn: "Circle", hint: "Günün çevresinde ince halka", hintEn: "A thin ring around the day" },
  { id: "star", label: "Yıldız", labelEn: "Star", hint: "Dolu yıldız, gün rakamı içinde boş", hintEn: "Filled star with the day cut out" },
  { id: "dot", label: "Dolu daire", labelEn: "Filled circle", hint: "Dolu daire, gün rakamı içinde boş", hintEn: "Filled circle with the day cut out" },
] as const;
export type CalendarMarker = (typeof CALENDAR_MARKERS)[number]["id"];

export type CalendarLanguage = "tr" | "en";
export type CalendarWeekStart = "monday" | "sunday";

export const CALENDAR_MONTHS: Record<CalendarLanguage, string[]> = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** Pazar'dan başlayarak (Date.getUTCDay sırası) */
export const CALENDAR_WEEKDAYS: Record<CalendarLanguage, string[]> = {
  tr: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/** Hazır renkler: ayar ekranındaki örnekler ve bilinen renklerin adları */
export const CALENDAR_SWATCHES: Array<{ hex: string; label: string; labelEn: string }> = [
  { hex: "#111111", label: "Siyah", labelEn: "Black" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White" },
  { hex: "#b8860b", label: "Altın", labelEn: "Gold" },
  { hex: "#1e3a5f", label: "Lacivert", labelEn: "Navy" },
  { hex: "#7b1e2b", label: "Bordo", labelEn: "Burgundy" },
  { hex: "#b76e79", label: "Gül kurusu", labelEn: "Rose gold" },
  { hex: "#2f5d3a", label: "Zümrüt", labelEn: "Emerald" },
  { hex: "#c0c0c0", label: "Gümüş", labelEn: "Silver" },
  { hex: "#8a8a8a", label: "Gri", labelEn: "Gray" },
];

export const CALENDAR_YEAR_FLOOR = 1900;
export const CALENDAR_YEAR_CEIL = 2100;

export interface CalendarConfig extends GeneratorConfigBase {
  kind: "calendar";
  layouts: CalendarLayout[];
  markers: CalendarMarker[];
  /** Rakamlar, ay ve gün adları; FONT_LIBRARY kimlikleri */
  fonts: string[];
  /** Başlık yazı tipleri (el yazısı önerilir) */
  titleFonts: string[];
  /** #rrggbb, en fazla 12 */
  colors: string[];
  /** Ay ve gün adlarının dili (mağaza ayarı) */
  language: CalendarLanguage;
  weekStart: CalendarWeekStart;
  titleEnabled: boolean;
  titleMaxLength: number;
  titlePlaceholder: string;
  namesEnabled: boolean;
  namesMaxLength: number;
  namesPlaceholder: string;
  /** Seçilebilir yıl aralığı */
  yearMin: number;
  yearMax: number;
}

const THIS_YEAR = new Date().getUTCFullYear();

const DEFAULTS: CalendarConfig = {
  kind: "calendar",
  layouts: ["classic", "minimal", "poster"],
  markers: ["heart", "circle", "star", "dot"],
  fonts: ["playfair", "cormorant", "montserrat", "oswald"],
  titleFonts: ["great-vibes", "dancing-script", "playfair"],
  colors: ["#111111", "#ffffff", "#b8860b", "#1e3a5f", "#7b1e2b"],
  language: "tr",
  weekStart: "monday",
  titleEnabled: true,
  titleMaxLength: 28,
  titlePlaceholder: "Evlendiğimiz Gün",
  namesEnabled: true,
  namesMaxLength: 30,
  namesPlaceholder: "Ayşe & Mehmet",
  yearMin: 1950,
  yearMax: THIS_YEAR + 5,
};

const FONT_IDS = FONT_LIBRARY.map((f) => f.id);

/** İzinli listeden süzer, tekrarları atar; boş kalırsa varsayılan liste */
function pickList<T extends string>(raw: unknown, allowed: readonly string[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out: T[] = [];
  for (const v of raw) if (typeof v === "string" && allowed.includes(v) && !out.includes(v as T)) out.push(v as T);
  return out.length ? out : [...fallback];
}

/** Renkler küçük harfli #rrggbb; en fazla 12 renk */
function pickColors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULTS.colors];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const hex = v.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex) && !out.includes(hex)) out.push(hex);
  }
  return out.length ? out.slice(0, 12) : [...DEFAULTS.colors];
}

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return raw !== null && raw !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function str(raw: unknown, max: number, fallback: string): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : fallback;
}

export function normalizeCalendarConfig(raw: unknown): CalendarConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let yearMin = int(r.yearMin, CALENDAR_YEAR_FLOOR, CALENDAR_YEAR_CEIL, DEFAULTS.yearMin);
  let yearMax = int(r.yearMax, CALENDAR_YEAR_FLOOR, CALENDAR_YEAR_CEIL, DEFAULTS.yearMax);
  if (yearMin > yearMax) [yearMin, yearMax] = [yearMax, yearMin];
  return {
    kind: "calendar",
    layouts: pickList(r.layouts, CALENDAR_LAYOUTS.map((l) => l.id), DEFAULTS.layouts),
    markers: pickList(r.markers, CALENDAR_MARKERS.map((m) => m.id), DEFAULTS.markers),
    fonts: pickList(r.fonts, FONT_IDS, DEFAULTS.fonts),
    titleFonts: pickList(r.titleFonts, FONT_IDS, DEFAULTS.titleFonts),
    colors: pickColors(r.colors),
    language: r.language === "en" || r.language === "tr" ? r.language : DEFAULTS.language,
    weekStart: r.weekStart === "sunday" || r.weekStart === "monday" ? r.weekStart : DEFAULTS.weekStart,
    titleEnabled: typeof r.titleEnabled === "boolean" ? r.titleEnabled : DEFAULTS.titleEnabled,
    titleMaxLength: int(r.titleMaxLength, 8, 40, DEFAULTS.titleMaxLength),
    titlePlaceholder: str(r.titlePlaceholder, 40, DEFAULTS.titlePlaceholder),
    namesEnabled: typeof r.namesEnabled === "boolean" ? r.namesEnabled : DEFAULTS.namesEnabled,
    namesMaxLength: int(r.namesMaxLength, 8, 40, DEFAULTS.namesMaxLength),
    namesPlaceholder: str(r.namesPlaceholder, 40, DEFAULTS.namesPlaceholder),
    yearMin,
    yearMax,
  };
}

export function calendarColorName(hex: string, en = false): string {
  const s = CALENDAR_SWATCHES.find((c) => c.hex === hex.toLowerCase());
  return s ? (en ? s.labelEn : s.label) : hex;
}

export const calendarConfig: GeneratorConfigModule<CalendarConfig> = {
  kind: "calendar",
  defaults: DEFAULTS,
  normalize: normalizeCalendarConfig,
  sampleInput: {
    fields: { date: "2026-06-12", title: "Evlendiğimiz Gün", names: "Ayşe & Mehmet" },
    choices: { layout: "classic", marker: "heart", font: "playfair", titleFont: "great-vibes", color: "#111111" },
  },
};
