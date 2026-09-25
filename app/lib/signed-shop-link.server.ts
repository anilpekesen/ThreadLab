import { createHmac, timingSafeEqual } from "node:crypto";
import { isValidShop } from "~/lib/platform";

/**
 * Mağaza adına imzalı bağlantı.
 *
 * Bazı istekler Shopify yönetim çerçevesinin dışından geliyor ve gömülü
 * oturum belirteci taşımıyor: ödeme onayından dönüş, yeni sekmede açılan
 * Google Drive bağlantısı, düz bağlantıyla indirilen ZIP ve PDF. Bunlar
 * eskiden yalnızca `?shop=` ile tanınıyordu ve kimlik doğrulaması bu
 * parametreye güveniyordu — mağaza alan adını bilen herkes o mağaza adına
 * oturum açabiliyordu.
 *
 * Artık bağlantı sunucuda imzalanıyor. İmza mağazayı, isteğin YOLUNU ve bir
 * son kullanma zamanını kapsıyor: bir indirme bağlantısı sızarsa yalnızca o
 * uç için ve kısa süre geçerli, yönetim paneline kapı açmıyor.
 */

const EXP_PARAM = "pl_exp";
const SIG_PARAM = "pl_sig";

function signingKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET tanımlı değil; imzalı bağlantı üretilemez");
  // Uygulama sırrı doğrudan kullanılmıyor; bu amaca özel türetilmiş anahtar,
  // başka bir yerde üretilen imzanın buraya taşınmasını engelliyor.
  return createHmac("sha256", secret).update("printlab:signed-shop-link:v1").digest();
}

function signature(shop: string, pathname: string, exp: number): string {
  return createHmac("sha256", signingKey())
    .update(`${shop}\n${pathname}\n${exp}`)
    .digest("base64url");
}

export function isValidShopDomain(shop: string): boolean {
  return isValidShop(shop);
}

/**
 * `shop`, `pl_exp` ve `pl_sig` parametrelerini üretir. Yol, isteğin
 * `pathname` değeriyle birebir aynı olmalı ("/api/production-zip").
 */
export function signedShopQuery(shop: string, pathname: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.floor(ttlSeconds));
  const params = new URLSearchParams({ shop, [EXP_PARAM]: String(exp), [SIG_PARAM]: signature(shop, pathname, exp) });
  return params.toString();
}

/** Aynı parametreleri var olan bir URL'ye ekler */
export function appendSignedShopParams(url: URL, shop: string, ttlSeconds: number): URL {
  const query = new URLSearchParams(signedShopQuery(shop, url.pathname, ttlSeconds));
  query.forEach((value, key) => url.searchParams.set(key, value));
  return url;
}

/**
 * İsteğin imzası geçerliyse mağazayı döndürür. İmza yoksa, bozuksa, başka
 * bir yol için üretildiyse ya da süresi dolduysa null.
 */
export function verifySignedShopRequest(url: URL): string | null {
  const shop = url.searchParams.get("shop") ?? "";
  const expRaw = url.searchParams.get(EXP_PARAM) ?? "";
  const sig = url.searchParams.get(SIG_PARAM) ?? "";
  if (!isValidShopDomain(shop) || !/^\d+$/.test(expRaw) || !sig) return null;

  const exp = Number(expRaw);
  if (exp < Math.floor(Date.now() / 1000)) return null;

  let expected: string;
  try {
    expected = signature(shop, url.pathname, exp);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return shop;
}

/** İmza parametrelerini temizler; doğrulanmış isteği temiz adrese yönlendirirken kullanılır */
export function stripSignedShopParams(url: URL): URL {
  const clean = new URL(url.toString());
  ["shop", "host", "embedded", "hmac", "id_token", "session", "timestamp", EXP_PARAM, SIG_PARAM]
    .forEach((key) => clean.searchParams.delete(key));
  return clean;
}
