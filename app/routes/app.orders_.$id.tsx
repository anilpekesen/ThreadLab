import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useTranslation } from "~/i18n";

const APP_URL = "https://app.printlabapp.com";

function dlUrl(fileUrl: string, filename: string): string {
  if (fileUrl.startsWith("data:")) return fileUrl;
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

function imageDownloadUrl(shop: string, orderId: string, side: "front" | "back", imgIndex: number): string {
  return `${APP_URL}/api/design-image?order_id=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}&side=${side}&index=${imgIndex}`;
}
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Box, Divider, Grid, Thumbnail, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrder, getSiblingOrders, updateOrderStatus, bulkUpdateStatus, fulfillShopifyOrders } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getDesignByToken, extractObjects, type DesignObject } from "~/models/designs.server";

function DesignObjectCard({ obj, downloadHref }: { obj: DesignObject; downloadHref?: string }) {
  const { t } = useTranslation();
  const isText = obj.type === "i-text" || obj.type === "textbox";
  const isImage = obj.type === "image";

  return (
    <div style={{
      border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px",
      background: "#fafafa", display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      {isImage && obj.src && (
        <div style={{ flexShrink: 0 }}>
          <Thumbnail source={obj.src} alt={t("orderDetail.layerAdded")} size="medium" />
        </div>
      )}
      {isText && (
        <div style={{
          flexShrink: 0, width: 48, height: 48, borderRadius: 6,
          background: toHex(obj.fill), border: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: isDark(obj.fill) ? "#fff" : "#000", fontWeight: 700, fontSize: 18, fontFamily: obj.fontFamily ?? "sans-serif" }}>A</span>
        </div>
      )}
      <BlockStack gap="100">
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {isImage ? t("orderDetail.layerImage") : isText ? t("orderDetail.layerText") : obj.type}
        </Text>
        {isText && obj.text && (
          <Text as="p" variant="bodySm">&quot;{obj.text}&quot;</Text>
        )}
        {isText && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
            {obj.fontFamily && <MetaChip label={t("orderDetail.font")} value={obj.fontFamily} />}
            {obj.fontSize && <MetaChip label={t("orderDetail.size")} value={`${obj.fontSize}px`} />}
            {obj.fill && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6b7280" }}>
                <span>Renk</span>
                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: toHex(obj.fill), border: "1px solid #d1d5db", verticalAlign: "middle" }} />
                <span style={{ fontFamily: "monospace" }}>{toHex(obj.fill)}</span>
              </span>
            )}
            {obj.fontWeight && String(obj.fontWeight) !== "normal" && <MetaChip label={t("orderDetail.thickness")} value={String(obj.fontWeight)} />}
            {obj.fontStyle === "italic" && <MetaChip label={t("orderDetail.style")} value="italic" />}
            {obj.underline && <MetaChip label={t("orderDetail.underline")} value="var" />}
            {obj.textAlign && obj.textAlign !== "left" && <MetaChip label={t("orderDetail.alignment")} value={obj.textAlign} />}
          </div>
        )}
        {isImage && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
            {obj.width && obj.scaleX && <MetaChip label={t("orderDetail.width")} value={`${Math.round(obj.width * obj.scaleX)}px`} />}
            {obj.height && obj.scaleY && <MetaChip label={t("orderDetail.height")} value={`${Math.round(obj.height * obj.scaleY)}px`} />}
            {obj.angle ? <MetaChip label={t("orderDetail.angle")} value={`${Math.round(obj.angle)}°`} /> : null}
          </div>
        )}
        <Text as="span" variant="bodySm" tone="subdued">
          Konum: {Math.round(obj.left ?? 0)}, {Math.round(obj.top ?? 0)}
        </Text>
        {isImage && obj.src && (
          <a
            href={downloadHref ?? dlUrl(obj.src, "tasarim-gorsel.png")}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#2c6ecb" }}
          >
            Görseli İndir
          </a>
        )}
      </BlockStack>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 12, color: "#6b7280" }}>
      <span style={{ color: "#9ca3af" }}>{label}:</span>{" "}
      <span style={{ color: "#374151", fontWeight: 500 }}>{value}</span>
    </span>
  );
}

const CSS_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080",
  grey: "#808080", cyan: "#00ffff", magenta: "#ff00ff", lime: "#00ff00", navy: "#000080",
  teal: "#008080", maroon: "#800000", olive: "#808000", silver: "#c0c0c0", brown: "#a52a2a",
  transparent: "#ffffff",
};

function toHex(color?: string): string {
  if (!color) return "#000000";
  const c = color.trim().toLowerCase();
  if (c.startsWith("#")) return color.toLowerCase();
  if (CSS_COLORS[c]) return CSS_COLORS[c];
  const rgb = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return "#" + [rgb[1], rgb[2], rgb[3]].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("");
  }
  return color;
}

function isDark(color?: string): boolean {
  const hex = toHex(color).replace("#", "");
  if (hex.length < 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

const STATUS_KEYS: Record<string, "status.pending" | "status.preparing" | "status.printed" | "status.ready" | "status.shipped"> = {
  pending: "status.pending",
  preparing: "status.preparing",
  printed: "status.printed",
  ready: "status.ready",
  shipped: "status.shipped",
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

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const order = await getOrder(params.id ?? "");
  if (!order) throw new Response("Sipariş bulunamadı", { status: 404 });

  const orderShop = order.shop || session.shop;
  const [design, siblings] = await Promise.all([
    order.designToken ? getDesignByToken(orderShop, order.designToken) : null,
    getSiblingOrders(orderShop, order.shopifyOrderId, order.id),
  ]);
  const frontObjects = design ? extractObjects(design.designJson, "front") : [];
  const backObjects = design ? extractObjects(design.designJson, "back") : [];

  return json({ order, siblings, design, frontObjects, backObjects, shop: session.shop });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const status = form.get("status") as string;
  const appOrderId = params.id ?? "";

  if (status === "shipped") {
    // Mark all variants of this Shopify order as shipped (not just this one row)
    const order = await getOrder(appOrderId);
    let allIds = [appOrderId];
    if (order?.shopifyOrderId) {
      // Pass "" as excludeId — no UUID matches empty string, so returns ALL rows for this Shopify order
      const all = await getSiblingOrders(session.shop, order.shopifyOrderId, "");
      allIds = [...new Set([appOrderId, ...all.map((s) => s.id)])];
    }
    await bulkUpdateStatus(allIds, "shipped");
    try {
      await fulfillShopifyOrders(admin, session.shop, allIds);
    } catch (err) {
      console.error("[fulfill] order detail ship error:", err);
    }
  } else {
    await updateOrderStatus(appOrderId, status);
  }

  return redirect(`/app/orders/${params.id}`);
};

export default function OrderDetail() {
  const { order, siblings = [], design, frontObjects = [], backObjects = [], shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const { t, lang } = useTranslation();

  const next = NEXT_STATUS[order.productionStatus];
  const shopDomain = shop.replace(".myshopify.com", "");
  const customerDesignUrl = order.designToken
    ? `https://${shopDomain}.myshopify.com/apps/tshirt-designer/my-order?token=${encodeURIComponent(order.designToken)}`
    : null;

  // Fallback URLs: design record → order JOIN data → order own columns
  const frontPreviewUrl = design?.frontPreviewUrl || order.designFrontPreviewUrl || order.previewUrl || "";
  const backPreviewUrl = design?.backPreviewUrl || order.designBackPreviewUrl || "";
  const frontPrintUrl = design?.frontPrintUrl || order.designFrontPrintUrl || order.productionFileUrl || "";
  const backPrintUrl = design?.backPrintUrl || order.designBackPrintUrl || "";

  return (
    <Page
      title={order.orderNumber}
      backAction={{ content: t("orderDetail.backToOrders"), onAction: () => navigate("/app/orders") }}
      primaryAction={next ? {
        content: `→ ${STATUS_KEYS[next] ? t(STATUS_KEYS[next]) : next}`,
        onAction: () => {
          const fd = new FormData();
          fd.set("status", next);
          fetcher.submit(fd, { method: "post" });
        },
      } : undefined}
      titleMetadata={
        <Badge tone={BADGE_TONE[order.productionStatus] ?? "new"}>
          {STATUS_KEYS[order.productionStatus] ? t(STATUS_KEYS[order.productionStatus]) : order.productionStatus}
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
                  {frontPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={frontPreviewUrl}
                        alt="Ön tasarım önizlemesi"
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">Önizleme yok</Text>
                    </Box>
                  )}
                  <InlineStack gap="300">
                    {frontPreviewUrl && (
                      <a href={dlUrl(frontPreviewUrl, "on-onizleme.png")} download>
                        <Button variant="plain" size="slim">⬇ Önizlemeyi İndir</Button>
                      </a>
                    )}
                    {frontPrintUrl && (
                      <a href={dlUrl(frontPrintUrl, "on-baski.png")} download>
                        <Button variant="secondary" size="slim">⬇ Baskı Dosyası (Yüksek Kalite)</Button>
                      </a>
                    )}
                  </InlineStack>
                  {frontObjects.length > 0 && (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm" tone="subdued">Ön yüz öğeleri ({frontObjects.length})</Text>
                      {(() => {
                        let imgIdx = 0;
                        return frontObjects.map((obj, i) => {
                          const isImg = obj.type === "image" && obj.src;
                          const href = isImg ? imageDownloadUrl(shop, order.id, "front", imgIdx) : undefined;
                          if (isImg) imgIdx++;
                          return <DesignObjectCard key={i} obj={obj} downloadHref={href} />;
                        });
                      })()}
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
                  {backPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={backPreviewUrl}
                        alt="Arka tasarım önizlemesi"
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">Arka tasarım yok</Text>
                    </Box>
                  )}
                  <InlineStack gap="300">
                    {backPreviewUrl && (
                      <a href={dlUrl(backPreviewUrl, "arka-onizleme.png")} download>
                        <Button variant="plain" size="slim">⬇ Önizlemeyi İndir</Button>
                      </a>
                    )}
                    {backPrintUrl && (
                      <a href={dlUrl(backPrintUrl, "arka-baski.png")} download>
                        <Button variant="secondary" size="slim">⬇ Baskı Dosyası (Yüksek Kalite)</Button>
                      </a>
                    )}
                  </InlineStack>
                  {backObjects.length > 0 && (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm" tone="subdued">Arka yüz öğeleri ({backObjects.length})</Text>
                      {(() => {
                        let imgIdx = 0;
                        return backObjects.map((obj, i) => {
                          const isImg = obj.type === "image" && obj.src;
                          const href = isImg ? imageDownloadUrl(shop, order.id, "back", imgIdx) : undefined;
                          if (isImg) imgIdx++;
                          return <DesignObjectCard key={i} obj={obj} downloadHref={href} />;
                        });
                      })()}
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
                <Text as="span">{order.productName?.split(" - ")[0] || order.productName || "—"}</Text>
              </InlineStack>
              {order.variantTitle && (
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">Bu kayıt (beden)</Text>
                  <Badge tone="info">{order.variantTitle}</Badge>
                </InlineStack>
              )}
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Adet</Text>
                <Text as="span" fontWeight="semibold">{order.quantity ?? 1}</Text>
              </InlineStack>

              {/* Aynı siparişin diğer bedenleri */}
              {siblings.length > 0 && (
                <>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Bu tasarımın diğer bedenleri ({siblings.length + 1} beden toplam{" "}
                      {[order, ...siblings].reduce((s: number, o: Order) => s + (o.quantity ?? 1), 0)} adet):
                    </Text>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {/* Mevcut kayıt */}
                      <span style={{ background: "#4f46e5", color: "#fff", padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                        {order.variantTitle || "—"} × {order.quantity ?? 1}
                      </span>
                      {siblings.map((s: Order) => (
                        <span key={s.id} style={{ background: "#f3f4f6", color: "#374151", padding: "3px 10px", borderRadius: 20, fontSize: 13, border: "1px solid #e5e7eb" }}>
                          {s.variantTitle || "—"} × {s.quantity ?? 1}
                        </span>
                      ))}
                    </div>
                  </BlockStack>
                </>
              )}

              <Divider />
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Durum</Text>
                <Badge tone={BADGE_TONE[order.productionStatus] ?? "new"}>
                  {STATUS_KEYS[order.productionStatus] ? t(STATUS_KEYS[order.productionStatus]) : order.productionStatus}
                </Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">Tarih</Text>
                <Text as="span">
                  {new Date(order.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "tr-TR", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </Text>
              </InlineStack>
              {!design && (
                <Banner tone="warning" title={t("orderDetail.noDesignData")}>
                  <p>Bu sipariş için tasarım dosyası sunucuda mevcut değil. Tasarım token: {order.designToken || "—"}</p>
                </Banner>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Müşteri Linki */}
        {customerDesignUrl && (
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Müşteri Tasarım Linki</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Bu linki müşteriye gönderin — kendi tasarımını görebilir ve indirebilir.
                </Text>
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", wordBreak: "break-all", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>
                  {customerDesignUrl}
                </div>
                <InlineStack gap="300">
                  <Button
                    variant="secondary"
                    onClick={() => navigator.clipboard.writeText(customerDesignUrl)}
                  >
                    Linki Kopyala
                  </Button>
                  <a href={customerDesignUrl} target="_blank" rel="noreferrer">
                    <Button variant="plain">Önizle →</Button>
                  </a>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        )}

      </BlockStack>
    </Page>
  );
}
