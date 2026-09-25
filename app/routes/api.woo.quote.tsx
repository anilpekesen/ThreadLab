import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { quoteDesign } from "~/models/woo.server";

/** Eklentinin sepet hesabında sorduğu ek ücret (sunucudan, tasarım kaydından) */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!isWooShop(shop) || !/^[a-zA-Z0-9_]{8,80}$/.test(token)) return json({ error: "bad request" }, { status: 400 });
  const quantity = Math.min(10000, Math.max(1, Number.parseInt(url.searchParams.get("qty") ?? "1", 10) || 1));
  const q = await quoteDesign(shop, token, quantity);
  if (!q) return json({ error: "not found" }, { status: 404 });
  return json(q, { headers: { "Cache-Control": "no-store" } });
};
