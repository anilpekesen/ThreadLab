import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "~/i18n";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Box, Select, RangeSlider, Thumbnail, Checkbox, Banner,
  Grid, Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrdersWithPrintFiles, getOrdersByIds } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getShopSubscription } from "~/models/billing.server";
import { PLANS, planKeyFromName } from "~/lib/billing.server";

const SHEET_PRESETS = [
  { label: "DTF Rulo 60cm (150dpi — 3543px)", value: "dtf60" },
  { label: "DTF Rulo 100cm (150dpi — 5906px)", value: "dtf100" },
  { label: "A3 Dikey (300dpi — 3508×4961px)", value: "a3" },
  { label: "A3 Yatay (300dpi — 4961×3508px)", value: "a3l" },
  { label: "A4 Dikey (300dpi — 2480×3508px)", value: "a4" },
  { label: "A4 Yatay (300dpi — 3508×2480px)", value: "a4l" },
];

const PRESET_DIMS: Record<string, { w: number; h: number | null }> = {
  dtf60:  { w: 3543, h: null },
  dtf100: { w: 5906, h: null },
  a3:     { w: 3508, h: 4961 },
  a3l:    { w: 4961, h: 3508 },
  a4:     { w: 2480, h: 3508 },
  a4l:    { w: 3508, h: 2480 },
};

interface OrderGroup {
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  productBaseName: string;
  previewUrl: string;
  totalQty: number;
  orderIds: string[];
  variants: Array<{ variantTitle: string; quantity: number }>;
  hasFront: boolean;
  hasBack: boolean;
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
        productBaseName: (o.productName || "").split(" - ")[0] || o.productName || "",
        previewUrl: o.designFrontPrintUrl || o.productionFileUrl || o.designFrontPreviewUrl || o.previewUrl || "",
        totalQty: 0,
        orderIds: [],
        variants: [],
        hasFront: false,
        hasBack: false,
      });
    }
    const g = map.get(key)!;
    g.orderIds.push(o.id);
    g.totalQty += o.quantity ?? 1;
    if (o.variantTitle) g.variants.push({ variantTitle: o.variantTitle, quantity: o.quantity ?? 1 });
    if (o.designFrontPrintUrl || o.productionFileUrl) g.hasFront = true;
    if (o.designBackPrintUrl) g.hasBack = true;
  }
  return Array.from(map.values());
}

function hasPrintFile(order: Order): boolean {
  return !!(order.designFrontPrintUrl || order.productionFileUrl || order.designBackPrintUrl);
}

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
  if (!hasActiveSubscription || !plan.allowGangSheet) {
    return json({ printableOrders: [], shop, locked: true });
  }

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const preselectedIds = idsParam.split(",").filter(Boolean);

  let orders: Order[];
  if (preselectedIds.length) {
    orders = await getOrdersByIds(shop, preselectedIds);
  } else {
    orders = await getOrdersWithPrintFiles(shop);
  }

  const printableOrders = orders.filter(hasPrintFile);
  return json({ printableOrders, shop, locked: false });
};

export default function GangSheet() {
  const { printableOrders, shop, locked } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (locked) {
    return (
      <Page title="Gang Sheet">
        <Banner tone="warning" title="Pro veya Business planı gerekli">
          <p>Gang Sheet özelliği Pro ve Business planlarında kullanılabilir.</p>
          <Button onClick={() => navigate("/app/billing")}>Planı Yükselt</Button>
        </Banner>
      </Page>
    );
  }

  const groups = useMemo(() => groupOrders(printableOrders), [printableOrders]);

  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    groups.map((g) => g.shopifyOrderId),
  );
  const [preset, setPreset] = useState("dtf60");
  const [margin, setMargin] = useState(20);
  const [columns, setColumns] = useState("0");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleGroup = useCallback((key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.length === groups.length ? [] : groups.map((g) => g.shopifyOrderId),
    );
  }, [groups]);

  const selectedGroups = useMemo(
    () => groups.filter((g) => selectedKeys.includes(g.shopifyOrderId)),
    [groups, selectedKeys],
  );

  const allOrderIds = useMemo(
    () => selectedGroups.flatMap((g) => g.orderIds),
    [selectedGroups],
  );

  const totalPrints = useMemo(
    () => selectedGroups.reduce((s, g) => s + g.totalQty, 0),
    [selectedGroups],
  );

  const handleGenerate = useCallback(async () => {
    if (!allOrderIds.length) return;
    setGenerating(true);
    setError(null);
    const params = new URLSearchParams({
      ids: allOrderIds.join(","),
      preset,
      margin: String(margin),
      cols: columns,
      shop,
    });
    try {
      const res = await fetch(`/api/gang-sheet?${params.toString()}`);
      if (!res.ok) {
        const text = await res.text();
        setError(`Hata: ${text}`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `gang-sheet-${preset}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setGenerating(false);
    }
  }, [allOrderIds, preset, margin, columns]);

  const dims = PRESET_DIMS[preset];
  const dimsLabel = dims
    ? `${dims.w}px × ${dims.h ? `${dims.h}px` : "otomatik yükseklik"}`
    : "";

  return (
    <Page
      title={t("gangSheet.title")}
      backAction={{ content: "Üretim", onAction: () => navigate("/app/production") }}
      primaryAction={{
        content: generating ? t("gangSheet.generating") : t("gangSheet.generate"),
        onAction: handleGenerate,
        disabled: selectedKeys.length === 0 || generating,
        loading: generating,
      }}
    >
      <BlockStack gap="500">
        <Text as="p" tone="subdued">{t("gangSheet.desc")}</Text>

        {error && <Banner tone="critical" title={error} onDismiss={() => setError(null)} />}

        <Grid>
          {/* Sol: Ayarlar */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 5, xl: 5 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">{t("gangSheet.settings")}</Text>
                  <Divider />

                  <Select
                    label={t("gangSheet.sheetSize")}
                    options={SHEET_PRESETS}
                    value={preset}
                    onChange={setPreset}
                    helpText={dimsLabel}
                  />

                  <div>
                    <Text as="p" variant="bodySm" tone="subdued">{t("gangSheet.margin")}: {margin}px</Text>
                    <Box paddingBlockStart="200">
                      <RangeSlider
                        label=""
                        value={margin}
                        onChange={(v) => setMargin(typeof v === "number" ? v : v[0])}
                        min={0}
                        max={100}
                        step={5}
                        output
                      />
                    </Box>
                  </div>

                  <Select
                    label="Sütun sayısı (yan yana)"
                    options={[
                      { label: "Otomatik (fiziksel boyut)", value: "0" },
                      { label: "2 sütun", value: "2" },
                      { label: "3 sütun", value: "3" },
                      { label: "4 sütun", value: "4" },
                      { label: "5 sütun", value: "5" },
                      { label: "6 sütun", value: "6" },
                    ]}
                    value={columns}
                    onChange={setColumns}
                    helpText={columns === "0" ? "Fiziksel baskı boyutuna göre otomatik" : `Her satırda en az ${columns} tasarım`}
                  />

                  <Divider />

                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Tasarım yüzü: ön ve arka planlar otomatik eklenmektedir.
                    </Text>
                  </Banner>

                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {selectedKeys.length} / {groups.length} sipariş seçildi
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Toplam baskı: <strong>{totalPrints}</strong> adet
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Sayfa: {dimsLabel}
                    </Text>
                  </BlockStack>

                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("gangSheet.note")}
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>

          {/* Sağ: Sipariş seçimi */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 3, lg: 7, xl: 7 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">{t("gangSheet.selectOrders")}</Text>
                    <Button size="slim" variant="plain" onClick={toggleAll}>
                      {selectedKeys.length === groups.length ? "Tümünü Kaldır" : t("production.selectAll")}
                    </Button>
                  </InlineStack>

                  <Divider />

                  {groups.length === 0 ? (
                    <Box padding="600">
                      <Text as="p" tone="subdued" alignment="center">{t("gangSheet.noOrders")}</Text>
                    </Box>
                  ) : (
                    <BlockStack gap="200">
                      {groups.map((group) => {
                        const isSelected = selectedKeys.includes(group.shopifyOrderId);
                        return (
                          <div
                            key={group.shopifyOrderId}
                            style={{
                              border: `1px solid ${isSelected ? "#4f46e5" : "#e5e7eb"}`,
                              borderRadius: 8,
                              padding: "10px 14px",
                              background: isSelected ? "#f5f5ff" : "#fff",
                              cursor: "pointer",
                              transition: "all .15s",
                            }}
                            onClick={() => toggleGroup(group.shopifyOrderId)}
                          >
                            <InlineStack gap="300" blockAlign="center">
                              <Checkbox
                                label=""
                                checked={isSelected}
                                onChange={() => toggleGroup(group.shopifyOrderId)}
                              />
                              {group.previewUrl && (
                                <Thumbnail source={group.previewUrl} alt="Tasarım" size="small" />
                              )}
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">
                                    {group.orderNumber}
                                  </Text>
                                  <Badge tone="warning" size="small">{`${group.totalQty} adet`}</Badge>
                                  {group.hasFront && <Badge tone="success" size="small">Ön ✓</Badge>}
                                  {group.hasBack && <Badge size="small">Arka ✓</Badge>}
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {group.customerName} · {group.productBaseName}
                                </Text>
                                {group.variants.length > 0 && (
                                  <InlineStack gap="100" wrap>
                                    {group.variants.map((v, i) => (
                                      <span
                                        key={i}
                                        style={{
                                          fontSize: 11,
                                          background: "#f3f4f6",
                                          border: "1px solid #e5e7eb",
                                          borderRadius: 10,
                                          padding: "1px 7px",
                                          color: "#374151",
                                        }}
                                      >
                                        {v.variantTitle} ×{v.quantity}
                                      </span>
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

        {selectedKeys.length > 0 && (
          <Card>
            <Box padding="400">
              <InlineStack align="center" gap="400" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="p" variant="headingMd">
                    {totalPrints} baskı → Gang Sheet hazır
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {SHEET_PRESETS.find((p) => p.value === preset)?.label} · {columns !== "0" ? `${columns} sütun` : "Otomatik boyut"} · Ön + Arka
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  size="large"
                  onClick={handleGenerate}
                  disabled={generating}
                  loading={generating}
                >
                  {generating ? t("gangSheet.generating") : `${t("gangSheet.generate")} (${totalPrints} baskı)`}
                </Button>
              </InlineStack>
            </Box>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
