import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import { useTranslation } from "~/i18n";
import {
  Page, Card, Badge, Button, InlineStack, Box, Text, BlockStack,
  Thumbnail, IndexTable, useIndexResourceState, Banner, Grid,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrders, getTodayOrders, bulkUpdateStatus, fulfillShopifyOrders } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getShopSubscription } from "~/models/billing.server";
import { PLANS, planKeyFromName } from "~/lib/billing.server";

const APP_URL = "https://app.printlabapp.com";

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  preparing: "Hazırlanıyor",
  printed: "Basıldı",
  ready: "Hazır",
  shipped: "Gönderildi",
};
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
  const planKey = planKeyFromName(sub?.plan_key) ?? "Pro";
  const plan = PLANS[planKey];
  if (!plan.allowProduction) {
    return json({ orders: [], withFile: 0, statusFilter: "", todayOnly: false, shop, locked: true });
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

  return json({
    orders,
    withFile,
    statusFilter,
    todayOnly,
    shop: session.shop,
    locked: false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const idsRaw = form.get("ids") as string;
  const ids = idsRaw ? idsRaw.split(",").filter(Boolean) : [];

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

const STATUSES = [
  { label: "Tümü (Bugün)", value: "" },
  { label: "Bekliyor", value: "pending" },
  { label: "Hazırlanıyor", value: "preparing" },
  { label: "Basıldı", value: "printed" },
];

export default function Production() {
  const { orders, withFile, statusFilter, todayOnly, shop, locked } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (locked) {
    return (
      <Page title="Üretim">
        <Banner tone="warning" title="Pro veya Business planı gerekli">
          <p>Üretim ekranı Pro ve Business planlarında kullanılabilir.</p>
          <Button onClick={() => navigate("/app/billing")}>Planı Yükselt</Button>
        </Banner>
      </Page>
    );
  }
  const fetcher = useFetcher();
  const { t } = useTranslation();

  const resourceName = { singular: "sipariş", plural: "sipariş" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);

  const [downloadState, setDownloadState] = useState<"idle" | "downloading">("idle");

  const handleZipDownload = useCallback(async () => {
    const ids = selectedResources.length ? selectedResources : orders.map((o) => o.id);
    if (!ids.length) return;
    setDownloadState("downloading");
    try {
      const res = await fetch(`/api/production-zip?shop=${encodeURIComponent(shop)}&ids=${ids.join(",")}`);
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
      fetcher.submit(fd, { method: "post" });
    },
    [selectedResources, fetcher],
  );

  const today = new Date().toLocaleDateString("tr-TR", {
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
            <Thumbnail source={previewUrl} alt="Tasarım" size="small" />
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
                <Badge tone="warning" size="small">{`${o.quantity}× adet`}</Badge>
              )}
            </InlineStack>
          </BlockStack>
        </IndexTable.Cell>

        {/* Durum */}
        <IndexTable.Cell>
          <Badge tone={STATUS_TONE[o.productionStatus] ?? "attention"}>
            {STATUS_LABELS[o.productionStatus] ?? o.productionStatus}
          </Badge>
        </IndexTable.Cell>

        {/* Dosya + İndir */}
        <IndexTable.Cell>
          {hasFile ? (
            <InlineStack gap="150" blockAlign="center">
              <Badge tone="success">✓ Dosya var</Badge>
              {frontUrl && (
                <a href={`${APP_URL}/api/download?url=${encodeURIComponent(frontUrl)}&filename=on-baski.png`}
                  target="_blank" rel="noreferrer" download>
                  <Button size="slim" variant="plain">⬇ Ön</Button>
                </a>
              )}
              {backUrl && (
                <a href={`${APP_URL}/api/download?url=${encodeURIComponent(backUrl)}&filename=arka-baski.png`}
                  target="_blank" rel="noreferrer" download>
                  <Button size="slim" variant="plain">⬇ Arka</Button>
                </a>
              )}
            </InlineStack>
          ) : (
            <Badge tone="attention">Dosya yok</Badge>
          )}
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title={`${t("production.title")} — ${today}`}
      primaryAction={{
        content: downloadState === "downloading" ? "İndiriliyor..." : t("production.downloadZip"),
        onAction: handleZipDownload,
        disabled: orders.length === 0 || downloadState === "downloading",
      }}
      secondaryActions={[
        {
          content: "Print Queue",
          onAction: () => navigate("/app/print-queue"),
          disabled: orders.filter(hasPrintFile).length === 0,
        },
        {
          content: t("production.openGangSheet"),
          onAction: handleGangSheet,
          disabled: orders.filter(hasPrintFile).length === 0,
        },
        {
          content: "Yenile",
          onAction: () => navigate("/app/production"),
        },
      ]}
    >
      <BlockStack gap="400">
        {/* İstatistikler */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label={todayOnly ? "Bugün toplam" : "Toplam sipariş"} value={orders.length} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label="Baskı dosyası hazır" value={withFile} tone="success" />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
            <StatCard label="Dosya eksik" value={orders.length - withFile} tone={orders.length - withFile > 0 ? "caution" : undefined} />
          </Grid.Cell>
        </Grid>

        {/* Seçim banner */}
        {selectedResources.length > 0 && (
          <Banner tone="info">
            <InlineStack gap="300" blockAlign="center" wrap>
              <Text as="span" variant="bodySm">
                <strong>{selectedResources.length}</strong> sipariş seçildi
              </Text>
              <Button
                size="slim"
                onClick={() => handleBulkStatus("preparing")}
                loading={fetcher.state === "submitting"}
              >
                → Hazırlanıyor İşaretle
              </Button>
              <Button
                size="slim"
                onClick={() => handleBulkStatus("printed")}
                loading={fetcher.state === "submitting"}
              >
                → Basıldı İşaretle
              </Button>
              <Button size="slim" variant="secondary" onClick={handleZipDownload}>
                ⬇ Seçilenleri ZIP İndir
              </Button>
              <Button size="slim" variant="secondary" onClick={handleGangSheet}>
                Gang Sheet Oluştur
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
                📅 Sadece Bugün
              </Button>
            </InlineStack>
          </Box>

          {orders.length === 0 ? (
            <Box padding="800">
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" variant="headingMd" alignment="center">
                  Bekleyen sipariş bulunamadı
                </Text>
                <Text as="p" tone="subdued" alignment="center">
                  Yeni siparişler geldiğinde burada görünecek.
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
                { title: "Sipariş" },
                { title: "Müşteri" },
                { title: "Ürün" },
                { title: "Durum" },
                { title: "Baskı Dosyası" },
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
          ZIP İndir: seçilen siparişlerin baskı dosyalarını tek bir ZIP'e paketler. Hiçbir şey seçilmezse listelenen tüm siparişler dahil edilir.
        </Text>
      </BlockStack>
    </Page>
  );
}
