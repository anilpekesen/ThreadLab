import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { findConfigForStorefront } from "~/models/product-config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  const config = await findConfigForStorefront(shop, productId, handle);
  if (!config) {
    return json({ error: "Not found" }, { status: 404 });
  }

  return json({
    product: {
      id: config.productId,
      title: config.settings.productTitle,
      handle: config.settings.productHandle,
      productType: config.settings.productType,
      surfaceMode: config.settings.surfaceMode,
    },
    settings: config.settings,
    printAreas: config.printAreas,
  });
};
