import { query } from "~/lib/db.server";

/** Aynı mağaza için en fazla bu sıklıkta yazılır; vitrin isteklerini yavaşlatmasın */
const WRITE_EVERY_MS = 10 * 60 * 1000;
const lastWrite = new Map<string, number>();
const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Tasarımcı vitrinde yüklendi: kurulum durumu kartı için son görülme zamanı */
export function markStorefrontSeen(shop: string): void {
  if (!SHOP_RE.test(shop)) return;
  const now = Date.now();
  if (now - (lastWrite.get(shop) ?? 0) < WRITE_EVERY_MS) return;
  lastWrite.set(shop, now);
  query(
    `INSERT INTO storefront_pings (shop, last_seen_at) VALUES ($1, now())
     ON CONFLICT (shop) DO UPDATE SET last_seen_at = now()`,
    [shop],
  ).catch((err) => console.error("[storefront-ping] yazılamadı:", err));
}

export async function getStorefrontLastSeen(shop: string): Promise<Date | null> {
  const r = await query<{ last_seen_at: Date }>("SELECT last_seen_at FROM storefront_pings WHERE shop = $1", [shop]);
  return r.rows[0]?.last_seen_at ?? null;
}
