import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Text, BlockStack, InlineGrid, Box,
  Badge, Button, InlineStack, ProgressBar, Divider,
  IndexTable, Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrders, getDashboardStats } from "~/models/orders.server";
import { getAnalytics } from "~/models/billing.server";
import { PLANS } from "~/lib/plans";

const AUTO_REFRESH_MS = 30_000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [stats, orders, analytics] = await Promise.all([
    getDashboardStats(session.shop),
    getOrders(session.shop),
    getAnalytics(session.shop),
  ]);

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appBlockHandle = "tshirt-designer";
  const newAppsSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=newAppsSection`
    : null;
  const mainSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=mainSection`
    : null;

  const shopDomain = session.shop.replace(".myshopify.com", "");

  return json({ stats, recentOrders: orders.slice(0, 10), newAppsSectionUrl, mainSectionUrl, analytics, shopDomain });
};

const STATUS_KEYS: Record<string, "status.pending" | "status.preparing" | "status.printed" | "status.ready" | "status.shipped"> = {
  pending: "status.pending", preparing: "status.preparing", printed: "status.printed",
  ready: "status.ready", shipped: "status.shipped",
};
const BADGE_TONE: Record<string, "info" | "attention" | "success" | "warning" | "new"> = {
  pending: "attention", preparing: "info", printed: "info",
  ready: "success", shipped: "success",
};
const PLAN_BADGE_TONE: Record<string, "success" | "info" | "warning" | "attention"> = {
  Business: "success", Pro: "info", Growth: "info", Starter: "attention",
};

export default function Index() {
  const { stats, recentOrders, newAppsSectionUrl, mainSectionUrl, analytics, shopDomain } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const { t, lang } = useTranslation();
  const plan = PLANS[analytics.planKey];
  const isActive = analytics.subscriptionStatus === "active" || analytics.subscriptionStatus === "trial";

  // Otomatik yenileme
  useEffect(() => {
    const id = setInterval(revalidate, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [revalidate]);

  const rowMarkup = recentOrders.map((o, index) => {
    const shopifyOrderUrl = o.shopifyOrderId
      ? `https://admin.shopify.com/store/${shopDomain}/orders/${o.shopifyOrderId}`
      : null;

    return (
      <IndexTable.Row
        id={o.id}
        key={o.id}
        position={index}
        onClick={() => navigate(`/app/orders/${o.id}`)}
      >
        <IndexTable.Cell>
          {(o.designFrontPreviewUrl || o.previewUrl) ? (
            <div style={{ display: "flex", gap: 4 }}>
              <Thumbnail source={o.designFrontPreviewUrl || o.previewUrl} alt="Ön" size="small" />
              {o.designBackPreviewUrl && (
                <Thumbnail source={o.designBackPreviewUrl} alt="Arka" size="small" />
              )}
            </div>
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎨</div>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {shopifyOrderUrl ? (
            <a href={shopifyOrderUrl} target="_blank" rel="noreferrer"
              style={{ fontWeight: 600, color: "#2c6ecb", textDecoration: "none" }}
              onClick={(e) => e.stopPropagation()}>
              {o.orderNumber}
            </a>
          ) : (
            <Text as="span" fontWeight="semibold">{o.orderNumber}</Text>
          )}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" fontWeight="semibold">{o.customerName}</Text>
            {o.customerEmail && <Text as="span" variant="bodySm" tone="subdued">{o.customerEmail}</Text>}
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">{o.productName}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="150" blockAlign="center">
            <Badge tone={BADGE_TONE[o.productionStatus] ?? "new"}>
              {STATUS_KEYS[o.productionStatus] ? t(STATUS_KEYS[o.productionStatus]) : o.productionStatus}
            </Badge>
            {o.missingSurcharge && <Badge tone="critical">{t("dashboard.missingSurchargeWarning")}</Badge>}
          </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {new Date(o.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title={t("dashboard.title")}>
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.dashboard.1.title", bodyKey: "helper.dashboard.1.body" },
          { titleKey: "helper.dashboard.2.title", bodyKey: "helper.dashboard.2.body" },
          { titleKey: "helper.dashboard.3.title", bodyKey: "helper.dashboard.3.body" },
        ]} />

        {/* Plan durumu */}
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">{t("dashboard.activePlan")}</Text>
                  <Badge tone={PLAN_BADGE_TONE[analytics.planKey] ?? "attention"}>{analytics.planKey}</Badge>
                  {!isActive && <Badge tone="warning">{t("common.passive")}</Badge>}
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  {isActive
                    ? `${plan.maxMonthlyOrders === -1 ? t("common.unlimited") : plan.maxMonthlyOrders} ${t("dashboard.ordersPerMonth")} · ${plan.maxProductTypes === -1 ? t("common.unlimited") : plan.maxProductTypes} ${t("dashboard.productTypes")}`
                    : t("dashboard.planInactive")}
                </Text>
              </BlockStack>
              <Button onClick={() => navigate("/app/billing")} variant={isActive ? "plain" : "primary"}>
                {isActive ? t("dashboard.managePlan") : t("dashboard.choosePlan")}
              </Button>
            </InlineStack>
          </Box>
        </Card>

        {/* Sipariş istatistikleri */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {[
            { label: t("dashboard.totalOrders"), value: stats.total },
            { label: t("dashboard.today"), value: stats.today },
            { label: t("dashboard.pendingProduction"), value: stats.pendingProduction },
            { label: t("dashboard.readyShipped"), value: stats.ready },
          ].map(({ label, value }) => (
            <Card key={label}>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                  <Text as="p" variant="headingXl">{value}</Text>
                </BlockStack>
              </Box>
            </Card>
          ))}
        </InlineGrid>

        {/* Tasarım & AI analitiği */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          <Card>
            <Box padding="400">
              <BlockStack gap="150">
                <Text as="p" variant="bodySm" tone="subdued">{t("dashboard.totalDesigns")}</Text>
                <Text as="p" variant="headingXl">{analytics.designsTotal}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{t("dashboard.thisMonth")} <strong>{analytics.designsThisMonth}</strong></Text>
              </BlockStack>
            </Box>
          </Card>
          <Card>
            <Box padding="400">
              <BlockStack gap="150">
                <InlineStack align="space-between">
                  <Text as="p" variant="bodySm" tone="subdued">{t("dashboard.bgRemoval")}</Text>
                  <Text as="p" variant="bodySm">
                    {analytics.bgThisMonth} / {analytics.bgQuota}
                  </Text>
                </InlineStack>
                {analytics.bgQuota > 0 && (
                  <ProgressBar
                    progress={Math.min(analytics.bgPercent, 100)}
                    tone={analytics.bgPercent >= 90 ? "critical" : analytics.bgPercent >= 70 ? "highlight" : "primary"}
                    size="small"
                  />
                )}
                <Text as="p" variant="bodySm" tone="subdued">{t("dashboard.bgTotal")} <strong>{analytics.bgAllTime}</strong> {t("dashboard.bgRemovals")}</Text>
                {analytics.customerBgSessionsThisMonth > 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {analytics.customerBgSessionsThisMonth} {lang === "tr" ? "müşteri" : "customers"} · {lang === "tr" ? "ort." : "avg."} {analytics.customerBgAvgPerSession} {lang === "tr" ? "kullanım/kişi" : "uses/customer"}
                  </Text>
                )}
              </BlockStack>
            </Box>
          </Card>
          <Card>
            <Box padding="400">
              <BlockStack gap="150">
                <Text as="p" variant="bodySm" tone="subdued">{t("dashboard.missingSurcharge")}</Text>
                <Text as="p" variant="headingXl" tone={stats.missingSurcharge > 0 ? "caution" : undefined}>
                  {stats.missingSurcharge}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.missingSurcharge > 0 ? t("dashboard.checkOrders") : t("dashboard.allOrdersComplete")}
                </Text>
              </BlockStack>
            </Box>
          </Card>
        </InlineGrid>

        {/* Tema kurulumu */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{t("dashboard.themeSetup")}</Text>
              <Text as="p" tone="subdued">{t("dashboard.themeSetupDesc")}</Text>
              <InlineStack gap="200">
                {newAppsSectionUrl && (
                  <Button url={newAppsSectionUrl} target="_blank" variant="primary">{t("dashboard.addAppsSection")}</Button>
                )}
                {mainSectionUrl && (
                  <Button url={mainSectionUrl} target="_blank">{t("dashboard.addBlock")}</Button>
                )}
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Son siparişler — IndexTable */}
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">{t("dashboard.recentOrders")}</Text>
              <Button onClick={() => navigate("/app/orders")} variant="plain">{t("common.viewAll")}</Button>
            </InlineStack>
          </Box>
          <Divider />
          {recentOrders.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued" alignment="center">{t("dashboard.noOrders")}</Text>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: t("common.order"), plural: t("common.orders") }}
              itemCount={recentOrders.length}
              headings={[
                { title: "" },
                { title: t("common.order") },
                { title: t("common.customer") },
                { title: t("common.product") },
                { title: t("common.status") },
                { title: t("common.date") },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

      </BlockStack>
    </Page>
  );
}
