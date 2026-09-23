import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";
import { FONT_LIBRARY } from "../../font-library";

/**
 * Doğum çiçeği ve isim — her kişinin doğum ayının çiçeği, altında adı.
 * Tek kişilik zarif bir çiçekten anneye aile buketine kadar.
 *
 * Çiçekler dış görsel kullanmadan, sunucuda kodla çizilir (bkz.
 * flowers.server). Bu dosya istemci-güvenli: yönetim ekranı ve model katmanı
 * da kullanır.
 */

export type BirthflowerStyle = "lineart" | "color" | "silhouette";
export type BirthflowerLayout = "row" | "bouquet" | "single";

/** Yaygın Batı geleneğindeki ay çiçekleri */
export const BIRTH_MONTHS: Array<{ month: number; label: string; labelEn: string; flower: string; flowerEn: string }> = [
  { month: 1, label: "Ocak", labelEn: "January", flower: "Karanfil", flowerEn: "Carnation" },
  { month: 2, label: "Şubat", labelEn: "February", flower: "Menekşe", flowerEn: "Violet" },
  { month: 3, label: "Mart", labelEn: "March", flower: "Nergis", flowerEn: "Daffodil" },
  { month: 4, label: "Nisan", labelEn: "April", flower: "Papatya", flowerEn: "Daisy" },
  { month: 5, label: "Mayıs", labelEn: "May", flower: "İnci çiçeği", flowerEn: "Lily of the valley" },
  { month: 6, label: "Haziran", labelEn: "June", flower: "Gül", flowerEn: "Rose" },
  { month: 7, label: "Temmuz", labelEn: "July", flower: "Hezaren", flowerEn: "Larkspur" },
  { month: 8, label: "Ağustos", labelEn: "August", flower: "Gelincik", flowerEn: "Poppy" },
  { month: 9, label: "Eylül", labelEn: "September", flower: "Yıldız çiçeği", flowerEn: "Aster" },
  { month: 10, label: "Ekim", labelEn: "October", flower: "Kadife çiçeği", flowerEn: "Marigold" },
  { month: 11, label: "Kasım", labelEn: "November", flower: "Kasımpatı", flowerEn: "Chrysanthemum" },
  { month: 12, label: "Aralık", labelEn: "December", flower: "Kardelen", flowerEn: "Snowdrop" },
];

export const BIRTHFLOWER_STYLES: Array<{ id: BirthflowerStyle; label: string; labelEn: string; hint: string }> = [
  { id: "lineart", label: "Çizgi", labelEn: "Line art", hint: "Tek renk kontur, zarif ve minimal" },
  { id: "color", label: "Renkli", labelEn: "Colour", hint: "Kontur + yumuşak renk dolgular (tam renkli baskı gerekir)" },
  { id: "silhouette", label: "Siluet", labelEn: "Silhouette", hint: "Dolu tek renk, kâğıt kesiği görünümü" },
];

export const BIRTHFLOWER_LAYOUTS: Array<{ id: BirthflowerLayout; label: string; labelEn: string; hint: string }> = [
  { id: "bouquet", label: "Buket", labelEn: "Bouquet", hint: "Saplar kurdeleyle toplanır, isimler altta" },
  { id: "row", label: "Yan yana", labelEn: "Side by side", hint: "Her kişinin çiçeği, altında adı" },
  { id: "single", label: "Tek çiçek", labelEn: "Single flower", hint: "Tek kişi, büyük çiçek, ad sapın yanında" },
];

/** Mürekkep renkleri: koyu ürün için beyaz, açık ürün için diğerleri */
export const BIRTHFLOWER_INKS: Array<{ id: string; label: string; labelEn: string; hex: string }> = [
  { id: "black", label: "Siyah", labelEn: "Black", hex: "#1a1a1a" },
  { id: "white", label: "Beyaz", labelEn: "White", hex: "#ffffff" },
  { id: "sage", label: "Adaçayı yeşili", labelEn: "Sage green", hex: "#5f7a61" },
  { id: "burgundy", label: "Bordo", labelEn: "Burgundy", hex: "#7b2536" },
  { id: "dustyrose", label: "Gül kurusu", labelEn: "Dusty rose", hex: "#b76e79" },
  { id: "navy", label: "Lacivert", labelEn: "Navy", hex: "#1f2d4a" },
  { id: "brown", label: "Kahve", labelEn: "Brown", hex: "#5b4033" },
  { id: "gold", label: "Altın", labelEn: "Gold", hex: "#b08d57" },
];

export interface BirthflowerConfig extends GeneratorConfigBase {
  kind: "birthflower";
  /** Müşteriye açılan stiller; ilk eleman varsayılan */
  styles: BirthflowerStyle[];
  /** Müşteriye açılan düzenler; ilk eleman varsayılan */
  layouts: BirthflowerLayout[];
  /** Kütüphane font kimlikleri; ilk eleman varsayılan */
  fonts: string[];
  /** Mürekkep kimlikleri (BIRTHFLOWER_INKS); ilk eleman varsayılan */
  inks: string[];
  /** Bir tasarımdaki en fazla kişi (1–8) */
  maxPeople: number;
  /** İsim başına en fazla harf */
  nameMaxLength: number;
  /** Başlık alanı ("Annemin Bahçesi") açık mı */
  titleEnabled: boolean;
  titleMaxLength: number;
  /** Başlık kutusunun örnek metni */
  titlePlaceholder: string;
}

const STYLE_IDS = BIRTHFLOWER_STYLES.map((s) => s.id);
const LAYOUT_IDS = BIRTHFLOWER_LAYOUTS.map((l) => l.id);
const INK_IDS = BIRTHFLOWER_INKS.map((i) => i.id);
const FONT_IDS = FONT_LIBRARY.map((f) => f.id);

const defaults: BirthflowerConfig = {
  kind: "birthflower",
  styles: ["lineart", "color", "silhouette"],
  layouts: ["bouquet", "row", "single"],
  fonts: ["dancing-script", "great-vibes", "playfair"],
  inks: ["black", "white", "sage", "burgundy", "dustyrose"],
  maxPeople: 5,
  nameMaxLength: 16,
  titleEnabled: true,
  titleMaxLength: 30,
  titlePlaceholder: "Annemin Bahçesi",
};

/** İzinli listeden süzülmüş, tekrarsız liste; boş kalırsa varsayılan */
function list<T extends string>(raw: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const out = Array.from(new Set(raw.filter((v): v is T => (allowed as readonly unknown[]).includes(v))));
  return out.length ? out : [...fallback];
}

function int(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export const birthflowerConfig: GeneratorConfigModule<BirthflowerConfig> = {
  kind: "birthflower",
  defaults,
  normalize(raw) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      kind: "birthflower",
      styles: list(r.styles, STYLE_IDS, defaults.styles),
      layouts: list(r.layouts, LAYOUT_IDS, defaults.layouts),
      fonts: list(r.fonts, FONT_IDS, defaults.fonts),
      inks: list(r.inks, INK_IDS, defaults.inks),
      maxPeople: int(r.maxPeople, 1, 8, defaults.maxPeople),
      nameMaxLength: int(r.nameMaxLength, 4, 20, defaults.nameMaxLength),
      titleEnabled: typeof r.titleEnabled === "boolean" ? r.titleEnabled : defaults.titleEnabled,
      titleMaxLength: int(r.titleMaxLength, 8, 40, defaults.titleMaxLength),
      titlePlaceholder: typeof r.titlePlaceholder === "string" ? r.titlePlaceholder.slice(0, 40) : defaults.titlePlaceholder,
    };
  },
  sampleInput: {
    fields: {
      title: "Annemin Bahçesi",
      name_1: "Ayşe", month_1: "6",
      name_2: "Mehmet", month_2: "3",
      name_3: "Zeynep", month_3: "11",
    },
    choices: {},
  },
};
