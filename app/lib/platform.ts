/**
 * Mağazanın platformu ve kimliği.
 *
 * Her tablo mağazayı `shop` metniyle tutuyor. Shopify mağazaları bugünkü
 * gibi `*.myshopify.com`; WooCommerce mağazaları `woo:` önekiyle sitenin
 * alan adı (`woo:shop.example.com`). Önek sayesinde mevcut tablolar,
 * sorgular ve tekil kısıtlar değişmeden iki platformu birlikte taşır.
 *
 * Tarayıcı ve sunucuda kullanılır; bağımlılığı yok.
 */

export type Platform = "shopify" | "woo";

const SHOPIFY_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
const WOO_RE = /^woo:[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;
const WOO_PREFIX = "woo:";

export function platformOf(shop: string): Platform {
  return shop.startsWith(WOO_PREFIX) ? "woo" : "shopify";
}

export function isShopifyShop(shop: string): boolean {
  return SHOPIFY_RE.test(shop);
}

export function isWooShop(shop: string): boolean {
  return WOO_RE.test(shop);
}

/** Herhangi bir platformun geçerli mağaza kimliği */
export function isValidShop(shop: string): boolean {
  return isShopifyShop(shop) || isWooShop(shop);
}

/** WordPress site adresinden mağaza kimliği; geçersizse null */
export function wooShopKey(siteUrl: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
    const key = `${WOO_PREFIX}${u.host.toLowerCase()}`;
    return isWooShop(key) ? key : null;
  } catch {
    return null;
  }
}

/**
 * Kısa mağaza adı: görünen ad ve anahtar olarak. Shopify'da bugünkü gibi
 * `.myshopify.com` atılır; WooCommerce'te sitenin alan adı.
 */
export function shopHandle(shop: string): string {
  if (shop.startsWith(WOO_PREFIX)) return shop.slice(WOO_PREFIX.length);
  return shop.replace(/\.myshopify\.com$/i, "");
}

/** Mağazanın kendi yönetim panelinde sipariş sayfası */
export function orderAdminUrl(shop: string, orderId: string): string {
  if (platformOf(shop) === "woo") {
    return `https://${shopHandle(shop)}/wp-admin/admin.php?page=wc-orders&action=edit&id=${encodeURIComponent(orderId)}`;
  }
  return `https://admin.shopify.com/store/${shopHandle(shop)}/orders/${orderId}`;
}
