import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import crypto from "crypto";
import { authenticate } from "~/lib/authenticate.server";
import { buildAuthUrl } from "~/lib/google-drive.server";
import { createShopSession, getShopFromSession, getValidAccessToken } from "~/lib/session.server";

const STATE_COOKIE = "__printlab_gdrive_state";

function makeStateCookie(payload: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${encodeURIComponent(payload)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function isValidShop(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop") ?? "";

  let shop = await getShopFromSession(request);
  let sessionCookie: string | null = null;

  if (!shop && isValidShop(shopParam)) {
    const accessToken = await getValidAccessToken(shopParam);
    if (accessToken) {
      shop = shopParam;
      sessionCookie = await createShopSession(shopParam);
    }
  }

  if (!shop) {
    // Fall back to the embedded admin auth path when this route is opened
    // from inside Shopify Admin with a live embedded session.
    const auth = await authenticate(request);
    shop = auth.session.shop;
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  // State carries both an unguessable nonce and the shop, joined by ":".
  // Callback verifies the nonce against the cookie and uses the shop to know
  // which row to write tokens to.
  const state = `${nonce}:${shop}`;
  const authUrl = buildAuthUrl(state);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", makeStateCookie(nonce, 600));
  if (sessionCookie) headers.append("Set-Cookie", sessionCookie);

  return redirect(authUrl, {
    headers,
  });
};
