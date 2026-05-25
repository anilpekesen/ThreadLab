import { createCookieSessionStorage } from "@remix-run/node";
import { query } from "~/lib/db.server";
import { refreshAccessToken } from "~/lib/shopify.server";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__printlab_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET ?? "printlab-secret-key-2026"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
});

export async function getShopFromSession(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return (session.get("shop") as string | undefined) ?? null;
}

export async function createShopSession(shop: string): Promise<string> {
  const session = await sessionStorage.getSession();
  session.set("shop", shop);
  return sessionStorage.commitSession(session);
}

export async function destroyShopSession(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return sessionStorage.destroySession(session);
}

// Returns a valid (non-expired) access token, refreshing it if needed.
export async function getValidAccessToken(shop: string): Promise<string | null> {
  const result = await query<{
    accessToken: string;
    expires: Date | null;
    refreshToken: string | null;
  }>(
    `SELECT "accessToken", expires, "refreshToken" FROM shopify_sessions WHERE id = $1`,
    [`offline_${shop}`],
  );

  const row = result.rows[0];
  if (!row) return null;

  // Token not expiring or expires more than 5 minutes from now — still valid
  const BUFFER_MS = 5 * 60 * 1000;
  if (!row.expires || row.expires.getTime() - Date.now() > BUFFER_MS) {
    return row.accessToken;
  }

  // Token expired — try to refresh
  if (!row.refreshToken) {
    console.error(`[token] Token expired for ${shop} but no refresh token stored — reinstall required`);
    return null;
  }

  try {
    const tokenData = await refreshAccessToken(shop, row.refreshToken);
    await query(
      `UPDATE shopify_sessions SET "accessToken" = $1, expires = $2, "refreshToken" = $3 WHERE id = $4`,
      [tokenData.accessToken, tokenData.expiresAt, tokenData.refreshToken, `offline_${shop}`],
    );
    console.log(`[token] Refreshed access token for ${shop}`);
    return tokenData.accessToken;
  } catch (err) {
    console.error(`[token] Token refresh failed for ${shop}:`, err);
    return null;
  }
}
