import type { Lang } from "./index";

/**
 * Sunucu tarafında (loader/action) yönetim dilini bulur.
 *
 * Önce formla gelen `_lang` alanına bakılır: uygulama Shopify admin
 * iframe'inde çalıştığı için tarayıcı dil çerezini engelleyebiliyor; istemci
 * seçili dili forma koyarsa sunucu doğru dilde hata döndürür. Yoksa çerez,
 * o da yoksa Türkçe.
 *
 *   const lang = langFromRequest(request, form);
 *   return json({ error: lang === "en" ? "Name is required" : "İsim gerekli" });
 */
export function langFromRequest(request: Request, form?: FormData | null): Lang {
  const fromForm = form?.get("_lang");
  if (fromForm === "en" || fromForm === "tr") return fromForm;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("_lang");
  if (fromQuery === "en" || fromQuery === "tr") return fromQuery;
  const cookie = request.headers.get("Cookie") ?? "";
  const m = cookie.match(/(?:^|; )dk_lang=([^;]*)/);
  return m && decodeURIComponent(m[1]) === "en" ? "en" : "tr";
}
