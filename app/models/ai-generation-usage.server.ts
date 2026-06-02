import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopSettings } from "~/models/shop-settings.server";
import { getTestStoreLimits } from "~/models/test-store-limits.server";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeShopKey(shop: string) {
  return shop.trim().toLowerCase().replace(/\.myshopify\.com$/, "");
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

// Sadece açıkça belirtilen mağazalar AI kotasından muaf tutulur.
function isQuotaBypassShop(shop: string): boolean {
  const bypassShops = (process.env.AI_DEV_SHOPS ?? process.env.AI_QUOTA_BYPASS_SHOPS ?? "")
    .split(",").map(normalizeShopKey).filter(Boolean);
  const shopKey = normalizeShopKey(shop);
  if (shopKey === "whanotify-dev") return true;
  return bypassShops.includes(shopKey);
}

export async function checkAndIncrementAiGeneration(shop: string): Promise<AiQuotaResult> {
  const testLimits = getTestStoreLimits(shop);

  if (!testLimits && isQuotaBypassShop(shop)) {
    return { allowed: true, count: 0, quota: 99999, planKey: "Business" };
  }

  if (testLimits) {
    const quota = testLimits.aiMonthlyQuota;
    const count = await getAiGenCount(shop);

    if (count >= quota) {
      return { allowed: false, count, quota, planKey: "Business", reason: "quota_exceeded" };
    }

    const month = currentMonth();
    await query(
      `INSERT INTO ai_generation_usage (shop, month, count, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (shop, month)
       DO UPDATE SET count = ai_generation_usage.count + 1, updated_at = now()`,
      [shop, month],
    );

    return { allowed: true, count: count + 1, quota, planKey: "Business" };
  }

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

  const [shopSettings, purchasedBonusRes, count] = await Promise.all([
    getShopSettings(shop).catch(() => null),
    query<{ total: string }>(
      "SELECT COALESCE(SUM(credits_added), 0)::text AS total FROM ai_credit_purchases WHERE shop = $1 AND expires_at > now()",
      [shop],
    ).catch(() => null),
    getAiGenCount(shop),
  ]);
  const permanentBonus = shopSettings?.aiQuotaBonus ?? 0;
  const purchasedBonus = parseInt(purchasedBonusRes?.rows[0]?.total ?? "0", 10);
  const bonus = permanentBonus + purchasedBonus;
  const quota = (PLANS[planKey].aiImageMonthlyQuota ?? 0) + bonus;

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
  const testLimits = getTestStoreLimits(shop);

  if (testLimits) {
    const [shopSettings, shopCount] = await Promise.all([
      getShopSettings(shop).catch(() => null),
      getAiGenCount(shop),
    ]);
    const customerLimit = shopSettings?.customerAiLimit ?? 3;
    let customerCount = 0;
    if (sessionId) {
      const result = await query<{ count: number }>(
        "SELECT count FROM customer_ai_quota WHERE shop = $1 AND session_id = $2",
        [shop, sessionId],
      );
      customerCount = result.rows[0]?.count ?? 0;
    }
    const shopQuota = testLimits.aiMonthlyQuota;
    const shopRemaining = Math.max(0, shopQuota - shopCount);
    const customerRemaining = Math.max(0, customerLimit - customerCount);

    return {
      isTrial: false,
      isActive: true,
      planKey: "Business" as PlanKey,
      shopQuota,
      shopCount,
      shopRemaining,
      customerCount,
      customerLimit,
      customerRemaining,
      shopSettings,
    };
  }

  if (isQuotaBypassShop(shop)) {
    return {
      isTrial: false,
      isActive: true,
      planKey: "Business" as PlanKey,
      shopQuota: 99999,
      shopCount: 0,
      shopRemaining: 99999,
      customerCount: 0,
      customerLimit: 99999,
      customerRemaining: 99999,
    };
  }

  const sub = await getShopSubscription(shop);
  const shopSettings = await getShopSettings(shop).catch(() => null);
  const planKey = (sub?.plan_key ?? "Starter") as PlanKey;
  const status = sub?.subscription_status ?? "none";
  const isTrial = status === "trial";
  const isActive = status === "active";

  const shopQuota = PLANS[planKey].aiImageMonthlyQuota ?? 0;
  const shopCount = isActive ? await getAiGenCount(shop) : 0;
  const shopRemaining = isActive ? Math.max(0, shopQuota - shopCount) : 0;

  // Müşteri kotası
  let customerCount = 0;
  let customerLimit = shopSettings?.customerAiLimit ?? 3;
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
