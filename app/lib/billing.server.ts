import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "~/lib/storage.server";
import { PLANS, type PlanKey } from "~/lib/plans";

export { PLANS, PLAN_NAMES, type PlanKey } from "~/lib/plans";

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
  const keys = Object.keys(PLANS) as PlanKey[];
  return keys.includes(name as PlanKey) ? (name as PlanKey) : null;
}

export function isOrderLimitReached(plan: PlanKey, monthlyOrderCount: number): boolean {
  const limit = PLANS[plan].maxMonthlyOrders;
  return limit !== -1 && monthlyOrderCount >= limit;
}
