import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import { authenticate } from "~/shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  console.log("[auth] request url params:", Object.fromEntries(url.searchParams.entries()));
  console.log("[auth] SHOPIFY_API_KEY set:", !!process.env.SHOPIFY_API_KEY);
  console.log("[auth] SHOPIFY_API_SECRET set:", !!process.env.SHOPIFY_API_SECRET);
  console.log("[auth] SHOPIFY_APP_URL:", process.env.SHOPIFY_APP_URL);
  try {
    await authenticate.admin(request);
  } catch (e: unknown) {
    if (e instanceof Response) {
      const body = await e.clone().text().catch(() => "");
      console.error("[auth] authenticate.admin threw Response:", e.status, body);
      throw e;
    }
    console.error("[auth] authenticate.admin threw error:", String(e));
    throw e;
  }
  return json({ apiKey: process.env.SHOPIFY_API_KEY ?? "" });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <ShopifyAppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={trTranslations}>
        <NavMenu>
          <a href="/app" rel="home">Ana Sayfa</a>
          <a href="/app/orders">Siparişler</a>
          <a href="/app/products">Ürünler</a>
          <a href="/app/billing">Abonelik</a>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;
