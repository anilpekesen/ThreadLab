import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { clearBillingReturnShopCookie, getBillingReturnShop } from "~/lib/billing-return-cookie.server";
import { authenticateShopify, login } from "~/shopify.server";

function shouldEscapeIframe(url: URL): boolean {
  return Boolean(
    !url.searchParams.get("top_level")
    && (url.searchParams.get("host") || url.searchParams.get("embedded") || url.searchParams.get("id_token") || url.searchParams.get("session")),
  );
}

function renderTopLevelEscape(target: string) {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Redirecting…</title>
  </head>
  <body>
    <script>
      (function () {
        var target = ${JSON.stringify(target)};
        if (window.top && window.top !== window.self) {
          window.top.location.href = target;
          return;
        }
        window.location.href = target;
      })();
    </script>
  </body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/auth/login") {
    if (!url.searchParams.get("shop")) {
      const billingShop = getBillingReturnShop(request);
      if (billingShop) {
        const target = new URL("/auth/login", url.origin);
        target.searchParams.set("shop", billingShop);
        return redirect(target.toString(), {
          headers: { "Set-Cookie": clearBillingReturnShopCookie() },
        });
      }
    }

    if (shouldEscapeIframe(url)) {
      const shop = url.searchParams.get("shop");
      const target = new URL("/auth/login", url.origin);
      if (shop) target.searchParams.set("shop", shop);
      target.searchParams.set("top_level", "1");
      return renderTopLevelEscape(target.toString());
    }
    return login(request);
  }

  await authenticateShopify.admin(request);
  return null;
};
