import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { useTranslation, type Lang } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Text, BlockStack, InlineGrid, Box,
  Badge, Button, InlineStack, ProgressBar, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrders, getProductionAnalytics } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getAnalytics } from "~/models/billing.server";
import { getDashboardAnalyticsDetail } from "~/models/analytics.server";
import { PLANS } from "~/lib/plans";

const AUTO_REFRESH_MS = 30_000;

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const lang = readLang(request);
  const [orders, analytics, production] = await Promise.all([
    getOrders(session.shop),
    getAnalytics(session.shop),
    getProductionAnalytics(session.shop),
  ]);
  const stats = summarizeGroupedStats(groupOrders(orders));
  const detail = await getDashboardAnalyticsDetail(session.shop);
  const chartDays = buildChartDays(production.dailyCounts, lang);
  const displayDetail = {
    ...detail,
    recentActivity: detail.recentActivity.map((item) => ({
      ...item,
      displayDate: formatShortDate(item.createdAt, lang),
    })),
  };

  return json({ stats, analytics, production, detail: displayDetail, chartDays });
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

type ChartDay = { day: string; label: string; count: number; isToday: boolean };

function readLang(request: Request): Lang {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  return langMatch?.[1] === "en" ? "en" : "tr";
}

function getIstanbulParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    weekday: date.getUTCDay(),
  };
}

const WEEKDAY_LABELS: Record<Lang, string[]> = {
  tr: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const MONTH_LABELS: Record<Lang, string[]> = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

function toIsoDay(date: Date): string {
  const parts = getIstanbulParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildChartDays(data: Array<{ day: string; count: number }>, lang: Lang): ChartDay[] {
  const todayParts = getIstanbulParts(new Date());
  const todayUtcNoon = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 12);
  const todayIso = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
  const countByDay: Record<string, number> = {};
  for (const row of data) countByDay[row.day] = row.count;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayUtcNoon - (6 - index) * 24 * 60 * 60 * 1000);
    const day = toIsoDay(date);
    return {
      day,
      label: WEEKDAY_LABELS[lang][date.getUTCDay()],
      count: countByDay[day] ?? 0,
      isToday: day === todayIso,
    };
  });
}

function formatShortDate(value: string, lang: Lang): string {
  const date = new Date(value);
  const parts = getIstanbulParts(date);
  return `${String(parts.day).padStart(2, "0")} ${MONTH_LABELS[lang][parts.month - 1]}`;
}

function MiniBarChart({ days }: { days: ChartDay[] }) {
  const values = days.map((d) => d.count);
  const max = Math.max(...values, 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 80, paddingTop: 4 }}>
      {days.map((item) => {
        const count = item.count;
        const barH = Math.max(3, Math.round((count / max) * 56));
        return (
          <div key={item.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {count > 0 && (
              <Text as="span" variant="bodySm" fontWeight={item.isToday ? "semibold" : undefined}>{count}</Text>
            )}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{
                width: "100%",
                height: barH,
                background: item.isToday ? "#4f46e5" : "#c7d2fe",
                borderRadius: "3px 3px 0 0",
                minHeight: 3,
              }} />
            </div>
            <Text as="span" variant="bodySm" tone="subdued">{item.label}</Text>
          </div>
        );
      })}
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.min(999, value))}%`;
}

function formatDuration(seconds: number | null, lang: string): string {
  if (seconds === null) return lang === "tr" ? "Veri yok" : "No data";
  if (seconds < 60) return lang === "tr" ? `${seconds} sn` : `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return lang === "tr" ? `${minutes} dk` : `${minutes} min`;
  const hours = (minutes / 60).toFixed(1);
  return lang === "tr" ? `${hours} saat` : `${hours} hr`;
}

function formatMoneyValue(value: number | null, currencyCode: string, lang: string): string {
  if (value === null) return lang === "tr" ? "Veri yok" : "No data";
  try {
    return new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-US", {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

function statusLabel(status: string, lang: string): string {
  const tr: Record<string, string> = {
    pending: "Bekliyor",
    preparing: "Hazırlanıyor",
    printed: "Basılı",
    ready: "Hazır",
    shipped: "Gönderildi",
    cancelled: "İptal",
  };
  const en: Record<string, string> = {
    pending: "Pending",
    preparing: "Preparing",
    printed: "Printed",
    ready: "Ready",
    shipped: "Shipped",
    cancelled: "Cancelled",
  };
  return (lang === "tr" ? tr : en)[status] ?? status;
}

function activityLabel(type: string, fallback: string, lang: string): string {
  const tr: Record<string, string> = {
    order: "Sipariş alındı",
    cart_add: "Sepete eklendi",
    template_applied: "Şablon kullanıldı",
    design_created: "Tasarım oluşturuldu",
    design_activity: "Tasarım yapıldı",
    background_removed: "Arka plan kaldırıldı",
  };
  const en: Record<string, string> = {
    order: "Order received",
    cart_add: "Added to cart",
    template_applied: "Template used",
    design_created: "Design created",
    design_activity: "Design activity",
    background_removed: "Background removed",
  };
  return (lang === "tr" ? tr : en)[type] ?? fallback ?? type;
}

function activityDetail(type: string, label: string, detail: string, lang: string): string {
  const cleanDetail = detail && !detail.startsWith("d_") ? detail : "";
  if (type === "order") return cleanDetail || (lang === "tr" ? "Özel tasarım siparişi" : "Custom design order");
  if (type === "template_applied") {
    const template = label && !label.startsWith("d_") ? label : (lang === "tr" ? "Şablon" : "Template");
    return cleanDetail ? `${template} · ${cleanDetail}` : template;
  }
  return cleanDetail || (lang === "tr" ? "Tasarım aktivitesi" : "Design activity");
}

function EmptyMetric({ lang }: { lang: string }) {
  return (
    <Text as="p" variant="bodySm" tone="subdued">
      {lang === "tr" ? "Henüz veri yok" : "No data yet"}
    </Text>
  );
}

interface OrderGroup {
  shopifyOrderId: string;
  createdAt: string;
  status: string;
  missingSurcharge: boolean;
}

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0, preparing: 1, printed: 2, ready: 3, shipped: 4, cancelled: 5,
};

function groupOrders(orders: Order[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();

  for (const order of orders) {
    const key = order.shopifyOrderId || order.id;
    if (!map.has(key)) {
      map.set(key, {
        shopifyOrderId: key,
        createdAt: order.createdAt,
        status: order.productionStatus,
        missingSurcharge: Boolean(order.missingSurcharge),
      });
      continue;
    }

    const group = map.get(key)!;
    if ((STATUS_PRIORITY[order.productionStatus] ?? 99) < (STATUS_PRIORITY[group.status] ?? 99)) {
      group.status = order.productionStatus;
    }
    if (new Date(order.createdAt).getTime() > new Date(group.createdAt).getTime()) {
      group.createdAt = order.createdAt;
    }
    group.missingSurcharge = group.missingSurcharge || Boolean(order.missingSurcharge);
  }

  return Array.from(map.values());
}

function summarizeGroupedStats(groups: OrderGroup[]) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return {
    total: groups.length,
    today: groups.filter((group) => new Date(group.createdAt) >= todayStart).length,
    pendingProduction: groups.filter((group) => group.status === "pending").length,
    ready: groups.filter((group) => group.status === "ready" || group.status === "shipped").length,
    missingSurcharge: groups.filter((group) => group.missingSurcharge).length,
  };
}

export default function Index() {
  const { stats, analytics, production, detail, chartDays } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const { t, lang } = useTranslation();
  const isActive = analytics.subscriptionStatus === "active" || analytics.subscriptionStatus === "trial";
  const plan = isActive ? PLANS[analytics.planKey] : null;
  const planLabel = isActive ? analytics.planKey : t("common.noPlan");

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
          { titleKey: "helper.dashboard.4.title", bodyKey: "helper.dashboard.4.body" },
          { titleKey: "helper.dashboard.5.title", bodyKey: "helper.dashboard.5.body" },
        ]} />

        {/* Plan durumu */}
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">{t("dashboard.activePlan")}</Text>
                  <Badge tone={isActive ? (PLAN_BADGE_TONE[analytics.planKey] ?? "attention") : "attention"}>{planLabel}</Badge>
                  {!isActive && <Badge tone="warning">{t("common.passive")}</Badge>}
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  {isActive
                    ? `${plan!.maxMonthlyOrders === -1 ? t("common.unlimited") : plan!.maxMonthlyOrders} ${t("dashboard.ordersPerMonth")} · ${plan!.maxProductTypes === -1 ? t("common.unlimited") : plan!.maxProductTypes} ${t("dashboard.productTypes")}`
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
              <MiniBarChart days={chartDays} />
            </BlockStack>
          </Box>
        </Card>

        {/* Gelişmiş analitik */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            {lang === "tr" ? "Gelişmiş Analitik" : "Advanced Analytics"}
          </Text>

          <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="400">
            {[
              {
                label: lang === "tr" ? "Bugün tasarım yaptı" : "Designed today",
                value: detail.todayFunnel.designUsers,
                caption: lang === "tr" ? "farklı kişi" : "unique customers",
                tone: undefined,
              },
              {
                label: lang === "tr" ? "Arka plan kaldırdı" : "Removed background",
                value: detail.todayFunnel.backgroundRemovedUsers,
                caption: lang === "tr" ? "farklı kişi" : "unique customers",
                tone: undefined,
              },
              {
                label: lang === "tr" ? "Sepete ekledi" : "Added to cart",
                value: detail.todayFunnel.cartAddUsers,
                caption: lang === "tr" ? "farklı kişi" : "unique customers",
                tone: undefined,
              },
              {
                label: lang === "tr" ? "Sepette kaldı" : "Abandoned cart",
                value: detail.todayFunnel.cartAbandonedUsers,
                caption: lang === "tr" ? "aldı ama ödemedi" : "carted, not purchased",
                tone: detail.todayFunnel.cartAbandonedUsers > 0 ? ("caution" as const) : undefined,
              },
              {
                label: lang === "tr" ? "Satın aldı" : "Purchased",
                value: detail.todayFunnel.purchasedUsers,
                caption: `${detail.todayFunnel.purchasedOrders} ${lang === "tr" ? "sipariş" : "orders"}`,
                tone: "success" as const,
              },
            ].map((item) => (
              <Card key={item.label}>
                <Box padding="400">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">{item.label}</Text>
                    <Text as="p" variant="headingXl" tone={item.tone}>{item.value}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{item.caption}</Text>
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lang === "tr" ? "Tasarım → Sipariş" : "Design → Order"}
                  </Text>
                  <Text as="p" variant="headingXl">{formatPercent(detail.conversion.designToOrderPercent)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {detail.conversion.designs} {lang === "tr" ? "tasarım" : "designs"} · {detail.conversion.cartAdds} {lang === "tr" ? "sepete ekleme" : "cart adds"} · {detail.conversion.orders} {lang === "tr" ? "sipariş" : "orders"}
                  </Text>
                  <InlineStack gap="200">
                    <Badge tone="info">{lang === "tr" ? "Sepete" : "To cart"} {formatPercent(detail.conversion.designToCartPercent)}</Badge>
                    <Badge tone="success">{lang === "tr" ? "Siparişe" : "To order"} {formatPercent(detail.conversion.cartToOrderPercent)}</Badge>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lang === "tr" ? "Ortalama Tasarım Süresi" : "Avg. Design Time"}
                  </Text>
                  <Text as="p" variant="headingXl">{formatDuration(detail.designDuration.avgSeconds, lang)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {detail.designDuration.samples} {lang === "tr" ? "sepete ekleme örneği" : "cart-add samples"}
                  </Text>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lang === "tr" ? "AI Kullanım Verimi" : "AI Usage Efficiency"}
                  </Text>
                  <Text as="p" variant="headingXl">{formatPercent(detail.aiEfficiency.bgToOrderPercent)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {detail.aiEfficiency.bgUses} {lang === "tr" ? "arka plan silme" : "background removals"} · {detail.aiEfficiency.ordersWithBgSession} {lang === "tr" ? "siparişe dönen" : "converted orders"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {detail.aiEfficiency.bgCustomers} {lang === "tr" ? "müşteri kullandı" : "customers used it"}
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "En Çok Tasarlanan Ürünler" : "Top Designed Products"}
                  </Text>
                  {detail.topProducts.length === 0 ? <EmptyMetric lang={lang} /> : (
                    <BlockStack gap="200">
                      {detail.topProducts.map((item) => (
                        <InlineStack key={`${item.productId}-${item.productName}`} align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{item.productName}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{item.quantity} {lang === "tr" ? "adet" : "units"}</Text>
                          </BlockStack>
                          <Badge tone="info">{item.orders} {lang === "tr" ? "sipariş" : "orders"}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "En Çok Kullanılan Şablonlar" : "Most Used Templates"}
                  </Text>
                  {detail.topTemplates.length === 0 ? <EmptyMetric lang={lang} /> : (
                    <BlockStack gap="200">
                      {detail.topTemplates.map((item) => (
                        <InlineStack key={`${item.templateKind}-${item.templateId}`} align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{item.templateName}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {item.templateKind === "shop"
                                ? (lang === "tr" ? "Mağaza görsel şablonu" : "Store image template")
                                : (lang === "tr" ? "Yazı şablonu" : "Text template")}
                            </Text>
                          </BlockStack>
                          <Badge tone="success">{item.uses} {lang === "tr" ? "kullanım" : "uses"}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "Üretim Durum Dağılımı" : "Production Status Breakdown"}
                  </Text>
                  {detail.productionStatus.length === 0 ? <EmptyMetric lang={lang} /> : (
                    <BlockStack gap="200">
                      {detail.productionStatus.map((item) => {
                        const total = detail.productionStatus.reduce((sum, s) => sum + s.count, 0);
                        const p = total ? Math.round((item.count / total) * 100) : 0;
                        return (
                          <BlockStack gap="100" key={item.status}>
                            <InlineStack align="space-between">
                              <Text as="p" variant="bodySm">{statusLabel(item.status, lang)}</Text>
                              <Text as="p" variant="bodySm" tone="subdued">{item.count} · {p}%</Text>
                            </InlineStack>
                            <ProgressBar progress={p} size="small" />
                          </BlockStack>
                        );
                      })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "Baskı Dosyası Sağlığı" : "Print File Health"}
                  </Text>
                  <InlineGrid columns={2} gap="300">
                    {[
                      { label: lang === "tr" ? "Tasarım kaydı yok" : "Missing design", value: detail.fileHealth.missingDesign },
                      { label: lang === "tr" ? "Baskı dosyası yok" : "Missing print file", value: detail.fileHealth.missingPrintFile },
                      { label: lang === "tr" ? "Önizleme yok" : "Missing preview", value: detail.fileHealth.missingPreview },
                      { label: lang === "tr" ? "Katman verisi eksik" : "Missing layer data", value: detail.fileHealth.incompleteDesignData },
                    ].map((item) => (
                      <BlockStack gap="050" key={item.label}>
                        <Text as="p" variant="headingLg" tone={item.value > 0 ? "caution" : "success"}>{item.value}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">{item.label}</Text>
                      </BlockStack>
                    ))}
                  </InlineGrid>
                  {(detail.fileHealth.missingDesign + detail.fileHealth.missingPrintFile + detail.fileHealth.missingPreview) > 0 && (
                    <Button onClick={() => navigate("/app/orders")}>
                      {lang === "tr" ? "Siparişleri Kontrol Et" : "Check Orders"}
                    </Button>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>

          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "Gelir Etkisi" : "Revenue Impact"}
                  </Text>
                  <InlineGrid columns={2} gap="300">
                    <BlockStack gap="050">
                      <Text as="p" variant="headingLg">
                        {formatMoneyValue(detail.revenueImpact.customOrderValue, detail.revenueImpact.currencyCode, lang)}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">{lang === "tr" ? "özel tasarım geliri" : "custom design revenue"}</Text>
                    </BlockStack>
                    <BlockStack gap="050">
                      <Text as="p" variant="headingLg">
                        {formatMoneyValue(detail.revenueImpact.avgCustomOrderValue, detail.revenueImpact.currencyCode, lang)}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">{lang === "tr" ? "ortalama özel sipariş" : "avg. custom order"}</Text>
                    </BlockStack>
                  </InlineGrid>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {detail.revenueImpact.customOrders} {lang === "tr" ? "sipariş" : "orders"} · {detail.revenueImpact.customUnits} {lang === "tr" ? "adet" : "units"}
                    {!detail.revenueImpact.valueTracked
                      ? (lang === "tr" ? " · Yeni siparişlerde tutar otomatik dolacak." : " · Value will populate automatically for new orders.")
                      : ""}
                  </Text>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    {lang === "tr" ? "Son Aktiviteler" : "Recent Activity"}
                  </Text>
                  {detail.recentActivity.length === 0 ? <EmptyMetric lang={lang} /> : (
                    <BlockStack gap="200">
                      {detail.recentActivity.map((item, index) => (
                        <InlineStack key={`${item.type}-${item.createdAt}-${index}`} align="space-between" blockAlign="start">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {activityLabel(item.type, item.label, lang)}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {activityDetail(item.type, item.label, item.detail, lang)}
                            </Text>
                          </BlockStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {item.displayDate}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </InlineGrid>
        </BlockStack>

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
