import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import crypto from "crypto";
import { verifyHmac, buildAuthUrl, exchangeCodeForToken } from "~/lib/shopify.server";
import { createShopSession } from "~/lib/session.server";
import { query } from "~/lib/db.server";

const SCOPES =
  process.env.SCOPES ??
  "read_products,write_products,read_orders,write_orders,write_fulfillments,write_app_proxy,write_cart_transforms,write_script_tags";

function isValidShop(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function getStateCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader.match(/(?:^|; )__printlab_oauth_state=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function makeStateCookie(state: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `__printlab_oauth_state=${encodeURIComponent(state)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // ── OAuth callback ──────────────────────────────────────────────────────────
  if (pathname === "/auth/callback") {
    if (!verifyHmac(url.searchParams)) {
      return new Response("HMAC verification failed", { status: 403 });
    }

    const shop = url.searchParams.get("shop") ?? "";
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";

    if (!isValidShop(shop)) {
      return new Response("Invalid shop", { status: 400 });
    }

    const expectedState = getStateCookie(request);
    if (!expectedState || expectedState !== state) {
      return new Response("OAuth state mismatch", { status: 403 });
    }

    const accessToken = await exchangeCodeForToken(shop, code);

    await query(
      `INSERT INTO shopify_sessions (id, shop, state, "isOnline", scope, expires, "accessToken")
       VALUES ($1, $2, '', false, $3, null, $4)
       ON CONFLICT (id) DO UPDATE SET "accessToken" = $4, scope = $3`,
      [`offline_${shop}`, shop, SCOPES, accessToken],
    );

    const sessionCookie = await createShopSession(shop);

    return redirect("/app", {
      headers: {
        "Set-Cookie": sessionCookie,
      },
    });
  }

  // ── Begin OAuth (handles /auth and /auth/login) ─────────────────────────────
  const shop = url.searchParams.get("shop") ?? "";

  if (!shop) {
    return redirect("/");
  }

  if (!isValidShop(shop)) {
    return new Response("Invalid shop URL", { status: 400 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl(shop, state);

  return redirect(authUrl, {
    headers: {
      "Set-Cookie": makeStateCookie(state, 600),
      "Cache-Control": "no-store",
    },
  });
};
