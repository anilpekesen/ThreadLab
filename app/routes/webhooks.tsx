import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { processOrderBgRemoval } from "~/models/auto-bg-removal.server";
import { getOrderByShopifyId, updateOrderStatus } from "~/models/orders.server";
import { resetCustomerBgQuota } from "~/models/customer-bg-quota.server";
import { getSessionForDesignToken } from "~/models/designs.server";

// Shopify uses both {name, value} (REST) and {key, value} (some contexts)
type Attr = { name?: string; key?: string; value: string };
type LineItem = { properties?: Attr[]; attributes?: Attr[] };
type OrderPayload = {
  id?: number;
  name?: string;
  note_attributes?: Attr[];
  attributes?: Attr[];
  line_items?: LineItem[];
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

function resetCustomerQuota(shop: string, designToken: string, orderName?: string) {
  getSessionForDesignToken(designToken)
    .then((sessionId) => {
      if (sessionId) return resetCustomerBgQuota(shop, sessionId);
    })
    .catch((err) =>
      console.error(`[webhook] customer bg quota reset failed for order ${orderName}:`, err),
    );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  // ── GDPR: customers/data_request ──────────────────────────────────
  if (topic === "CUSTOMERS_DATA_REQUEST" || topic === "customers/data_request") {
    // We store session IDs (no PII) tied to shop, no personal data to export.
    console.log(`[webhook] GDPR data_request shop=${shop}`);
    return json({ ok: true });
  }

  // ── GDPR: customers/redact ────────────────────────────────────────
  if (topic === "CUSTOMERS_REDACT" || topic === "customers/redact") {
    // No customer PII stored; session IDs are anonymous.
    console.log(`[webhook] GDPR customers_redact shop=${shop}`);
    return json({ ok: true });
  }

  // ── GDPR: shop/redact ─────────────────────────────────────────────
  if (topic === "SHOP_REDACT" || topic === "shop/redact") {
    // Shop uninstalled; all shop data can be cleaned up here if needed.
    console.log(`[webhook] GDPR shop_redact shop=${shop}`);
    return json({ ok: true });
  }

  // ── Orders created: trigger auto-bg-removal only ──────────────────
  if (topic === "ORDERS_CREATE" || topic === "orders/create") {
    const order = payload as OrderPayload;
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"}`);

    if (designToken) {
      processOrderBgRemoval(shop, designToken).catch((err) =>
        console.error(`[webhook] auto-bg failed for order ${order.name}:`, err),
      );
    }
  }

  // ── Orders paid: reset customer bg quota (payment confirmed) ─────
  if (topic === "ORDERS_PAID" || topic === "orders/paid") {
    const order = payload as OrderPayload;
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"}`);

    if (designToken) {
      resetCustomerQuota(shop, designToken, order.name);
    }
  }

  // ── Orders fulfilled: update production status ────────────────────
  if (topic === "ORDERS_FULFILLED" || topic === "orders/fulfilled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String(order.id ?? "");
    console.log(`[webhook] fulfilled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      getOrderByShopifyId(shopifyOrderId)
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
