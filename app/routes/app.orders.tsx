import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState, useMemo } from "react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Badge, Button, InlineStack, Box, Text, BlockStack,
  Thumbnail, IndexTable, useIndexResourceState, Banner,
  Grid, Modal,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrders, bulkUpdateStatus, getDashboardStats, syncOrdersFromAdmin, fulfillShopifyOrders } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { query } from "~/lib/db.server";

const STATUSES = [
  { labelKey: "status.all" as const, value: "" },
  { labelKey: "status.pending" as const, value: "pending" },
  { labelKey: "status.preparing" as const, value: "preparing" },
  { labelKey: "status.printed" as const, value: "printed" },
  { labelKey: "status.ready" as const, value: "ready" },
  { labelKey: "status.shipped" as const, value: "shipped" },
];

const NEXT_STATUS: Record<string, string> = {
  pending: "preparing",
  preparing: "printed",
  printed: "ready",
  ready: "shipped",
};

const STATUS_KEYS: Record<string, "status.pending" | "status.preparing" | "status.printed" | "status.ready" | "status.shipped"> = {
  pending: "status.pending",
  preparing: "status.preparing",
  printed: "status.printed",
  ready: "status.ready",
  shipped: "status.shipped",
};

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0, preparing: 1, printed: 2, ready: 3, shipped: 4, cancelled: 5,
};

const BADGE_TONE: Record<string, "info" | "attention" | "success" | "warning" | "new"> = {
  pending: "attention",
  preparing: "info",
  printed: "info",
  ready: "success",
  shipped: "success",
};

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const forceSync = url.searchParams.get("sync") === "1";
  const resetOrders = url.searchParams.get("reset") === "1";

  const activeStatus = status ?? "";
  let syncError: string | null = null;
  let syncCount = 0;
  if (forceSync || resetOrders) {
    try {
      if (resetOrders) {
        await query("DELETE FROM orders WHERE shop = $1", [session.shop]);
      }
      syncCount = await syncOrdersFromAdmin(admin, session.shop);
    } catch (e) {
      if (e instanceof Response && e.status >= 300 && e.status < 400) throw e;
      if (e instanceof Response) {
        const body = await e.text().catch(() => "");
        console.error("[sync] Response error:", e.status, body.slice(0, 500));
        syncError = `HTTP ${e.status}: ${body.slice(0, 200)}`;
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[sync] Error:", msg);
        syncError = msg;
      }
    }
  }

  const [orders, stats] = await Promise.all([
    getOrders(session.shop, activeStatus || undefined),
    getDashboardStats(session.shop),
  ]);
  return json({ orders, status: activeStatus, stats, shop: session.shop, syncError, syncCount });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const id = form.get("id") as string;
  const idsRaw = form.get("ids") as string;
  const status = form.get("status") as string;

  const ids = idsRaw ? idsRaw.split(",").filter(Boolean) : (id ? [id] : []);
  if (ids.length) {
    await bulkUpdateStatus(ids, status);
    if (status === "shipped") {
      try {
        await fulfillShopifyOrders(admin, session.shop, ids);
      } catch (err) {
        console.error("[fulfill] orders ship error:", err);
      }
    }
  }
  return json({ ok: true });
};

interface OrderGroup {
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  previewUrl: string;
  createdAt: string;
  status: string;
  totalQty: number;
  variants: Array<{ id: string; variantTitle: string; quantity: number }>;
  frontPrintUrl: string;
  backPrintUrl: string;
  hasMissingSurcharge: boolean;
  ids: string[];
  representativeId: string;
}

function groupOrders(orders: Order[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const o of orders) {
    const key = o.shopifyOrderId || o.id;
    if (!map.has(key)) {
      map.set(key, {
        shopifyOrderId: key,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        productName: (o.productName || "").split(" - ")[0] || o.productName || "",
        previewUrl: o.designFrontPreviewUrl || o.previewUrl || "",
        createdAt: o.createdAt,
        status: o.productionStatus,
        totalQty: 0,
        variants: [],
        frontPrintUrl: o.designFrontPrintUrl || o.productionFileUrl || "",
        backPrintUrl: o.designBackPrintUrl || "",
        hasMissingSurcharge: false,
        ids: [],
        representativeId: o.id,
      });
    }
    const g = map.get(key)!;
    g.ids.push(o.id);
    g.totalQty += o.quantity ?? 1;
    g.variants.push({ id: o.id, variantTitle: o.variantTitle, quantity: o.quantity ?? 1 });
    if (o.missingSurcharge) g.hasMissingSurcharge = true;
    if ((STATUS_PRIORITY[o.productionStatus] ?? 99) < (STATUS_PRIORITY[g.status] ?? 99)) {
      g.status = o.productionStatus;
    }
    if (!g.previewUrl && (o.designFrontPreviewUrl || o.previewUrl)) {
      g.previewUrl = o.designFrontPreviewUrl || o.previewUrl || "";
    }
    if (!g.frontPrintUrl && (o.designFrontPrintUrl || o.productionFileUrl)) {
      g.frontPrintUrl = o.designFrontPrintUrl || o.productionFileUrl || "";
    }
    if (!g.backPrintUrl && o.designBackPrintUrl) {
      g.backPrintUrl = o.designBackPrintUrl;
    }
  }
  return Array.from(map.values());
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <Text as="p" variant="headingXl" fontWeight="bold"
            tone={tone as "critical" | "caution" | "success" | undefined}>
            {value}
          </Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function Orders() {
  const { orders, status, stats, shop, syncError, syncCount } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const { t, lang } = useTranslation();
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const groups = useMemo(() => groupOrders(orders), [orders]);

  const resourceName = { singular: t("common.order"), plural: t("common.orders") };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(groups.map((g) => ({ id: g.shopifyOrderId })));

  const shopDomain = shop.replace(".myshopify.com", "");

  const rowMarkup = groups.map((g, index) => {
    const next = NEXT_STATUS[g.status];
    const shopifyOrderUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${g.shopifyOrderId}`;

    return (
      <IndexTable.Row
        id={g.shopifyOrderId}
        key={g.shopifyOrderId}
        selected={selectedResources.includes(g.shopifyOrderId)}
        position={index}
        onClick={() => navigate(`/app/orders/${g.representativeId}`)}
      >
        {/* Önizleme */}
        <IndexTable.Cell>
          {g.previewUrl ? (
            <Thumbnail source={g.previewUrl} alt="Tasarım" size="small" />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 6,
              background: "#f3f4f6", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 18,
            }}>🎨</div>
          )}
        </IndexTable.Cell>

        {/* Sipariş no */}
        <IndexTable.Cell>
          <a
            href={shopifyOrderUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontWeight: 600, color: "#2c6ecb", textDecoration: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            {g.orderNumber}
          </a>
        </IndexTable.Cell>

        {/* Müşteri */}
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" fontWeight="semibold">{g.customerName}</Text>
            {g.customerEmail && (
              <Text as="span" variant="bodySm" tone="subdued">{g.customerEmail}</Text>
            )}
          </BlockStack>
        </IndexTable.Cell>

        {/* Ürün + Tüm Varyantlar */}
        <IndexTable.Cell>
          <BlockStack gap="100">
            <Text as="span" variant="bodySm">{g.productName}</Text>
            <InlineStack gap="100" wrap>
              {g.variants.map((v) => (
                <Badge key={v.id} tone="info" size="small">
                  {v.variantTitle ? `${v.variantTitle} ×${v.quantity}` : `×${v.quantity}`}
                </Badge>
              ))}
            </InlineStack>
          </BlockStack>
        </IndexTable.Cell>

        {/* Durum */}
        <IndexTable.Cell>
          <InlineStack gap="150" blockAlign="center">
            <Badge tone={BADGE_TONE[g.status] ?? "new"}>
              {STATUS_KEYS[g.status] ? t(STATUS_KEYS[g.status]) : g.status}
            </Badge>
            {g.hasMissingSurcharge && (
              <Badge tone="critical">{t("orders.missingSurcharge")}</Badge>
            )}
          </InlineStack>
        </IndexTable.Cell>

        {/* Tarih */}
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {new Date(g.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "tr-TR", {
              day: "2-digit", month: "short", year: "numeric",
            })}
          </Text>
        </IndexTable.Cell>

        {/* İşlemler */}
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center" wrap>
            {g.frontPrintUrl && (
              <a href={g.frontPrintUrl} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}>
                <Button size="slim" variant="plain">⬇ Ön</Button>
              </a>
            )}
            {g.backPrintUrl && (
              <a href={g.backPrintUrl} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}>
                <Button size="slim" variant="plain">⬇ Arka</Button>
              </a>
            )}
            {next ? (
              <fetcher.Form method="post" onClick={(e) => e.stopPropagation()}>
                <input type="hidden" name="ids" value={g.ids.join(",")} />
                <input type="hidden" name="status" value={next} />
                <Button submit size="slim" variant="secondary">
                  → {STATUS_KEYS[next] ? t(STATUS_KEYS[next]) : next}
                </Button>
              </fetcher.Form>
            ) : (
              <Text as="span" variant="bodySm" tone="success">✓ Tamamlandı</Text>
            )}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title={t("orders.printedOrders")}
      primaryAction={{
        content: t("common.refresh"),
        onAction: () => navigate("/app/orders?sync=1"),
      }}
      secondaryActions={[{
        content: "Temizle ve Yeniden Senkronize Et",
        destructive: true,
        onAction: () => setResetModalOpen(true),
      }]}
    >
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Siparişleri sıfırla"
        primaryAction={{
          content: "Evet, sil ve yeniden çek",
          destructive: true,
          onAction: () => { setResetModalOpen(false); navigate("/app/orders?reset=1"); },
        }}
        secondaryActions={[{
          content: "Vazgeç",
          onAction: () => setResetModalOpen(false),
        }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Bu mağazadaki tüm siparişler veritabanından silinecek ve Shopify'dan yeniden çekilecek.
            </Text>
            <Text as="p" tone="subdued">
              Üretim durumları (Hazırlanıyor, Baskıda vb.) sıfırlanır. Gönderilmiş siparişler Shopify'daki durumuna göre tekrar "Gönderildi" olarak gelecektir.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
      <BlockStack gap="400">
        <PageHelper sections={[
          { titleKey: "helper.orders.1.title", bodyKey: "helper.orders.1.body" },
          { titleKey: "helper.orders.2.title", bodyKey: "helper.orders.2.body" },
          { titleKey: "helper.orders.3.title", bodyKey: "helper.orders.3.body" },
        ]} />
        {syncError && (
          <Banner tone={syncError.includes("protected") || syncError.includes("approved") ? "warning" : "critical"}
            title={syncError.includes("protected") || syncError.includes("approved")
              ? t("orders.apiAuthRequired")
              : `Sync hatası: ${syncError}`}>
            {(syncError.includes("protected") || syncError.includes("approved")) && (
              <p>
                Shopify'da sipariş verisi okumak için Partner Dashboard'dan
                &quot;Protected Customer Data&quot; başvurusu yapılması gerekiyor.{" "}
                <a href="https://partners.shopify.com" target="_blank" rel="noreferrer">
                  partners.shopify.com
                </a>{" "}
                → DesignKit → API access → Protected customer data access → Request access
              </p>
            )}
          </Banner>
        )}
        {!syncError && syncCount > 0 && (
          <Banner tone="success" title={`${syncCount} ${t("orders.synced")}`} />
        )}
        {/* İstatistik kartları */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label={t("dashboard.totalOrders")} value={stats.total} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label={t("dashboard.today")} value={stats.today} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label={t("dashboard.pendingProduction")} value={stats.pendingProduction} tone="caution" />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label={t("dashboard.readyShipped")} value={stats.ready} tone="success" />
          </Grid.Cell>
          {stats.missingSurcharge > 0 && (
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <StatCard label={t("orders.missingBadge")} value={stats.missingSurcharge} tone="critical" />
            </Grid.Cell>
          )}
        </Grid>

        {/* Filtre + Tablo */}
        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack gap="200" wrap>
              {STATUSES.map((s) => (
                <Button
                  key={s.value}
                  pressed={status === s.value || (!status && s.value === "")}
                  size="slim"
                  onClick={() => navigate(`/app/orders${s.value ? `?status=${s.value}` : ""}`)}
                >
                  {t(s.labelKey)}
                </Button>
              ))}
            </InlineStack>
          </Box>

          {groups.length === 0 ? (
            <Box padding="800">
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" variant="headingMd" alignment="center">
                  {status
                    ? `"${STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}" durumunda sipariş yok`
                    : t("orders.noOrders")}
                </Text>
                <Text as="p" tone="subdued" alignment="center">
                  Tasarım içeren siparişler checkout tamamlandığında otomatik buraya eklenir.
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={groups.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "" },
                { title: t("common.order") },
                { title: t("common.customer") },
                { title: t("common.product") },
                { title: t("common.status") },
                { title: t("common.date") },
                { title: "İşlem" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
