import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopSettings } from "~/models/shop-settings.server";
import { getTestStoreLimits } from "~/models/test-store-limits.server";

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "2026-05"
}

export async function getShopPlan(shop: string): Promise<PlanKey> {
  const result = await query<{ plan_key: string }>(
    "SELECT plan_key FROM shop_subscriptions WHERE shop = $1",
    [shop],
  );
  if (!result.rows.length) return "Pro"; // default until billing is active
  const key = result.rows[0].plan_key as PlanKey;
  return Object.keys(PLANS).includes(key) ? key : "Pro";
}

export async function setShopPlan(shop: string, planKey: PlanKey): Promise<void> {
  await query(
    `INSERT INTO shop_subscriptions (shop, plan_key, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (shop) DO UPDATE SET plan_key = $2, updated_at = now()`,
    [shop, planKey],
  );
}

export async function getBgRemovalCount(shop: string): Promise<number> {
  const month = currentMonth();
  const result = await query<{ count: number }>(
    "SELECT count FROM bg_removal_usage WHERE shop = $1 AND month = $2",
    [shop, month],
  );
  return result.rows[0]?.count ?? 0;
}

export async function getBgRemovalStats(shop: string): Promise<{ month: string; count: number }[]> {
  const result = await query<{ month: string; count: number }>(
    "SELECT month, count FROM bg_removal_usage WHERE shop = $1 ORDER BY month DESC LIMIT 12",
    [shop],
  );
  return result.rows;
}

export interface QuotaCheckResult {
  allowed: boolean;
  count: number;
  quota: number;
  planKey: PlanKey;
}

export async function checkAndIncrementBgRemoval(shop: string): Promise<QuotaCheckResult> {
  const testLimits = getTestStoreLimits(shop);
  const [planKey, count] = await Promise.all([
    testLimits ? Promise.resolve("Business" as PlanKey) : getShopPlan(shop),
    getBgRemovalCount(shop),
  ]);

  const shopSettings = await getShopSettings(shop).catch(() => null);
  const bonus = shopSettings?.bgQuotaBonus ?? 0;
  const quota = (testLimits?.bgMonthlyQuota ?? PLANS[planKey].removeBgMonthlyQuota) + bonus;
  const allowed = quota < 0 || count < quota;

  if (!allowed) {
    return { allowed: false, count, quota, planKey };
  }

  // Upsert increment
  const month = currentMonth();
  await query(
    `INSERT INTO bg_removal_usage (shop, month, count, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (shop, month)
     DO UPDATE SET count = bg_removal_usage.count + 1, updated_at = now()`,
    [shop, month],
  );

  return { allowed: true, count: count + 1, quota, planKey };
}
