import { join } from "path";
import { readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { getDataDir } from "~/lib/storage.server";

const DATA_DIR = getDataDir();

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

export interface Order {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productId: string;
  productName: string;
  variantId: string;
  designToken: string;
  previewUrl: string;
  productionFileUrl: string;
  productionStatus: string;
  missingSurcharge?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export async function getOrders(status?: string): Promise<Order[]> {
  const orders = readJson<Order[]>("orders.json", []);
  const filtered = status ? orders.filter((o) => o.productionStatus === status) : orders;
  return [...filtered].reverse();
}

export async function getDashboardStats() {
  const orders = readJson<Order[]>("orders.json", []);
  const today = new Date().toDateString();
  return {
    total: orders.length,
    today: orders.filter((o) => new Date(o.createdAt).toDateString() === today).length,
    pendingProduction: orders.filter((o) => o.productionStatus === "pending").length,
    ready: orders.filter((o) => o.productionStatus === "ready").length,
    missingSurcharge: orders.filter((o) => o.missingSurcharge).length,
  };
}

export async function updateOrderStatus(id: string, status: string) {
  const orders = readJson<Order[]>("orders.json", []);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error("Order not found");
  orders[idx].productionStatus = status;
  orders[idx].updatedAt = new Date().toISOString();
  writeJson("orders.json", orders);
  return orders[idx];
}

export interface SyncResult {
  shopifyTotal: number;
  newlySynced: number;
  skippedExisting: number;
  error?: string;
  sampleLineItemAttrs?: string;
}

// Fetch recent orders from Shopify Admin API and sync design orders into local JSON.
// Called on the orders page load so no webhook approval is needed.
export async function syncOrdersFromShopify(
  admin: { graphql: (query: string) => Promise<{ json: () => Promise<unknown> }> }
): Promise<SyncResult> {
  type Attr = { key: string; value: string };
  type LineItem = {
    id: string;
    name: string;
    product?: { id: string };
    variant?: { id: string };
    requiresShipping: boolean;
    customAttributes: Attr[];
  };
  type ShopifyOrder = {
    id: string;
    name: string;
    createdAt: string;
    customer?: { firstName: string; lastName: string; email: string };
    lineItems: { nodes: LineItem[] };
    customAttributes: Attr[];
  };

  let res: { json: () => Promise<unknown> };
  try {
    res = await admin.graphql(`#graphql
      {
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            customer { firstName lastName email }
            customAttributes { key value }
            lineItems(first: 20) {
              nodes {
                id
                name
                requiresShipping
                product { id }
                variant { id }
                customAttributes { key value }
              }
            }
          }
        }
      }
    `);
  } catch (e) {
    return { shopifyTotal: 0, newlySynced: 0, skippedExisting: 0, error: String(e) };
  }

  const data = await res.json() as { data?: { orders?: { nodes?: ShopifyOrder[] } }; errors?: unknown };
  if (!data.data?.orders) {
    return { shopifyTotal: 0, newlySynced: 0, skippedExisting: 0, error: JSON.stringify(data.errors ?? "no data") };
  }

  const shopifyOrders = data.data.orders.nodes ?? [];
  const orders = readJson<Order[]>("orders.json", []);
  let newlySynced = 0;
  let skippedExisting = 0;

  for (const so of shopifyOrders) {
    const shopifyOrderId = so.id.split("/").pop() ?? so.id;
    if (orders.some((o) => o.shopifyOrderId === shopifyOrderId)) {
      skippedExisting++;
      continue;
    }

    const getAttr = (attrs: Attr[], key: string) => attrs.find((a) => a.key === key)?.value;

    // Primary: design_token in line item customAttributes (set before Cart Transform)
    const designItems = so.lineItems.nodes.filter((li) =>
      getAttr(li.customAttributes, "design_token") !== undefined
    );

    // Secondary: design_token in order-level customAttributes (= cart attributes → note_attributes)
    // This works for orders placed after the liquid fix.
    const orderToken = getAttr(so.customAttributes, "design_token");

    // Tertiary: identify design order by having a non-shipping (surcharge) line item.
    // Cart Transform creates one requires_shipping=false line for the print fee.
    // The remaining requires_shipping=true item is the t-shirt.
    const hasSurcharge = so.lineItems.nodes.some((li) => !li.requiresShipping);
    const tshirtItem = hasSurcharge
      ? so.lineItems.nodes.find((li) => li.requiresShipping)
      : null;

    const itemsToProcess: LineItem[] =
      designItems.length > 0
        ? designItems
        : orderToken
        ? (tshirtItem ? [tshirtItem] : [so.lineItems.nodes[0]].filter(Boolean))
        : tshirtItem
        ? [tshirtItem]
        : [];

    for (const item of itemsToProcess) {
      const token =
        getAttr(item.customAttributes, "design_token") ??
        orderToken ??
        "";

      orders.push({
        id: `order_${randomBytes(8).toString("hex")}`,
        shopifyOrderId,
        orderNumber: so.name,
        customerName: `${so.customer?.firstName ?? ""} ${so.customer?.lastName ?? ""}`.trim() || "Müşteri",
        customerEmail: so.customer?.email ?? "",
        productId: item.product?.id.split("/").pop() ?? "",
        productName: item.name ?? "",
        variantId: item.variant?.id.split("/").pop() ?? "",
        designToken: token,
        previewUrl:
          getAttr(item.customAttributes, "_front_preview_url") ??
          getAttr(so.customAttributes, "_front_preview_url") ??
          "",
        productionFileUrl:
          getAttr(item.customAttributes, "_front_print_url") ??
          getAttr(so.customAttributes, "_front_print_url") ??
          "",
        productionStatus: "pending",
        missingSurcharge: false,
        createdAt: so.createdAt,
      });
      newlySynced++;
    }
  }

  if (newlySynced > 0) writeJson("orders.json", orders);
  return { shopifyTotal: shopifyOrders.length, newlySynced, skippedExisting };
}

export async function createOrderFromWebhook(shopifyOrder: Record<string, unknown>) {
  const orders = readJson<Order[]>("orders.json", []);
  const shopifyOrderId = String(shopifyOrder.id);
  if (orders.some((o) => o.shopifyOrderId === shopifyOrderId)) return;

  type Prop = { name: string; value: string };
  const lineItems = (shopifyOrder.line_items as Record<string, unknown>[]) ?? [];
  const noteAttrs = (shopifyOrder.note_attributes as Prop[]) ?? [];

  const getProp = (item: Record<string, unknown>, name: string) =>
    ((item.properties as Prop[]) ?? []).find((p) => p.name === name)?.value;
  const getNote = (name: string) => noteAttrs.find((a) => a.name === name)?.value;

  // Step 1: find line items that directly carry design_token in their properties.
  // Cart Transform expand should preserve properties on the original merchandise item.
  const designItems = lineItems.filter((item) =>
    getProp(item, "design_token") !== undefined
  );

  // Step 2: if Cart Transform stripped all properties, fall back to note_attributes
  // (cart.attributes end up in order.note_attributes) and use the first non-surcharge line item.
  const fallbackToken = getNote("design_token");
  const itemsToProcess: Record<string, unknown>[] =
    designItems.length > 0
      ? designItems
      : fallbackToken
      ? [lineItems[0]].filter(Boolean)
      : [];

  const customer = shopifyOrder.customer as Record<string, string> | undefined;

  for (const item of itemsToProcess) {
    const token = getProp(item, "design_token") ?? fallbackToken ?? "";
    if (!token) continue;

    orders.push({
      id: `order_${randomBytes(8).toString("hex")}`,
      shopifyOrderId,
      orderNumber: `#${shopifyOrder.order_number ?? shopifyOrder.id}`,
      customerName: `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() || "Müşteri",
      customerEmail: customer?.email ?? "",
      productId: String(item.product_id),
      productName: (item.name as string) ?? (item.title as string) ?? "",
      variantId: String(item.variant_id),
      designToken: token,
      previewUrl: getProp(item, "_front_preview_url") ?? getNote("_front_preview_url") ?? "",
      productionFileUrl: getProp(item, "_front_print_url") ?? getNote("_front_print_url") ?? "",
      productionStatus: "pending",
      missingSurcharge: false,
      createdAt: new Date().toISOString(),
    });
  }
  writeJson("orders.json", orders);
}
