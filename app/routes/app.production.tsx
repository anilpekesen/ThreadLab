import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import { useTranslation, useDict } from "~/i18n";
import dict from "~/i18n/admin/production";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Badge, Button, InlineStack, Box, Text, BlockStack,
  Thumbnail, IndexTable, useIndexResourceState, Banner, Grid,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { signedShopQuery } from "~/lib/signed-shop-link.server";
import { getOrders, getTodayOrders, bulkUpdateStatus, fulfillShopifyOrders } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { confirmPrintfulOrder, createPrintfulDraft, getPrintfulConnection, listPodOrders } from "~/models/printful.server";
import { getShopSubscription } from "~/models/billing.server";
import { PLANS, planKeyFromName } from "~/lib/billing.server";

const APP_URL = "https://app.printlabapp.com";

const STATUS_TONE: Record<string, "attention" | "info" | "success"> = {
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
  const { session } = await authenticate(request);
  const shop = session.shop;

  const sub = await getShopSubscription(shop);
  const planKey = planKeyFromName(sub?.plan_key) ?? "Starter";
  const plan = PLANS[planKey];
  const hasActiveSubscription = sub?.subscription_status === "active" || sub?.subscription_status === "trial";
  if (!hasActiveSubscription || !plan.allowProduction) {
    return json({ orders: [], withFile: 0, statusFilter: "", todayOnly: false, shop, zipQuery: "", locked: true, printful: null as null | { connected: boolean; pod: Record<string, { status: string; error: string; printfulOrderId: string | null; trackingUrl: string }> } });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "";
  const todayOnly = url.searchParams.get("today") === "1";
  let orders: Order[];
  if (todayOnly) {
    const statuses = statusFilter ? [statusFilter] : ["pending", "preparing"];
    orders = await getTodayOrders(shop, statuses);
  } else {
    orders = statusFilter
      ? await getOrders(shop, statusFilter)
      : await getOrders(shop, "pending").then(async (p) => [
          ...p,
          ...(await getOrders(shop, "preparing")),
        ]);
  }

  const withFile = orders.filter(
    (o) => o.designFrontPrintUrl || o.productionFileUrl,
  ).length;

  // Printful: bağlıysa her siparişin taslak/onay durumu
  const conn = await getPrintfulConnection(shop).catch(() => null);
  const pod: Record<string, { status: string; error: string; printfulOrderId: string | null; trackingUrl: string }> = {};
  if (conn) {
    for (const r of await listPodOrders(shop, [...new Set(orders.map((o) => o.shopifyOrderId))])) {
      pod[r.shopify_order_id] = { status: r.status, error: r.error, printfulOrderId: r.printful_order_id, trackingUrl: r.tracking_url };
    }
  }

  return json({
    printful: conn ? { connected: true, pod } : null,
    orders,
    withFile,
    statusFilter,
    todayOnly,
    shop: session.shop,
    zipQuery: signedShopQuery(session.shop, "/api/production-zip", 8 * 60 * 60),
    locked: false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const idsRaw = form.get("ids") as string;
  const ids = idsRaw ? idsRaw.split(",").filter(Boolean) : [];

  if (intent === "printful_draft" || intent === "printful_confirm") {
    const orderId = String(form.get("shopifyOrderId") ?? "");
    if (!orderId) return json({ ok: false });
    const r = intent === "printful_draft"
      ? await createPrintfulDraft(session.shop, orderId, { force: true })
      : await confirmPrintfulOrder(session.shop, orderId);
    return json({ ok: "ok" in r ? r.ok : r.status === "draft", printfulMessage: r.message ?? "" });
  }

  if (intent === "bulk_status" && ids.length) {
    const status = form.get("status") as string;
    await bulkUpdateStatus(ids, status);
    if (status === "shipped") {
      try {
        await fulfillShopifyOrders(admin, session.shop, ids);
      } catch (err) {
        console.error("[fulfill] production bulk-ship error:", err);
      }
    }
  }

  return json({ ok: true });
};

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "caution" | "success" | "critical" }) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="100">
          <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
          <Text as="p" variant="headingXl" fontWeight="bold" tone={tone}>{value}</Text>
        </BlockStack>
      </Box>
    </Card>
  );
}

function hasPrintFile(order: Order): boolean {
  return !!(order.designFrontPrintUrl || order.productionFileUrl);
}

const STATUS_VALUES = ["", "pending", "preparing", "printed"];

export default function Production() {
  const { orders, withFile, statusFilter, todayOnly, zipQuery, locked, printful } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const L = useDict(dict);

  if (locked) {
    return (
      <Page title={L.title}>
        <Banner tone="warning" title={L.planRequired}>
          <p>{L.lockedBody}</p>
          <Button onClick={() => navigate("/app/billing")}>{L.upgradePlan}</Button>
        </Banner>
      </Page>
    );
  }
  const fetcher = useFetcher();
  const { t, lang } = useTranslation();

  const resourceName = { singular: L.resourceSingular, plural: L.resourcePlural };
  const STATUSES = STATUS_VALUES.map((value) => ({
    label: value ? L.statusLabels[value] : L.allToday,
    value,
  }));
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);

  const [downloadState, setDownloadState] = useState<"idle" | "downloading">("idle");

  const handleZipDownload = useCallback(async () => {
    const ids = selectedResources.length ? selectedResources : orders.map((o) => o.id);
    if (!ids.length) return;
    setDownloadState("downloading");
    try {
      const res = await fetch(`/api/production-zip?${zipQuery}&ids=${ids.join(",")}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `baski-dosyalari-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } finally {
      setDownloadState("idle");
    }
  }, [selectedResources, orders]);

  const handleGangSheet = useCallback(() => {
    const ids = selectedResources.length ? selectedResources : orders
      .filter(hasPrintFile)
      .map((o) => o.id);
    if (!ids.length) return;
    navigate(`/app/gang-sheet?ids=${ids.join(",")}`);
  }, [selectedResources, orders, navigate]);

  const handleBulkStatus = useCallback(
    (status: string) => {
      if (!selectedResources.length) return;
      const fd = new FormData();
      fd.set("intent", "bulk_status");
      fd.set("ids", selectedResources.join(","));
      fd.set("status", status);
      fd.set("_lang", lang);
      fetcher.submit(fd, { method: "post" });
    },
    [selectedResources, fetcher, lang],
  );

  const today = new Date().toLocaleDateString(lang === "en" ? "en-US" : "tr-TR", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const rowMarkup = orders.map((o, index) => {
    const frontUrl = o.designFrontPrintUrl || o.productionFileUrl || "";
    const backUrl = o.designBackPrintUrl || "";
    const previewUrl = o.designFrontPreviewUrl || o.previewUrl || "";
    const hasFile = hasPrintFile(o);

    return (
      <IndexTable.Row
        id={o.id}
        key={o.id}
        selected={selectedResources.includes(o.id)}
        position={index}
      >
        {/* Önizleme */}
        <IndexTable.Cell>
          {previewUrl ? (
            <Thumbnail source={previewUrl} alt={L.designAlt} size="small" />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 6, background: "#f3f4f6",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>🎨</div>
          )}
        </IndexTable.Cell>

        {/* Sipariş no */}
        <IndexTable.Cell>
          <Text as="span" fontWeight="semibold">{o.orderNumber}</Text>
        </IndexTable.Cell>

        {/* Müşteri */}
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" fontWeight="semibold">{o.customerName}</Text>
            {o.customerEmail && (
              <Text as="span" variant="bodySm" tone="subdued">{o.customerEmail}</Text>
            )}
          </BlockStack>
        </IndexTable.Cell>

        {/* Ürün */}
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm">{o.productName}</Text>
            <InlineStack gap="100">
              {o.variantTitle && (
                <Badge tone="info" size="small">{o.variantTitle}</Badge>
              )}
              {(o.quantity ?? 1) > 1 && (
                <Badge tone="warning" size="small">{L.qty(o.quantity ?? 1)}</Badge>
              )}
            </InlineStack>
          </BlockStack>
        </IndexTable.Cell>

        {/* Durum */}
        <IndexTable.Cell>
          <Badge tone={STATUS_TONE[o.productionStatus] ?? "attention"}>
            {L.statusLabels[o.productionStatus] ?? o.productionStatus}
          </Badge>
        </IndexTable.Cell>

        {/* Dosya + İndir */}
        <IndexTable.Cell>
          {hasFile ? (
            <InlineStack gap="150" blockAlign="center">
              <Badge tone="success">{L.hasFile}</Badge>
              {frontUrl && (
                <a href={`${APP_URL}/api/download?url=${encodeURIComponent(frontUrl)}&filename=on-baski.png`}
                  target="_blank" rel="noreferrer" download>
                  <Button size="slim" variant="plain">{L.front}</Button>
                </a>
              )}
              {backUrl && (
                <a href={`${APP_URL}/api/download?url=${encodeURIComponent(backUrl)}&filename=arka-baski.png`}
                  target="_blank" rel="noreferrer" download>
                  <Button size="slim" variant="plain">{L.back}</Button>
                </a>
              )}
            </InlineStack>
          ) : (
            <Badge tone="attention">{L.noFile}</Badge>
          )}
        </IndexTable.Cell>

        {/* Printful: taslak → onay → kargo */}
        {printful && (
          <IndexTable.Cell>
            {(() => {
              const p = printful.pod[o.shopifyOrderId];
              const busy = fetcher.state !== "idle" && fetcher.formData?.get("shopifyOrderId") === o.shopifyOrderId;
              const send = (intent: string) => fetcher.submit({ intent, shopifyOrderId: o.shopifyOrderId }, { method: "POST" });
              if (!p) return <Button size="slim" loading={busy} onClick={() => send("printful_draft")}>{L.pfDraft}</Button>;
              if (p.status === "draft") {
                return (
                  <InlineStack gap="100" blockAlign="center">
                    <Badge tone="info">{L.pfStatus.draft}</Badge>
                    <Button size="slim" variant="primary" loading={busy} onClick={() => send("printful_confirm")}>{L.pfConfirm}</Button>
                  </InlineStack>
                );
              }
              if (p.status === "needs_access" || p.status === "error") {
                return (
                  <BlockStack gap="050">
                    <Badge tone="critical">{L.pfStatus[p.status]}</Badge>
                    {p.error && <Text as="span" variant="bodySm" tone="subdued">{p.error}</Text>}
                    <Button size="slim" variant="plain" loading={busy} onClick={() => send("printful_draft")}>{L.pfRetry}</Button>
                  </BlockStack>
                );
              }
              return (
                <InlineStack gap="100" blockAlign="center">
                  <Badge tone={p.status === "shipped" ? "success" : p.status === "failed" || p.status === "canceled" ? "critical" : "attention"}>
                    {L.pfStatus[p.status] ?? p.status}
                  </Badge>
                  {p.trackingUrl && <a href={p.trackingUrl} target="_blank" rel="noreferrer">{L.pfTrack}</a>}
                </InlineStack>
              );
            })()}
          </IndexTable.Cell>
        )}
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title={`${t("production.title")} — ${today}`}
      primaryAction={{
        content: downloadState === "downloading" ? L.downloading : t("production.downloadZip"),
        onAction: handleZipDownload,
        disabled: orders.length === 0 || downloadState === "downloading",
      }}
      secondaryActions={[
        {
          content: L.printQueue,
          onAction: () => navigate("/app/print-queue"),
          disabled: orders.filter(hasPrintFile).length === 0,
        },
        {
          content: t("production.openGangSheet"),
          onAction: handleGangSheet,
          disabled: orders.filter(hasPrintFile).length === 0,
        },
        {
          content: L.refresh,
          onAction: () => navigate("/app/production"),
        },
      ]}
    >
      <BlockStack gap="400">
        <PageHelper sections={L.help} />
        {/* İstatistikler */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label={todayOnly ? L.todayTotal : L.totalOrders} value={orders.length} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label={L.filesReady} value={withFile} tone="success" />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label={L.filesMissing} value={orders.length - withFile} tone={orders.length - withFile > 0 ? "caution" : undefined} />
          </Grid.Cell>
        </Grid>

        {/* Seçim banner */}
        {selectedResources.length > 0 && (
          <Banner tone="info">
            <InlineStack gap="300" blockAlign="center" wrap>
              <Text as="span" variant="bodySm">
                <strong>{selectedResources.length}</strong>{L.selectedSuffix}
              </Text>
              <Button
                size="slim"
                onClick={() => handleBulkStatus("preparing")}
                loading={fetcher.state === "submitting"}
              >
                {L.markPreparing}
              </Button>
              <Button
                size="slim"
                onClick={() => handleBulkStatus("printed")}
                loading={fetcher.state === "submitting"}
              >
                {L.markPrinted}
              </Button>
              <Button size="slim" variant="secondary" onClick={handleZipDownload}>
                {L.downloadSelectedZip}
              </Button>
              <Button size="slim" variant="secondary" onClick={handleGangSheet}>
                {L.createGangSheet}
              </Button>
            </InlineStack>
          </Banner>
        )}

        {/* Filtre + Tablo */}
        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack gap="200" wrap align="space-between">
              <InlineStack gap="200" wrap>
                {STATUSES.map((s) => (
                  <Button
                    key={s.value}
                    pressed={statusFilter === s.value || (!statusFilter && s.value === "")}
                    size="slim"
                    onClick={() => navigate(`/app/production${s.value ? `?status=${s.value}` : ""}`)}
                  >
                    {s.label}
                  </Button>
                ))}
              </InlineStack>
              <Button
                size="slim"
                pressed={todayOnly}
                onClick={() => navigate(`/app/production${todayOnly ? "" : "?today=1"}`)}
              >
                {L.todayOnly}
              </Button>
            </InlineStack>
          </Box>

          {orders.length === 0 ? (
            <Box padding="800">
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" variant="headingMd" alignment="center">
                  {L.emptyTitle}
                </Text>
                <Text as="p" tone="subdued" alignment="center">
                  {L.emptyBody}
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={resourceName}
              itemCount={orders.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "" },
                { title: L.colOrder },
                { title: L.colCustomer },
                { title: L.colProduct },
                { title: L.colStatus },
                { title: L.colPrintFile },
                ...(printful ? [{ title: "Printful" }] : []),
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

        {/* Alt bilgi */}
        <Box paddingBlock="200">
          <Divider />
        </Box>
        <Text as="p" variant="bodySm" tone="subdued">
          {L.zipFooter}
        </Text>
      </BlockStack>
    </Page>
  );
}
