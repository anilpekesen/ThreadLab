import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { createShopSession } from "~/lib/session.server";
import { consumeWooLogin } from "~/models/woo.server";

/**
 * WordPress'teki "PrintLab'i aç" düğmesinin imzalı bağlantısı: doğrulanınca
 * mağaza oturum çerezi verilir ve temiz adrese yönlendirilir.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const ok = isWooShop(shop) && await consumeWooLogin(
    shop,
    url.searchParams.get("ts") ?? "",
    url.searchParams.get("nonce") ?? "",
    url.searchParams.get("sig") ?? "",
  );
  if (!ok) {
    return new Response(
      "This PrintLab link has expired. Open PrintLab again from WooCommerce > PrintLab in your WordPress admin.",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  const next = url.searchParams.get("next") ?? "";
  const target = /^\/app(\/[a-zA-Z0-9/_-]*)?$/.test(next) ? next : "/app";
  return redirect(target, { headers: { "Set-Cookie": await createShopSession(shop) } });
};
