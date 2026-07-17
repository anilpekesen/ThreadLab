import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
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

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "tr",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
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
    (key: TranslationKey): string => translations[lang][key] ?? translations["tr"][key] ?? key,
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}

export { readLangFromCookie };
