import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { listWooTemplates, verifyWooSiteRequest } from "~/models/woo.server";

/** Eklentinin ürün ekranı: mağazanın şablonları (webhook sırrıyla imzalı istek) */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  if (!isWooShop(shop)) return json({ error: "bad request" }, { status: 400 });
  const ok = await verifyWooSiteRequest(shop, url.searchParams.get("ts") ?? "", url.searchParams.get("sig") ?? "");
  if (!ok) return json({ error: "unauthorized" }, { status: 401 });
  return json({ templates: await listWooTemplates(shop) }, { headers: { "Cache-Control": "no-store" } });
};
