import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { useMemo } from "react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Badge, Button, InlineStack, Box, Text, BlockStack,
  Thumbnail, IndexTable, useIndexResourceState, Banner,
  Grid,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrders, bulkUpdateStatus, fulfillShopifyOrders, syncOrdersFromAdmin, getOrderByShopifyId, setOrderDriveUpload } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getDriveConnection } from "~/models/shop-google-drive.server";
import { getDesignByToken } from "~/models/designs.server";
import {
  getValidAccessToken,
  ensureRootFolder,
  ensureSubfolder,
  uploadFromUrl,
  uploadText,
} from "~/lib/google-drive.server";

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
  const { session } = await authenticate(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const activeStatus = status ?? "";

  const [allOrders, orders, driveConn] = await Promise.all([
    getOrders(session.shop),
    activeStatus ? getOrders(session.shop, activeStatus) : getOrders(session.shop),
    getDriveConnection(session.shop),
  ]);
  const stats = summarizeGroupedStats(groupOrders(allOrders));
  return json({ orders, status: activeStatus, stats, shop: session.shop, driveConnected: Boolean(driveConn) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "sync") {
    try {
      const count = await syncOrdersFromAdmin(admin, session.shop);
      return json({ ok: true, synced: count });
    } catch (err) {
      let msg = "Bilinmeyen hata";
      if (err instanceof Error) {
        msg = err.message;
      } else if (err instanceof Response) {
        msg = `Shopify API hatası (HTTP ${err.status})`;
      } else {
        msg = String(err);
      }
      console.error("[sync] error:", err);
      return json({ ok: false, error: msg });
    }
  }

  if (intent === "bulkDriveExport") {
    const shopifyOrderIds = ((form.get("shopifyOrderIds") as string) || "").split(",").filter(Boolean);
    let success = 0, failed = 0;
    const errors: string[] = [];

    let accessToken: string;
    let rootId: string;
    try {
      accessToken = await getValidAccessToken(session.shop);
      rootId = await ensureRootFolder(session.shop, accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ ok: false, bulkDrive: true, success: 0, failed: shopifyOrderIds.length, errors: [msg] });
    }

    for (const shopifyOrderId of shopifyOrderIds) {
      try {
        const order = await getOrderByShopifyId(session.shop, shopifyOrderId);
        if (!order) { failed++; errors.push(`#${shopifyOrderId}: bulunamadı`); continue; }

        const design = order.designToken ? await getDesignByToken(order.shop || session.shop, order.designToken) : null;
        const frontPrint = design?.frontPrintUrl || order.designFrontPrintUrl || order.productionFileUrl || "";
        const backPrint = design?.backPrintUrl || order.designBackPrintUrl || "";
        const frontPreview = design?.frontPreviewUrl || order.designFrontPreviewUrl || order.previewUrl || "";
        const backPreview = design?.backPreviewUrl || order.designBackPreviewUrl || "";

        const folderName = (order.orderNumber || shopifyOrderId).replace(/^#/, "");
        const folderId = order.driveFolderId || await ensureSubfolder(accessToken, rootId, folderName);

        const tasks: Promise<unknown>[] = [];
        if (frontPrint) tasks.push(uploadFromUrl(accessToken, folderId, "front-print.png", frontPrint, "image/png"));
        if (backPrint) tasks.push(uploadFromUrl(accessToken, folderId, "back-print.png", backPrint, "image/png"));
        if (frontPreview) tasks.push(uploadFromUrl(accessToken, folderId, "front-mockup.png", frontPreview, "image/png"));
        if (backPreview) tasks.push(uploadFromUrl(accessToken, folderId, "back-mockup.png", backPreview, "image/png"));
        if (design?.designJson) tasks.push(uploadText(accessToken, folderId, "design.json", JSON.stringify(design.designJson, null, 2), "application/json"));

        await Promise.all(tasks);
        await setOrderDriveUpload(order.id, folderId);
        success++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`#${shopifyOrderId}: ${msg}`);
      }
    }

    return json({ ok: failed === 0, bulkDrive: true, success, failed, errors });
  }

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
  driveFolderId: string | null;
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
        driveFolderId: null,
        ids: [],
        representativeId: o.id,
      });
    }
    const g = map.get(key)!;
    g.ids.push(o.id);
    g.totalQty += o.quantity ?? 1;
    g.variants.push({ id: o.id, variantTitle: o.variantTitle, quantity: o.quantity ?? 1 });
    if (o.missingSurcharge) g.hasMissingSurcharge = true;
    if (o.driveFolderId && !g.driveFolderId) g.driveFolderId = o.driveFolderId;
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

function summarizeGroupedStats(groups: OrderGroup[]) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return {
    total: groups.length,
    today: groups.filter((group) => new Date(group.createdAt) >= todayStart).length,
    pendingProduction: groups.filter((group) => group.status === "pending").length,
    ready: groups.filter((group) => group.status === "ready" || group.status === "shipped").length,
    missingSurcharge: groups.filter((group) => group.hasMissingSurcharge).length,
  };
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
  const { orders, status, stats, shop, driveConnected } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok: boolean; synced?: number; error?: string }>();
  const syncFetcher = useFetcher<{ ok: boolean; synced?: number; error?: string }>();
  const driveFetcher = useFetcher<{ ok: boolean; bulkDrive?: boolean; success?: number; failed?: number; errors?: string[] }>();
  const { t, lang } = useTranslation();
  const isSyncing = syncFetcher.state !== "idle";
  const syncResult = syncFetcher.data as { ok: boolean; synced?: number; error?: string } | undefined;
  const isDriveExporting = driveFetcher.state !== "idle";
  const driveResult = driveFetcher.data?.bulkDrive ? driveFetcher.data : null;

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
            {g.driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${g.driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                title={lang === "tr" ? "Drive'a yüklendi — klasörü aç" : "Uploaded to Drive — open folder"}
                onClick={(e) => e.stopPropagation()}
              >
                <Badge tone="success">✓ Drive</Badge>
              </a>
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
      primaryAction={
        <syncFetcher.Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <Button submit loading={isSyncing} variant="secondary" size="slim">
            {isSyncing ? "Senkronize ediliyor..." : "Eski siparişleri çek"}
          </Button>
        </syncFetcher.Form>
      }
    >
      <BlockStack gap="400">
        {syncResult && (
          <Banner tone={syncResult.ok ? "success" : "critical"}>
            {syncResult.ok
              ? `${syncResult.synced ?? 0} yeni sipariş eklendi.`
              : `Hata: ${syncResult.error}`}
          </Banner>
        )}
        {driveResult && (
          <Banner tone={driveResult.ok ? "success" : (driveResult.success ? "warning" : "critical")}>
            {driveResult.ok
              ? `${driveResult.success} sipariş Drive'a başarıyla yüklendi.`
              : `${driveResult.success ?? 0} başarılı, ${driveResult.failed ?? 0} başarısız.${driveResult.errors?.length ? " " + driveResult.errors.join(" | ") : ""}`
            }
          </Banner>
        )}
        <PageHelper sections={[
          { titleKey: "helper.orders.1.title", bodyKey: "helper.orders.1.body" },
          { titleKey: "helper.orders.2.title", bodyKey: "helper.orders.2.body" },
          { titleKey: "helper.orders.3.title", bodyKey: "helper.orders.3.body" },
          { titleKey: "helper.orders.4.title", bodyKey: "helper.orders.4.body" },
          { titleKey: "helper.orders.5.title", bodyKey: "helper.orders.5.body" },
          { titleKey: "helper.orders.6.title", bodyKey: "helper.orders.6.body" },
        ]} />
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
              promotedBulkActions={driveConnected ? [
                {
                  content: isDriveExporting ? "Yükleniyor..." : "Drive'a Aktar",
                  onAction: () => {
                    const selected = allResourcesSelected
                      ? groups
                      : groups.filter((g) => selectedResources.includes(g.shopifyOrderId));
                    const fd = new FormData();
                    fd.set("intent", "bulkDriveExport");
                    fd.set("shopifyOrderIds", selected.map((g) => g.shopifyOrderId).join(","));
                    driveFetcher.submit(fd, { method: "post" });
                  },
                },
              ] : [
                {
                  content: "Drive Bağla",
                  onAction: () => navigate("/app/settings"),
                },
              ]}
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
