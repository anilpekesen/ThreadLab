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
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  const designerUrl = new URL("/designer-app/", appUrl);
  designerUrl.search = params;

  const iframeSrc = designerUrl.toString().replace(/&/g, "&amp;");

  return liquid(
    `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{{ shop.name }} — Tasarım Aracı</title>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#18181b}
  iframe{display:block;width:100%;height:100vh;border:0;background:#18181b}
</style>
</head>
<body>
<iframe src="${iframeSrc}" allow="camera; microphone"></iframe>
</body>
</html>`,
    { layout: false },
  );
};
