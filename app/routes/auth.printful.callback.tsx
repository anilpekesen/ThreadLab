import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { buildEmbeddedAppAdminUrl } from "~/lib/shopify-admin-url.server";
import { completePrintfulOAuth } from "~/models/printful.server";

/**
 * Printful izin ekranından dönüş. Mağaza, `state` ile eşleşen kayıttan
 * okunur (tek kullanımlık, 15 dk); adresteki hiçbir şeye güvenilmez.
 * Shopify mağazası gömülü uygulamaya, WooCommerce mağazası kendi paneline döner.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  let shop: string | null = null;
  let result = "denied";
  if (code && state && url.searchParams.get("success") === "1") {
    try {
      shop = await completePrintfulOAuth(state, code);
      result = shop ? "connected" : "expired";
    } catch (err) {
      console.error("[printful] OAuth tamamlanamadı:", err);
      result = "failed";
    }
  }
  const path = `/app/printful?oauth=${result}`;
  if (shop && !isWooShop(shop)) return redirect(buildEmbeddedAppAdminUrl(shop, path) ?? path);
  return redirect(path);
};
