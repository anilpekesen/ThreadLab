import type { LoaderFunctionArgs } from "@remix-run/node";
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

// OAuth runs in a popup/new tab because Google won't render its consent
// screen inside the Shopify admin iframe. After we finish the round-trip we
// return a tiny page that refreshes the opener (the embedded PrintLab admin)
// and closes itself.
function closingPage(opts: { ok: boolean; message: string }): Response {
  const safe = opts.message.replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const color = opts.ok ? "#0a7c2f" : "#b71c1c";
  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>Google Drive</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f7f7f7; }
  .box { background: white; padding: 32px 40px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.08); text-align: center; max-width: 420px; }
  h1 { font-size: 18px; margin: 0 0 8px; color: ${color}; }
  p { color: #555; font-size: 14px; margin: 0; }
  small { display: block; margin-top: 16px; color: #999; }
</style></head>
<body>
  <div class="box">
    <h1>${safe}</h1>
    <p>Bu sekmeyi kapatabilirsiniz.</p>
    <small>Bu pencere birkaç saniye sonra kendiliğinden kapanacak.</small>
  </div>
  <script>
    try { if (window.opener && !window.opener.closed) window.opener.location.reload(); } catch (e) {}
    setTimeout(function(){ window.close(); }, 1500);
  </script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": clearStateCookie(),
    },
  });
}

function errorPage(reason: string) {
  return closingPage({ ok: false, message: `Google Drive bağlanamadı: ${reason}` });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) return errorPage(err);
  if (!code || !state) return errorPage("missing_code");

  const [nonce, shop] = state.split(":");
  if (!nonce || !shop) return errorPage("bad_state");

  const expectedNonce = getStateNonce(request);
  if (!expectedNonce || expectedNonce !== nonce) {
    return errorPage("state_mismatch");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch (e) {
    console.error("[google-drive] token exchange failed", e);
    return errorPage("token_exchange_failed");
  }

  if (!tokens.refresh_token) {
    // prompt=consent should always return one; if not, user revoked and
    // re-granted without prompt — ask them to retry.
    return errorPage("no_refresh_token");
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

  return closingPage({ ok: true, message: "Google Drive bağlandı ✓" });
};
