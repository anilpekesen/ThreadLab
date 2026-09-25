import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
  useLoaderData,
} from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getShopFromSession } from "~/lib/session.server";
import { hasEmbeddedSignals } from "~/lib/authenticate.server";
import { isWooShop } from "~/lib/platform";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // WooCommerce yönetimi Shopify dışında, tek başına açılır. App Bridge orada
  // yüklenirse sayfayı Shopify yönetimine taşımaya çalışır.
  const shop = await getShopFromSession(request).catch(() => null);
  const standalone = Boolean(shop && isWooShop(shop) && !hasEmbeddedSignals(request));
  return json({ apiKey: standalone ? "" : (process.env.SHOPIFY_API_KEY ?? "") });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {apiKey && <meta name="shopify-api-key" content={apiKey} />}
        {apiKey && <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />}
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Bilinmeyen hata";

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Links />
      </head>
      <body>
        <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
          <h2 style={{ color: "#d92020" }}>Bir hata oluştu</h2>
          <p style={{ color: "#6b7280" }}>{message}</p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
