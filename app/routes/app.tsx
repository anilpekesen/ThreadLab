import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider, Badge, InlineStack, Text } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import { authenticate } from "~/shopify.server";
import { getShopSubscription } from "~/models/billing.server";
import type { PlanKey } from "~/lib/plans";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sub = await getShopSubscription(session.shop);
  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
    planKey: (sub?.plan_key ?? "Pro") as PlanKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
  });
};

const PLAN_BADGE_TONE: Record<string, "success" | "info" | "warning" | "attention"> = {
  Business: "success",
  Pro: "info",
  Growth: "info",
  Starter: "attention",
};

function PlanHeader({ planKey, subscriptionStatus }: { planKey: PlanKey; subscriptionStatus: string }) {
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trial";
  const navigate = useNavigate();
  return (
    <div style={{
      padding: "7px 20px",
      background: "#fafbfb",
      borderBottom: "1px solid #e1e3e5",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <InlineStack gap="200" blockAlign="center">
        <Text as="span" variant="bodySm" tone="subdued">Plan:</Text>
        <Badge tone={PLAN_BADGE_TONE[planKey] ?? "attention"}>{planKey}</Badge>
        {!isActive && <Text as="span" variant="bodySm" tone="caution">· Aktif değil</Text>}
      </InlineStack>
      {!isActive && (
        <button
          onClick={() => navigate("/app/billing")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#2271b1", fontSize: 13, fontWeight: 600 }}
        >
          Plan seç →
        </button>
      )}
    </div>
  );
}

export default function App() {
  const { apiKey, planKey, subscriptionStatus } = useLoaderData<typeof loader>();
  return (
    <ShopifyAppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={trTranslations}>
        <NavMenu>
          <a href="/app" rel="home">Ana Sayfa</a>
          <a href="/app/orders">Siparişler</a>
          <a href="/app/product-types">Ürün Ayarlama</a>
          <a href="/app/templates">Şablonlar</a>
          <a href="/app/billing">Abonelik</a>
          <a href="/app/settings">Ayarlar</a>
        </NavMenu>
        <PlanHeader planKey={planKey} subscriptionStatus={subscriptionStatus} />
        <Outlet context={{ planKey, subscriptionStatus }} />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;
