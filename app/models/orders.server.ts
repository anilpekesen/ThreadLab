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

// Called from the public /api/pixel-order endpoint, triggered by the Web Pixel
// extension on checkout_completed. Cart Transform strips line item properties,
// so we rely on cart attributes (saved via /cart/update.js) passed through the pixel.
export async function createOrderFromPixel(data: {
  orderId?: string;
  orderNumber?: string;
  designToken?: string;
  frontPreviewUrl?: string;
  frontPrintUrl?: string;
  productName?: string;
  variantId?: string;
  productId?: string;
}) {
  if (!data.designToken || !data.orderId) return;

  const orders = readJson<Order[]>("orders.json", []);

  // De-duplicate by Shopify order ID
  if (orders.some((o) => o.shopifyOrderId === data.orderId)) return;

  orders.push({
    id: `order_${randomBytes(8).toString("hex")}`,
    shopifyOrderId: data.orderId,
    orderNumber: data.orderNumber ?? `#${data.orderId}`,
    customerName: "Müşteri",
    customerEmail: "",
    productId: data.productId ?? "",
    productName: data.productName ?? "",
    variantId: data.variantId ?? "",
    designToken: data.designToken,
    previewUrl: data.frontPreviewUrl ?? "",
    productionFileUrl: data.frontPrintUrl ?? "",
    productionStatus: "pending",
    missingSurcharge: false,
    createdAt: new Date().toISOString(),
  });

  writeJson("orders.json", orders);
}
