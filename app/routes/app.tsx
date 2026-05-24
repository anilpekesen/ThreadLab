import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useLocation, useNavigate, useRouteError } from "@remix-run/react";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import {
  AppProvider as PolarisAppProvider,
  Badge,
  Frame,
  Navigation,
  TopBar,
  InlineStack,
  Text,
  Box,
} from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "~/shopify.server";
import { getShopSubscription } from "~/models/billing.server";
import type { PlanKey } from "~/lib/plans";
import { LanguageProvider, useTranslation, type Lang } from "~/i18n";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sub = await getShopSubscription(session.shop);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  const lang: Lang = langMatch?.[1] === "en" ? "en" : "tr";
  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
    planKey: (sub?.plan_key ?? "Pro") as PlanKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
    lang,
    shop: session.shop,
  });
};

const PLAN_BADGE_TONE: Record<string, "success" | "info" | "warning" | "attention"> = {
  Business: "success",
  Pro: "info",
  Growth: "info",
  Starter: "attention",
};

function AppInner() {
  const { apiKey, planKey, subscriptionStatus, lang, shop } = useLoaderData<typeof loader>();
  const { t, setLang } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trial";

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          { label: t("nav.home"), url: "/app", exactMatch: true },
          { label: t("nav.orders"), url: "/app/orders" },
          { label: t("nav.production"), url: "/app/production" },
          { label: t("nav.gangSheet"), url: "/app/gang-sheet" },
          { label: t("nav.productTypes"), url: "/app/product-types" },
          { label: t("nav.templates"), url: "/app/templates" },
          { label: t("nav.billing"), url: "/app/billing" },
          { label: t("nav.settings"), url: "/app/settings" },
        ]}
      />
      <Navigation.Section
        separator
        title={shop.replace(".myshopify.com", "")}
        items={[
          { label: `Plan: ${planKey}`, url: "/app/billing" },
        ]}
      />
    </Navigation>
  );

  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setMobileNavOpen((v) => !v)}
      secondaryMenu={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16 }}>
          {!isActive && (
            <button
              onClick={() => navigate("/app/billing")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#2271b1", fontSize: 13, fontWeight: 600 }}
            >
              {t("planHeader.choosePlan")}
            </button>
          )}
          <div style={{ display: "flex", gap: 2, background: "#e9ecef", borderRadius: 8, padding: 3 }}>
            {(["tr", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  background: lang === l ? "#4f46e5" : "transparent",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  padding: "4px 12px", fontSize: 13, fontWeight: 600,
                  color: lang === l ? "#fff" : "#6b7280",
                  transition: "all .15s",
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      }
    />
  );

  return (
    <ShopifyAppProvider isEmbeddedApp={false} apiKey={apiKey}>
      <PolarisAppProvider i18n={lang === "en" ? enTranslations : trTranslations}>
        <Frame
          logo={{
            width: 124,
            url: "/app",
            accessibilityLabel: "PrintLab",
            topBarSource: "/logo.svg",
            contextualSaveBarSource: "/logo.svg",
          }}
          topBar={topBarMarkup}
          navigation={navigationMarkup}
          showMobileNavigation={mobileNavOpen}
          onNavigationDismiss={() => setMobileNavOpen(false)}
        >
          <Box paddingBlockEnd="400">
            <Outlet context={{ planKey, subscriptionStatus }} />
          </Box>
        </Frame>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export default function App() {
  const { lang } = useLoaderData<typeof loader>();
  return (
    <LanguageProvider initialLang={lang}>
      <AppInner />
    </LanguageProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = boundary.headers;
