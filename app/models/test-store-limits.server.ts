const TEST_STORE_KEY = "whanotify-dev";

const TEST_STORE_LIMITS = {
  aiMonthlyQuota: 10,
  aiSessionLimit: 5,
  bgMonthlyQuota: 10,
  bgSessionLimit: 5,
} as const;

function normalizeShopKey(shop: string) {
  return shop.trim().toLowerCase().replace(/\.myshopify\.com$/, "");
}

export function getTestStoreLimits(shop: string) {
  return normalizeShopKey(shop) === TEST_STORE_KEY ? TEST_STORE_LIMITS : null;
}

