import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page, Card, Badge, Button, InlineStack, Box, Text, BlockStack,
  Thumbnail, IndexTable, useIndexResourceState, EmptyState,
  Grid,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrders, updateOrderStatus, getDashboardStats } from "~/models/orders.server";

const STATUSES = [
  { label: "Tümü", value: "" },
  { label: "Bekliyor", value: "pending" },
  { label: "Hazırlanıyor", value: "preparing" },
  { label: "Basıldı", value: "printed" },
  { label: "Hazır", value: "ready" },
  { label: "Gönderildi", value: "shipped" },
];

const NEXT_STATUS: Record<string, string> = {
  pending: "preparing",
  preparing: "printed",
  printed: "ready",
  ready: "shipped",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  preparing: "Hazırlanıyor",
  printed: "Basıldı",
  ready: "Hazır",
  shipped: "Gönderildi",
};

const BADGE_TONE: Record<string, "info" | "attention" | "success" | "warning" | "new"> = {
  pending: "attention",
  preparing: "info",
  printed: "info",
  ready: "success",
  shipped: "success",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const [orders, stats] = await Promise.all([
    getOrders(status || undefined),
    getDashboardStats(),
  ]);
  return json({ orders, status, stats, shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = form.get("id") as string;
  const status = form.get("status") as string;
  await updateOrderStatus(id, status);
  return json({ ok: true });
};

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
  const { orders, status, stats, shop } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher();

  const resourceName = { singular: "sipariş", plural: "sipariş" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(orders);

  const shopDomain = shop.replace(".myshopify.com", "");

  const rowMarkup = orders.map((o, index) => {
    const next = NEXT_STATUS[o.productionStatus];
    const designUrl = o.designToken
      ? `/apps/tshirt-designer/designs/${encodeURIComponent(o.designToken)}`
      : null;
    const shopifyOrderUrl = o.shopifyOrderId
      ? `https://admin.shopify.com/store/${shopDomain}/orders/${o.shopifyOrderId}`
      : null;

    return (
      <IndexTable.Row
        id={o.id}
        key={o.id}
        selected={selectedResources.includes(o.id)}
        position={index}
      >
        {/* Önizleme */}
        <IndexTable.Cell>
          {o.previewUrl ? (
            <Thumbnail source={o.previewUrl} alt="Tasarım önizlemesi" size="small" />
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
          {shopifyOrderUrl ? (
            <a href={shopifyOrderUrl} target="_blank" rel="noreferrer"
              style={{ fontWeight: 600, color: "#2c6ecb", textDecoration: "none" }}>
              {o.orderNumber}
            </a>
          ) : (
            <Text as="span" fontWeight="semibold">{o.orderNumber}</Text>
          )}
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
          <Text as="span" variant="bodySm">{o.productName}</Text>
        </IndexTable.Cell>

        {/* Durum */}
        <IndexTable.Cell>
          <InlineStack gap="150" blockAlign="center">
            <Badge tone={BADGE_TONE[o.productionStatus] ?? "new"}>
              {STATUS_LABELS[o.productionStatus] ?? o.productionStatus}
            </Badge>
            {o.missingSurcharge && (
              <Badge tone="critical">Baskı ücreti eksik</Badge>
            )}
          </InlineStack>
        </IndexTable.Cell>

        {/* Tarih */}
        <IndexTable.Cell>
          <Text as="span" variant="bodySm" tone="subdued">
            {new Date(o.createdAt).toLocaleDateString("tr-TR", {
              day: "2-digit", month: "short", year: "numeric",
            })}
          </Text>
        </IndexTable.Cell>

        {/* İşlemler */}
        <IndexTable.Cell>
          <InlineStack gap="200" blockAlign="center">
            {designUrl && (
              <a href={designUrl} target="_blank" rel="noreferrer">
                <Button size="slim" variant="plain">Tasarımı Gör</Button>
              </a>
            )}
            {next ? (
              <fetcher.Form method="post">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="status" value={next} />
                <Button submit size="slim" variant="secondary">
                  → {STATUS_LABELS[next]}
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
    <Page title="Siparişler">
      <BlockStack gap="400">
        {/* İstatistik kartları */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Toplam Sipariş" value={stats.total} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Bugün" value={stats.today} />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Üretim Bekliyor" value={stats.pendingProduction} tone="caution" />
          </Grid.Cell>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <StatCard label="Hazır / Kargoda" value={stats.ready} tone="success" />
          </Grid.Cell>
          {stats.missingSurcharge > 0 && (
            <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
              <StatCard label="Baskı Ücreti Eksik" value={stats.missingSurcharge} tone="critical" />
            </Grid.Cell>
          )}
        </Grid>

        {/* Filtre + Tablo */}
        <Card padding="0">
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack gap="200" wrap>
              {STATUSES.map((s) => (
                <a
                  key={s.value}
                  href={`/app/orders${s.value ? `?status=${s.value}` : ""}`}
                  style={{ textDecoration: "none" }}
                >
                  <Button
                    pressed={status === s.value || (!status && s.value === "")}
                    size="slim"
                  >
                    {s.label}
                  </Button>
                </a>
              ))}
            </InlineStack>
          </Box>

          {orders.length === 0 ? (
            <EmptyState
              heading="Bu durumda sipariş yok"
              image=""
            >
              <Text as="p" tone="subdued">
                {status
                  ? `"${STATUS_LABELS[status]}" durumunda henüz sipariş bulunmuyor.`
                  : "Henüz hiç sipariş alınmamış."}
              </Text>
            </EmptyState>
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
                { title: "Tarih" },
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
