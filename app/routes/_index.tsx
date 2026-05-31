import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    const next = new URL("/auth/login", url.origin);
    next.searchParams.set("shop", shop);
    ["host", "embedded", "id_token", "session", "hmac", "timestamp", "locale"].forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) next.searchParams.set(key, value);
    });
    throw redirect(`${next.pathname}${next.search}`);
  }
  // Installation must originate from Shopify's surface
  throw redirect("https://apps.shopify.com/printlab");
};
