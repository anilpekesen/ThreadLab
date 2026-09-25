import { query } from "~/lib/db.server";

/**
 * Shopify'ın uygulama içi yorum penceresi ne zaman istensin.
 *
 * Shopify kuralı (App Store gereksinimi 1.3.1): yorum tarafsız dille
 * istenir, karşılığında ödül/indirim verilemez. Pencereyi Shopify açar ve
 * 60 günde bir, yılda en fazla üç kez gösterir; erken çağrı "reddedildi"
 * döner. Bu yüzden yalnız mağaza uygulamadan gerçek fayda gördükten sonra
 * (yeterli sayıda kişiselleştirilmiş sipariş) ve kendi 60 günlük aramızı
 * bekleyerek isteriz.
 */
export const REVIEW_ORDER_THRESHOLD = 10;
const COOLDOWN_DAYS = 60;

/** Bir daha istenmeyecek cevaplar */
const FINAL_CODES = new Set(["already-reviewed", "annual-limit-reached"]);

/** Uygulama sahibinin kendi mağazaları: geliştiricinin kendi uygulamasına yorum yazması yasak */
function isOwnerShop(shop: string): boolean {
  return (process.env.OWNER_SHOPS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(shop.toLowerCase());
}

export async function shouldRequestReview(shop: string, orderCount: number): Promise<boolean> {
  if (orderCount < REVIEW_ORDER_THRESHOLD) return false;
  if (isOwnerShop(shop)) return false;
  const r = await query<{ last_requested_at: Date; last_code: string }>(
    "SELECT last_requested_at, last_code FROM review_prompts WHERE shop = $1",
    [shop],
  );
  const row = r.rows[0];
  if (!row) return true;
  if (FINAL_CODES.has(row.last_code)) return false;
  const days = (Date.now() - new Date(row.last_requested_at).getTime()) / 86_400_000;
  return days >= COOLDOWN_DAYS;
}

export async function recordReviewPrompt(shop: string, code: string): Promise<void> {
  const safe = String(code).replace(/[^a-z-]/g, "").slice(0, 40);
  await query(
    `INSERT INTO review_prompts (shop, last_requested_at, last_code, request_count)
     VALUES ($1, now(), $2, 1)
     ON CONFLICT (shop) DO UPDATE SET
       last_requested_at = now(),
       last_code = $2,
       request_count = review_prompts.request_count + 1`,
    [shop, safe],
  );
}
