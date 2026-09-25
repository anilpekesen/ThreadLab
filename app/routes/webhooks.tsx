import { importOrder, shopifyOrderToIncoming } from "~/models/order-import.server";
import { createPrintfulDraft } from "~/models/printful.server";
import { checkOrderPrintPricing } from "~/lib/print-price-check.server";
import { activatePendingPromo } from "~/models/promo.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { notifyOrderPaid, type OrderNotificationItem } from "~/lib/notify-order.server";
import { randomBytes } from "crypto";
import { verifyWebhookHmac } from "~/lib/shopify.server";
import { processOrderBgRemoval } from "~/models/auto-bg-removal.server";
import { getOrderByShopifyId, getOrdersByShopifyId, updateOrderStatus, cancelShopifyOrder, setShopifyOrderDriveUpload, getSiblingOrders } from "~/models/orders.server";
import { resetCustomerBgQuota } from "~/models/customer-bg-quota.server";
import { resetCustomerAiQuota } from "~/models/customer-ai-quota.server";
import { getSessionForDesignToken } from "~/models/designs.server";
import { query } from "~/lib/db.server";
import { upsertShopSubscription } from "~/models/billing.server";
import { PLAN_NAMES } from "~/lib/plans";
import { getDriveConnection } from "~/models/shop-google-drive.server";
import { CREDIT_PACKS } from "~/lib/credit-packs";
import {
  getValidAccessToken,
  ensureRootFolder,
  uploadText,
  getDriveFolderName,
  renameDriveFolder,
} from "~/lib/google-drive.server";
import {
  buildOrderDriveSummary,
  ensureOrderDriveFolder,
  resolveDriveExportProducts,
  uploadOrderProductsToDrive,
  withOrderDriveExportLock,
} from "~/lib/order-drive-export.server";

async function autoExportOrderToDrive(shop: string, shopifyOrderId: string): Promise<void> {
  const conn = await getDriveConnection(shop);
  if (!conn) return;

  await withOrderDriveExportLock(shop, shopifyOrderId, async () => {
    const firstOrder = await getOrderByShopifyId(shop, shopifyOrderId);
    if (!firstOrder) return;

    // Check ALL rows for this order: getOrderByShopifyId returns an arbitrary
    // row (no ORDER BY), so if a newly-inserted row with drive_folder_id = NULL
    // comes first we would miss the existing upload and create a duplicate.
    const uploaded = await query<{ drive_folder_id: string }>(
      `SELECT drive_folder_id FROM orders
       WHERE shop = $1 AND shopify_order_id = $2
         AND drive_folder_id IS NOT NULL AND drive_folder_id != ''
         AND drive_folder_id != 'pending' AND drive_uploaded_at IS NOT NULL
       LIMIT 1`,
      [shop, shopifyOrderId],
    );
    if (uploaded.rows[0]) return;

    // Tüm satırları al (farklı ürünler dahil)
    const siblings = await getSiblingOrders(shop, shopifyOrderId, "").catch(() => []);
    const allRows = [firstOrder, ...siblings.filter((s) => s.id !== firstOrder.id)];
    const resolvedProducts = await resolveDriveExportProducts(shop, allRows);

    const hasAnyFile = resolvedProducts.some((p) =>
      p.frontPrint || p.backPrint || p.frontPreview || p.backPreview,
    );
    if (!hasAnyFile) {
      console.log(`[webhook] drive export skipped — no files for order=${firstOrder.orderNumber}`);
      return;
    }

    const accessToken = await getValidAccessToken(shop);
    const rootId = await ensureRootFolder(shop, accessToken);
    const folderId = await ensureOrderDriveFolder({
      shop,
      shopifyOrderId,
      accessToken,
      rootFolderId: rootId,
      folderName: (firstOrder.orderNumber || shopifyOrderId).replace(/^#/, ""),
    });

    await uploadOrderProductsToDrive(accessToken, folderId, resolvedProducts, shop);
    await uploadText(accessToken, folderId, "siparis.txt", buildOrderDriveSummary(allRows), "text/plain; charset=utf-8");
    await setShopifyOrderDriveUpload(shop, shopifyOrderId, folderId);
    console.log(`[webhook] auto drive export: order=${firstOrder.orderNumber} products=${resolvedProducts.length} folder=${folderId}`);
  });
}

async function markDriveFolderCancelled(shop: string, shopifyOrderId: string): Promise<void> {
  const conn = await getDriveConnection(shop);
  if (!conn) return;

  const order = await getOrderByShopifyId(shop, shopifyOrderId);
  if (!order?.driveFolderId) return;

  const accessToken = await getValidAccessToken(shop);
  const currentName = await getDriveFolderName(accessToken, order.driveFolderId);
  if (!currentName || currentName.startsWith("❌")) return; // already marked

  await renameDriveFolder(accessToken, order.driveFolderId, `❌ ${currentName}`);
  console.log(`[webhook] drive folder cancelled: "${currentName}" → "❌ ${currentName}"`);
}

async function deleteShopData(shop: string): Promise<void> {
  const tables = [
    "orders",
    "designs",
    "product_settings",
    "product_print_areas",
    "product_categories",
    "shop_subscriptions",
    "shop_settings",
    "shop_templates",
    "bg_removal_usage",
    "customer_bg_quota",
  ];
  for (const table of tables) {
    await query(`DELETE FROM ${table} WHERE shop = $1`, [shop]);
  }
  console.log(`[webhook] shop_redact: deleted all data for ${shop}`);
}

// Shopify uses both {name, value} (REST) and {key, value} (some contexts)
type Attr = { name?: string; key?: string; value: string };
type LineItem = {
  id?: number;
  product_id?: number;
  variant_id?: number;
  variant_title?: string | null;
  quantity?: number;
  price?: string;
  price_set?: { shop_money?: { amount?: string; currency_code?: string } };
  name?: string;
  requires_shipping?: boolean;
  properties?: Attr[];
  attributes?: Attr[];
};
type OrderPayload = {
  id?: number;
  name?: string;
  created_at?: string;
  financial_status?: string;
  currency?: string;
  total_price?: string;
  // Shopify müşteri e-postasını üç ayrı alanda gönderebiliyor; customer objesi
  // olmayan (misafir) siparişlerde sadece üst seviyedekiler dolu oluyor
  email?: string;
  contact_email?: string;
  note_attributes?: Attr[];
  attributes?: Attr[];
  line_items?: LineItem[];
  customer?: { first_name?: string; last_name?: string; email?: string };
};

function getAttr(attrs: Attr[] | undefined, key: string): string | undefined {
  return attrs?.find((a) => (a.name ?? a.key) === key)?.value;
}

function getDesignToken(attrs: Attr[] | undefined): string | undefined {
  return getAttr(attrs, "_design_token") ?? getAttr(attrs, "design_token");
}

function extractCustomerEmail(payload: OrderPayload): string {
  return (payload.customer?.email || payload.email || payload.contact_email || "").trim();
}

function extractDesignToken(payload: OrderPayload): string | undefined {
  const fromOrder =
    getDesignToken(payload.note_attributes) ??
    getDesignToken(payload.attributes);
  if (fromOrder) return fromOrder;

  for (const item of payload.line_items ?? []) {
    const token =
      getDesignToken(item.properties) ??
      getDesignToken(item.attributes);
    if (token) return token;
  }
  return undefined;
}

function resetCustomerQuota(shop: string, designToken: string, orderName?: string) {
  getSessionForDesignToken(shop, designToken)
    .then(async (sessionId) => {
      if (!sessionId) return;
      await Promise.all([
        resetCustomerBgQuota(shop, sessionId),
        resetCustomerAiQuota(shop, sessionId),
      ]);
    })
    .catch((err) =>
      console.error(`[webhook] customer quota reset failed for order ${orderName}:`, err),
    );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256") ?? "";

  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("X-Shopify-Topic") ?? "";
  const shop = request.headers.get("X-Shopify-Shop-Domain") ?? "";

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // ── GDPR: customers/data_request ──────────────────────────────────
  if (topic === "CUSTOMERS_DATA_REQUEST" || topic === "customers/data_request") {
    console.log(`[webhook] GDPR data_request shop=${shop}`);
    return json({ ok: true });
  }

  // ── GDPR: customers/redact ────────────────────────────────────────
  if (topic === "CUSTOMERS_REDACT" || topic === "customers/redact") {
    const body = payload as { customer?: { email?: string }; orders_to_redact?: Array<{ id: number }> };
    const email = body.customer?.email;
    console.log(`[webhook] GDPR customers_redact shop=${shop} email=${email}`);
    if (email) {
      await query(
        `UPDATE orders SET customer_name = 'Redacted', customer_email = '' WHERE shop = $1 AND customer_email = $2`,
        [shop, email],
      ).catch((err) => console.error(`[webhook] customers_redact failed:`, err));
    }
    return json({ ok: true });
  }

  // ── GDPR: shop/redact ─────────────────────────────────────────────
  if (topic === "SHOP_REDACT" || topic === "shop/redact") {
    console.log(`[webhook] GDPR shop_redact shop=${shop} — deleting all shop data`);
    deleteShopData(shop).catch((err) =>
      console.error(`[webhook] shop_redact data deletion failed for ${shop}:`, err),
    );
    return json({ ok: true });
  }

  // ── App subscription updated (trial end / cancel / reactivate) ───────
  if (topic === "APP_SUBSCRIPTIONS_UPDATE" || topic === "app_subscriptions/update") {
    const body = payload as {
      app_subscription?: {
        admin_graphql_api_id?: string;
        name?: string;
        status?: string;
      };
    };
    const sub = body.app_subscription;
    const status = sub?.status?.toUpperCase();
    const planName = sub?.name ?? "";
    const subscriptionId = sub?.admin_graphql_api_id ?? null;

    if (PLAN_NAMES.includes(planName as never) && status) {
      const subscriptionStatus =
        status === "ACTIVE" ? "active" :
        status === "TRIAL" ? "trial" :
        "cancelled";
      upsertShopSubscription(shop, {
        planKey: planName as never,
        shopifySubscriptionId: subscriptionId,
        subscriptionStatus,
      }).catch((err) =>
        console.error(`[webhook] app_subscriptions/update upsert failed for ${shop}:`, err),
      );
      console.log(`[webhook] app_subscriptions/update shop=${shop} plan=${planName} status=${subscriptionStatus}`);
      if (subscriptionStatus === "active") {
        activatePendingPromo(shop, planName as never).catch((err) =>
          console.error(`[webhook] promo activation failed for ${shop}:`, err),
        );
      }
    }
    return json({ ok: true });
  }

  // ── Orders created ──────────────────────────────────────────────────
  if (topic === "ORDERS_CREATE" || topic === "orders/create") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    const designToken = extractDesignToken(order);
    const financialStatus = order.financial_status ?? "pending";
    const isPaid = ["paid", "authorized", "partially_paid"].includes(financialStatus);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"} financial=${financialStatus}`);

    importOrder(shop, shopifyOrderToIncoming(order))
      .then(() => {
        // Baskı ücreti tasarımdan yeniden hesaplanır; eksikse etiket + bildirim
        // Printful bağlıysa eşleşen satırlar için taslak sipariş (onay beklenir)
        if (shopifyOrderId) {
          createPrintfulDraft(shop, shopifyOrderId).then((r) => {
            if (r.status !== "skipped") console.log(`[printful] ${order.name}: ${r.status}${r.message ? ` (${r.message})` : ""}`);
          }).catch((err) => console.error(`[printful] ${order.name} taslak hatası:`, err));
        }
        if (shopifyOrderId && designToken) {
          checkOrderPrintPricing(shop, shopifyOrderId).catch((err) =>
            console.error(`[webhook] price check failed for order ${order.name}:`, err),
          );
        }
        if (designToken) {
          processOrderBgRemoval(shop, designToken).catch((err) =>
            console.error(`[webhook] auto-bg failed for order ${order.name}:`, err),
          );
        }
        // Sadece ödeme onaylıysa Drive'a at — havale (pending) ise orders/paid bekle
        if (shopifyOrderId && designToken && isPaid) {
          autoExportOrderToDrive(shop, shopifyOrderId).catch((err) =>
            console.error(`[webhook] auto-drive-export failed for order ${order.name}:`, err),
          );
        } else if (!isPaid) {
          console.log(`[webhook] drive export beklemede (${financialStatus}): order=${order.name}`);
        }
      })
      .catch((err) =>
        console.error(`[webhook] importOrder failed for order ${order.name}:`, err),
      );
  }

  // ── Orders paid ──────────────────────────────────────────────────
  if (topic === "ORDERS_PAID" || topic === "orders/paid") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"} — ödeme onaylandı`);

    importOrder(shop, shopifyOrderToIncoming(order))
      .then(async () => {
        if (designToken) {
          resetCustomerQuota(shop, designToken, order.name);
        }
        // Ödeme onaylandı → her zaman Drive'a at (havale dahil)
        if (shopifyOrderId) {
          autoExportOrderToDrive(shop, shopifyOrderId).catch((err) =>
            console.error(`[webhook] auto-drive-export (paid) failed for order ${order.name}:`, err),
          );
        }

        // Sipariş bildirimi (e-posta / webhook)
        try {
          const firstItem = order.line_items?.[0];
          const customerName =
            [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
            "Misafir";

          // Tasarım URL'lerini DB'den çek — çok ürünlü siparişte ürün başına bir satır
          let designFrontUrl: string | undefined;
          let designBackUrl: string | undefined;
          let printFrontUrl: string | undefined;
          let printBackUrl: string | undefined;
          let notifyDesignToken = designToken;
          let notifyItems: OrderNotificationItem[] | undefined;

          const currency =
            firstItem?.price_set?.shop_money?.currency_code ?? order.currency ?? "";

          if (shopifyOrderId) {
            const dbOrders = await getOrdersByShopifyId(shop, shopifyOrderId).catch(() => []);
            const dbOrder = dbOrders[0];
            if (dbOrder) {
              designFrontUrl = dbOrder.designFrontPreviewUrl ?? undefined;
              designBackUrl  = dbOrder.designBackPreviewUrl  ?? undefined;
              printFrontUrl  = dbOrder.designFrontPrintUrl   ?? undefined;
              printBackUrl   = dbOrder.designBackPrintUrl    ?? undefined;
              notifyDesignToken = notifyDesignToken || (dbOrder.designToken ?? undefined);
            }

            // Satır tutarı DB'de yok — webhook payload'ından varyanta göre eşleştir
            const unitPriceByVariant = new Map<string, number>();
            for (const li of order.line_items ?? []) {
              const vId = String(li.variant_id ?? "");
              if (!vId) continue;
              const price = Number(li.price_set?.shop_money?.amount ?? li.price ?? 0);
              if (Number.isFinite(price)) unitPriceByVariant.set(vId, price);
            }

            notifyItems = dbOrders.map((row) => {
              const unit = unitPriceByVariant.get(row.variantId);
              const qty = row.quantity || 1;
              return {
                productName: row.productName || "Ürün",
                variantTitle: row.variantTitle || undefined,
                quantity: qty,
                lineTotal: unit !== undefined ? (unit * qty).toFixed(2) : undefined,
                currency,
                designFrontUrl: row.designFrontPreviewUrl || row.previewUrl || undefined,
                designBackUrl: row.designBackPreviewUrl || undefined,
                designToken: row.designToken || undefined,
              };
            });
          }

          await notifyOrderPaid({
            shop,
            orderName: order.name ?? shopifyOrderId,
            shopifyOrderId,
            customerName,
            customerEmail: extractCustomerEmail(order) || undefined,
            productName: firstItem?.name ?? "Ürün",
            variantTitle: firstItem?.variant_title ?? "",
            quantity: firstItem?.quantity ?? 1,
            totalPrice: firstItem?.price_set?.shop_money?.amount ?? firstItem?.price ?? "—",
            currency,
            designFrontUrl,
            designBackUrl,
            printFrontUrl,
            printBackUrl,
            designToken: notifyDesignToken,
            items: notifyItems?.length ? notifyItems : undefined,
            orderTotal: order.total_price,
          });
        } catch (err) {
          console.error(`[webhook] notify failed for order ${order.name}:`, err);
        }
      })
      .catch((err) =>
        console.error(`[webhook] importOrder (paid) failed for order ${order.name}:`, err),
      );
  }

  // ── Orders cancelled ─────────────────────────────────────────────
  if (topic === "ORDERS_CANCELLED" || topic === "orders/cancelled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    console.log(`[webhook] cancelled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      // Cancel ALL rows for this order (multi-line-item orders have one row per variant)
      cancelShopifyOrder(shop, shopifyOrderId)
        .catch((err) =>
          console.error(`[webhook] cancel status update failed for order ${order.name}:`, err),
        );

      markDriveFolderCancelled(shop, shopifyOrderId).catch((err) =>
        console.error(`[webhook] drive cancel mark failed for order ${order.name}:`, err),
      );
    }
  }

  // ── Orders deleted ───────────────────────────────────────────────
  if (topic === "ORDERS_DELETE" || topic === "orders/delete") {
    const order = payload as { id?: number };
    const shopifyOrderId = String(order.id ?? "");
    console.log(`[webhook] deleted shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      query("DELETE FROM orders WHERE shop = $1 AND shopify_order_id = $2", [
        shop,
        shopifyOrderId,
      ]).catch((err) =>
        console.error(`[webhook] delete failed for shopifyId=${shopifyOrderId}:`, err),
      );
    }
  }

  // ── One-time purchase approved (AI credit packs) ──────────────────────────
  if (topic === "APP_PURCHASES_ONE_TIME_UPDATE" || topic === "app_purchases/update") {
    const body = payload as {
      id?: number;
      admin_graphql_api_id?: string;
      status?: string;
      name?: string;
    };
    const status = body.status?.toUpperCase();
    const chargeId = body.admin_graphql_api_id;
    const packName = body.name ?? "";

    if (status === "ACTIVE" && chargeId) {
      const pack = Object.values(CREDIT_PACKS).find((p) => p.label === packName);
      if (pack) {
        query("SELECT id FROM ai_credit_purchases WHERE charge_id = $1", [chargeId])
          .then(async (existing) => {
            if (existing.rows.length > 0) return;
            const id = `acp_${randomBytes(8).toString("hex")}`;
            await query(
              `INSERT INTO ai_credit_purchases (id, shop, charge_id, pack_key, credits_added, price_usd, expires_at)
               VALUES ($1,$2,$3,$4,$5,$6, now() + interval '30 days') ON CONFLICT (charge_id) DO NOTHING`,
              [id, shop, chargeId, pack.key, pack.credits, pack.price],
            );
            console.log(
              `[webhook] credit pack applied: shop=${shop} pack=${pack.key} credits=${pack.credits}`,
            );
          })
          .catch((err) => console.error("[webhook] credit pack error:", err));
      }
    }
  }

  // ── Orders fulfilled ─────────────────────────────────────────────
  if (topic === "ORDERS_FULFILLED" || topic === "orders/fulfilled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    console.log(`[webhook] fulfilled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      getOrderByShopifyId(shop, shopifyOrderId)
        .then((existing) => {
          if (existing && existing.productionStatus !== "shipped") {
            return updateOrderStatus(existing.id, "shipped");
          }
        })
        .catch((err) =>
          console.error(`[webhook] status update failed for order ${order.name}:`, err),
        );
    }
  }

  return json({ ok: true });
};
