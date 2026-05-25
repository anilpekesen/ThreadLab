import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Text, BlockStack, InlineGrid, Box,
  Badge, Button, InlineStack, ProgressBar, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getDashboardStats, getProductionAnalytics } from "~/models/orders.server";
import { getAnalytics } from "~/models/billing.server";
import { PLANS } from "~/lib/plans";

const AUTO_REFRESH_MS = 30_000;

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const [stats, analytics, production] = await Promise.all([
    getDashboardStats(session.shop),
    getAnalytics(session.shop),
    getProductionAnalytics(session.shop),
  ]);

  return json({ stats, analytics, production });
};

const PLAN_BADGE_TONE: Record<string, "success" | "info" | "warning" | "attention"> = {
  Business: "success", Pro: "info", Growth: "info", Starter: "attention",
};

function formatFulfillmentTime(hours: number | null, lang: string): string {
  if (hours === null) return lang === "tr" ? "Veri yok" : "No data";
  if (hours < 1) return lang === "tr" ? "< 1 saat" : "< 1 hr";
  if (hours < 24) return lang === "tr" ? `${hours} saat` : `${hours} hrs`;
  const days = (hours / 24).toFixed(1);
  return lang === "tr" ? `${days} gün` : `${days} days`;
}

function MiniBarChart({ data, lang }: { data: Array<{ day: string; count: number }>; lang: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  const countByDay: Record<string, number> = {};
  for (const r of data) countByDay[r.day] = r.count;

  const values = days.map((d) => countByDay[d] ?? 0);
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 80, paddingTop: 4 }}>
      {days.map((day, i) => {
        const count = values[i];
        const barH = Math.max(3, Math.round((count / max) * 56));
        const label = new Date(day + "T12:00:00").toLocaleDateString(
          lang === "en" ? "en-US" : "tr-TR",
          { weekday: "short" },
        );
        const isToday = day === new Date().toISOString().slice(0, 10);
        return (
          <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {count > 0 && (
              <Text as="span" variant="bodySm" fontWeight={isToday ? "semibold" : undefined}>{count}</Text>
            )}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{
                width: "100%",
                height: barH,
                background: isToday ? "#4f46e5" : "#c7d2fe",
                borderRadius: "3px 3px 0 0",
                minHeight: 3,
              }} />
            </div>
            <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
          </div>
        );
      })}
    </div>
  );
}

export default function Index() {
  const { stats, analytics, production } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const { t, lang } = useTranslation();
  const plan = PLANS[analytics.planKey];
  const isActive = analytics.subscriptionStatus === "active" || analytics.subscriptionStatus === "trial";

  useEffect(() => {
    const id = setInterval(revalidate, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [revalidate]);

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
        <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="400">
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

        {/* Üretim analitiği */}
        {production.lateCount > 0 && (
          <Banner
            tone="warning"
            title={lang === "tr"
              ? `${production.lateCount} sipariş 2 günden uzun süredir bekliyor`
              : `${production.lateCount} order${production.lateCount > 1 ? "s" : ""} waiting for over 2 days`}
            action={{ content: lang === "tr" ? "Siparişlere Git" : "Go to Orders", onAction: () => navigate("/app/orders") }}
          />
        )}

        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
          {/* Ort. karşılama süresi */}
          <Card>
            <Box padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "Ort. Karşılama Süresi" : "Avg. Fulfillment Time"}
                </Text>
                <Text as="p" variant="headingXl" tone={
                  production.avgFulfillmentHours === null ? undefined
                  : production.avgFulfillmentHours <= 24 ? "success"
                  : production.avgFulfillmentHours <= 48 ? undefined
                  : "caution"
                }>
                  {formatFulfillmentTime(production.avgFulfillmentHours, lang)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "Son 30 gün · gönderildi olanlar" : "Last 30 days · shipped orders"}
                </Text>
              </BlockStack>
            </Box>
          </Card>

          {/* Bu hafta */}
          <Card>
            <Box padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "Bu Hafta" : "This Week"}
                </Text>
                <Text as="p" variant="headingXl">{production.weekCount}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "Son 7 günde gelen sipariş" : "Orders in the last 7 days"}
                </Text>
              </BlockStack>
            </Box>
          </Card>

          {/* Geciken */}
          <Card>
            <Box padding="400">
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "Geciken Sipariş" : "Late Orders"}
                </Text>
                <Text as="p" variant="headingXl" tone={production.lateCount > 0 ? "caution" : undefined}>
                  {production.lateCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lang === "tr" ? "2 günden uzun bekliyor / hazırlanıyor" : "Pending / preparing over 2 days"}
                </Text>
              </BlockStack>
            </Box>
          </Card>
        </InlineGrid>

        {/* 7 günlük sipariş grafiği */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                {lang === "tr" ? "Son 7 Gün — Sipariş Hacmi" : "Last 7 Days — Order Volume"}
              </Text>
              <MiniBarChart data={production.dailyCounts} lang={lang} />
            </BlockStack>
          </Box>
        </Card>

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

      </BlockStack>
    </Page>
  );
}
