const COOKIE_NAME = "__printlab_billing_shop";
const MAX_AGE_SECONDS = 15 * 60;

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production" || process.env.SHOPIFY_APP_URL?.startsWith("https://") === true;
}

function isValidShop(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

export function getBillingReturnShop(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const prefix = `${COOKIE_NAME}=`;
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!pair) return null;

  try {
    const shop = decodeURIComponent(pair.slice(prefix.length));
    return isValidShop(shop) ? shop : null;
  } catch {
    return null;
  }
}

export function makeBillingReturnShopCookie(shop: string): string {
  const sameSite = isSecureCookie() ? "SameSite=None; Secure" : "SameSite=Lax";
  return `${COOKIE_NAME}=${encodeURIComponent(shop)}; Max-Age=${MAX_AGE_SECONDS}; Path=/; HttpOnly; ${sameSite}`;
}

export function clearBillingReturnShopCookie(): string {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
