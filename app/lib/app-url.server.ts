/**
 * Uygulamanın herkese açık adresi (yüklemeler, bildirim bağlantıları, gömülü
 * sayfalar). Platformdan bağımsız `APP_URL`; yoksa Shopify'ın `SHOPIFY_APP_URL`
 * değeri, o da yoksa çağıranın verdiği yedek. Sondaki `/` atılır.
 *
 * Shopify'a özel adresler (OAuth dönüşü, faturalama dönüşü, app proxy)
 * doğrudan `SHOPIFY_APP_URL` kullanmaya devam eder.
 */
export function publicAppUrl(fallback = "https://app.printlabapp.com"): string {
  return (process.env.APP_URL || process.env.SHOPIFY_APP_URL || fallback).replace(/\/+$/, "");
}
