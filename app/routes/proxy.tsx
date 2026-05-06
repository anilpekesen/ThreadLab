import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

/**
 * App Proxy: /apps/tshirt-designer → bu route
 * Remix'te app proxy rotası "proxy" olarak adlandırılır.
 * https://shopify.dev/docs/api/shopify-app-remix/authenticate/public/app-proxy
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { liquid } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const params = url.searchParams.toString();

  // Redirect to the designer SPA with the same query params
  return liquid(
    `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{{ shop.name }} — Tasarım Aracı</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#18181b}</style>
</head>
<body>
<script>
  // Pass Shopify liquid data to the React app via window object
  window.__SHOPIFY_DATA__ = {
    shopName: {{ shop.name | json }},
    currency: {{ shop.currency | json }},
    locale: {{ request.locale.iso_code | json }},
  };
</script>
<div id="root" style="height:100vh"></div>
<link rel="stylesheet" href="/apps/tshirt-designer/assets/app.css"/>
<script type="module" src="/apps/tshirt-designer/assets/app.js"></script>
</body>
</html>`,
    { layout: false },
  );
};
