import { extra as de } from "~/i18n/storefront/de";
import { extra as fr } from "~/i18n/storefront/fr";
import { extra as es } from "~/i18n/storefront/es";

/**
 * Mağaza tarafında (müşterinin gördüğü) sunucuda üretilen metinlerin dili:
 * kişiselleştirme kutusu, hata mesajları. Tasarımcıyla aynı kural
 * (designer-ui/src/i18n.ts): yalnız "tr" Türkçe; de/fr/es çevirisi, geri
 * kalan her dil İngilizce. Eskiden "en ile başlamıyorsa Türkçe" deniyordu ve
 * Almanca bir mağazada kutu Türkçe açılıyordu.
 */
export type StorefrontLang = "tr" | "en" | "de" | "fr" | "es";

const TABLES: Partial<Record<StorefrontLang, Record<string, string>>> = { de, fr, es };

export function storefrontLang(locale: string | null | undefined): StorefrontLang {
  const code = String(locale ?? "").toLowerCase().slice(0, 2);
  if (!code) return "tr";
  return (["tr", "en", "de", "fr", "es"] as const).includes(code as StorefrontLang) ? (code as StorefrontLang) : "en";
}

/** `isTr ? tr : en` yerine: Türkçe, İngilizce ya da İngilizce metnin çevirisi */
export function makeStx(lang: StorefrontLang) {
  return (trText: string, enText: string): string => {
    if (lang === "tr") return trText;
    if (lang === "en") return enText;
    return TABLES[lang]?.[enText] ?? enText;
  };
}
