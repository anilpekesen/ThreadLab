import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";

/**
 * Monogram — bir iki üç baş harften zarif bir amblem: çift, aile ya da kişi.
 * Tişört, havlu, boxer, çerçeve için tek renk mürekkep, şeffaf zemin.
 *
 * Mağaza sahibi müşteriye açılacak düzenleri, çerçeveleri, yazı tiplerini ve
 * renkleri seçer; her listenin ilki müşterinin penceresinde varsayılan olur.
 * Bir listede tek seçenek kalırsa pencerede o seçim hiç görünmez.
 */

export const MONOGRAM_LAYOUTS = [
  { id: "classic", label: "Klasik", labelEn: "Classic", hint: "3 harfte ortadaki büyük; 2 harfte ayraçla yan yana", hintEn: "3 letters: larger middle letter; 2 letters: side by side with a separator" },
  { id: "stacked", label: "Yan yana", labelEn: "Side by side", hint: "Harfler eşit boyda", hintEn: "Letters are the same size" },
  { id: "single", label: "Tek harf", labelEn: "Single letter", hint: "Yalnızca ilk harf, büyük", hintEn: "First letter only, large" },
  { id: "interlock", label: "İç içe", labelEn: "Interlocked", hint: "Harfler hafifçe üst üste biner", hintEn: "Letters overlap slightly" },
] as const;
export type MonogramLayout = (typeof MONOGRAM_LAYOUTS)[number]["id"];

export const MONOGRAM_FRAMES = [
  { id: "none", label: "Çerçevesiz", labelEn: "No frame" },
  { id: "circle", label: "Daire", labelEn: "Circle" },
  { id: "circle-text", label: "Yazılı daire", labelEn: "Circle with text" },
  { id: "diamond", label: "Baklava", labelEn: "Diamond" },
  { id: "square", label: "Kare", labelEn: "Square" },
  { id: "laurel", label: "Defne dalı", labelEn: "Laurel" },
  { id: "crest", label: "Arma", labelEn: "Crest" },
] as const;
export type MonogramFrame = (typeof MONOGRAM_FRAMES)[number]["id"];

/** Klasik düzende iki harfin arasına konan ayraç */
export const MONOGRAM_JOINERS = [
  { id: "line", label: "İnce çizgi", labelEn: "Thin line" },
  { id: "amp", label: "&", labelEn: "&" },
  { id: "dot", label: "Nokta", labelEn: "Dot" },
  { id: "none", label: "Ayraçsız", labelEn: "None" },
] as const;
export type MonogramJoiner = (typeof MONOGRAM_JOINERS)[number]["id"];

/** Hazır renkler: ayar ekranındaki örnekler ve bilinen renklerin adları */
export const MONOGRAM_SWATCHES: Array<{ hex: string; label: string; labelEn: string }> = [
  { hex: "#111111", label: "Siyah", labelEn: "Black" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White" },
  { hex: "#b8860b", label: "Altın", labelEn: "Gold" },
  { hex: "#1e3a5f", label: "Lacivert", labelEn: "Navy" },
  { hex: "#7b1e2b", label: "Bordo", labelEn: "Burgundy" },
  { hex: "#c0c0c0", label: "Gümüş", labelEn: "Silver" },
  { hex: "#b76e79", label: "Gül kurusu", labelEn: "Rose gold" },
  { hex: "#2f5d3a", label: "Zümrüt", labelEn: "Emerald" },
  { hex: "#8a8a8a", label: "Gri", labelEn: "Grey" },
];

/** El yazısı fontlar: harf aralığı daraltılır, küçük yazılar eşlikçi serif ile */
export const MONOGRAM_SCRIPT_FONTS = ["great-vibes", "dancing-script"];

export const MONOGRAM_TOP_MAX = 30;
export const MONOGRAM_BOTTOM_MAX = 24;

export interface MonogramConfig extends GeneratorConfigBase {
  kind: "monogram";
  layouts: MonogramLayout[];
  frames: MonogramFrame[];
  joiners: MonogramJoiner[];
  /** FONT_LIBRARY kimlikleri */
  fonts: string[];
  /** #rrggbb */
  colors: string[];
  topText: boolean;
  bottomText: boolean;
  /** 1–3 */
  maxLetters: number;
}

const DEFAULTS: MonogramConfig = {
  kind: "monogram",
  layouts: ["classic", "stacked", "single", "interlock"],
  frames: ["none", "circle", "circle-text", "laurel", "diamond", "square", "crest"],
  joiners: ["line", "amp", "dot", "none"],
  fonts: ["playfair", "great-vibes", "cormorant", "montserrat"],
  colors: ["#111111", "#ffffff", "#b8860b", "#1e3a5f", "#7b1e2b"],
  topText: true,
  bottomText: true,
  maxLetters: 3,
};

const FONT_IDS = FONT_LIBRARY.map((f) => f.id);

/** İzinli listeden süzer, tekrarları atar; boş kalırsa varsayılan liste */
function pickList<T extends string>(raw: unknown, allowed: readonly string[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out: T[] = [];
  for (const v of raw) if (typeof v === "string" && allowed.includes(v) && !out.includes(v as T)) out.push(v as T);
  return out.length ? out : [...fallback];
}

/** Renkler küçük harfli #rrggbb; en fazla 12 renk (pencerede tek sıra hap) */
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

export function normalizeMonogramConfig(raw: unknown): MonogramConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const maxLetters = Math.round(Number(r.maxLetters));
  return {
    kind: "monogram",
    layouts: pickList(r.layouts, MONOGRAM_LAYOUTS.map((l) => l.id), DEFAULTS.layouts),
    frames: pickList(r.frames, MONOGRAM_FRAMES.map((l) => l.id), DEFAULTS.frames),
    joiners: pickList(r.joiners, MONOGRAM_JOINERS.map((l) => l.id), DEFAULTS.joiners),
    fonts: pickList(r.fonts, FONT_IDS, DEFAULTS.fonts),
    colors: pickColors(r.colors),
    topText: typeof r.topText === "boolean" ? r.topText : DEFAULTS.topText,
    bottomText: typeof r.bottomText === "boolean" ? r.bottomText : DEFAULTS.bottomText,
    maxLetters: Number.isFinite(maxLetters) ? Math.min(3, Math.max(1, maxLetters)) : DEFAULTS.maxLetters,
  };
}

/**
 * Müşterinin yazdığı harfler: Türkçe büyük harfe çevrilir, harf ve rakam
 * dışındaki her şey (boşluk, nokta, &) atılır. Sunucu ve pencere aynı kuralı
 * kullanır ki önizleme ile baskı aynı harfleri göstersin.
 */
export function cleanMonogramLetters(v: unknown, max: number): string {
  const upper = String(v ?? "").toLocaleUpperCase("tr-TR");
  return Array.from(upper).filter((ch) => /[\p{L}\p{N}]/u.test(ch)).slice(0, max).join("");
}

export function monogramColorName(hex: string, en = false): string {
  const s = MONOGRAM_SWATCHES.find((c) => c.hex === hex.toLowerCase());
  return s ? (en ? s.labelEn : s.label) : hex;
}

export const monogramConfig: GeneratorConfigModule<MonogramConfig> = {
  kind: "monogram",
  defaults: DEFAULTS,
  normalize: normalizeMonogramConfig,
  sampleInput: {
    fields: { letters: "AŞM", topText: "AYŞE & MEHMET", bottomText: "12.06.2026" },
    choices: { layout: "classic", frame: "circle-text", font: "playfair", color: "#111111", joiner: "line" },
  },
};
