export const PLANS = {
  Starter: {
    price: 9.99,
    maxProductTypes: 1,
    maxMonthlyOrders: 100,
    allowBackSurface: false,
    allowRemoveBg: false,
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
    allowRemoveBg: false,
    features: [
      "3 ürün tipi",
      "500 sipariş/ay",
      "Ön + arka yüz baskı",
      "E-posta desteği",
    ],
  },
  Pro: {
    price: 39.99,
    maxProductTypes: 6,
    maxMonthlyOrders: 2000,
    allowBackSurface: true,
    allowRemoveBg: true,
    features: [
      "Tüm ürün tipleri (6)",
      "2000 sipariş/ay",
      "Ön + arka yüz baskı",
      "Arka plan kaldırma",
      "Öncelikli destek",
    ],
  },
  Business: {
    price: 79.99,
    maxProductTypes: -1,
    maxMonthlyOrders: -1,
    allowBackSurface: true,
    allowRemoveBg: true,
    features: [
      "Sınırsız ürün tipi",
      "Sınırsız sipariş",
      "Tüm özellikler",
      "Özel onboarding",
      "Öncelikli destek",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const PLAN_NAMES = Object.keys(PLANS) as PlanKey[];
