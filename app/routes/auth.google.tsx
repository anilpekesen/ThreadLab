import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import crypto from "crypto";
import { authenticate } from "~/lib/authenticate.server";
import { buildAuthUrl } from "~/lib/google-drive.server";

const STATE_COOKIE = "__printlab_gdrive_state";

function makeStateCookie(payload: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=${encodeURIComponent(payload)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Admin-only — requires an active Shopify shop session.
  const { session } = await authenticate(request);

  const nonce = crypto.randomBytes(16).toString("hex");
  // State carries both an unguessable nonce and the shop, joined by ":".
  // Callback verifies the nonce against the cookie and uses the shop to know
  // which row to write tokens to.
  const state = `${nonce}:${session.shop}`;
  const authUrl = buildAuthUrl(state);

  return redirect(authUrl, {
    headers: {
      "Set-Cookie": makeStateCookie(nonce, 600),
      "Cache-Control": "no-store",
    },
  });
};
