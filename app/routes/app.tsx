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
import { PLANS, effectivePlanKey, type PlanKey } from "~/lib/plans";
import { LanguageProvider, useTranslation, pickDict, readLangFromCookie, type Lang } from "~/i18n";
import shellDict from "~/i18n/admin/app-shell";
import { useEffect, useState } from "react";
import appLayoutStyles from "~/styles/app-layout.css?url";
import personalizerAdminStyles from "~/styles/personalizer-admin.css?url";
import { isWooShop, shopHandle } from "~/lib/platform";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appLayoutStyles },
  { rel: "stylesheet", href: personalizerAdminStyles },
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
    return current.emailSenderName?.trim() || shopName || shopHandle(shop);
  } catch (error) {
    console.error(`[shop-identity] mağaza adı eşitlenemedi: ${shop}`, error);
    return current.emailSenderName?.trim()
      || current.shopDisplayName?.trim()
      || shopHandle(shop);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  // WooCommerce: sepet fonksiyonu ve Shopify mağaza adı yok
  const standalone = isWooShop(session.shop);
  if (!standalone) ensureCartTransformRegistered(admin, session.shop);
  const [sub, shopDisplayName] = await Promise.all([
    getShopSubscription(session.shop),
    standalone
      ? getShopSettings(session.shop).then((s) => s.emailSenderName?.trim() || s.shopDisplayName?.trim() || shopHandle(session.shop))
      : syncShopDisplayName(admin, session.shop),
  ]);
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  // Kullanıcı dil seçtiyse o geçerli. Seçmediyse Shopify yönetim panelinin
  // dili: Shopify gömülü uygulamayı ?locale=en-US gibi bir parametreyle açar.
  // Eskiden varsayılan hep Türkçeydi; App Store'dan kuran yabancı mağaza
  // sahibi uygulamayı Türkçe görüyor, dil düğmesini aramak zorunda kalıyordu.
  const shopifyLocale = new URL(request.url).searchParams.get("locale") ?? "";
  const lang: Lang = langMatch?.[1] === "en" || langMatch?.[1] === "tr"
    ? (langMatch[1] as Lang)
    : shopifyLocale && !shopifyLocale.toLowerCase().startsWith("tr") ? "en" : "tr";
  const planKey = effectivePlanKey(sub);
  const planFeatures = PLANS[planKey];
  const hasActiveSubscription = sub?.subscription_status === "active" || sub?.subscription_status === "trial";
  const isPaidProductionPlan = hasActiveSubscription && (planKey === "Pro" || planKey === "Business");
  return json({
    planKey,
    subscriptionStatus: sub?.subscription_status ?? "none",
    lang,
    shop: session.shop,
    shopDisplayName,
    standalone,
    allowProduction: hasActiveSubscription && planFeatures.allowProduction,
    allowGangSheet: hasActiveSubscription && planFeatures.allowGangSheet,
    allowPrintQueue: isPaidProductionPlan,
  });
};

function AppInner() {
  const { planKey, subscriptionStatus, shop, shopDisplayName, standalone, allowProduction, allowGangSheet, allowPrintQueue } = useLoaderData<typeof loader>();
  const { t, setLang, lang } = useTranslation(); // lang context'ten gelsin — anlık değişsin
  const navigate = useNavigate();

  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trial";
  const shopName = shopDisplayName || shopHandle(shop);
  // Aboneliği olmayan mağaza ücretsiz plandadır; "Plan yok" yerine planın adı görünür
  const planLabel = planKey;

  const navItems = [
    { label: t("nav.home"), url: "/app", end: true, show: true },
    { label: t("nav.orders"), url: "/app/orders", end: false, show: true },
    // Plana bağlı sayfalar gizlenmez, kilitli olarak işaretlenir (Built for
    // Shopify 4.3.7); sayfanın kendisi plan uyarısını ve yükseltme yolunu gösterir
    { label: allowProduction ? t("nav.production") : `${t("nav.production")} · Pro`, url: "/app/production", end: false, show: true },
    { label: allowGangSheet ? t("nav.gangSheet") : `${t("nav.gangSheet")} · Pro`, url: "/app/gang-sheet", end: false, show: true },
    { label: allowPrintQueue ? t("nav.printQueue") : `${t("nav.printQueue")} · Pro`, url: "/app/print-queue", end: false, show: true },
    { label: t("nav.productTypes"), url: "/app/product-types", end: false, show: true },
    { label: t("nav.templates"), url: "/app/templates", end: false, show: true },
    { label: t("nav.cliparts"), url: "/app/cliparts", end: false, show: true },
    { label: t("nav.personalizer"), url: "/app/personalizer", end: false, show: true },
    { label: t("nav.printProducts"), url: "/app/print-products", end: false, show: true },
    { label: "Printful", url: "/app/printful", end: false, show: true },
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
        {standalone && (
          <aside className="app-sidebar app-sidebar--standalone">
            <div className="app-sidebar-logo">
              <Link to="/app"><img src="/logo.png" alt="PrintLab" /></Link>
            </div>
            <nav className="app-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.url}
                  to={item.url}
                  end={item.end}
                  className={({ isActive: active }) => `app-nav-link${active ? " active" : ""}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="app-sidebar-footer">
              <div className="app-sidebar-shop">{shopName}</div>
              <span className="app-sidebar-plan">{planLabel}</span>
            </div>
          </aside>
        )}
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
  // Hata sınırı LanguageProvider dışında; dili istemcide çerez/localStorage'dan oku
  const [errLang, setErrLang] = useState<Lang>("tr");
  useEffect(() => {
    let next: Lang = readLangFromCookie();
    try {
      const stored = window.localStorage.getItem("dk_lang");
      if (stored === "en" || stored === "tr") next = stored;
    } catch {
      // localStorage yoksa çerezle devam
    }
    setErrLang(next);
  }, []);
  const L = pickDict(shellDict, errLang);
  return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "#d92020" }}>{L.errorTitle}</h2>
      <p style={{ color: "#6b7280" }}>{L.errorBody}</p>
    </div>
  );
}
