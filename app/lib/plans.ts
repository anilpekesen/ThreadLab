export const PLANS = {
  Starter: {
    price: 9.99,
    maxProductTypes: 1,
    maxMonthlyOrders: 100,
    allowBackSurface: false,
    allowRemoveBg: false,
    removeBgMonthlyQuota: 0,
    maxShopTemplates: 0,
    features: [
      "1 ürün tipi",
      "100 sipariş/ay",
      "Sadece ön yüz baskı",
      "Temel destek",
    ],
  },
  Growth: {
    price: 19.99,
    maxProductTypes: 3,
    maxMonthlyOrders: 500,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 50,
    maxShopTemplates: 10,
    features: [
      "3 ürün tipi",
      "500 sipariş/ay",
      "Ön + arka yüz baskı",
      "50 arka plan kaldırma/ay",
      "10 özel şablon",
      "E-posta desteği",
    ],
  },
  Pro: {
    price: 39.99,
    maxProductTypes: 6,
    maxMonthlyOrders: 2000,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: 500,
    maxShopTemplates: 20,
    features: [
      "Tüm ürün tipleri (6)",
      "2000 sipariş/ay",
      "Ön + arka yüz baskı",
      "500 arka plan kaldırma/ay",
      "20 özel şablon",
      "Öncelikli destek",
    ],
  },
  Business: {
    price: 79.99,
    maxProductTypes: -1,
    maxMonthlyOrders: -1,
    allowBackSurface: true,
    allowRemoveBg: true,
    removeBgMonthlyQuota: -1,
    maxShopTemplates: -1,
    features: [
      "Sınırsız ürün tipi",
      "Sınırsız sipariş",
      "Sınırsız arka plan kaldırma",
      "Sınırsız özel şablon",
      "Özel onboarding",
      "Öncelikli destek",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const PLAN_NAMES = Object.keys(PLANS) as PlanKey[];
