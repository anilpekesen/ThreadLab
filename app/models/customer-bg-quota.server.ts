import { query } from "~/lib/db.server";

const DEFAULT_LIMIT = 5;

export async function checkAndIncrementCustomerBg(
  shop: string,
  sessionId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ allowed: boolean; count: number; limit: number }> {
  if (!sessionId) return { allowed: true, count: 0, limit };

  const result = await query<{ count: number; reset_count: number }>(
    "SELECT count, reset_count FROM customer_bg_quota WHERE shop = $1 AND session_id = $2",
    [shop, sessionId],
  );

  const row = result.rows[0];
  const count = row?.count ?? 0;
  const resetCount = row?.reset_count ?? 0;
  // Each order placed gives +limit extra uses
  const effectiveLimit = limit + resetCount * limit;

  if (count >= effectiveLimit) {
    return { allowed: false, count, limit: effectiveLimit };
  }

  await query(
    `INSERT INTO customer_bg_quota (shop, session_id, count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (shop, session_id)
     DO UPDATE SET count = customer_bg_quota.count + 1, updated_at = now()`,
    [shop, sessionId],
  );

  return { allowed: true, count: count + 1, limit: effectiveLimit };
}

export async function resetCustomerBgQuota(shop: string, sessionId: string): Promise<void> {
  if (!sessionId) return;
  await query(
    `INSERT INTO customer_bg_quota (shop, session_id, count, reset_count, last_order_at, updated_at)
     VALUES ($1, $2, 0, 1, now(), now())
     ON CONFLICT (shop, session_id)
     DO UPDATE SET
       count = 0,
       reset_count = customer_bg_quota.reset_count + 1,
       last_order_at = now(),
       updated_at = now()`,
    [shop, sessionId],
  );
}
