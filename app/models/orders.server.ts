import { randomBytes } from "crypto";
import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
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
  // Joined from designs table
  designFrontPreviewUrl?: string;
  designBackPreviewUrl?: string;
  designFrontPrintUrl?: string;
  designBackPrintUrl?: string;
}

type DbRow = {
  id: string;
  shopify_order_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  product_id: string;
  product_name: string;
  variant_id: string;
  design_token: string;
  preview_url: string;
  production_file_url: string;
  production_status: string;
  missing_surcharge: boolean;
  created_at: Date;
  updated_at: Date | null;
  design_front_preview_url?: string | null;
  design_back_preview_url?: string | null;
  design_front_print_url?: string | null;
  design_back_print_url?: string | null;
};

function rowToOrder(row: DbRow): Order {
  return {
    id: row.id,
    shopifyOrderId: row.shopify_order_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    designToken: row.design_token,
    previewUrl: row.preview_url,
    productionFileUrl: row.production_file_url,
    productionStatus: row.production_status,
    missingSurcharge: row.missing_surcharge,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    designFrontPreviewUrl: row.design_front_preview_url || undefined,
    designBackPreviewUrl: row.design_back_preview_url || undefined,
    designFrontPrintUrl: row.design_front_print_url || undefined,
    designBackPrintUrl: row.design_back_print_url || undefined,
  };
}

const ORDER_SELECT = `
  SELECT o.id, o.shopify_order_id, o.order_number, o.customer_name, o.customer_email,
    o.product_id, o.product_name, o.variant_id, o.design_token, o.preview_url,
    o.production_file_url, o.production_status, o.missing_surcharge, o.created_at, o.updated_at,
    d.front_preview_url AS design_front_preview_url,
    d.back_preview_url  AS design_back_preview_url,
    d.front_print_url   AS design_front_print_url,
    d.back_print_url    AS design_back_print_url
  FROM orders o
  LEFT JOIN designs d ON o.design_token = d.token
`;

export async function getOrders(status?: string): Promise<Order[]> {
  await ensureMigrations();
  const result = status
    ? await query<DbRow>(
        `${ORDER_SELECT} WHERE o.design_token != '' AND o.production_status = $1 ORDER BY o.created_at DESC`,
        [status],
      )
    : await query<DbRow>(`${ORDER_SELECT} WHERE o.design_token != '' ORDER BY o.created_at DESC`);
  return result.rows.map(rowToOrder);
}

export async function getDashboardStats() {
  await ensureMigrations();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, todayCount, pending, ready, missingSurcharge] = await Promise.all([
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE design_token != ''"),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE design_token != '' AND created_at >= $1", [today]),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE design_token != '' AND production_status = 'pending'"),
    query<{ count: string }>(
      "SELECT COUNT(*) FROM orders WHERE design_token != '' AND production_status IN ('ready', 'shipped')",
    ),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE design_token != '' AND missing_surcharge = TRUE"),
  ]);

  return {
    total: Number(total.rows[0].count),
    today: Number(todayCount.rows[0].count),
    pendingProduction: Number(pending.rows[0].count),
    ready: Number(ready.rows[0].count),
    missingSurcharge: Number(missingSurcharge.rows[0].count),
  };
}

export async function getOrder(id: string): Promise<Order | null> {
  await ensureMigrations();
  const result = await query<DbRow>(
    `${ORDER_SELECT} WHERE o.id = $1`,
    [id],
  );
  if (!result.rows.length) return null;
  return rowToOrder(result.rows[0]);
}

export async function getOrderByShopifyId(shopifyOrderId: string): Promise<Order | null> {
  await ensureMigrations();
  const result = await query<DbRow>(
    `${ORDER_SELECT} WHERE o.shopify_order_id = $1`,
    [shopifyOrderId],
  );
  if (!result.rows.length) return null;
  return rowToOrder(result.rows[0]);
}

export async function updateOrderStatus(id: string, status: string): Promise<Order> {
  await ensureMigrations();
  const result = await query<DbRow>(
    "UPDATE orders SET production_status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, id],
  );
  if (!result.rows.length) throw new Error("Order not found");
  return rowToOrder(result.rows[0]);
}

export async function syncOrdersFromAdmin(
  admin: { graphql: (query: string) => Promise<{ json: () => Promise<unknown> }> },
): Promise<number> {
  await ensureMigrations();

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
    customAttributes: Attr[];
    lineItems: { nodes: LineItem[] };
  };

  const res = await admin.graphql(`#graphql
    {
      orders(first: 100, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id name createdAt
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
  const getAttr = (attrs: Attr[], key: string) => attrs.find((a) => a.key === key)?.value;
  let added = 0;

  for (const so of shopifyOrders) {
    const shopifyOrderId = so.id.split("/").pop() ?? so.id;

    // Skip already imported orders
    const existing = await query("SELECT id FROM orders WHERE shopify_order_id = $1", [
      shopifyOrderId,
    ]);
    if (existing.rows.length > 0) continue;

    // Only import design orders (must have a design_token somewhere)
    const orderToken = getAttr(so.customAttributes, "design_token");
    const designItems = so.lineItems.nodes.filter(
      (li) => getAttr(li.customAttributes, "design_token") !== undefined,
    );

    const hasDesignToken = orderToken || designItems.length > 0;
    if (!hasDesignToken) continue;

    const itemsToProcess: LineItem[] = designItems.length > 0 ? designItems : so.lineItems.nodes.filter((li) => li.requiresShipping).slice(0, 1);
    if (itemsToProcess.length === 0) continue;

    for (const item of itemsToProcess) {
      const token = getAttr(item.customAttributes, "design_token") ?? orderToken ?? "";
      const id = `order_${randomBytes(8).toString("hex")}`;
      await query(
        `INSERT INTO orders (id, shopify_order_id, order_number, product_id, product_name,
          variant_id, design_token, preview_url, production_file_url, production_status,
          missing_surcharge, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',FALSE,$10)
         ON CONFLICT (shopify_order_id) DO NOTHING`,
        [
          id,
          shopifyOrderId,
          so.name,
          item.product?.id.split("/").pop() ?? "",
          item.name ?? "",
          item.variant?.id.split("/").pop() ?? "",
          token,
          getAttr(item.customAttributes, "_front_preview_url") ??
            getAttr(so.customAttributes, "_front_preview_url") ??
            "",
          getAttr(item.customAttributes, "_front_print_url") ??
            getAttr(so.customAttributes, "_front_print_url") ??
            "",
          new Date(so.createdAt),
        ],
      );
      added++;
    }
  }

  return added;
}

export async function createOrderFromPixel(data: {
  orderId?: string;
  orderNumber?: string;
  designToken?: string;
  frontPreviewUrl?: string;
  frontPrintUrl?: string;
  productName?: string;
  variantId?: string;
  productId?: string;
}): Promise<void> {
  if (!data.designToken || !data.orderId) return;
  await ensureMigrations();

  const id = `order_${randomBytes(8).toString("hex")}`;
  await query(
    `INSERT INTO orders (id, shopify_order_id, order_number, product_id, product_name,
      variant_id, design_token, preview_url, production_file_url, production_status,
      missing_surcharge)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',FALSE)
     ON CONFLICT (shopify_order_id) DO NOTHING`,
    [
      id,
      data.orderId,
      data.orderNumber ?? `#${data.orderId}`,
      data.productId ?? "",
      data.productName ?? "",
      data.variantId ?? "",
      data.designToken,
      data.frontPreviewUrl ?? "",
      data.frontPrintUrl ?? "",
    ],
  );
}
