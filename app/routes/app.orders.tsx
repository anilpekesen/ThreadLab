import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, DataTable, Badge, Button, Select, InlineStack, Box, Text, BlockStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrders, updateOrderStatus } from "~/models/orders.server";

const STATUSES = [
  { label: "Tümü", value: "" },
  { label: "Bekliyor", value: "pending" },
  { label: "Hazırlanıyor", value: "preparing" },
  { label: "Basıldı", value: "printed" },
  { label: "Hazır", value: "ready" },
  { label: "Gönderildi", value: "shipped" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const orders = await getOrders(status || undefined);
  return json({ orders, status });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const id = form.get("id") as string;
  const status = form.get("status") as string;
  await updateOrderStatus(id, status);
  return json({ ok: true });
};

const BADGE_TONE: Record<string, "info" | "attention" | "success" | "warning" | "new"> = {
  pending: "attention", preparing: "info", printed: "info", ready: "success", shipped: "success",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor", preparing: "Hazırlanıyor", printed: "Basıldı", ready: "Hazır", shipped: "Gönderildi",
};

export default function Orders() {
  const { orders, status } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const rows = orders.map((o) => {
    const nextStatus = {
      pending: "preparing", preparing: "printed", printed: "ready", ready: "shipped",
    }[o.productionStatus];
    return [
      o.orderNumber,
      o.customerName,
      <a href={`mailto:${o.customerEmail}`}>{o.customerEmail}</a>,
      o.productName,
      <Badge tone={BADGE_TONE[o.productionStatus] ?? "new"}>
        {STATUS_LABELS[o.productionStatus] ?? o.productionStatus}
      </Badge>,
      new Date(o.createdAt).toLocaleDateString("tr-TR"),
      nextStatus ? (
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="status" value={nextStatus} />
          <Button submit size="slim">
            → {STATUS_LABELS[nextStatus]}
          </Button>
        </fetcher.Form>
      ) : "✓ Tamamlandı",
    ];
  });

  return (
    <Page title={`Siparişler (${orders.length})`}>
      <BlockStack gap="400">
        <Card>
          <Box padding="400">
            <InlineStack gap="200">
              {STATUSES.map((s) => (
                <a key={s.value} href={`/app/orders${s.value ? `?status=${s.value}` : ""}`}>
                  <Button pressed={status === s.value} size="slim">{s.label}</Button>
                </a>
              ))}
            </InlineStack>
          </Box>
          {rows.length === 0 ? (
            <Box padding="800">
              <Text as="p" tone="subdued" alignment="center">Bu durumda sipariş yok.</Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
              headings={["Sipariş", "Müşteri", "E-posta", "Ürün", "Durum", "Tarih", "İşlem"]}
              rows={rows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
