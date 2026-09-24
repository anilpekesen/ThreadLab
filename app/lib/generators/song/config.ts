import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";

/**
 * Şarkı / Spotify tasarımı: müşterinin fotoğrafı, şarkı adı ve sanatçısıyla
 * bir müzik çalar kartı; altında (bağlantı verilirse) telefonla okutulabilen
 * Spotify kodu.
 *
 * Stil zemini, tema tonu belirler:
 * - `card`: yuvarlak köşeli dolgulu kart; baskıda kendi zeminiyle gelir.
 * - `minimal`: şeffaf zemin, yalnızca mürekkep; kumaşın rengi zemin olur.
 * - `dark`: tasarım koyu okunur — açık renk ürünler için (minimalde koyu
 *   mürekkep, kartta #121212 kart üstüne beyaz yazı).
 * - `light`: tasarım açık okunur — koyu renk ürünler için (minimalde beyaz
 *   mürekkep, kartta beyaz kart üstüne koyu yazı).
 */

export const SONG_STYLES = [
  { id: "card", label: "Kart", labelEn: "Card" },
  { id: "minimal", label: "Sade (şeffaf)", labelEn: "Minimal" },
] as const;

export const SONG_THEMES = [
  { id: "dark", label: "Koyu", labelEn: "Dark", hint: "Açık renk ürünler için", hintEn: "For light products", swatch: "#121212" },
  { id: "light", label: "Açık", labelEn: "Light", hint: "Koyu renk ürünler için", hintEn: "For dark products", swatch: "#ffffff" },
] as const;

export type SongStyle = (typeof SONG_STYLES)[number]["id"];
export type SongTheme = (typeof SONG_THEMES)[number]["id"];

/** Müşteri alanlarının sınırları; sunucu da aynı değerleri uygular */
export const SONG_LIMITS = { title: 40, artist: 40, duration: 5, link: 300 } as const;

export interface SongConfig extends GeneratorConfigBase {
  kind: "song";
  /** Müşteriye açılan stiller; ilki varsayılan */
  styles: SongStyle[];
  /** Müşteriye açılan temalar; ilki varsayılan */
  themes: SongTheme[];
  /** Kütüphane font kimlikleri; ilki varsayılan */
  fonts: string[];
  /** Fotoğrafsız tasarım üretilmesin mi */
  requirePhoto: boolean;
  /** Kapalıysa bağlantı alanı hiç sorulmaz, kod çizilmez */
  showCode: boolean;
  /** Pencere bu metinlerle açılır; önizleme de bunları kullanır */
  sampleTitle: string;
  sampleArtist: string;
}

const STYLE_IDS = SONG_STYLES.map((s) => s.id) as SongStyle[];
const THEME_IDS = SONG_THEMES.map((t) => t.id) as SongTheme[];

const defaults: SongConfig = {
  kind: "song",
  styles: ["card", "minimal"],
  themes: ["dark", "light"],
  fonts: ["montserrat", "poppins"],
  requirePhoto: true,
  showCode: true,
  sampleTitle: "Bizim Şarkımız",
  sampleArtist: "Sen ve Ben",
};

// Tekrarı atar, bilinmeyeni düşürür; hiçbiri kalmazsa varsayılana döner
function pickList<T extends string>(raw: unknown, allowed: readonly string[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out = Array.from(new Set(raw.filter((v): v is T => typeof v === "string" && allowed.includes(v))));
  return out.length ? out : [...fallback];
}

const clip = (v: unknown, max: number, fallback: string) => {
  const s = typeof v === "string" ? Array.from(v.replace(/\s+/g, " ").trim()).slice(0, max).join("") : "";
  return s || fallback;
};

function normalize(raw: unknown): SongConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    kind: "song",
    styles: pickList<SongStyle>(r.styles, STYLE_IDS, defaults.styles),
    themes: pickList<SongTheme>(r.themes, THEME_IDS, defaults.themes),
    fonts: pickList<string>(r.fonts, FONT_LIBRARY.map((f) => f.id), defaults.fonts),
    requirePhoto: typeof r.requirePhoto === "boolean" ? r.requirePhoto : defaults.requirePhoto,
    showCode: typeof r.showCode === "boolean" ? r.showCode : defaults.showCode,
    sampleTitle: clip(r.sampleTitle, SONG_LIMITS.title, defaults.sampleTitle),
    sampleArtist: clip(r.sampleArtist, SONG_LIMITS.artist, defaults.sampleArtist),
  };
}

export const songConfig: GeneratorConfigModule<SongConfig> = {
  kind: "song",
  defaults,
  normalize,
  // Başlık ve sanatçı boşsa sunucu ayardaki örnek metinlere döner; önizleme
  // böylece mağaza sahibinin yazdığı örnekle çizilir
  sampleInput: {
    fields: {
      title: "",
      artist: "",
      link: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
      duration: "3:20",
    },
    choices: {},
  },
  samplePhoto: true,
};
