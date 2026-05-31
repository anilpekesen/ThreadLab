import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const hasEmbeddedParams = Boolean(
    url.searchParams.get("shop")
    || url.searchParams.get("host")
    || url.searchParams.get("embedded")
    || url.searchParams.get("id_token")
    || url.searchParams.get("session"),
  );

  if (hasEmbeddedParams) {
    throw redirect(`/app${url.search}`);
  }

  // Installation must originate from Shopify's surface
  throw redirect("https://apps.shopify.com/printlab");
};
