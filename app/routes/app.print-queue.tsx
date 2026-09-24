import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useCallback, useMemo, useState } from "react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Grid,
  InlineStack,
  Page,
  RangeSlider,
  Select,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrdersWithPrintFiles, bulkUpdateStatus, fulfillShopifyOrders } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getShopSubscription } from "~/models/billing.server";
import { planKeyFromName } from "~/lib/billing.server";
import { useDict, useTranslation, pickDict } from "~/i18n";
import { langFromRequest } from "~/i18n/server";
import dict from "~/i18n/admin/print-queue";
import { PageHelper } from "~/components/PageHelper";

const SHEET_PRESET_VALUES = ["dtf60", "dtf100", "a3", "a3l", "a4", "a4l"];

function canUsePrintQueue(planKey: string, subscriptionStatus?: string | null): boolean {
  return (planKey === "Pro" || planKey === "Business")
    && (subscriptionStatus === "active" || subscriptionStatus === "trial");
}

interface QueueGroup {
  key: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  previewUrl: string;
  totalQty: number;
  orderIds: string[];
  variants: Array<{ title: string; qty: number }>;
  hasFront: boolean;
  hasBack: boolean;
  status: string;
}

function groupOrders(orders: Order[]): QueueGroup[] {
  const map = new Map<string, QueueGroup>();
  for (const order of orders) {
    const key = order.shopifyOrderId || order.id;
    if (!map.has(key)) {
      map.set(key, {
        key,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        productName: (order.productName || "").split(" - ")[0] || order.productName || "",
        previewUrl: order.designFrontPreviewUrl || order.previewUrl || order.designFrontPrintUrl || order.productionFileUrl || "",
        totalQty: 0,
        orderIds: [],
        variants: [],
        hasFront: false,
        hasBack: false,
        status: order.productionStatus,
      });
    }
    const group = map.get(key)!;
    group.totalQty += Math.max(1, order.quantity ?? 1);
    group.orderIds.push(order.id);
    if (order.variantTitle) group.variants.push({ title: order.variantTitle, qty: order.quantity ?? 1 });
    if (order.designFrontPrintUrl || order.productionFileUrl) group.hasFront = true;
    if (order.designBackPrintUrl) group.hasBack = true;
  }
  return Array.from(map.values());
}

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const sub = await getShopSubscription(shop);
  const planKey = planKeyFromName(sub?.plan_key) ?? "Pro";
  if (!canUsePrintQueue(planKey, sub?.subscription_status)) {
    return json({ orders: [], locked: true, shop });
  }

  const orders = await getOrdersWithPrintFiles(shop, ["pending", "preparing"]);
  return json({ orders, locked: false, shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const sub = await getShopSubscription(session.shop);
  const planKey = planKeyFromName(sub?.plan_key) ?? "Pro";
  const form = await request.formData();
  if (!canUsePrintQueue(planKey, sub?.subscription_status)) {
    return json({ ok: false, error: pickDict(dict, langFromRequest(request, form)).planRequired }, { status: 403 });
  }
  const intent = String(form.get("intent") || "");
  const ids = String(form.get("ids") || "").split(",").filter(Boolean);
  if (intent === "bulk_status" && ids.length) {
    const status = String(form.get("status") || "");
    if (["preparing", "printed", "ready", "shipped"].includes(status)) {
      await bulkUpdateStatus(ids, status);
      if (status === "shipped") {
        try {
          await fulfillShopifyOrders(admin, session.shop, ids);
        } catch (err) {
          console.error("[print-queue] fulfill error:", err);
        }
      }
    }
  }
  return json({ ok: true });
};

export default function PrintQueue() {
  const { orders, locked, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const L = useDict(dict);
  const { lang } = useTranslation();
  const SHEET_PRESETS = SHEET_PRESET_VALUES.map((value) => ({ label: L.sheetPresets[value], value }));
  const groups = useMemo(() => groupOrders(orders), [orders]);
  const [selectedKeys, setSelectedKeys] = useState(groups.map((g) => g.key));
  const [preset, setPreset] = useState("dtf60");
  const [margin, setMargin] = useState(20);
  const [columns, setColumns] = useState("0");
  const [labels, setLabels] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroups = useMemo(
    () => groups.filter((g) => selectedKeys.includes(g.key)),
    [groups, selectedKeys],
  );
  const selectedIds = selectedGroups.flatMap((g) => g.orderIds);
  const selectedQty = selectedGroups.reduce((sum, g) => sum + g.totalQty, 0);

  const toggleGroup = useCallback((key: string) => {
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) => prev.length === groups.length ? [] : groups.map((g) => g.key));
  }, [groups]);

  const buildZip = useCallback(async () => {
    if (!selectedIds.length) return;
    setDownloading(true);
    setError(null);
    const params = new URLSearchParams({
      shop,
      ids: selectedIds.join(","),
      preset,
      margin: String(margin),
      cols: columns,
      labels: labels ? "1" : "0",
    });
    try {
      const res = await fetch(`/api/print-queue?${params.toString()}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `print-queue-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.unknownError);
    } finally {
      setDownloading(false);
    }
  }, [columns, labels, margin, preset, selectedIds, shop, L]);

  const setBulkStatus = useCallback((status: string) => {
    if (!selectedIds.length) return;
    const fd = new FormData();
    fd.set("intent", "bulk_status");
    fd.set("ids", selectedIds.join(","));
    fd.set("status", status);
    fd.set("_lang", lang);
    fetcher.submit(fd, { method: "post" });
  }, [fetcher, selectedIds, lang]);

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

  return (
    <Page
      title={L.title}
      subtitle={L.subtitle}
      backAction={{ content: L.production, onAction: () => navigate("/app/production") }}
      primaryAction={{
        content: downloading ? L.preparing : L.buildPackage,
        onAction: buildZip,
        disabled: selectedIds.length === 0 || downloading,
        loading: downloading,
      }}
      secondaryActions={[
        { content: L.gangSheet, onAction: () => navigate(`/app/gang-sheet?ids=${selectedIds.join(",")}`), disabled: selectedIds.length === 0 },
        { content: L.refresh, onAction: () => navigate("/app/print-queue") },
      ]}
    >
      <BlockStack gap="500">
        <PageHelper sections={L.help} />
        {error && <Banner tone="critical" title={L.buildFailed} onDismiss={() => setError(null)}><p>{error}</p></Banner>}

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{L.selectedOrders}</Text>
                  <Text as="p" variant="headingXl">{selectedGroups.length}</Text>
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{L.printQty}</Text>
                  <Text as="p" variant="headingXl">{selectedQty}</Text>
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{L.queuedOrders}</Text>
                  <Text as="p" variant="headingXl">{groups.length}</Text>
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>
        </Grid>

        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">{L.autoPackageSettings}</Text>
                  <Divider />
                  <Select label={L.sheetSize} options={SHEET_PRESETS} value={preset} onChange={setPreset} />
                  <Select
                    label={L.columns}
                    options={[
                      { label: L.auto, value: "0" },
                      { label: L.nColumns(2), value: "2" },
                      { label: L.nColumns(3), value: "3" },
                      { label: L.nColumns(4), value: "4" },
                      { label: L.nColumns(5), value: "5" },
                      { label: L.nColumns(6), value: "6" },
                    ]}
                    value={columns}
                    onChange={setColumns}
                  />
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">{L.margin(margin)}</Text>
                    <RangeSlider label="" min={0} max={100} step={5} value={margin} onChange={(v) => setMargin(typeof v === "number" ? v : v[0])} />
                  </BlockStack>
                  <Checkbox label={L.printLabels} checked={labels} onChange={setLabels} />
                  <Banner tone="info">
                    <p>{L.zipInfo}</p>
                  </Banner>
                  <Button variant="primary" onClick={buildZip} loading={downloading} disabled={!selectedIds.length}>
                    {L.buildPackage}
                  </Button>
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 8, xl: 8 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">{L.title}</Text>
                    <InlineStack gap="200">
                      <Button size="slim" variant="plain" onClick={toggleAll}>
                        {selectedKeys.length === groups.length ? L.deselectAll : L.selectAll}
                      </Button>
                      <Button size="slim" onClick={() => setBulkStatus("printed")} loading={fetcher.state === "submitting"} disabled={!selectedIds.length}>
                        {L.markPrinted}
                      </Button>
                      <Button size="slim" onClick={() => setBulkStatus("ready")} loading={fetcher.state === "submitting"} disabled={!selectedIds.length}>
                        {L.markReady}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  {groups.length === 0 ? (
                    <Box padding="800">
                      <Text as="p" tone="subdued" alignment="center">{L.empty}</Text>
                    </Box>
                  ) : (
                    <BlockStack gap="200">
                      {groups.map((group) => {
                        const selected = selectedKeys.includes(group.key);
                        return (
                          <div
                            key={group.key}
                            onClick={() => toggleGroup(group.key)}
                            style={{
                              border: `1px solid ${selected ? "#2563eb" : "#e5e7eb"}`,
                              background: selected ? "#eff6ff" : "#fff",
                              borderRadius: 8,
                              padding: 12,
                              cursor: "pointer",
                            }}
                          >
                            <InlineStack gap="300" blockAlign="center">
                              <Checkbox label="" checked={selected} onChange={() => toggleGroup(group.key)} />
                              {group.previewUrl && <Thumbnail source={group.previewUrl} alt={L.designAlt} size="small" />}
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">{group.orderNumber}</Text>
                                  <Badge tone="warning">{L.qty(group.totalQty)}</Badge>
                                  <Badge tone={group.status === "pending" ? "attention" : "info"}>{L.statusLabels[group.status] ?? group.status}</Badge>
                                  {group.hasFront && <Badge tone="success">{L.front}</Badge>}
                                  {group.hasBack && <Badge>{L.back}</Badge>}
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {group.customerName} · {group.productName}
                                </Text>
                                {group.variants.length > 0 && (
                                  <InlineStack gap="100" wrap>
                                    {group.variants.map((v, idx) => (
                                      <Badge key={`${v.title}-${idx}`} tone="info">{`${v.title} ×${v.qty}`}</Badge>
                                    ))}
                                  </InlineStack>
                                )}
                              </BlockStack>
                            </InlineStack>
                          </div>
                        );
                      })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}
