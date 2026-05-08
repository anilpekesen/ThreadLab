import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "~/lib/storage.server";

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

export interface ShopBillingState {
  monthlyOrderCount: number;
  usageResetMonth: string;
}

type BillingMap = Record<string, ShopBillingState>;

function getBillingFile() {
  return join(getDataDir(), "billing.json");
}

function readBillingMap(): BillingMap {
  try {
    return JSON.parse(readFileSync(getBillingFile(), "utf8")) as BillingMap;
  } catch {
    return {};
  }
}

function writeBillingMap(map: BillingMap) {
  writeFileSync(getBillingFile(), JSON.stringify(map, null, 2));
}

export function getShopBillingState(shop: string): ShopBillingState {
  const map = readBillingMap();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const state = map[shop];
  if (!state || state.usageResetMonth !== currentMonth) {
    return { monthlyOrderCount: 0, usageResetMonth: currentMonth };
  }
  return state;
}

export function incrementOrderCount(shop: string) {
  const map = readBillingMap();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const existing = map[shop];
  if (!existing || existing.usageResetMonth !== currentMonth) {
    map[shop] = { monthlyOrderCount: 1, usageResetMonth: currentMonth };
  } else {
    map[shop] = { ...existing, monthlyOrderCount: existing.monthlyOrderCount + 1 };
  }
  writeBillingMap(map);
}

export function planKeyFromName(name: string | null | undefined): PlanKey | null {
  if (!name) return null;
  return PLAN_NAMES.includes(name as PlanKey) ? (name as PlanKey) : null;
}

export function isOrderLimitReached(plan: PlanKey, monthlyOrderCount: number): boolean {
  const limit = PLANS[plan].maxMonthlyOrders;
  return limit !== -1 && monthlyOrderCount >= limit;
}