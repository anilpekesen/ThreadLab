import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "~/lib/authenticate.server";
import { ensureCartTransformRegistered } from "~/lib/cart-transform.server";
import { getShopSubscription } from "~/models/billing.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { LanguageProvider, useTranslation, type Lang } from "~/i18n";
import appLayoutStyles from "~/styles/app-layout.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appLayoutStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  ensureCartTransformRegistered(admin, session.shop);
  const sub = await getShopSubscription(session.shop);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  const lang: Lang = langMatch?.[1] === "en" ? "en" : "tr";
  const planKey = (sub?.plan_key ?? "Pro") as PlanKey;
  const planFeatures = PLANS[planKey] ?? PLANS["Pro"];
  const isPaidProductionPlan = (planKey === "Pro" || planKey === "Business")
    && (sub?.subscription_status === "active" || sub?.subscription_status === "trial");
  return json({
    planKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
    lang,
    shop: session.shop,
    allowProduction: planFeatures.allowProduction,
    allowGangSheet: planFeatures.allowGangSheet,
    allowPrintQueue: isPaidProductionPlan,
  });
};

function AppInner() {
  const { planKey, subscriptionStatus, lang, allowProduction, allowGangSheet, allowPrintQueue } = useLoaderData<typeof loader>();
  const { t, setLang } = useTranslation();
  const navigate = useNavigate();

  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trial";

  const navItems = [
    { label: t("nav.home"), url: "/app", end: true, show: true },
    { label: t("nav.orders"), url: "/app/orders", end: false, show: true },
    { label: t("nav.production"), url: "/app/production", end: false, show: allowProduction },
    { label: t("nav.gangSheet"), url: "/app/gang-sheet", end: false, show: allowGangSheet },
    { label: "Print Queue", url: "/app/print-queue", end: false, show: allowPrintQueue },
    { label: t("nav.productTypes"), url: "/app/product-types", end: false, show: true },
    { label: t("nav.templates"), url: "/app/templates", end: false, show: true },
    { label: t("nav.billing"), url: "/app/billing", end: false, show: true },
    { label: t("nav.settings"), url: "/app/settings", end: false, show: true },
  ].filter((item) => item.show);

  return (
    <PolarisAppProvider i18n={lang === "en" ? enTranslations : trTranslations}>
      <NavMenu>
        {navItems.map((item) => (
          <a key={item.url} href={item.url}>
            {item.label}
          </a>
        ))}
      </NavMenu>
      <div className="app-shell">
        <div className="app-main">
          <header className="app-topbar">
            <a href="/app" className="app-topbar-brand" aria-label="PrintLab home">
              <img src="/logo.png" alt="PrintLabApp" />
            </a>
            <span className="app-sidebar-plan">{planKey}</span>
            {!isActive && (
              <button
                className="app-topbar-upgrade"
                onClick={() => navigate("/app/billing")}
              >
                {t("planHeader.choosePlan")}
              </button>
            )}
            <div className="app-lang-switcher">
              {(["tr", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  className={`app-lang-btn${lang === l ? " active" : ""}`}
                  onClick={() => setLang(l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </header>

          <main className="app-content">
            <Outlet context={{ planKey, subscriptionStatus, allowProduction, allowGangSheet }} />
          </main>
        </div>
      </div>
    </PolarisAppProvider>
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
  const error = useRouteError();
  console.error("[app.tsx ErrorBoundary]", error);
  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "#d92020" }}>Bir hata oluştu</h2>
      <p style={{ color: "#6b7280" }}>Lütfen sayfayı yenileyin.</p>
    </div>
  );
}
