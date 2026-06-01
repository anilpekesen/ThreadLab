import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "crypto";
import { verifyWebhookHmac } from "~/lib/shopify.server";
import { processOrderBgRemoval } from "~/models/auto-bg-removal.server";
import { getOrderByShopifyId, updateOrderStatus } from "~/models/orders.server";
import { resetCustomerBgQuota } from "~/models/customer-bg-quota.server";
import { resetCustomerAiQuota } from "~/models/customer-ai-quota.server";
import { getSessionForDesignToken } from "~/models/designs.server";
import { query } from "~/lib/db.server";
import { upsertShopSubscription } from "~/models/billing.server";
import { PLAN_NAMES } from "~/lib/plans";

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
  product_id?: number;
  variant_id?: number;
  variant_title?: string | null;
  quantity?: number;
  name?: string;
  requires_shipping?: boolean;
  properties?: Attr[];
  attributes?: Attr[];
};
type OrderPayload = {
  id?: number;
  name?: string;
  created_at?: string;
  note_attributes?: Attr[];
  attributes?: Attr[];
  line_items?: LineItem[];
  customer?: { first_name?: string; last_name?: string; email?: string };
};

function getAttr(attrs: Attr[] | undefined, key: string): string | undefined {
  return attrs?.find((a) => (a.name ?? a.key) === key)?.value;
}

function extractDesignToken(payload: OrderPayload): string | undefined {
  const fromOrder =
    getAttr(payload.note_attributes, "design_token") ??
    getAttr(payload.attributes, "design_token");
  if (fromOrder) return fromOrder;

  for (const item of payload.line_items ?? []) {
    const token =
      getAttr(item.properties, "design_token") ??
      getAttr(item.attributes, "design_token");
    if (token) return token;
  }
  return undefined;
}

async function importOrderFromWebhook(shop: string, payload: OrderPayload): Promise<void> {
  const shopifyOrderId = String(payload.id ?? "");
  if (!shopifyOrderId) return;

  const orderToken = getAttr(payload.note_attributes, "design_token") ?? getAttr(payload.attributes, "design_token");
  const lineItems = payload.line_items ?? [];
  const designItems = lineItems.filter(
    (li) =>
      getAttr(li.properties, "design_token") !== undefined ||
      getAttr(li.attributes, "design_token") !== undefined,
  );
  const itemsToProcess =
    designItems.length > 0 ? designItems : lineItems.filter((li) => li.requires_shipping);

  if (!orderToken && designItems.length === 0) return;
  if (itemsToProcess.length === 0) return;

  const orderFrontPreviewUrl =
    getAttr(payload.note_attributes, "_front_preview_url") ??
    getAttr(payload.attributes, "_front_preview_url") ??
    "";
  const orderFrontPrintUrl =
    getAttr(payload.note_attributes, "_front_print_url") ??
    getAttr(payload.attributes, "_front_print_url") ??
    "";
  const customerName =
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") ||
    "Müşteri";
  const customerEmail = payload.customer?.email ?? "";

  for (const item of itemsToProcess) {
    const variantId = String(item.variant_id ?? "");

    const exists = await query(
      "SELECT 1 FROM orders WHERE shop = $1 AND shopify_order_id = $2 AND variant_id = $3",
      [shop, shopifyOrderId, variantId],
    );
    if (exists.rows.length > 0) continue;

    const token =
      getAttr(item.properties, "design_token") ??
      getAttr(item.attributes, "design_token") ??
      orderToken ??
      "";
    const frontPreviewUrl =
      getAttr(item.properties, "_front_preview_url") ??
      getAttr(item.attributes, "_front_preview_url") ??
      orderFrontPreviewUrl;
    const frontPrintUrl =
      getAttr(item.properties, "_front_print_url") ??
      getAttr(item.attributes, "_front_print_url") ??
      orderFrontPrintUrl;

    const id = `order_${randomBytes(8).toString("hex")}`;
    await query(
      `INSERT INTO orders
         (id, shop, shopify_order_id, order_number, product_id, product_name,
          variant_id, variant_title, quantity, design_token, preview_url,
          production_file_url, customer_name, customer_email,
          production_status, missing_surcharge, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',FALSE,$15)
       ON CONFLICT (shop, shopify_order_id, variant_id) DO NOTHING`,
      [
        id,
        shop,
        shopifyOrderId,
        payload.name ?? `#${shopifyOrderId}`,
        String(item.product_id ?? ""),
        item.name ?? "",
        variantId,
        item.variant_title ?? "",
        item.quantity ?? 1,
        token,
        frontPreviewUrl,
        frontPrintUrl,
        customerName,
        customerEmail,
        payload.created_at ? new Date(payload.created_at) : new Date(),
      ],
    );
    console.log(
      `[webhook] imported order ${payload.name} variant=${item.variant_title ?? variantId} qty=${item.quantity ?? 1}`,
    );
  }
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
    }
    return json({ ok: true });
  }

  // ── Orders created ──────────────────────────────────────────────────
  if (topic === "ORDERS_CREATE" || topic === "orders/create") {
    const order = payload as OrderPayload;
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"}`);

    importOrderFromWebhook(shop, order).catch((err) =>
      console.error(`[webhook] importOrder failed for order ${order.name}:`, err),
    );

    if (designToken) {
      processOrderBgRemoval(shop, designToken).catch((err) =>
        console.error(`[webhook] auto-bg failed for order ${order.name}:`, err),
      );
    }
  }

  // ── Orders paid ──────────────────────────────────────────────────
  if (topic === "ORDERS_PAID" || topic === "orders/paid") {
    const order = payload as OrderPayload;
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"}`);

    importOrderFromWebhook(shop, order).catch((err) =>
      console.error(`[webhook] importOrder (paid fallback) failed for order ${order.name}:`, err),
    );

    if (designToken) {
      resetCustomerQuota(shop, designToken, order.name);
    }
  }

  // ── Orders cancelled ─────────────────────────────────────────────
  if (topic === "ORDERS_CANCELLED" || topic === "orders/cancelled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    console.log(`[webhook] cancelled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      getOrderByShopifyId(shop, shopifyOrderId)
        .then((existing) => {
          if (existing) return updateOrderStatus(existing.id, "cancelled");
        })
        .catch((err) =>
          console.error(`[webhook] cancel status update failed for order ${order.name}:`, err),
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
