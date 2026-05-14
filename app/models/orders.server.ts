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
