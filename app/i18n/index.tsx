import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
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

function writeLangCookie(lang: Lang) {
  document.cookie = `${COOKIE_NAME}=${lang}; path=/; max-age=31536000; SameSite=None; Secure`;
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
