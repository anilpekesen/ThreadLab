import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Box, Divider, Grid, Thumbnail, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getOrder, updateOrderStatus } from "~/models/orders.server";
import { getDesignByToken, extractObjects } from "~/models/designs.server";

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  preparing: "Hazırlanıyor",
  printed: "Basıldı",
  ready: "Hazır",
  shipped: "Gönderildi",
};

const BADGE_TONE: Record<string, "info" | "attention" | "success" | "warning"> = {
  pending: "attention",
  preparing: "info",
  printed: "info",
  ready: "success",
  shipped: "success",
};

const NEXT_STATUS: Record<string, string> = {
  pending: "preparing",
  preparing: "printed",
  printed: "ready",
  ready: "shipped",
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const order = await getOrder(params.id ?? "");
  if (!order) throw new Response("Sipariş bulunamadı", { status: 404 });

  const design = order.designToken ? await getDesignByToken(order.designToken) : null;
  const frontObjects = design ? extractObjects(design.designJson, "front") : [];
  const backObjects = design ? extractObjects(design.designJson, "back") : [];

  return json({ order, design, frontObjects, backObjects });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  const status = form.get("status") as string;
  await updateOrderStatus(params.id ?? "", status);
  return redirect(`/app/orders/${params.id}`);
};

export default function OrderDetail() {
  const { order, design, frontObjects, backObjects } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const next = NEXT_STATUS[order.productionStatus];
  const shopDomain = "whanotify-dev"; // fallback

  return (
    <Page
      title={order.orderNumber}
      backAction={{ content: "Siparişler", onAction: () => navigate("/app/orders") }}
      primaryAction={next ? {
        content: `→ ${STATUS_LABELS[next]}`,
        onAction: () => {
          const fd = new FormData();
          fd.set("status", next);
          fetcher.submit(fd, { method: "post" });
        },
      } : undefined}
      titleMetadata={
        <Badge tone={BADGE_TONE[order.productionStatus] ?? "new"}>
          {STATUS_LABELS[order.productionStatus] ?? order.productionStatus}
        </Badge>
      }
    >
      <BlockStack gap="500">

        {/* Önizleme: Ön ve Arka */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Ön Yüz</Text>
                  {design?.frontPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={design.frontPreviewUrl}
                        alt="Ön tasarım önizlemesi"
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">Önizleme yok</Text>
                    </Box>
                  )}
                  {design?.frontPrintUrl && (
                    <a href={design.frontPrintUrl} target="_blank" rel="noreferrer" download>
                      <Button variant="secondary" fullWidth>Ön Baskı Dosyasını İndir</Button>
                    </a>
                  )}
                  {frontObjects.length > 0 && (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Ön yüz öğeleri ({frontObjects.length})</Text>
                      {frontObjects.map((obj, i) => (
                        <InlineStack key={i} gap="200" blockAlign="center">
                          {obj.src && (
                            <Thumbnail source={obj.src} alt="Tasarım görseli" size="small" />
                          )}
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {obj.type === "image" ? "Görsel" : obj.type === "i-text" || obj.type === "textbox" ? "Metin" : obj.type}
                            </Text>
                            {obj.text && <Text as="span" variant="bodySm" tone="subdued">&quot;{obj.text}&quot;</Text>}
                            <Text as="span" variant="bodySm" tone="subdued">
                              Konum: {Math.round(obj.left ?? 0)}, {Math.round(obj.top ?? 0)}
                              {obj.angle ? ` · ${Math.round(obj.angle)}°` : ""}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Arka Yüz</Text>
                  {design?.backPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={design.backPreviewUrl}
                        alt="Arka tasarım önizlemesi"
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">Arka tasarım yok</Text>
                    </Box>
                  )}
                  {design?.backPrintUrl && (
                    <a href={design.backPrintUrl} target="_blank" rel="noreferrer" download>
                      <Button variant="secondary" fullWidth>Arka Baskı Dosyasını İndir</Button>
                    </a>
                  )}
                  {backObjects.length > 0 && (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">Arka yüz öğeleri ({backObjects.length})</Text>
                      {backObjects.map((obj, i) => (
                        <InlineStack key={i} gap="200" blockAlign="center">
                          {obj.src && (
                            <Thumbnail source={obj.src} alt="Tasarım görseli" size="small" />
                          )}
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {obj.type === "image" ? "Görsel" : obj.type === "i-text" || obj.type === "textbox" ? "Metin" : obj.type}
                            </Text>
                            {obj.text && <Text as="span" variant="bodySm" tone="subdued">&quot;{obj.text}&quot;</Text>}
                            <Text as="span" variant="bodySm" tone="subdued">
                              Konum: {Math.round(obj.left ?? 0)}, {Math.round(obj.top ?? 0)}
                              {obj.angle ? ` · ${Math.round(obj.angle)}°` : ""}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Sipariş bilgileri */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Sipariş Bilgileri</Text>
              <Divider />
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Sipariş No</Text>
                <a
                  href={`https://admin.shopify.com/store/whanotify-dev/orders/${order.shopifyOrderId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2c6ecb", fontWeight: 600, textDecoration: "none" }}
                >
                  {order.orderNumber}
                </a>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Ürün</Text>
                <Text as="span">{order.productName || "—"}</Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Durum</Text>
                <Badge tone={BADGE_TONE[order.productionStatus] ?? "new"}>
                  {STATUS_LABELS[order.productionStatus] ?? order.productionStatus}
                </Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Tarih</Text>
                <Text as="span">
                  {new Date(order.createdAt).toLocaleDateString("tr-TR", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              </InlineStack>
              {!design && (
                <Banner tone="warning" title="Tasarım verisi bulunamadı">
                  <p>Bu sipariş için tasarım dosyası sunucuda mevcut değil. Tasarım token: {order.designToken || "—"}</p>
                </Banner>
              )}
            </BlockStack>
          </Box>
        </Card>

      </BlockStack>
    </Page>
  );
}
