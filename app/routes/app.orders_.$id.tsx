import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "~/i18n";

const APP_URL = "https://app.printlabapp.com";

function isValidFileUrl(url: string): boolean {
  return Boolean(url) && url.startsWith("https://") && !url.startsWith("data:");
}

function dlUrl(fileUrl: string, filename: string): string {
  if (!isValidFileUrl(fileUrl)) return "";
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

function imageDownloadUrl(shop: string, orderId: string, side: "front" | "back", imgIndex: number): string {
  return `${APP_URL}/api/design-image?order_id=${encodeURIComponent(orderId)}&shop=${encodeURIComponent(shop)}&side=${side}&index=${imgIndex}`;
}

function shopAdminHandle(shop?: string | null): string {
  return (shop || "").replace(".myshopify.com", "");
}

function adminAppOrderUrl(shop: string, orderId: string): string {
  return `https://admin.shopify.com/store/${shopAdminHandle(shop)}/apps/printlabapp/app/orders/${orderId}`;
}

function adminShopifyOrderUrl(shop: string, shopifyOrderId: string): string {
  return `https://admin.shopify.com/store/${shopAdminHandle(shop)}/orders/${shopifyOrderId}`;
}

function cardActionStyle(selected: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    minHeight: 36,
    borderRadius: 8,
    border: selected ? "1px solid #91b7ff" : "1px solid #babfc3",
    background: selected ? "#2c6ecb" : "#ffffff",
    color: selected ? "#ffffff" : "#202223",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: "34px",
    textAlign: "center",
    textDecoration: "none",
    cursor: selected ? "default" : "pointer",
    opacity: selected ? 0.86 : 1,
  };
}
import {
  Page, Card, BlockStack, InlineStack, Text, Badge, Button,
  Box, Divider, Grid, Thumbnail, Banner,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { getOrder, getSiblingOrders, updateOrderStatus, bulkUpdateStatus, fulfillShopifyOrders, setShopifyOrderDriveUpload } from "~/models/orders.server";
import type { Order } from "~/models/orders.server";
import { getDesignByToken, extractObjects, type DesignObject } from "~/models/designs.server";
import { getDriveConnection } from "~/models/shop-google-drive.server";
import {
  getValidAccessToken,
  ensureRootFolder,
  uploadText,
  getFolderWebUrl,
} from "~/lib/google-drive.server";
import {
  buildOrderDriveSummary,
  ensureOrderDriveFolder,
  resolveDriveExportProducts,
  uploadOrderProductsToDrive,
  withOrderDriveExportLock,
} from "~/lib/order-drive-export.server";

function DesignObjectCard({ obj, downloadHref }: { obj: DesignObject; downloadHref?: string }) {
  const { t } = useTranslation();
  // curvedText: tasarımcıdaki kavisli yazı aracının özel fabric tipi
  const isText = obj.type === "i-text" || obj.type === "textbox" || obj.type === "curvedText";
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
                <span>{t("orderDetail.colorLabel")}</span>
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
          {t("orderDetail.positionLabel")}: {Math.round(obj.left ?? 0)}, {Math.round(obj.top ?? 0)}
        </Text>
        {isImage && obj.src && (
          <a
            href={downloadHref ?? dlUrl(obj.src, "tasarim-gorsel.png")}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#2c6ecb" }}
          >
            {t("orderDetail.downloadImage")}
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

function productTitle(order: Order, fallback: string): string {
  return (order.productName || "").split(" - ")[0] || order.productName || fallback;
}

function productGroupKey(order: Order): string {
  return order.designToken || `${order.productId}:${order.variantId}:${order.id}`;
}

function compactVariants(rows: Order[], noVariantLabel: string): string {
  const variants = rows
    .map((row) => row.variantTitle || noVariantLabel)
    .filter(Boolean);
  const unique = [...new Set(variants)];
  if (unique.length <= 2) return unique.join(", ");
  return `${unique.slice(0, 2).join(", ")} +${unique.length - 2}`;
}

function groupTotalQty(rows: Order[]): number {
  return rows.reduce((total, row) => total + (row.quantity ?? 1), 0);
}

function hasFrontFiles(rows: Order[]): boolean {
  return rows.some((row) => Boolean(row.designFrontPreviewUrl || row.designFrontPrintUrl || row.previewUrl || row.productionFileUrl));
}

function hasBackFiles(rows: Order[]): boolean {
  return rows.some((row) => Boolean(row.designBackPreviewUrl || row.designBackPrintUrl));
}

function formatOrderDateTime(value?: string | null, lang: string = "tr"): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const order = await getOrder(params.id ?? "");
  if (!order) throw new Response("Sipariş bulunamadı", { status: 404 });

  const orderShop = order.shop || session.shop;
  const [design, allSiblings, driveConn] = await Promise.all([
    order.designToken ? getDesignByToken(orderShop, order.designToken) : null,
    getSiblingOrders(orderShop, order.shopifyOrderId, order.id),
    getDriveConnection(session.shop),
  ]);
  const frontObjects = design ? extractObjects(design.designJson, "front") : [];
  const backObjects = design ? extractObjects(design.designJson, "back") : [];

  // Aynı designToken = aynı ürünün farklı bedeni, farklı = ayrı ürün
  const siblings = allSiblings.filter((s) => s.designToken === order.designToken);
  const otherProducts = allSiblings.filter((s) => s.designToken !== order.designToken);

  return json({
    order,
    siblings,
    otherProducts,
    design,
    frontObjects,
    backObjects,
    shop: session.shop,
    driveConnected: Boolean(driveConn),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const appOrderId = params.id ?? "";

  if (intent === "googleDriveExport") {
    const order = await getOrder(appOrderId);
    if (!order) return json({ ok: false, error: "Sipariş bulunamadı" }, { status: 404 });
    const orderShop = order.shop || session.shop;
    const siblings = await getSiblingOrders(orderShop, order.shopifyOrderId, "").catch(() => [] as Order[]);
    const allRows = [order, ...siblings.filter((row) => row.id !== order.id)];
    const products = await resolveDriveExportProducts(orderShop, allRows);
    const hasAnyFile = products.some((product) =>
      product.frontPrint || product.backPrint || product.frontPreview || product.backPreview || product.design,
    );

    if (!hasAnyFile) {
      return json({ ok: false, error: "Yüklenecek tasarım dosyası bulunamadı" }, { status: 400 });
    }

    try {
      const result = await withOrderDriveExportLock(orderShop, order.shopifyOrderId, async () => {
        const accessToken = await getValidAccessToken(session.shop);
        const rootId = await ensureRootFolder(session.shop, accessToken);
        const folderId = await ensureOrderDriveFolder({
          shop: orderShop,
          shopifyOrderId: order.shopifyOrderId,
          accessToken,
          rootFolderId: rootId,
          folderName: (order.orderNumber || order.shopifyOrderId).replace(/^#/, ""),
        });

        const uploadedFiles = await uploadOrderProductsToDrive(accessToken, folderId, products, session.shop);
        await uploadText(accessToken, folderId, "siparis.txt", buildOrderDriveSummary(allRows), "text/plain; charset=utf-8");
        await setShopifyOrderDriveUpload(orderShop, order.shopifyOrderId, folderId);
        return { folderId, uploadedFiles };
      });

      return json({
        ok: true,
        folderUrl: await getFolderWebUrl(result.folderId),
        uploaded: result.uploadedFiles + 1,
      });
    } catch (err) {
      console.error("[google-drive] export failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      return json({ ok: false, error: msg }, { status: 500 });
    }
  }

  const status = form.get("status") as string;

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
  const { order, siblings = [], otherProducts = [], design, frontObjects = [], backObjects = [], shop, driveConnected } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const driveFetcher = useFetcher<{ ok?: boolean; error?: string; folderUrl?: string; uploaded?: number }>();
  const { t, lang } = useTranslation();
  const driveSubmitting = driveFetcher.state !== "idle";
  const driveResult = driveFetcher.data;

  const next = NEXT_STATUS[order.productionStatus];
  const customerDesignUrl = order.designToken
    ? `${APP_URL}/apps/tshirt-designer/my-order?shop=${encodeURIComponent(order.shop || shop)}&token=${encodeURIComponent(order.designToken)}`
    : null;
  const productGroups = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const row of [order, ...siblings, ...otherProducts]) {
      const key = productGroupKey(row);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([key, rows]) => ({
      key,
      rows,
      representative: rows[0],
      selected: key === productGroupKey(order),
    }));
  }, [order, siblings, otherProducts]);

  // Fallback URLs: design record → order JOIN data → order own columns
  // Filter out empty data: URLs (data:, saved when designer had no print content)
  const validUrl = (url: string | null | undefined) =>
    url && url.startsWith("https://") ? url : "";
  const frontPreviewUrl = validUrl(design?.frontPreviewUrl) || validUrl(order.designFrontPreviewUrl) || validUrl(order.previewUrl) || "";
  const backPreviewUrl = validUrl(design?.backPreviewUrl) || validUrl(order.designBackPreviewUrl) || "";
  const frontPrintUrl = validUrl(design?.frontPrintUrl) || validUrl(order.designFrontPrintUrl) || validUrl(order.productionFileUrl) || "";
  const backPrintUrl = validUrl(design?.backPrintUrl) || validUrl(order.designBackPrintUrl) || "";
  const hasDesignFiles = Boolean(frontPreviewUrl || backPreviewUrl || frontPrintUrl || backPrintUrl);

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

        {/* Renk uyuşmazlığı uyarısı — müşterinin seçtiği renk ile sipariş edilen varyant farklı */}
        {order.colorMismatch && (
          <Banner
            tone="critical"
            title={lang === "tr" ? "Renk uyuşmazlığı — yanlış renkte üretim riski" : "Color mismatch — risk of wrong-color production"}
          >
            <p>
              {lang === "tr"
                ? `Bu siparişteki varyant (${order.variantTitle}) müşterinin tasarımcıda seçtiği renkle uyuşmuyor. Basıma göndermeden önce müşteriyle teyit edin.`
                : `The variant on this order (${order.variantTitle}) does not match the color the customer selected in the designer. Confirm with the customer before sending to production.`}
            </p>
          </Banner>
        )}

        {/* Önizleme sorunu uyarısı */}
        {(order.previewIssue || design?.previewIssue) && (
          <Banner
            tone="warning"
            title={lang === "tr" ? "Önizleme görseli sorunlu olabilir" : "Preview image may be incorrect"}
          >
            <p>
              {lang === "tr"
                ? "Bu siparişin ön/arka önizleme görseli sepete eklenirken tişört arka planı tam yüklenmeden oluşturulmuş olabilir (beyaz görunüyor olabilir). Lütfen müşteri ile iletişime geçip tasarımı teyit edin."
                : "The front/back preview image for this order may have been captured before the t-shirt background fully loaded. Please contact the customer to confirm their design."}
            </p>
          </Banner>
        )}

        {/* Siparişteki farklı tasarımlar */}
        {productGroups.length > 1 && (
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">{t("orderDetail.orderDesigns")}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {order.orderNumber} · {productGroups.length} {t("orderDetail.variantCount")}
                    </Text>
                  </BlockStack>
                  <Badge tone="info">{`${productGroups.length} ${t("orderDetail.variantCount")}`}</Badge>
                </InlineStack>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}>
                  {productGroups.map((group, index) => {
                    const representative = group.representative;
                    const selected = group.selected;
                    const totalQty = groupTotalQty(group.rows);
                    const front = hasFrontFiles(group.rows);
                    const back = hasBackFiles(group.rows);
                    const targetUrl = adminAppOrderUrl(representative.shop || shop, representative.id);
                    return (
                      <div
                        key={group.key}
                        style={{
                          border: "1px solid #d9d9d9",
                          borderRadius: 8,
                          background: selected ? "#f4f8ff" : "#ffffff",
                          padding: 12,
                          outline: selected ? "2px solid #2c6ecb" : "none",
                          boxShadow: selected ? "0 0 0 1px rgba(44,110,203,.12)" : "none",
                        }}
                      >
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="start" gap="300">
                            <InlineStack gap="300" blockAlign="center" wrap={false}>
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                background: selected ? "#2c6ecb" : "#f1f2f4",
                                color: selected ? "#fff" : "#4a4a4a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {index + 1}
                              </div>
                              <BlockStack gap="050">
                                <Text as="h3" variant="headingSm">{productTitle(representative, t("orderDetail.productFallback"))}</Text>
                                <Text as="p" variant="bodySm" tone="subdued">{compactVariants(group.rows, t("orderDetail.noVariant"))}</Text>
                              </BlockStack>
                            </InlineStack>
                            {selected && <Badge tone="success">Açık</Badge>}
                          </InlineStack>

                          <InlineStack gap="200" wrap>
                            <Badge>{`${totalQty} ${t("orderDetail.piecesLabel")}`}</Badge>
                            {front && <Badge tone="info">{t("orderDetail.frontPrint")}</Badge>}
                            {back && <Badge tone="attention">{t("orderDetail.backPrint")}</Badge>}
                            {group.rows.length > 1 && <Badge tone="new">{`${group.rows.length} ${t("orderDetail.variantCount")}`}</Badge>}
                          </InlineStack>

                          {selected ? (
                            <span style={cardActionStyle(true)}>{t("orderDetail.thisDesignOpen")}</span>
                          ) : (
                            <a href={targetUrl} target="_top" style={cardActionStyle(false)}>
                              {t("orderDetail.openThisDesign")}
                            </a>
                          )}
                        </BlockStack>
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            </Box>
          </Card>
        )}

        {/* Google Drive Export */}
        {(() => {
          const liveFolderUrl = driveResult?.ok ? driveResult.folderUrl : null;
          const persistedFolderUrl = order.driveFolderId
            ? `https://drive.google.com/drive/folders/${order.driveFolderId}`
            : null;
          const uploadedFolderUrl = liveFolderUrl || persistedFolderUrl;
          const uploadedAt = driveResult?.ok ? new Date().toISOString() : order.driveUploadedAt;
          const isUploaded = Boolean(uploadedFolderUrl);
          const formattedDate = formatOrderDateTime(uploadedAt, lang);

          return (
            <Card>
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingMd">{t("orderDetail.googleDriveBackup")}</Text>
                      {isUploaded && (
                        <Badge tone="success">{t("orderDetail.driveUploaded")}</Badge>
                      )}
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm">{t("orderDetail.driveDesc")}</Text>
                    {isUploaded && (
                      <Text as="p" variant="bodySm" tone="success">
                        {formattedDate && `${t("orderDetail.driveUploadedPrefix")}${formattedDate} · `}
                        <a href={uploadedFolderUrl!} target="_blank" rel="noopener noreferrer">
                          {t("orderDetail.driveOpenFolder")}
                        </a>
                      </Text>
                    )}
                    {driveResult && driveResult.ok === false && driveResult.error && (
                      <Text as="p" variant="bodySm" tone="critical">
                        {driveResult.error}
                      </Text>
                    )}
                  </BlockStack>
                  {driveConnected ? (
                    <Button
                      variant={isUploaded ? "secondary" : "primary"}
                      loading={driveSubmitting}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("intent", "googleDriveExport");
                        driveFetcher.submit(fd, { method: "post" });
                      }}
                    >
                      {isUploaded ? t("orderDetail.driveReUpload") : t("orderDetail.driveExport")}
                    </Button>
                  ) : (
                    <Button url="/app/settings">
                      {t("orderDetail.driveConnect")}
                    </Button>
                  )}
                </InlineStack>
              </Box>
            </Card>
          );
        })()}

        {/* Önizleme: Ön ve Arka */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">{t("orderDetail.frontFace")}</Text>
                  {frontPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={frontPreviewUrl}
                        alt={t("orderDetail.frontPreview")}
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">{t("orderDetail.noPreview")}</Text>
                    </Box>
                  )}
                  <InlineStack gap="300">
                    {frontPreviewUrl && (
                      <a href={dlUrl(frontPreviewUrl, "on-onizleme.png")} download>
                        <Button variant="plain" size="slim">{t("orderDetail.downloadPreview")}</Button>
                      </a>
                    )}
                    {frontPrintUrl && (
                      <a href={dlUrl(frontPrintUrl, "on-baski.png")} download>
                        <Button variant="secondary" size="slim">{t("orderDetail.downloadPrintFile")}</Button>
                      </a>
                    )}
                  </InlineStack>
                  {frontObjects.length > 0 && (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm" tone="subdued">{t("orderDetail.frontElements")} ({frontObjects.length})</Text>
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
                  <Text as="h2" variant="headingMd">{t("orderDetail.backFace")}</Text>
                  {backPreviewUrl ? (
                    <div style={{ display: "flex", justifyContent: "center", background: "#f9fafb", borderRadius: 8, padding: 16 }}>
                      <img
                        src={backPreviewUrl}
                        alt={t("orderDetail.backPreview")}
                        style={{ maxWidth: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 4 }}
                      />
                    </div>
                  ) : (
                    <Box background="bg-surface-secondary" padding="800" borderRadius="200">
                      <Text as="p" tone="subdued" alignment="center">{t("orderDetail.noBackDesign")}</Text>
                    </Box>
                  )}
                  <InlineStack gap="300">
                    {backPreviewUrl && (
                      <a href={dlUrl(backPreviewUrl, "arka-onizleme.png")} download>
                        <Button variant="plain" size="slim">{t("orderDetail.downloadPreview")}</Button>
                      </a>
                    )}
                    {backPrintUrl && (
                      <a href={dlUrl(backPrintUrl, "arka-baski.png")} download>
                        <Button variant="secondary" size="slim">{t("orderDetail.downloadPrintFile")}</Button>
                      </a>
                    )}
                  </InlineStack>
                  {backObjects.length > 0 && (
                    <BlockStack gap="300">
                      <Text as="p" variant="bodySm" tone="subdued">{t("orderDetail.backElements")} ({backObjects.length})</Text>
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
              <Text as="h2" variant="headingMd">{t("orderDetail.orderInfo")}</Text>
              <Divider />
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">{t("orderDetail.orderNo")}</Text>
                <a
                  href={adminShopifyOrderUrl(order.shop || shop, order.shopifyOrderId)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2c6ecb", fontWeight: 600, textDecoration: "none" }}
                >
                  {order.orderNumber}
                </a>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">{t("orderDetail.productLabel")}</Text>
                <Text as="span">{order.productName?.split(" - ")[0] || order.productName || "—"}</Text>
              </InlineStack>
              {order.variantTitle && (
                <InlineStack align="space-between">
                  <Text as="span" tone="subdued">{t("orderDetail.thisRecord")}</Text>
                  <Badge tone="info">{order.variantTitle}</Badge>
                </InlineStack>
              )}
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">{t("orderDetail.quantity")}</Text>
                <Text as="span" fontWeight="semibold">{order.quantity ?? 1}</Text>
              </InlineStack>

              {/* Aynı ürünün diğer bedenleri */}
              {siblings.length > 0 && (
                <>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("orderDetail.otherSizes")} ({siblings.length + 1} · {[order, ...siblings].reduce((s: number, o: Order) => s + (o.quantity ?? 1), 0)} {t("orderDetail.piecesLabel")}):
                    </Text>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                <Text as="span" tone="subdued">{t("orderDetail.statusLabel")}</Text>
                <Badge tone={BADGE_TONE[order.productionStatus] ?? "new"}>
                  {STATUS_KEYS[order.productionStatus] ? t(STATUS_KEYS[order.productionStatus]) : order.productionStatus}
                </Badge>
              </InlineStack>
              <InlineStack align="space-between">
                <Text as="span" tone="subdued">{t("orderDetail.dateLabel")}</Text>
                <Text as="span">
                  {formatOrderDateTime(order.createdAt, lang)}
                </Text>
              </InlineStack>
              {!design && !hasDesignFiles && (
                <Banner tone="warning" title={t("orderDetail.noDesignData")}>
                  <p>{t("orderDetail.noDesignDataDesc")} {order.designToken || "—"}</p>
                </Banner>
              )}
              {!design && hasDesignFiles && (
                <Banner tone="info" title={t("orderDetail.layerDataMissing")}>
                  <p>{t("orderDetail.layerDataMissingDesc")}</p>
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
                <Text as="h2" variant="headingMd">{t("orderDetail.customerLink")}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{t("orderDetail.customerLinkDesc")}</Text>
                <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", wordBreak: "break-all", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>
                  {customerDesignUrl}
                </div>
                <InlineStack gap="300">
                  <Button
                    variant="secondary"
                    onClick={() => navigator.clipboard.writeText(customerDesignUrl)}
                  >
                    {t("orderDetail.copyLinkBtn")}
                  </Button>
                  <a href={customerDesignUrl} target="_blank" rel="noreferrer">
                    <Button variant="plain">{t("orderDetail.previewLink")}</Button>
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
