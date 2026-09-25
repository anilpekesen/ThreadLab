import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";

/**
 * Kelime avı bulmacası — müşterinin kelimeleri (isimler, yerler, anılar) kare
 * bir harf tablosuna gizlenir. "Bizim hikâyemizi bul" tişörtü ya da çerçevesi.
 *
 * İki görünüm: düz bulmaca (altında kelime listesi) ya da "çözülmüş" hâli
 * (gizli kelimeler yuvarlak kapsüllerle çevrilmiş). Yerleşim girdiden türeyen
 * sabit tohumla yapılır: yönetim önizlemesi, müşteri önizlemesi ve baskı aynı
 * tabloyu verir.
 *
 * Bu dosya istemci-güvenli: yönetim ekranı ve model katmanı da kullanır.
 */

export const WORDSEARCH_STYLES = [
  { id: "solved", label: "Çözülmüş", labelEn: "Solved", hint: "Gizli kelimeler yuvarlak çizgiyle çevrili, bulunmuş görünümü", hintEn: "Hidden words circled with rounded outlines, the 'found' look" },
  { id: "puzzle", label: "Bulmaca", labelEn: "Puzzle", hint: "Düz harf tablosu; kelimeler bulunmayı bekler", hintEn: "Plain letter grid; the words are waiting to be found" },
] as const;
export type WordsearchStyle = (typeof WORDSEARCH_STYLES)[number]["id"];

export const WORDSEARCH_DIRECTIONS = [
  { id: "horizontal", label: "Yatay", labelEn: "Horizontal" },
  { id: "vertical", label: "Dikey", labelEn: "Vertical" },
  { id: "diagonal", label: "Çapraz", labelEn: "Diagonal" },
] as const;
export type WordsearchDirection = (typeof WORDSEARCH_DIRECTIONS)[number]["id"];

/** Dolgu harflerinin alfabesi; müşterinin kelimeleri de bu dilin kuralıyla büyük harfe çevrilir */
export const WORDSEARCH_ALPHABETS = [
  { id: "tr", label: "Türkçe (Ç Ğ İ Ö Ş Ü dahil)", labelEn: "Turkish (incl. Ç Ğ İ Ö Ş Ü)", letters: "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ", locale: "tr-TR" },
  { id: "en", label: "İngilizce (A–Z)", labelEn: "English (A–Z)", letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", locale: "en-US" },
] as const;
export type WordsearchAlphabet = (typeof WORDSEARCH_ALPHABETS)[number]["id"];

/** El yazısı fontlar tabloda okunmuyor: yalnızca başlıkta kullanılabilir */
export const WORDSEARCH_SCRIPT_FONTS = ["great-vibes", "dancing-script"];

/** Hazır renkler: ayar ekranındaki örnekler ve bilinen renklerin adları */
export const WORDSEARCH_SWATCHES: Array<{ hex: string; label: string; labelEn: string }> = [
  { hex: "#111111", label: "Siyah", labelEn: "Black" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White" },
  { hex: "#1e3a5f", label: "Lacivert", labelEn: "Navy" },
  { hex: "#7b1e2b", label: "Bordo", labelEn: "Burgundy" },
  { hex: "#b76e79", label: "Gül kurusu", labelEn: "Dusty rose" },
  { hex: "#5f7a61", label: "Adaçayı yeşili", labelEn: "Sage green" },
  { hex: "#b8860b", label: "Altın", labelEn: "Gold" },
  { hex: "#5b4033", label: "Kahve", labelEn: "Brown" },
  { hex: "#8a8a8a", label: "Gri", labelEn: "Gray" },
];

export const WORDSEARCH_WORD_MIN = 2;
export const WORDSEARCH_WORD_MAX = 12;
export const WORDSEARCH_GRID_MIN = 8;
export const WORDSEARCH_GRID_MAX = 15;

export interface WordsearchConfig extends GeneratorConfigBase {
  kind: "wordsearch";
  /** Müşteriye açılan görünümler; ilk eleman varsayılan */
  styles: WordsearchStyle[];
  /** Dolgu harfleri ve büyük harf kuralı */
  alphabet: WordsearchAlphabet;
  /** Kelimelerin gizlenebileceği yönler (en az biri) */
  directions: WordsearchDirection[];
  /** Kelimeler tersten de gizlenebilsin mi (zorlaştırır) */
  reversed: boolean;
  /** 0 = otomatik (kelimelere yeten en küçük kare), 8–15 = en az bu boyut */
  gridSize: number;
  /** Tablonun altında kelime listesi */
  wordList: boolean;
  /** Tablonun çevresinde ince yuvarlak köşeli çerçeve */
  frame: boolean;
  /** Tablo harfleri için kütüphane font kimlikleri (el yazısı hariç); ilk eleman varsayılan */
  fonts: string[];
  /** Başlık fontları; ilk eleman varsayılan */
  titleFonts: string[];
  /** Mürekkep renkleri, #rrggbb; ilk eleman varsayılan */
  inks: string[];
  /** Bir tasarımdaki en fazla kelime (2–12) */
  maxWords: number;
  titleEnabled: boolean;
  titleMaxLength: number;
  /** Başlık kutusunun örnek metni */
  titlePlaceholder: string;
}

const FONT_IDS = FONT_LIBRARY.map((f) => f.id);
const GRID_FONT_IDS = FONT_IDS.filter((id) => !WORDSEARCH_SCRIPT_FONTS.includes(id));

const DEFAULTS: WordsearchConfig = {
  kind: "wordsearch",
  styles: ["solved", "puzzle"],
  alphabet: "tr",
  directions: ["horizontal", "vertical", "diagonal"],
  reversed: false,
  gridSize: 0,
  wordList: true,
  frame: true,
  fonts: ["montserrat", "poppins", "playfair", "quicksand"],
  titleFonts: ["great-vibes", "playfair", "montserrat", "dancing-script"],
  inks: ["#111111", "#ffffff", "#1e3a5f", "#7b1e2b", "#b76e79"],
  maxWords: 8,
  titleEnabled: true,
  titleMaxLength: 28,
  titlePlaceholder: "Bizim Hikâyemiz",
};

/** İzinli listeden süzer, tekrarları atar; boş kalırsa varsayılan liste */
function pickList<T extends string>(raw: unknown, allowed: readonly string[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out: T[] = [];
  for (const v of raw) if (typeof v === "string" && allowed.includes(v) && !out.includes(v as T)) out.push(v as T);
  return out.length ? out : [...fallback];
}

/** Renkler küçük harfli #rrggbb; en fazla 12 renk */
function pickInks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULTS.inks];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const hex = v.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex) && !out.includes(hex)) out.push(hex);
  }
  return out.length ? out.slice(0, 12) : [...DEFAULTS.inks];
}

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === "boolean" ? raw : fallback;
}

export function normalizeWordsearchConfig(raw: unknown): WordsearchConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const grid = Math.round(Number(r.gridSize));
  return {
    kind: "wordsearch",
    styles: pickList(r.styles, WORDSEARCH_STYLES.map((s) => s.id), DEFAULTS.styles),
    alphabet: WORDSEARCH_ALPHABETS.some((a) => a.id === r.alphabet) ? (r.alphabet as WordsearchAlphabet) : DEFAULTS.alphabet,
    directions: pickList(r.directions, WORDSEARCH_DIRECTIONS.map((d) => d.id), DEFAULTS.directions),
    reversed: bool(r.reversed, DEFAULTS.reversed),
    // 0 otomatik; aralık dışı değer en yakın geçerli boyuta
    gridSize: !Number.isFinite(grid) || grid <= 0 ? 0 : Math.min(WORDSEARCH_GRID_MAX, Math.max(WORDSEARCH_GRID_MIN, grid)),
    wordList: bool(r.wordList, DEFAULTS.wordList),
    frame: bool(r.frame, DEFAULTS.frame),
    fonts: pickList(r.fonts, GRID_FONT_IDS, DEFAULTS.fonts),
    titleFonts: pickList(r.titleFonts, FONT_IDS, DEFAULTS.titleFonts),
    inks: pickInks(r.inks),
    maxWords: int(r.maxWords, 2, 12, DEFAULTS.maxWords),
    titleEnabled: bool(r.titleEnabled, DEFAULTS.titleEnabled),
    titleMaxLength: int(r.titleMaxLength, 10, 32, DEFAULTS.titleMaxLength),
    titlePlaceholder: typeof r.titlePlaceholder === "string" ? r.titlePlaceholder.slice(0, 40) : DEFAULTS.titlePlaceholder,
  };
}

/**
 * Müşterinin kelimesi: alfabenin diline göre büyük harf, harf dışı her şey
 * (boşluk, rakam, noktalama) atılır. Pencere aynı kuralı uygular ki önizleme
 * ile baskı aynı kelimeyi göstersin.
 */
export function cleanWordsearchWord(v: unknown, alphabet: WordsearchAlphabet): string {
  const locale = WORDSEARCH_ALPHABETS.find((a) => a.id === alphabet)?.locale ?? "tr-TR";
  return Array.from(String(v ?? "").toLocaleUpperCase(locale))
    .filter((ch) => /\p{L}/u.test(ch))
    .slice(0, WORDSEARCH_WORD_MAX)
    .join("");
}

export function wordsearchColorName(hex: string, en = false): string {
  const s = WORDSEARCH_SWATCHES.find((c) => c.hex === hex.toLowerCase());
  return s ? (en ? s.labelEn : s.label) : hex;
}

export const wordsearchConfig: GeneratorConfigModule<WordsearchConfig> = {
  kind: "wordsearch",
  defaults: DEFAULTS,
  normalize: normalizeWordsearchConfig,
  sampleInput: {
    fields: {
      title: "Bizim Hikâyemiz",
      word_1: "Ayşe",
      word_2: "Mehmet",
      word_3: "İstanbul",
      word_4: "Kahve",
      word_5: "Deniz",
      word_6: "Sonsuza",
      word_7: "Bodrum",
      word_8: "Aşk",
    },
    choices: { style: "solved", font: "montserrat", titleFont: "great-vibes", ink: "#111111" },
  },
};
