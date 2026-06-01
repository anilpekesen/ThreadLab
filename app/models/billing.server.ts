import { query } from "~/lib/db.server";
import { getCustomerBgStats } from "~/models/customer-bg-quota.server";
import { PLANS, type PlanKey } from "~/lib/plans";

export type SubscriptionStatus = "none" | "active" | "cancelled" | "trial";

export interface ShopSubscription {
  shop: string;
  plan_key: PlanKey;
  shopify_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  updated_at: Date;
}

export async function getShopSubscription(shop: string): Promise<ShopSubscription | null> {
  const result = await query<ShopSubscription>(
    "SELECT shop, plan_key, shopify_subscription_id, subscription_status, updated_at FROM shop_subscriptions WHERE shop = $1",
    [shop],
  );
  return result.rows[0] ?? null;
}

export async function upsertShopSubscription(
  shop: string,
  data: {
    planKey: PlanKey;
    shopifySubscriptionId?: string | null;
    subscriptionStatus: SubscriptionStatus;
  },
): Promise<void> {
  await query(
    `INSERT INTO shop_subscriptions (shop, plan_key, shopify_subscription_id, subscription_status, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (shop) DO UPDATE SET
       plan_key = $2,
       shopify_subscription_id = $3,
       subscription_status = $4,
       updated_at = now()`,
    [shop, data.planKey, data.shopifySubscriptionId ?? null, data.subscriptionStatus],
  );
}

export async function getAnalytics(shop: string) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthStart = new Date(currentMonth + "-01");

  const [bgMonth, bgTotal, designsAll, designsMonth, sub, customerBgStats, aiMonth] = await Promise.all([
    query<{ count: string }>(
      "SELECT COALESCE(SUM(count), 0) AS count FROM bg_removal_usage WHERE shop = $1 AND month = $2",
      [shop, currentMonth],
    ),
    query<{ count: string }>(
      "SELECT COALESCE(SUM(count), 0) AS count FROM bg_removal_usage WHERE shop = $1",
      [shop],
    ),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM designs WHERE shop = $1", [shop]),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM designs WHERE shop = $1 AND created_at >= $2", [shop, monthStart]),
    getShopSubscription(shop),
    getCustomerBgStats(shop),
    query<{ count: string }>(
      "SELECT COALESCE(SUM(count), 0) AS count FROM ai_generation_usage WHERE shop = $1 AND month = $2",
      [shop, currentMonth],
    ).catch(() => ({ rows: [{ count: "0" }] })),
  ]);

  const planKey: PlanKey = (sub?.plan_key ?? "Pro") as PlanKey;
  const quota = PLANS[planKey].removeBgMonthlyQuota;
  const bgUsed = Number(bgMonth.rows[0].count);
  const aiQuota = PLANS[planKey].aiImageMonthlyQuota ?? 0;
  const aiUsed = Number(aiMonth.rows[0].count);

  return {
    bgThisMonth: bgUsed,
    bgAllTime: Number(bgTotal.rows[0].count),
    bgQuota: quota,
    bgPercent: quota <= 0 ? 0 : Math.round((bgUsed / quota) * 100),
    aiThisMonth: aiUsed,
    aiQuota,
    aiPercent: aiQuota <= 0 ? 0 : Math.round((aiUsed / aiQuota) * 100),
    designsTotal: Number(designsAll.rows[0].count),
    designsThisMonth: Number(designsMonth.rows[0].count),
    planKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
    shopifySubscriptionId: sub?.shopify_subscription_id ?? null,
    customerBgSessionsThisMonth: customerBgStats.uniqueSessionsThisMonth,
    customerBgAvgPerSession: customerBgStats.avgPerSession,
  };
}
