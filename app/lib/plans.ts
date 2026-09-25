export const PLANS = {
  /**
   * Ücretsiz plan: aktif aboneliği olmayan her mağaza bu plandadır. Sipariş
   * sınırı yok; sınır ayarlanabilen ürün sayısında (maxProducts).
   */
  Free: {
    price: 0,
    trialDays: 0,
    maxProducts: 2,
    maxProductTypes: 1,
    maxMonthlyOrders: -1,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 20,
    aiImageMonthlyQuota: 0,
    maxShopTemplates: 0,
    allowProduction: false,
    allowGangSheet: false,
    features: {
      tr: [
        "2 ürün",
        "1 ürün kategorisi",
        "Sipariş sınırı yok",
        "Ön + arka yüz baskı",
        "20 arka plan kaldırma/ay",
      ],
      en: [
        "2 products",
        "1 product category",
        "No order limit",
        "Front + back surface print",
        "20 background removals/month",
      ],
    },
  },
  Starter: {
    maxProducts: -1,
    price: 9.99,
    /** Ücretsiz deneme günü; Partners'taki yönetilen planla aynı olmalı */
    trialDays: 14,
    maxProductTypes: 1,
    maxMonthlyOrders: 100,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 100,
    aiImageMonthlyQuota: 50,
    maxShopTemplates: 0,
    allowProduction: false,
    allowGangSheet: false,
    features: {
      tr: [
        "1 ürün kategorisi",
        "100 sipariş/ay",
        "Ön + arka yüz baskı",
        "100 arka plan kaldırma/ay",
        "50 yapay zeka görseli/ay",
      ],
      en: [
        "1 product category",
        "100 orders/month",
        "Front + back surface print",
        "100 background removals/month",
        "50 AI images/month",
      ],
    },
  },
  Growth: {
    maxProducts: -1,
    price: 19.99,
    trialDays: 14,
    maxProductTypes: 2,
    maxMonthlyOrders: 500,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 500,
    aiImageMonthlyQuota: 150,
    maxShopTemplates: 10,
    allowProduction: false,
    allowGangSheet: false,
    features: {
      tr: [
        "2 ürün kategorisi",
        "500 sipariş/ay",
        "Ön + arka yüz baskı",
        "500 arka plan kaldırma/ay",
        "150 yapay zeka görseli/ay",
        "10 özel şablon",
      ],
      en: [
        "2 product categories",
        "500 orders/month",
        "Front + back surface print",
        "500 background removals/month",
        "150 AI images/month",
        "10 custom templates",
      ],
    },
  },
  Pro: {
    maxProducts: -1,
    price: 49.99,
    trialDays: 0,
    maxProductTypes: 4,
    maxMonthlyOrders: 2000,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 1500,
    aiImageMonthlyQuota: 450,
    maxShopTemplates: 20,
    allowProduction: true,
    allowGangSheet: true,
    features: {
      tr: [
        "4 ürün kategorisi",
        "2000 sipariş/ay",
        "Ön + arka yüz baskı",
        "1500 arka plan kaldırma/ay",
        "450 yapay zeka görseli/ay",
        "20 özel şablon",
        "Üretim & Gang Sheet",
        "Öncelikli destek",
      ],
      en: [
        "4 product categories",
        "2000 orders/month",
        "Front + back surface print",
        "1500 background removals/month",
        "450 AI images/month",
        "20 custom templates",
        "Production & Gang Sheet",
        "Priority support",
      ],
    },
  },
  Business: {
    maxProducts: -1,
    price: 99,
    trialDays: 14,
    maxProductTypes: -1,
    maxMonthlyOrders: -1,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 4000,
    aiImageMonthlyQuota: 900,
    maxShopTemplates: -1,
    allowProduction: true,
    allowGangSheet: true,
    features: {
      tr: [
        "Sınırsız ürün kategorisi",
        "Sınırsız sipariş",
        "Ön + arka yüz baskı",
        "4000 arka plan kaldırma/ay",
        "900 yapay zeka görseli/ay",
        "Sınırsız özel şablon",
        "Üretim & Gang Sheet",
        "Özel onboarding & destek",
      ],
      en: [
        "Unlimited product categories",
        "Unlimited orders",
        "Front + back surface print",
        "4000 background removals/month",
        "900 AI images/month",
        "Unlimited custom templates",
        "Production & Gang Sheet",
        "Custom onboarding & support",
      ],
    },
  },
};

export type PlanKey = keyof typeof PLANS;

export const PLAN_NAMES = Object.keys(PLANS) as PlanKey[];

/** Ücretli planlar, ucuzdan pahalıya */
export const PAID_PLANS: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];

/**
 * Mağazanın gerçekte kullandığı plan. Aktif ya da denemedeki abonelik yoksa
 * (hiç abone olmamış, iptal etmiş) ücretsiz plandır. Eskiden varsayılan
 * "Pro"ydu; aboneliği olmayan mağaza Pro limitleriyle çalışıyordu.
 */
export function effectivePlanKey(
  sub: { plan_key?: string | null; subscription_status?: string | null } | null | undefined,
): PlanKey {
  const active = sub?.subscription_status === "active" || sub?.subscription_status === "trial";
  const key = sub?.plan_key as PlanKey | undefined;
  return active && key && key in PLANS ? key : "Free";
}
