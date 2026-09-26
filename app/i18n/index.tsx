import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import tr, { type TranslationKey } from "./tr";
import en from "./en";

export type Lang = "tr" | "en";

const translations: Record<Lang, Record<TranslationKey, string>> = { tr, en };

const COOKIE_NAME = "dk_lang";

function readLangFromCookie(): Lang {
  if (typeof document === "undefined") return "tr";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  const val = match ? decodeURIComponent(match[1]) : "tr";
  return val === "en" ? "en" : "tr";
}

// Uygulama Shopify admin iframe'inde çalıştığı için üçüncü taraf çerezler
// tarayıcılar tarafından engellenebiliyor; localStorage kalıcı kaynak olarak kullanılır.
function readStoredLang(): Lang | null {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(COOKIE_NAME);
    return val === "en" || val === "tr" ? val : null;
  } catch {
    return null;
  }
}

function writeLangCookie(lang: Lang) {
  document.cookie = `${COOKIE_NAME}=${lang}; path=/; max-age=31536000; SameSite=None; Secure`;
  try {
    window.localStorage.setItem(COOKIE_NAME, lang);
  } catch {
    // localStorage kullanılamıyorsa (gizli mod vb.) çerezle devam et
  }
}

export type Platform = "shopify" | "woo";

/**
 * WooCommerce yönetiminde metinlerdeki "Shopify" WooCommerce olur (Türkçe
 * ekleriyle). Anlamı platforma göre gerçekten değişen metinler ise ekranın
 * sözlüğünde `woo` anahtarıyla ayrıca yazılır (bkz. useDict).
 */
const WOO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Shopify'ın/g, "WooCommerce'in"],
  [/Shopify'ı/g, "WooCommerce'i"],
  [/Shopify'a/g, "WooCommerce'e"],
  [/Shopify'da/g, "WooCommerce'te"],
  [/Shopify'dan/g, "WooCommerce'ten"],
  [/Shopify's/g, "WooCommerce's"],
  [/Shopify/g, "WooCommerce"],
];

export function wooize<T>(value: T): T {
  if (typeof value === "string") {
    let out: string = value;
    for (const [re, to] of WOO_REPLACEMENTS) out = out.replace(re, to);
    return out as T;
  }
  if (Array.isArray(value)) return value.map((v) => wooize(v)) as T;
  if (typeof value === "function") {
    const fn = value as unknown as (...a: unknown[]) => unknown;
    return ((...a: unknown[]) => wooize(fn(...a))) as T;
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, wooize(v)])) as T;
  }
  return value;
}

interface LanguageContextValue {
  lang: Lang;
  platform: Platform;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "tr",
  platform: "shopify",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ initialLang, platform = "shopify", children }: { initialLang: Lang; platform?: Platform; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // Sunucu çerezi göremediyse (iframe'de engellenmiş olabilir) localStorage'daki seçimi uygula
  useEffect(() => {
    const stored = readStoredLang();
    if (stored && stored !== initialLang) {
      setLangState(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((next: Lang) => {
    writeLangCookie(next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const text = translations[lang][key] ?? translations["tr"][key] ?? key;
      return platform === "woo" ? wooize(text) : text;
    },
    [lang, platform],
  );

  return (
    <LanguageContext.Provider value={{ lang, platform, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

/**
 * Ekrana özel sözlük: `{ tr: {...}, en: {...} }` alır, geçerli dilin
 * nesnesini döndürür. Büyük ekranlar metinlerini ortak tr.ts/en.ts yerine
 * kendi dosyalarında (app/i18n/<bölüm>/<ekran>.ts) tutar; ortak dosyada
 * yüzlerce anahtar birikmez ve ekranlar birbirinin dosyasına dokunmaz.
 *
 *   const L = useDict(editorDict);
 *   <Button>{L.save}</Button>
 *   {L.linkedTo(3)}   // fonksiyon değerler de olabilir
 */
export function useDict<T>(dict: { tr: T; en: T; woo?: { tr?: Partial<T>; en?: Partial<T> } }): T {
  const { lang, platform } = useContext(LanguageContext);
  return useMemo(() => {
    const base = dict[lang] ?? dict.tr;
    if (platform !== "woo") return base;
    // Önce genel dönüşüm, sonra ekranın WooCommerce'e özel metinleri
    return { ...wooize(base), ...(dict.woo?.[lang] ?? {}) } as T;
  }, [dict, lang, platform]);
}

/** Aynı sözlüğü bileşen dışında (ör. yardımcı fonksiyonlarda) seçmek için */
export function pickDict<T>(dict: { tr: T; en: T }, lang: Lang): T {
  return dict[lang] ?? dict.tr;
}

export { readLangFromCookie };
