import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider, Badge, InlineStack, Text } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "~/shopify.server";
import { getShopSubscription } from "~/models/billing.server";
import type { PlanKey } from "~/lib/plans";
import { LanguageProvider, useTranslation, readLangFromCookie, type Lang } from "~/i18n";

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
  const { lang, setLang, t } = useTranslation();
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
        <Text as="span" variant="bodySm" tone="subdued">{t("planHeader.plan")}</Text>
        <Badge tone={PLAN_BADGE_TONE[planKey] ?? "attention"}>{planKey}</Badge>
        {!isActive && <Text as="span" variant="bodySm" tone="caution">{t("planHeader.inactive")}</Text>}
      </InlineStack>
      <InlineStack gap="300" blockAlign="center">
        {!isActive && (
          <button
            onClick={() => navigate("/app/billing")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#2271b1", fontSize: 13, fontWeight: 600 }}
          >
            {t("planHeader.choosePlan")}
          </button>
        )}
        {/* Language toggle */}
        <div style={{ display: "flex", gap: 2, background: "#e9ecef", borderRadius: 6, padding: 2 }}>
          {(["tr", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                background: lang === l ? "#fff" : "transparent",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                padding: "2px 8px",
                fontSize: 12,
                fontWeight: lang === l ? 700 : 400,
                color: lang === l ? "#1a1a2e" : "#6b7280",
                boxShadow: lang === l ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                transition: "all .15s",
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </InlineStack>
    </div>
  );
}

function AppInner() {
  const { apiKey, planKey, subscriptionStatus, lang } = useLoaderData<typeof loader>();
  const { t } = useTranslation();
  return (
    <ShopifyAppProvider isEmbeddedApp apiKey={apiKey}>
      <PolarisAppProvider i18n={lang === "en" ? enTranslations : trTranslations}>
        <NavMenu>
          <a href="/app" rel="home">{t("nav.home")}</a>
          <a href="/app/orders">{t("nav.orders")}</a>
          <a href="/app/product-types">{t("nav.productTypes")}</a>
          <a href="/app/templates">{t("nav.templates")}</a>
          <a href="/app/billing">{t("nav.billing")}</a>
          <a href="/app/settings">{t("nav.settings")}</a>
        </NavMenu>
        <PlanHeader planKey={planKey} subscriptionStatus={subscriptionStatus} />
        <Outlet context={{ planKey, subscriptionStatus }} />
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
