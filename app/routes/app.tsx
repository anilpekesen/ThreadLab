import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, NavLink, Outlet, useLoaderData, useNavigate, useRouteError } from "@remix-run/react";
import * as Sentry from "@sentry/remix";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import type { LinkLikeComponent } from "@shopify/polaris/build/ts/src/utilities/link";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import trTranslations from "@shopify/polaris/locales/tr.json";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "~/lib/authenticate.server";
import { ensureCartTransformRegistered } from "~/lib/cart-transform.server";
import { getShopSubscription } from "~/models/billing.server";
import { getShopSettings, saveShopSettings } from "~/models/shop-settings.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { LanguageProvider, useTranslation, type Lang } from "~/i18n";
import appLayoutStyles from "~/styles/app-layout.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appLayoutStyles },
];

async function syncShopDisplayName(
  admin: Awaited<ReturnType<typeof authenticate>>["admin"],
  shop: string,
): Promise<string> {
  const current = await getShopSettings(shop);
  try {
    const response = await admin.graphql(`#graphql
      query PrintLabShopIdentity {
        shop {
          name
        }
      }
    `);
    const body = await response.json() as {
      data?: { shop?: { name?: string | null } };
      errors?: Array<{ message?: string }>;
    };
    const shopName = body.data?.shop?.name?.trim() || "";
    if (shopName && shopName !== current.shopDisplayName) {
      await saveShopSettings(shop, { shopDisplayName: shopName });
    }
    return current.emailSenderName?.trim() || shopName || shop.replace(/\.myshopify\.com$/i, "");
  } catch (error) {
    console.error(`[shop-identity] mağaza adı eşitlenemedi: ${shop}`, error);
    return current.emailSenderName?.trim()
      || current.shopDisplayName?.trim()
      || shop.replace(/\.myshopify\.com$/i, "");
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  ensureCartTransformRegistered(admin, session.shop);
  const [sub, shopDisplayName] = await Promise.all([
    getShopSubscription(session.shop),
    syncShopDisplayName(admin, session.shop),
  ]);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  const lang: Lang = langMatch?.[1] === "en" ? "en" : "tr";
  const planKey = (sub?.plan_key ?? "Pro") as PlanKey;
  const planFeatures = PLANS[planKey] ?? PLANS["Pro"];
  const hasActiveSubscription = sub?.subscription_status === "active" || sub?.subscription_status === "trial";
  const isPaidProductionPlan = hasActiveSubscription && (planKey === "Pro" || planKey === "Business");
  return json({
    planKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
    lang,
    shop: session.shop,
    shopDisplayName,
    allowProduction: hasActiveSubscription && planFeatures.allowProduction,
    allowGangSheet: hasActiveSubscription && planFeatures.allowGangSheet,
    allowPrintQueue: isPaidProductionPlan,
  });
};

function AppInner() {
  const { planKey, subscriptionStatus, shop, shopDisplayName, allowProduction, allowGangSheet, allowPrintQueue } = useLoaderData<typeof loader>();
  const { t, setLang, lang } = useTranslation(); // lang context'ten gelsin — anlık değişsin
  const navigate = useNavigate();

  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trial";
  const shopName = shopDisplayName || shop.replace(".myshopify.com", "");
  const planLabel = isActive ? planKey : t("common.noPlan");

  const navItems = [
    { label: t("nav.home"), url: "/app", end: true, show: true },
    { label: t("nav.orders"), url: "/app/orders", end: false, show: true },
    { label: t("nav.production"), url: "/app/production", end: false, show: allowProduction },
    { label: t("nav.gangSheet"), url: "/app/gang-sheet", end: false, show: allowGangSheet },
    { label: t("nav.printQueue"), url: "/app/print-queue", end: false, show: allowPrintQueue },
    { label: t("nav.productTypes"), url: "/app/product-types", end: false, show: true },
    { label: t("nav.templates"), url: "/app/templates", end: false, show: true },
    { label: t("nav.cliparts"), url: "/app/cliparts", end: false, show: true },
    { label: t("nav.personalizer"), url: "/app/personalizer", end: false, show: true },
    { label: t("nav.printProducts"), url: "/app/print-products", end: false, show: true },
    { label: t("nav.billing"), url: "/app/billing", end: false, show: true },
    { label: t("nav.credits"), url: "/app/credits", end: false, show: true },
    { label: t("nav.settings"), url: "/app/settings", end: false, show: true },
    { label: t("nav.support"), url: "/app/support", end: false, show: true },
  ].filter((item) => item.show);

  return (
    <PolarisAppProvider
      i18n={lang === "en" ? enTranslations : trTranslations}
      linkComponent={PolarisLink}
    >
      {/* App Bridge navigation — Shopify admin sidebar entegrasyonu */}
      <ui-nav-menu>
        {navItems.map((item) => (
          <a key={item.url} href={item.url} rel={item.end ? "home" : undefined}>
            {item.label}
          </a>
        ))}
      </ui-nav-menu>

      <div className="app-shell">
        <nav className="app-sidebar">
          <div className="app-sidebar-logo">
            <a href="/app">
              <img src="/logo.png" alt="PrintLabApp" />
            </a>
          </div>

          <div className="app-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.end}
                className={({ isActive: a }) => `app-nav-link${a ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="app-sidebar-footer">
            <div className="app-sidebar-shop">{shopName}</div>
            <span className="app-sidebar-plan">{planLabel}</span>
          </div>
        </nav>

        <div className="app-main">
          <header className="app-topbar">
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

/**
 * Polaris'in `url` alan bileşenleri (Button, Link, Banner action…) varsayılan
 * olarak düz <a> basıyor; gömülü uygulamada bu tam sayfa yüklemesi demek.
 * Remix'in Link'ine bağlayınca aynı bileşenler istemci tarafında geziniyor ve
 * bağlantı olarak da davranıyor: orta tıkla yeni sekmede açılabiliyor.
 */
const PolarisLink: LinkLikeComponent = ({ children, url = "", external, ref, ...rest }) => {
  if (external || /^(https?:)?\/\//.test(url) || url.startsWith("mailto:")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>
        {children}
      </a>
    );
  }
  return <Link to={url} ref={ref as React.Ref<HTMLAnchorElement>} {...rest}>{children}</Link>;
};

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
  Sentry.captureException(error);
  console.error("[app.tsx ErrorBoundary]", error);
  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "#d92020" }}>Bir hata oluştu</h2>
      <p style={{ color: "#6b7280" }}>Lütfen sayfayı yenileyin.</p>
    </div>
  );
}
