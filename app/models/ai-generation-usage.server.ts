import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

async function getShopSubscription(shop: string) {
  const result = await query<{ plan_key: string; subscription_status: string }>(
    "SELECT plan_key, subscription_status FROM shop_subscriptions WHERE shop = $1",
    [shop],
  );
  return result.rows[0] ?? null;
}

async function getAiGenCount(shop: string): Promise<number> {
  const month = currentMonth();
  const result = await query<{ count: number }>(
    "SELECT count FROM ai_generation_usage WHERE shop = $1 AND month = $2",
    [shop, month],
  );
  return result.rows[0]?.count ?? 0;
}

export interface AiQuotaResult {
  allowed: boolean;
  count: number;
  quota: number;
  planKey: PlanKey;
  reason?: "trial" | "no_subscription" | "quota_exceeded";
}

export async function checkAndIncrementAiGeneration(shop: string): Promise<AiQuotaResult> {
  const sub = await getShopSubscription(shop);
  const planKey = (sub?.plan_key ?? "Starter") as PlanKey;
  const status = sub?.subscription_status ?? "none";

  // 14 günlük deneme veya aktif abonelik yoksa reddedilir
  if (status === "trial") {
    return { allowed: false, count: 0, quota: 0, planKey, reason: "trial" };
  }
  if (status !== "active") {
    return { allowed: false, count: 0, quota: 0, planKey, reason: "no_subscription" };
  }

  const quota = PLANS[planKey].aiImageMonthlyQuota ?? 0;
  const count = await getAiGenCount(shop);

  if (quota >= 0 && count >= quota) {
    return { allowed: false, count, quota, planKey, reason: "quota_exceeded" };
  }

  const month = currentMonth();
  await query(
    `INSERT INTO ai_generation_usage (shop, month, count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (shop, month)
     DO UPDATE SET count = ai_generation_usage.count + 1, updated_at = now()`,
    [shop, month],
  );

  return { allowed: true, count: count + 1, quota, planKey };
}

export async function getAiGenStats(shop: string) {
  const result = await query<{ month: string; count: number }>(
    "SELECT month, count FROM ai_generation_usage WHERE shop = $1 ORDER BY month DESC LIMIT 12",
    [shop],
  );
  return result.rows;
}

// Tüketmeden kota bilgisi döndür (GET endpoint için)
export async function getAiQuotaInfo(shop: string, sessionId: string) {
  const sub = await getShopSubscription(shop);
  const planKey = (sub?.plan_key ?? "Starter") as PlanKey;
  const status = sub?.subscription_status ?? "none";
  const isTrial = status === "trial";
  const isActive = status === "active";

  const shopQuota = PLANS[planKey].aiImageMonthlyQuota ?? 0;
  const shopCount = isActive ? await getAiGenCount(shop) : 0;
  const shopRemaining = isActive ? Math.max(0, shopQuota - shopCount) : 0;

  // Müşteri kotası
  let customerCount = 0;
  let customerLimit = 3;
  if (sessionId && isActive) {
    const result = await query<{ count: number }>(
      "SELECT count FROM customer_ai_quota WHERE shop = $1 AND session_id = $2",
      [shop, sessionId],
    );
    customerCount = result.rows[0]?.count ?? 0;
  }
  const customerRemaining = Math.max(0, customerLimit - customerCount);

  return {
    isTrial,
    isActive,
    planKey,
    shopQuota,
    shopCount,
    shopRemaining,
    customerCount,
    customerLimit,
    customerRemaining,
  };
}
