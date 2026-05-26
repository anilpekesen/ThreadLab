import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (shop) {
    throw redirect(`/auth/login?shop=${shop}`);
  }
  // Installation must originate from Shopify's surface
  throw redirect("https://apps.shopify.com/printlab");
};
