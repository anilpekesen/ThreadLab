import { query } from "~/lib/db.server";

const DEFAULT_LIMIT = 5;

export async function checkAndIncrementCustomerBg(
  shop: string,
  sessionId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ allowed: boolean; count: number; limit: number; remaining: number }> {
  if (!sessionId) return { allowed: true, count: 0, limit, remaining: limit };

  // #5: Probabilistic cleanup of old sessions (5% chance per request)
  if (Math.random() < 0.05) {
    query(
      "DELETE FROM customer_bg_quota WHERE updated_at < now() - interval '90 days'",
    ).catch(() => {});
  }

  const result = await query<{ count: number; reset_count: number }>(
    "SELECT count, reset_count FROM customer_bg_quota WHERE shop = $1 AND session_id = $2",
    [shop, sessionId],
  );

  const row = result.rows[0];
  const count = row?.count ?? 0;
  const resetCount = row?.reset_count ?? 0;
  // Each confirmed order gives +limit extra uses
  const effectiveLimit = limit + resetCount * limit;

  if (count >= effectiveLimit) {
    return { allowed: false, count, limit: effectiveLimit, remaining: 0 };
  }

  await query(
    `INSERT INTO customer_bg_quota (shop, session_id, count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (shop, session_id)
     DO UPDATE SET count = customer_bg_quota.count + 1, updated_at = now()`,
    [shop, sessionId],
  );

  const newCount = count + 1;
  return { allowed: true, count: newCount, limit: effectiveLimit, remaining: effectiveLimit - newCount };
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

export async function getCustomerBgStats(shop: string): Promise<{
  uniqueSessionsThisMonth: number;
  totalRemovalsThisMonth: number;
  avgPerSession: number;
}> {
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";
  const result = await query<{ sessions: string; total: string }>(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(count), 0) AS total
     FROM customer_bg_quota
     WHERE shop = $1 AND updated_at >= $2`,
    [shop, monthStart],
  );
  const sessions = Number(result.rows[0]?.sessions ?? 0);
  const total = Number(result.rows[0]?.total ?? 0);
  return {
    uniqueSessionsThisMonth: sessions,
    totalRemovalsThisMonth: total,
    avgPerSession: sessions > 0 ? Math.round((total / sessions) * 10) / 10 : 0,
  };
}
