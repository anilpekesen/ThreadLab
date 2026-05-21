export const PLANS = {
  Starter: {
    price: 19.99,
    maxProductTypes: 1,
    maxMonthlyOrders: 100,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 100,
    maxShopTemplates: 5,
    features: [
      "1 ürün kategorisi",
      "100 sipariş/ay",
      "Ön + arka yüz baskı",
      "100 arka plan kaldırma/ay",
    ],
  },
  Growth: {
    price: 29.99,
    maxProductTypes: 2,
    maxMonthlyOrders: 500,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 500,
    maxShopTemplates: 10,
    features: [
      "2 ürün kategorisi",
      "500 sipariş/ay",
      "Ön + arka yüz baskı",
      "500 arka plan kaldırma/ay",
      "10 özel şablon",
    ],
  },
  Pro: {
    price: 49.99,
    maxProductTypes: 4,
    maxMonthlyOrders: 2000,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 2000,
    maxShopTemplates: 20,
    features: [
      "4 ürün kategorisi",
      "2000 sipariş/ay",
      "Ön + arka yüz baskı",
      "2000 arka plan kaldırma/ay",
      "20 özel şablon",
      "Öncelikli destek",
    ],
  },
  Business: {
    price: 99.99,
    maxProductTypes: -1,
    maxMonthlyOrders: -1,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 6000,
    maxShopTemplates: -1,
    features: [
      "Sınırsız ürün kategorisi",
      "Sınırsız sipariş",
      "Ön + arka yüz baskı",
      "6000 arka plan kaldırma/ay",
      "Sınırsız özel şablon",
      "Özel onboarding & destek",
    ],
  },
};

export type PlanKey = keyof typeof PLANS;

export const PLAN_NAMES = Object.keys(PLANS) as PlanKey[];
