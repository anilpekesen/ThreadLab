import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
  try {
    await authenticate.admin(request);
  } catch (error: unknown) {
    if (error instanceof Response && error.status === 401) {
      const shop = url.searchParams.get("shop");
      if (shop) {
        const authUrl = new URL("/auth", url.origin);
        authUrl.searchParams.set("shop", shop);
        authUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
        throw redirect(`${authUrl.pathname}${authUrl.search}`);
      }
    }
    throw error;
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
