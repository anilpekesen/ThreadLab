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

  const lineItems = (shopifyOrder.line_items as Record<string, unknown>[]) ?? [];
  for (const item of lineItems) {
    const props = (item.properties as { name: string; value: string }[]) ?? [];
    const tokenProp = props.find((p) => p.name === "design_token");
    if (!tokenProp) continue;
    orders.push({
      id: `order_${randomBytes(8).toString("hex")}`,
      shopifyOrderId,
      orderNumber: `#${(shopifyOrder.order_number as string) ?? shopifyOrder.id}`,
      customerName: `${(shopifyOrder as Record<string, Record<string, string>>).customer?.first_name ?? ""} ${(shopifyOrder as Record<string, Record<string, string>>).customer?.last_name ?? ""}`.trim() || "Müşteri",
      customerEmail: (shopifyOrder as Record<string, Record<string, string>>).customer?.email ?? "",
      productId: String(item.product_id),
      productName: (item.name as string) ?? (item.title as string) ?? "",
      variantId: String(item.variant_id),
      designToken: tokenProp.value,
      previewUrl: props.find((p) => p.name === "_front_preview_url")?.value ?? "",
      productionFileUrl: props.find((p) => p.name === "_front_print_url")?.value ?? "",
      productionStatus: "pending",
      createdAt: new Date().toISOString(),
    });
  }
  writeJson("orders.json", orders);
}
