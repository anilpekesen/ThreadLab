/**
 * Kelime sanatı şablonu — kelimeler bir siluetin (kalp, yıldız, harf...) içine
 * dizilir. Müşteri kelimelerini yazar, sunucu yerleşimi yapıp tek bir PNG
 * üretir; tasarımcı onu diğer şablon sonuçları gibi görsel nesnesi olarak
 * ürüne koyar.
 *
 * Bu dosya ayarların tipini, sınırlarını ve hazır listeleri tutar. Sunucuda
 * da yönetim ekranında da çalışır; bağımlılığı yok.
 */
import { shapePath, type SlotShapeId } from "./slot-shapes";

export type WordArtShapeId = SlotShapeId | "circle" | "square" | "letter" | "photo";

/**
 * Hazır siluetler. `aspect` = genişlik / yükseklik: şekil tuvale esnetilmez,
 * bu oranla ortalanır. Kalbi 2400x1650'lik bir tuvale esnetmek onu yassı bir
 * yastığa çeviriyordu.
 */
export const WORDART_SHAPES: Array<{ id: WordArtShapeId; label: string; labelEn: string; aspect: number }> = [
  { id: "heart", label: "Kalp", labelEn: "Heart", aspect: 1.08 },
  { id: "circle", label: "Daire", labelEn: "Circle", aspect: 1 },
  { id: "star", label: "Yıldız", labelEn: "Star", aspect: 1.05 },
  { id: "square", label: "Kare", labelEn: "Square", aspect: 1 },
  { id: "oval", label: "Oval", labelEn: "Oval", aspect: 0.78 },
  { id: "hexagon", label: "Altıgen", labelEn: "Hexagon", aspect: 1.15 },
  { id: "diamond", label: "Elmas", labelEn: "Diamond", aspect: 0.82 },
  { id: "arch", label: "Kemer", labelEn: "Arch", aspect: 0.8 },
  // Harf siluetinin oranı seçilen harfe göre sunucuda hesaplanır
  { id: "letter", label: "Harf", labelEn: "Letter", aspect: 1 },
  // Müşterinin fotoğrafı: arka planı silinir, kelimeler kişinin siluetine dizilir
  { id: "photo", label: "Fotoğrafım", labelEn: "My photo", aspect: 1 },
];

export function isWordArtShape(v: unknown): v is WordArtShapeId {
  return WORDART_SHAPES.some((s) => s.id === v);
}

/**
 * Şeklin `w × h` kutudaki SVG yolu. Harf burada yok: glif yolu fonttan
 * geldiği için sunucuda üretiliyor.
 */
export function wordArtShapePath(shape: Exclude<WordArtShapeId, "letter" | "photo">, w: number, h: number): string {
  if (shape === "circle") return shapePath("oval", w, h);
  if (shape === "square") return `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`;
  return shapePath(shape, w, h);
}

export const WORDART_PALETTES: Array<{ id: string; label: string; labelEn: string; colors: string[] }> = [
  { id: "black", label: "Siyah", labelEn: "Black", colors: ["#111111"] },
  { id: "white", label: "Beyaz", labelEn: "White", colors: ["#ffffff"] },
  { id: "love", label: "Aşk", labelEn: "Love", colors: ["#c2185b", "#e91e63", "#f06292", "#8e0038", "#ff5c8a"] },
  { id: "warm", label: "Sıcak", labelEn: "Warm", colors: ["#d84315", "#f4511e", "#ffb300", "#c62828", "#6d4c41"] },
  { id: "ocean", label: "Okyanus", labelEn: "Ocean", colors: ["#01579b", "#0288d1", "#00838f", "#26c6da", "#1a237e"] },
  { id: "forest", label: "Orman", labelEn: "Forest", colors: ["#1b5e20", "#388e3c", "#689f38", "#827717", "#004d40"] },
  { id: "sunset", label: "Gün batımı", labelEn: "Sunset", colors: ["#ff6f00", "#e65100", "#d81b60", "#8e24aa", "#fdd835"] },
  { id: "rainbow", label: "Gökkuşağı", labelEn: "Rainbow", colors: ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"] },
  { id: "neon", label: "Neon", labelEn: "Neon", colors: ["#39ff14", "#ff073a", "#00f0ff", "#ffea00", "#ff00e6"] },
  { id: "gold", label: "Altın", labelEn: "Gold", colors: ["#b8860b", "#d4a017", "#8b6914", "#c9a227"] },
  { id: "mono", label: "Gri tonları", labelEn: "Greyscale", colors: ["#111111", "#424242", "#616161", "#212121"] },
  // Her kelime fotoğrafta durduğu yerin rengini alır; yalnızca "Fotoğrafım"
  // şekliyle anlamlı. Renkler çizim anında fotoğraftan okunur.
  { id: "photo", label: "Fotoğrafın renkleri", labelEn: "Photo colours", colors: [] },
];

/** Fotoğraftan renk alan palet — yalnızca fotoğraf şekliyle geçerli */
export const PHOTO_PALETTE_ID = "photo";

export function findPalette(id: string | undefined) {
  return WORDART_PALETTES.find((p) => p.id === id);
}

export type WordArtOrientation = "horizontal" | "mixed" | "vertical";

export interface WordArtTemplateConfig {
  /** Üretilen PNG'nin piksel ölçüsü */
  canvasWidth: number;
  canvasHeight: number;
  /** Müşteriye açılan şekiller; ilk eleman varsayılan */
  shapes: WordArtShapeId[];
  /** Kütüphane font kimlikleri (font-library); ilk eleman varsayılan */
  fonts: string[];
  /** Palet kimlikleri; ilk eleman varsayılan */
  palettes: string[];
  orientation: WordArtOrientation;
  /**
   * Punto sınırları, tuval pikseli cinsinden. Alt sınır baskıda okunabilirlik
   * içindir: 2400 px'lik bir tasarım ~30 cm basılırsa 28 px ≈ 3.5 mm.
   */
  minFontPx: number;
  maxFontPx: number;
  /** Müşterinin girebileceği en fazla kelime ve bir kelimenin en fazla harfi */
  maxWords: number;
  maxWordLength: number;
  /** Pencere ilk açıldığında görünen örnek kelimeler */
  sampleWords: string[];
  /** Harf şeklinde varsayılan harf */
  defaultLetter: string;
  /** Şeklin arkasına zemin rengi; boş = şeffaf */
  background: string;
  /** Kelimeler bitince tekrar ederek boşlukları doldur */
  repeatWords: boolean;
  seed: number;
}

export const DEFAULT_WORDART: WordArtTemplateConfig = {
  canvasWidth: 2400,
  canvasHeight: 2400,
  shapes: ["heart", "circle", "star", "letter"],
  fonts: ["archivo-black", "montserrat", "dancing-script"],
  palettes: ["love", "black", "white", "rainbow"],
  orientation: "mixed",
  minFontPx: 28,
  maxFontPx: 360,
  maxWords: 40,
  maxWordLength: 24,
  sampleWords: ["*Seni Seviyorum", "Aşkım", "Canım", "Hayatım", "Bir Tanem", "Sonsuza Dek", "Kalbim"],
  defaultLetter: "A",
  background: "",
  repeatWords: true,
  seed: 1,
};

const clampNum = (v: unknown, lo: number, hi: number, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fb;
};

const isHex = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/**
 * Kayıttan ya da formdan gelen ham değeri güvenli ayarlara çevirir. Kimliği
 * tanınmayan şekil/palet düşer; liste boş kalırsa varsayılana dönülür, yoksa
 * müşteri penceresi seçeneksiz açılırdı.
 */
export function normalizeWordArtConfig(raw: unknown, knownFonts: string[] = []): WordArtTemplateConfig {
  const o = (raw ?? {}) as Partial<WordArtTemplateConfig>;
  const d = DEFAULT_WORDART;

  const shapes = Array.isArray(o.shapes) ? o.shapes.filter(isWordArtShape) : [];
  const palettes = Array.isArray(o.palettes) ? o.palettes.map(String).filter((p) => findPalette(p)) : [];
  let fonts = Array.isArray(o.fonts) ? o.fonts.map(String) : [];
  if (knownFonts.length) fonts = fonts.filter((f) => knownFonts.includes(f));

  const minFontPx = clampNum(o.minFontPx, 12, 200, d.minFontPx);
  const orientation: WordArtOrientation = o.orientation === "horizontal" || o.orientation === "vertical"
    ? o.orientation : o.orientation === "mixed" ? "mixed" : d.orientation;

  return {
    canvasWidth: clampNum(o.canvasWidth, 600, 6000, d.canvasWidth),
    canvasHeight: clampNum(o.canvasHeight, 600, 6000, d.canvasHeight),
    shapes: shapes.length ? Array.from(new Set(shapes)) : d.shapes,
    fonts: fonts.length ? Array.from(new Set(fonts)) : d.fonts,
    palettes: palettes.length ? Array.from(new Set(palettes)) : d.palettes,
    orientation,
    minFontPx,
    maxFontPx: Math.max(minFontPx + 10, clampNum(o.maxFontPx, 40, 2000, d.maxFontPx)),
    maxWords: clampNum(o.maxWords, 1, 200, d.maxWords),
    maxWordLength: clampNum(o.maxWordLength, 3, 60, d.maxWordLength),
    sampleWords: Array.isArray(o.sampleWords)
      ? o.sampleWords.map((w) => String(w).trim()).filter(Boolean).slice(0, 200)
      : d.sampleWords,
    defaultLetter: normalizeLetter(o.defaultLetter) || d.defaultLetter,
    background: isHex(o.background) ? String(o.background) : "",
    repeatWords: o.repeatWords === undefined ? d.repeatWords : o.repeatWords === true,
    seed: clampNum(o.seed, 1, 1_000_000, d.seed),
  };
}

/** Harf şekli için tek bir harf ya da rakam; Türkçe harfler dahil */
export function normalizeLetter(v: unknown): string {
  const ch = Array.from(String(v ?? "").trim())[0] ?? "";
  return /^[\p{L}\p{N}&]$/u.test(ch) ? ch.toLocaleUpperCase("tr-TR") : "";
}

export interface WordArtWord {
  text: string;
  /** Başına `*` konan kelime öne çıkar: daha büyük puntoyla başlar */
  featured: boolean;
}

/**
 * Müşterinin yazdığı satırları kelime listesine çevirir: boşlar ve
 * tekrarlar atılır, sınırlar uygulanır. Sunucu da istemci de aynı kuralı
 * kullansın diye burada.
 */
export function parseWordArtWords(
  input: string | string[],
  limits: { maxWords: number; maxWordLength: number },
): WordArtWord[] {
  const lines = Array.isArray(input) ? input : String(input ?? "").split(/\r?\n/);
  const seen = new Set<string>();
  const out: WordArtWord[] = [];
  for (const line of lines) {
    let text = String(line ?? "").replace(/\s+/g, " ").trim();
    const featured = text.startsWith("*");
    if (featured) text = text.slice(1).trim();
    text = Array.from(text).slice(0, limits.maxWordLength).join("");
    if (!text) continue;
    const key = text.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, featured });
    if (out.length >= limits.maxWords) break;
  }
  return out;
}

/** Müşterinin pencerede yaptığı seçimler */
export interface WordArtChoices {
  shape?: string;
  letter?: string;
  font?: string;
  palette?: string;
  /** Dizilim varyantı; 0 = şablonun kendi tohumu */
  variant?: number;
}
