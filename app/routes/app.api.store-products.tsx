import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { fetchShopifyProducts } from "~/models/product-config.server";

/**
 * Ürün seçici (bkz. ~/components/ProductPicker) için mağazanın ürünleri.
 * Shopify'da App Bridge seçicisi kullanıldığından pratikte WooCommerce içindir.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate(request);
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  const products = await fetchShopifyProducts(admin, q);
  return json({
    products: products.map((p) => ({ id: p.id, title: p.title, handle: p.handle, image: p.featuredImage ?? null })),
  });
};
