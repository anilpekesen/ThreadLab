import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { processOrderBgRemoval } from "~/models/auto-bg-removal.server";
import { getOrderByShopifyId, updateOrderStatus } from "~/models/orders.server";

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
  // Order-level attributes
  const fromOrder =
    getAttr(payload.note_attributes, "design_token") ??
    getAttr(payload.attributes, "design_token");
  if (fromOrder) return fromOrder;

  // Line item properties
  for (const item of payload.line_items ?? []) {
    const token =
      getAttr(item.properties, "design_token") ??
      getAttr(item.attributes, "design_token");
    if (token) return token;
  }
  return undefined;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

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
