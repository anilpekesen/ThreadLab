import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { buildEmbeddedAppAdminUrl } from "~/lib/shopify-admin-url.server";
import { completeEtsyOAuth } from "~/models/etsy.server";

/**
 * Etsy izin ekranından dönüş. Mağaza, tek kullanımlık `state` kaydından
 * okunur (PKCE doğrulayıcısı da orada); adresteki hiçbir şeye güvenilmez.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  let shop: string | null = null;
  let result = "denied";
  if (code && state && !url.searchParams.get("error")) {
    try {
      shop = await completeEtsyOAuth(state, code);
      result = shop ? "connected" : "expired";
    } catch (err) {
      console.error("[etsy] OAuth tamamlanamadı:", err);
      result = "failed";
    }
  }
  const path = `/app/etsy?oauth=${result}`;
  if (shop && !isWooShop(shop)) return redirect(buildEmbeddedAppAdminUrl(shop, path) ?? path);
  return redirect(path);
};
