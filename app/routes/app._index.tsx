import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineGrid, Box,
  Badge, DataTable, EmptyState, Button, InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrders, getDashboardStats } from "~/models/orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [stats, orders] = await Promise.all([getDashboardStats(), getOrders()]);
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appBlockHandle = "tshirt-designer";

  const newAppsSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=newAppsSection`
    : null;

  const mainSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=mainSection`
    : null;

  return json({
    stats,
    recentOrders: orders.slice(0, 10),
    newAppsSectionUrl,
    mainSectionUrl,
  });
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
  const { stats, recentOrders, newAppsSectionUrl, mainSectionUrl } = useLoaderData<typeof loader>();

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
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tema kurulumu</Text>
              <Text as="p" tone="subdued">
                Tasarim aracini urun sayfasina eklemek icin tema editorunu dogrudan dogru hedefle ac.
              </Text>
              <InlineStack gap="200">
                {newAppsSectionUrl ? (
                  <Button url={newAppsSectionUrl} target="_blank" variant="primary">
                    Apps section olarak ekle
                  </Button>
                ) : null}
                {mainSectionUrl ? (
                  <Button url={mainSectionUrl} target="_blank">
                    Urun bolumune blok ekle
                  </Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

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
