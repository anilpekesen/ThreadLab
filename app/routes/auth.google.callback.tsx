import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  exchangeCodeForToken,
  getUserEmail,
} from "~/lib/google-drive.server";
import { saveDriveConnection } from "~/models/shop-google-drive.server";

const STATE_COOKIE = "__printlab_gdrive_state";

function getStateNonce(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|; )${STATE_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function clearStateCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function errorRedirect(reason: string) {
  return redirect(`/app/settings?gdrive_error=${encodeURIComponent(reason)}`, {
    headers: { "Set-Cookie": clearStateCookie() },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return errorRedirect(err);
  if (!code || !state) return errorRedirect("missing_code");

  const [nonce, shop] = state.split(":");
  if (!nonce || !shop) return errorRedirect("bad_state");

  const expectedNonce = getStateNonce(request);
  if (!expectedNonce || expectedNonce !== nonce) {
    return errorRedirect("state_mismatch");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch (e) {
    console.error("[google-drive] token exchange failed", e);
    return errorRedirect("token_exchange_failed");
  }

  if (!tokens.refresh_token) {
    // prompt=consent should always return one; if not, user revoked and
    // re-granted without prompt — ask them to retry.
    return errorRedirect("no_refresh_token");
  }

  let email = "";
  try {
    email = await getUserEmail(tokens.access_token);
  } catch (e) {
    console.error("[google-drive] userinfo failed", e);
  }

  await saveDriveConnection({
    shop,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    connectedEmail: email,
  });

  return redirect("/app/settings?gdrive_connected=1", {
    headers: { "Set-Cookie": clearStateCookie() },
  });
};
