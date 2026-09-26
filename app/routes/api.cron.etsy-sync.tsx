import { json, type ActionFunctionArgs } from "@remix-run/node";
import { timingSafeEqual } from "node:crypto";
import { syncAllEtsyShops } from "~/models/etsy.server";

/**
 * Zamanlanmış Etsy eşitlemesi (Etsy'de sipariş webhook'u yok). Sunucudaki
 * cron her 10 dakikada `x-cron-secret: $CRON_SECRET` ile çağırır. Sır
 * tanımlı değilse uç kapalıdır.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("x-cron-secret") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response(null, { status: 404 });
  return json(await syncAllEtsyShops());
};

export const loader = () => new Response(null, { status: 404 });
