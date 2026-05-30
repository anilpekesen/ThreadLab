import { createCookieSessionStorage } from "@remix-run/node";
import { query } from "~/lib/db.server";
import { refreshAccessToken, migrateToExpiringToken } from "~/lib/shopify.server";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__printlab_session",
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secrets: [process.env.SESSION_SECRET ?? "printlab-secret-key-2026"],
    secure: process.env.NODE_ENV === "production" || process.env.SHOPIFY_APP_URL?.startsWith("https://"),
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

// expires column in shopify_sessions is INTEGER (Unix timestamp in seconds).
function toExpiresInt(date: Date | null | undefined): number | null {
  return date ? Math.floor(date.getTime() / 1000) : null;
}

// Returns a valid (non-expired) access token, refreshing it if needed.
export async function getValidAccessToken(shop: string): Promise<string | null> {
  const result = await query<{
    accessToken: string;
    expires: number | null;
    refreshToken: string | null;
  }>(
    `SELECT "accessToken", expires, "refreshToken" FROM shopify_sessions WHERE id = $1`,
    [`offline_${shop}`],
  );

  const row = result.rows[0];
  if (!row) return null;

  const BUFFER_MS = 5 * 60 * 1000;
  const expiresMs = row.expires ? row.expires * 1000 : null;

  // Non-expiring (legacy) token — migrate to expiring token
  if (!expiresMs) {
    console.log(`[token] Non-expiring token detected for ${shop}, attempting migration`);
    try {
      const migrated = await migrateToExpiringToken(shop, row.accessToken);
      if (migrated?.expiresAt) {
        const expiresInt = toExpiresInt(migrated.expiresAt);
        // Optimistic lock: only update if another worker hasn't already migrated
        const updated = await query(
          `UPDATE shopify_sessions SET "accessToken" = $1, expires = $2, "refreshToken" = $3
           WHERE id = $4 AND "accessToken" = $5`,
          [migrated.accessToken, expiresInt, migrated.refreshToken, `offline_${shop}`, row.accessToken],
        );
        if ((updated.rowCount ?? 0) === 0) {
          // Another PM2 worker already migrated — re-read the fresh token
          const fresh = await query<{ accessToken: string }>(
            `SELECT "accessToken" FROM shopify_sessions WHERE id = $1`,
            [`offline_${shop}`],
          );
          console.log(`[token] Another worker already migrated for ${shop}, using fresh token`);
          return fresh.rows[0]?.accessToken ?? null;
        }
        console.log(`[token] Migration successful for ${shop}, expires at ${migrated.expiresAt}`);
        return migrated.accessToken;
      }
    } catch (err) {
      console.error(`[token] Migration failed for ${shop}:`, err);
    }
    // Migration failed — return existing non-expiring token (API call may fail)
    return row.accessToken;
  }

  // Token still valid
  if (expiresMs - Date.now() > BUFFER_MS) {
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
      [tokenData.accessToken, toExpiresInt(tokenData.expiresAt), tokenData.refreshToken, `offline_${shop}`],
    );
    console.log(`[token] Refreshed access token for ${shop}`);
    return tokenData.accessToken;
  } catch (err) {
    console.error(`[token] Token refresh failed for ${shop}:`, err);
    return null;
  }
}
