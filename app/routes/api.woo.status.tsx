import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { isWooConnected } from "~/models/woo.server";

/** Eklentinin ayar ekranı bağlantı durumunu buradan okur */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = new URL(request.url).searchParams.get("shop") ?? "";
  if (!isWooShop(shop)) return json({ connected: false }, { status: 400 });
  return json({ connected: await isWooConnected(shop) }, { headers: { "Cache-Control": "no-store" } });
};
