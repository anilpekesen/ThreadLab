import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { verifyProxyHmac, liquidResponse } from "~/lib/shopify.server";
import { handleDesignerUpload } from "~/models/uploads.server";

function verifyOrReject(request: Request) {
  const url = new URL(request.url);
  if (!verifyProxyHmac(url.searchParams)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  verifyOrReject(request);

  const url = new URL(request.url);
  const params = url.searchParams.toString();
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  const designerUrl = new URL("/designer-app/", appUrl);
  designerUrl.search = params;

  const iframeSrc = designerUrl.toString().replace(/&/g, "&amp;");

  return liquidResponse(
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

export const action = async ({ request }: ActionFunctionArgs) => {
  verifyOrReject(request);
  return handleDesignerUpload(request);
};
