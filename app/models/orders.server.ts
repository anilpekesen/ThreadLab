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

// Sync orders from Shopify Admin API — requires Protected Customer Data approval.
// Returns number of new orders added.
export async function syncOrdersFromAdmin(
  admin: { graphql: (query: string) => Promise<{ json: () => Promise<unknown> }> }
): Promise<number> {
  type Attr = { key: string; value: string };
  type LineItem = {
    name: string;
    requiresShipping: boolean;
    product?: { id: string };
    variant?: { id: string };
    customAttributes: Attr[];
  };
  type ShopifyOrder = {
    id: string;
    name: string;
    createdAt: string;
    customer?: { firstName: string; lastName: string; email: string };
    customAttributes: Attr[];
    lineItems: { nodes: LineItem[] };
  };

  const res = await admin.graphql(`#graphql
    {
      orders(first: 100, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id name createdAt
          customer { firstName lastName email }
          customAttributes { key value }
          lineItems(first: 20) {
            nodes {
              name requiresShipping
              product { id }
              variant { id }
              customAttributes { key value }
            }
          }
        }
      }
    }
  `);

  const data = await res.json() as {
    data?: { orders?: { nodes?: ShopifyOrder[] } };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join(", "));
  }

  const shopifyOrders = data.data?.orders?.nodes ?? [];
  const orders = readJson<Order[]>("orders.json", []);
  const getAttr = (attrs: Attr[], key: string) => attrs.find((a) => a.key === key)?.value;
  let added = 0;

  for (const so of shopifyOrders) {
    const shopifyOrderId = so.id.split("/").pop() ?? so.id;
    if (orders.some((o) => o.shopifyOrderId === shopifyOrderId)) continue;

    const designItems = so.lineItems.nodes.filter((li) =>
      getAttr(li.customAttributes, "design_token") !== undefined
    );
    const orderToken = getAttr(so.customAttributes, "design_token");
    const tshirtItem = so.lineItems.nodes.find((li) => li.requiresShipping);

    const itemsToProcess: LineItem[] =
      designItems.length > 0 ? designItems
      : orderToken ? (tshirtItem ? [tshirtItem] : [so.lineItems.nodes[0]].filter(Boolean))
      : tshirtItem ? [tshirtItem]
      : [];

    for (const item of itemsToProcess) {
      const token = getAttr(item.customAttributes, "design_token") ?? orderToken ?? "";
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
        previewUrl: getAttr(item.customAttributes, "_front_preview_url") ?? getAttr(so.customAttributes, "_front_preview_url") ?? "",
        productionFileUrl: getAttr(item.customAttributes, "_front_print_url") ?? getAttr(so.customAttributes, "_front_print_url") ?? "",
        productionStatus: "pending",
        missingSurcharge: false,
        createdAt: so.createdAt,
      });
      added++;
    }
  }

  if (added > 0) writeJson("orders.json", orders);
  return added;
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
