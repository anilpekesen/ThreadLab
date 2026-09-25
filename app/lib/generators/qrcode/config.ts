import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorConfigBase, GeneratorConfigModule } from "../types";

/**
 * QR kod — müşterinin bağlantısı, mesajı ya da Wi-Fi bilgisi okutulabilir bir
 * koda dönüşür: tişört, çerçeve, düğün panosu için tek renk mürekkep, şeffaf
 * zemin.
 *
 * Asıl kaygı okunabilirlik: modül stilleri, ortadaki kalp ve çerçeve ne olursa
 * olsun kod telefonla okunmalı. Köşe gözleri her stilde dolu çizilir, sessiz
 * bölge (4 modül) korunur, kalp açıkken hata düzeltme H'ye çıkar. Stillerin
 * okunabilirliği çizilen PNG'ler çözülerek doğrulandı.
 *
 * Bu dosya istemci-güvenli: yönetim ekranı ve model katmanı da kullanır.
 */

export const QR_CONTENT_TYPES = [
  { id: "url", label: "Bağlantı", labelEn: "Link", hint: "Web sitesi, video, albüm, davetiye bağlantısı", hintEn: "Website, video, album or invitation link" },
  { id: "text", label: "Mesaj", labelEn: "Message", hint: "Okutunca görünen kısa bir not", hintEn: "A short note shown when scanned" },
  { id: "wifi", label: "Wi-Fi", labelEn: "Wi-Fi", hint: "Okutan telefon ağa şifre yazmadan bağlanır", hintEn: "Phones join the network without typing the password" },
  { id: "phone", label: "Telefon", labelEn: "Phone", hint: "Okutunca numarayı arar", hintEn: "Calls the number when scanned" },
  { id: "email", label: "E-posta", labelEn: "Email", hint: "Okutunca e-posta taslağı açar", hintEn: "Opens a new email when scanned" },
] as const;
export type QrContentType = (typeof QR_CONTENT_TYPES)[number]["id"];

export const QR_STYLES = [
  { id: "square", label: "Klasik", labelEn: "Classic", hint: "Kare modüller, en yüksek okunabilirlik", hintEn: "Square modules, the most reliable" },
  { id: "rounded", label: "Yuvarlak", labelEn: "Rounded", hint: "Birbirine akan yumuşak köşeli modüller", hintEn: "Soft-cornered modules that flow into each other" },
  { id: "dots", label: "Noktalı", labelEn: "Dots", hint: "Yuvarlak noktalar, köşe gözleri dolu", hintEn: "Round dots with solid corner eyes" },
] as const;
export type QrStyle = (typeof QR_STYLES)[number]["id"];

export const QR_LAYOUTS = [
  { id: "plain", label: "Yalnızca kod", labelEn: "Code only", hint: "Yazısız, sade kod", hintEn: "Just the code, no text" },
  { id: "caption", label: "Altında yazı", labelEn: "Caption below", hint: "Kodun altında kısa yazı", hintEn: "A short caption under the code" },
  { id: "badge", label: "Çerçeveli", labelEn: "Framed badge", hint: "Yuvarlak köşeli çerçeve, yazı alt şeritte", hintEn: "Rounded frame with the caption in the bottom band" },
] as const;
export type QrLayout = (typeof QR_LAYOUTS)[number]["id"];

export const QR_ICONS = [
  { id: "none", label: "Yok", labelEn: "None" },
  { id: "heart", label: "Kalp", labelEn: "Heart" },
] as const;
export type QrIcon = (typeof QR_ICONS)[number]["id"];

export const QR_WIFI_SECURITY = [
  { id: "WPA", label: "WPA/WPA2/WPA3", labelEn: "WPA/WPA2/WPA3" },
  { id: "WEP", label: "WEP", labelEn: "WEP" },
  { id: "nopass", label: "Şifresiz", labelEn: "No password" },
] as const;
export type QrWifiSecurity = (typeof QR_WIFI_SECURITY)[number]["id"];

/** Hazır renkler: ayar ekranındaki örnekler ve bilinen renklerin adları */
export const QR_SWATCHES: Array<{ hex: string; label: string; labelEn: string }> = [
  { hex: "#111111", label: "Siyah", labelEn: "Black" },
  { hex: "#ffffff", label: "Beyaz", labelEn: "White" },
  { hex: "#1e3a5f", label: "Lacivert", labelEn: "Navy" },
  { hex: "#7b1e2b", label: "Bordo", labelEn: "Burgundy" },
  { hex: "#2f5d3a", label: "Zümrüt", labelEn: "Emerald" },
  { hex: "#5b4033", label: "Kahve", labelEn: "Brown" },
  { hex: "#b8860b", label: "Altın", labelEn: "Gold" },
  { hex: "#b76e79", label: "Gül kurusu", labelEn: "Rose gold" },
  { hex: "#8a8a8a", label: "Gri", labelEn: "Gray" },
];

/** Müşteri girdisi sınırları (pencere ve sunucu aynı değerleri kullanır) */
export const QR_LIMITS = {
  url: 300,
  text: 200,
  ssid: 32,
  password: 63,
  phone: 20,
  email: 120,
  caption: 24,
} as const;

/**
 * Yazı boş bırakılmışsa (mağaza sahibi varsayılan yazmamışsa) içerik türüne
 * göre önerilen yazı, şablonun diline göre.
 */
export const QR_AUTO_CAPTIONS: Record<"tr" | "en", Record<QrContentType, string>> = {
  tr: { url: "Beni okut", text: "Beni okut", wifi: "Wi-Fi'ye bağlan", phone: "Beni ara", email: "Bana yaz" },
  en: { url: "Scan me", text: "Scan me", wifi: "Join our Wi-Fi", phone: "Call me", email: "Email me" },
};

export interface QrcodeConfig extends GeneratorConfigBase {
  kind: "qrcode";
  /** Müşteriye açılan içerik türleri; ilk eleman varsayılan */
  contentTypes: QrContentType[];
  /** Modül stilleri; ilk eleman varsayılan */
  styles: QrStyle[];
  /** Düzenler; ilk eleman varsayılan */
  layouts: QrLayout[];
  /** Müşteri ortaya kalp koyabilsin mi (açıkken hata düzeltme H) */
  centerIcon: boolean;
  /** Yazı için FONT_LIBRARY kimlikleri; ilk eleman varsayılan */
  fonts: string[];
  /** #rrggbb mürekkepler; ilk eleman varsayılan */
  inks: string[];
  /**
   * Müşteri yazıyı kendisi değiştirebilsin mi. Kapalıyken "Altında yazı" ve
   * "Çerçeveli" düzenler mağaza sahibinin yazısını basar.
   */
  captionEnabled: boolean;
  /** Yazının başlangıç metni; boşsa içerik türüne göre önerilen (QR_AUTO_CAPTIONS) */
  defaultCaption: string;
  /** Önerilen yazıların dili */
  language: "tr" | "en";
}

const DEFAULTS: QrcodeConfig = {
  kind: "qrcode",
  contentTypes: ["url", "text", "wifi"],
  styles: ["rounded", "square", "dots"],
  layouts: ["caption", "badge", "plain"],
  centerIcon: true,
  fonts: ["montserrat", "poppins", "playfair", "dancing-script"],
  inks: ["#111111", "#ffffff", "#1e3a5f", "#7b1e2b"],
  captionEnabled: true,
  defaultCaption: "",
  language: "tr",
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
  if (!Array.isArray(raw)) return [...DEFAULTS.inks];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const hex = v.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex) && !out.includes(hex)) out.push(hex);
  }
  return out.length ? out.slice(0, 12) : [...DEFAULTS.inks];
}

// Yönetim ekranı her tuşta normalize ediyor: kırpma (trim) yapılmaz, yazılan
// son boşluk silinmesin. Kenar boşlukları çizimde atılır.
const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" ? Array.from(v.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : fallback;

export function normalizeQrcodeConfig(raw: unknown): QrcodeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    kind: "qrcode",
    contentTypes: pickList(r.contentTypes, QR_CONTENT_TYPES.map((c) => c.id), DEFAULTS.contentTypes),
    styles: pickList(r.styles, QR_STYLES.map((s) => s.id), DEFAULTS.styles),
    layouts: pickList(r.layouts, QR_LAYOUTS.map((l) => l.id), DEFAULTS.layouts),
    centerIcon: typeof r.centerIcon === "boolean" ? r.centerIcon : DEFAULTS.centerIcon,
    fonts: pickList(r.fonts, FONT_IDS, DEFAULTS.fonts),
    inks: pickColors(r.inks),
    captionEnabled: typeof r.captionEnabled === "boolean" ? r.captionEnabled : DEFAULTS.captionEnabled,
    defaultCaption: str(r.defaultCaption, QR_LIMITS.caption, DEFAULTS.defaultCaption),
    language: r.language === "en" ? "en" : "tr",
  };
}

/** Şablonun bu içerik türü için başlangıç yazısı */
export function qrDefaultCaption(config: QrcodeConfig, content: QrContentType): string {
  return config.defaultCaption.trim() || QR_AUTO_CAPTIONS[config.language][content];
}

export function qrColorName(hex: string, en = false): string {
  const s = QR_SWATCHES.find((c) => c.hex === hex.toLowerCase());
  return s ? (en ? s.labelEn : s.label) : hex;
}

export const qrcodeConfig: GeneratorConfigModule<QrcodeConfig> = {
  kind: "qrcode",
  defaults: DEFAULTS,
  normalize: normalizeQrcodeConfig,
  sampleInput: {
    fields: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "Düğün videomuz ♥" },
    choices: { content: "url", style: "rounded", layout: "badge", icon: "heart", font: "montserrat", ink: "#111111" },
  },
};
