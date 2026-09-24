import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getActiveCliparts } from "~/models/cliparts.server";

/**
 * Tasarımcının klipart listesi: PrintLab kütüphanesi + (?shop= verilirse) o
 * mağazanın aktif klipartları. Mağaza adı yalnızca filtre olarak kullanılır;
 * başka mağazanın klipartı hiçbir koşulda dönmez.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const origin = url.origin;
  const rawShop = (url.searchParams.get("shop") ?? "").trim().toLowerCase();
  const shop = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(rawShop) ? rawShop : null;
  const cliparts = await getActiveCliparts(shop);
  return json(
    { cliparts },
    {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
};
