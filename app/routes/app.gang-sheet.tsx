import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import { useTranslation } from "~/i18n";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Box, Select, RangeSlider, Thumbnail, Checkbox, Banner,
  Grid, Divider, RadioButton,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrdersByIds, getOrdersWithPrintFiles } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";

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

function hasPrintFile(order: Order): boolean {
  return !!(order.designFrontPrintUrl || order.productionFileUrl);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const preselectedIds = idsParam.split(",").filter(Boolean);

  // Load orders with print files
  let orders: Order[];
  if (preselectedIds.length) {
    orders = await getOrdersByIds(preselectedIds);
  } else {
    // Show all orders with print files (not just today's)
    orders = await getOrdersWithPrintFiles();
  }

  const printableOrders = orders.filter(hasPrintFile);

  return json({ printableOrders, preselectedIds });
};

export default function GangSheet() {
  const { printableOrders, preselectedIds } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [selectedIds, setSelectedIds] = useState<string[]>(
    preselectedIds.length ? preselectedIds.filter((id) => printableOrders.some((o) => o.id === id)) : printableOrders.map((o) => o.id),
  );
  const [preset, setPreset] = useState("dtf60");
  const [margin, setMargin] = useState(20);
  const [bg, setBg] = useState<"white" | "transparent">("white");
  const [side, setSide] = useState<"front" | "back">("front");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleOrder = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIds.length === printableOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(printableOrders.map((o) => o.id));
    }
  }, [selectedIds, printableOrders]);

  const handleGenerate = useCallback(() => {
    if (!selectedIds.length) return;
    setGenerating(true);
    setError(null);
    const params = new URLSearchParams({
      ids: selectedIds.join(","),
      preset,
      margin: String(margin),
      bg,
      side,
    });
    const url = `/api/gang-sheet?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setGenerating(false), 5000);
  }, [selectedIds, preset, margin, bg, side]);

  const dims = PRESET_DIMS[preset];
  const dimsLabel = dims
    ? `${dims.w}px × ${dims.h ? `${dims.h}px` : "otomatik yükseklik"}`
    : "";

  const allSelected = selectedIds.length === printableOrders.length;

  return (
    <Page
      title={t("gangSheet.title")}
      backAction={{ content: "Üretim", onAction: () => navigate("/app/production") }}
      primaryAction={{
        content: generating ? t("gangSheet.generating") : t("gangSheet.generate"),
        onAction: handleGenerate,
        disabled: selectedIds.length === 0 || generating,
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

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">{t("gangSheet.background")}</Text>
                    <InlineStack gap="300">
                      <RadioButton
                        label={t("gangSheet.bgWhite")}
                        checked={bg === "white"}
                        id="bg-white"
                        name="bg"
                        onChange={() => setBg("white")}
                      />
                      <RadioButton
                        label={t("gangSheet.bgTransparent")}
                        checked={bg === "transparent"}
                        id="bg-transparent"
                        name="bg"
                        onChange={() => setBg("transparent")}
                      />
                    </InlineStack>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">{t("gangSheet.side")}</Text>
                    <InlineStack gap="300">
                      <RadioButton
                        label={t("gangSheet.sideFront")}
                        checked={side === "front"}
                        id="side-front"
                        name="side"
                        onChange={() => setSide("front")}
                      />
                      <RadioButton
                        label={t("gangSheet.sideBack")}
                        checked={side === "back"}
                        id="side-back"
                        name="side"
                        onChange={() => setSide("back")}
                      />
                    </InlineStack>
                  </BlockStack>

                  <Divider />

                  {/* Özet */}
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {selectedIds.length} / {printableOrders.length} tasarım seçildi
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
                      {allSelected ? "Tümünü Kaldır" : t("production.selectAll")}
                    </Button>
                  </InlineStack>

                  <Divider />

                  {printableOrders.length === 0 ? (
                    <Box padding="600">
                      <Text as="p" tone="subdued" alignment="center">{t("gangSheet.noOrders")}</Text>
                    </Box>
                  ) : (
                    <BlockStack gap="200">
                      {printableOrders.map((order) => {
                        const isSelected = selectedIds.includes(order.id);
                        const previewUrl = order.designFrontPreviewUrl || order.previewUrl || "";
                        const hasFront = !!(order.designFrontPrintUrl || order.productionFileUrl);
                        const hasBack = !!order.designBackPrintUrl;

                        return (
                          <div
                            key={order.id}
                            style={{
                              border: `1px solid ${isSelected ? "#4f46e5" : "#e5e7eb"}`,
                              borderRadius: 8,
                              padding: "10px 14px",
                              background: isSelected ? "#f5f5ff" : "#fff",
                              cursor: "pointer",
                              transition: "all .15s",
                            }}
                            onClick={() => toggleOrder(order.id)}
                          >
                            <InlineStack gap="300" blockAlign="center">
                              <Checkbox
                                label=""
                                checked={isSelected}
                                onChange={() => toggleOrder(order.id)}
                              />
                              {previewUrl && (
                                <Thumbnail source={previewUrl} alt="Tasarım" size="small" />
                              )}
                              <BlockStack gap="050">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="bodySm" fontWeight="semibold">
                                    {order.orderNumber}
                                  </Text>
                                  {hasFront && (
                                    <Badge tone="success" size="small">Ön ✓</Badge>
                                  )}
                                  {hasBack && (
                                    <Badge tone="info" size="small">Arka ✓</Badge>
                                  )}
                                </InlineStack>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  {order.customerName} · {order.productName}
                                </Text>
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

        {/* Büyük oluştur butonu */}
        {selectedIds.length > 0 && (
          <Card>
            <Box padding="400">
              <InlineStack align="center" gap="400" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="p" variant="headingMd">
                    {selectedIds.length} tasarım → Gang Sheet hazır
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {SHEET_PRESETS.find((p) => p.value === preset)?.label} · {bg === "white" ? "Beyaz arka plan" : "Şeffaf"} · {side === "front" ? "Ön yüz" : "Arka yüz"}
                  </Text>
                </BlockStack>
                <Button
                  variant="primary"
                  size="large"
                  onClick={handleGenerate}
                  disabled={generating}
                  loading={generating}
                >
                  {generating ? t("gangSheet.generating") : `${t("gangSheet.generate")} (${selectedIds.length} tasarım)`}
                </Button>
              </InlineStack>
            </Box>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
