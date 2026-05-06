import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineGrid, Box,
  Badge, DataTable, EmptyState,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrders, getDashboardStats } from "~/models/orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const [stats, orders] = await Promise.all([getDashboardStats(), getOrders()]);
  return json({ stats, recentOrders: orders.slice(0, 10) });
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  preparing: "Hazırlanıyor",
  printed: "Basıldı",
  ready: "Hazır",
  shipped: "Gönderildi",
};

const STATUS_BADGE: Record<string, "info" | "attention" | "success" | "warning" | "new"> = {
  pending: "attention",
  preparing: "info",
  printed: "info",
  ready: "success",
  shipped: "success",
};

export default function Index() {
  const { stats, recentOrders } = useLoaderData<typeof loader>();

  const rows = recentOrders.map((o) => [
    o.orderNumber,
    o.customerName,
    o.productName,
    <Badge tone={STATUS_BADGE[o.productionStatus] ?? "new"}>
      {STATUS_LABELS[o.productionStatus] ?? o.productionStatus}
    </Badge>,
    new Date(o.createdAt).toLocaleDateString("tr-TR"),
  ]);

  return (
    <Page title="Tasarım Siparişleri">
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {[
            { label: "Toplam Sipariş", value: stats.total },
            { label: "Bugün", value: stats.today },
            { label: "Bekleyen Üretim", value: stats.pendingProduction },
            { label: "Hazır", value: stats.ready },
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

        <Card>
          <Box padding="400">
            <Text as="h2" variant="headingMd">Son Siparişler</Text>
          </Box>
          {rows.length === 0 ? (
            <EmptyState heading="Henüz sipariş yok" image="">
              <p>Müşteriler tasarım yapınca burada görünecek.</p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text"]}
              headings={["Sipariş", "Müşteri", "Ürün", "Durum", "Tarih"]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
