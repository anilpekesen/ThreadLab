import { randomBytes } from "crypto";
import { query, runMigrations } from "~/lib/db.server";
import { getDesignByToken, extractObjects } from "~/models/designs.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface Order {
  id: string;
  shop: string;
  shopifyOrderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productId: string;
  productName: string;
  variantId: string;
  variantTitle: string;
  quantity: number;
  designToken: string;
  previewUrl: string;
  productionFileUrl: string;
  productionStatus: string;
  missingSurcharge?: boolean;
  createdAt: string;
  updatedAt?: string;
  driveFolderId?: string | null;
  driveUploadedAt?: string | null;
  // Joined from designs table
  designFrontPreviewUrl?: string;
  designBackPreviewUrl?: string;
  designFrontPrintUrl?: string;
  designBackPrintUrl?: string;
}

type DbRow = {
  id: string;
  shop: string;
  shopify_order_id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_title: string;
  quantity: number;
  design_token: string;
  preview_url: string;
  production_file_url: string;
  production_status: string;
  missing_surcharge: boolean;
  created_at: Date;
  updated_at: Date | null;
  drive_folder_id?: string | null;
  drive_uploaded_at?: Date | null;
  design_front_preview_url?: string | null;
  design_back_preview_url?: string | null;
  design_front_print_url?: string | null;
  design_back_print_url?: string | null;
};

function rowToOrder(row: DbRow): Order {
  return {
    id: row.id,
    shop: row.shop ?? "",
    shopifyOrderId: row.shopify_order_id,
    orderNumber: row.order_number,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    productId: row.product_id,
    productName: row.product_name,
    variantId: row.variant_id,
    variantTitle: row.variant_title ?? "",
    quantity: row.quantity ?? 1,
    designToken: row.design_token,
    previewUrl: row.preview_url,
    productionFileUrl: row.production_file_url,
    productionStatus: row.production_status,
    missingSurcharge: row.missing_surcharge,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
    driveFolderId: row.drive_folder_id ?? null,
    driveUploadedAt: row.drive_uploaded_at ? row.drive_uploaded_at.toISOString() : null,
    designFrontPreviewUrl: row.design_front_preview_url || undefined,
    designBackPreviewUrl: row.design_back_preview_url || undefined,
    designFrontPrintUrl: row.design_front_print_url || undefined,
    designBackPrintUrl: row.design_back_print_url || undefined,
  };
}

const ORDER_SELECT = `
  SELECT o.id, o.shop, o.shopify_order_id, o.order_number, o.customer_name, o.customer_email,
    o.product_id, o.product_name, o.variant_id, o.variant_title, o.quantity,
    o.design_token, o.preview_url,
    o.production_file_url, o.production_status, o.missing_surcharge, o.created_at, o.updated_at,
    o.drive_folder_id, o.drive_uploaded_at,
    d.front_preview_url AS design_front_preview_url,
    d.back_preview_url  AS design_back_preview_url,
    d.front_print_url   AS design_front_print_url,
    d.back_print_url    AS design_back_print_url
  FROM orders o
  LEFT JOIN designs d ON o.shop = d.shop AND o.design_token = d.token
`;

export async function setOrderDriveUpload(orderId: string, folderId: string): Promise<void> {
  await query(
    `UPDATE orders SET drive_folder_id = $2, drive_uploaded_at = now() WHERE id = $1`,
    [orderId, folderId],
  );
}

export async function setShopifyOrderDriveUpload(shop: string, shopifyOrderId: string, folderId: string): Promise<void> {
  await query(
    `UPDATE orders SET drive_folder_id = $3, drive_uploaded_at = now()
     WHERE shop = $1 AND shopify_order_id = $2`,
    [shop, shopifyOrderId, folderId],
  );
}

export async function claimDriveExport(shop: string, shopifyOrderId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE orders SET drive_folder_id = 'pending'
     WHERE shop = $1 AND shopify_order_id = $2 AND drive_folder_id IS NULL
     RETURNING id`,
    [shop, shopifyOrderId],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function getOrders(shop: string, status?: string): Promise<Order[]> {
  await ensureMigrations();
  const result = status
    ? await query<DbRow>(
        `${ORDER_SELECT} WHERE o.shop = $1 AND o.design_token != '' AND o.production_status = $2 AND o.production_status != 'cancelled' ORDER BY o.created_at DESC`,
        [shop, status],
      )
    : await query<DbRow>(
        `${ORDER_SELECT} WHERE o.shop = $1 AND o.design_token != '' AND o.production_status != 'cancelled' ORDER BY o.created_at DESC`,
        [shop],
      );
  return result.rows.map(rowToOrder);
}

export async function getDashboardStats(shop: string) {
  await ensureMigrations();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, todayCount, pending, ready, missingSurcharge] = await Promise.all([
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != ''", [shop]),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != '' AND created_at >= $2", [shop, today]),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != '' AND production_status = 'pending'", [shop]),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != '' AND production_status IN ('ready', 'shipped')", [shop]),
    query<{ count: string }>("SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != '' AND missing_surcharge = TRUE", [shop]),
  ]);

  return {
    total: Number(total.rows[0].count),
    today: Number(todayCount.rows[0].count),
    pendingProduction: Number(pending.rows[0].count),
    ready: Number(ready.rows[0].count),
    missingSurcharge: Number(missingSurcharge.rows[0].count),
  };
}

export async function getProductionAnalytics(shop: string) {
  await ensureMigrations();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const [avgFulfill, weekCount, lateCount, dailyCounts] = await Promise.all([
    query<{ avg_hours: string | null }>(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric, 1) AS avg_hours
       FROM orders
       WHERE shop = $1 AND production_status = 'shipped' AND updated_at IS NOT NULL AND created_at >= $2`,
      [shop, thirtyDaysAgo],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != '' AND created_at >= $2`,
      [shop, sevenDaysAgo],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) FROM orders WHERE shop = $1 AND design_token != ''
       AND production_status IN ('pending', 'preparing') AND created_at < $2`,
      [shop, twoDaysAgo],
    ),
    query<{ day: string; count: string }>(
      `SELECT DATE(created_at AT TIME ZONE 'Europe/Istanbul') AS day, COUNT(*) AS count
       FROM orders WHERE shop = $1 AND design_token != '' AND created_at >= $2
       GROUP BY day ORDER BY day ASC`,
      [shop, sevenDaysAgo],
    ),
  ]);

  const avgHours = avgFulfill.rows[0]?.avg_hours ? parseFloat(avgFulfill.rows[0].avg_hours) : null;
  return {
    avgFulfillmentHours: avgHours,
    weekCount: Number(weekCount.rows[0].count),
    lateCount: Number(lateCount.rows[0].count),
    dailyCounts: dailyCounts.rows.map((r) => ({ day: r.day, count: Number(r.count) })),
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

export async function getOrderByShopifyId(shop: string, shopifyOrderId: string): Promise<Order | null> {
  await ensureMigrations();
  const result = shop
    ? await query<DbRow>(`${ORDER_SELECT} WHERE o.shop = $1 AND o.shopify_order_id = $2`, [shop, shopifyOrderId])
    : await query<DbRow>(`${ORDER_SELECT} WHERE o.shopify_order_id = $1 LIMIT 1`, [shopifyOrderId]);
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

type AdminClient = {
  graphql: (
    q: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
};

function summarizeObjects(
  objs: ReturnType<typeof extractObjects>,
): object[] {
  return objs
    .filter((o) => o.type === "i-text" || o.type === "textbox" || o.type === "image")
    .map((o) => ({
      type: o.type,
      text: o.text ?? null,
      fontFamily: o.fontFamily ?? null,
      fontSize: o.fontSize ?? null,
      fill: o.fill ?? null,
      fontWeight: o.fontWeight ?? null,
      fontStyle: o.fontStyle ?? null,
      underline: o.underline ?? null,
      textAlign: o.textAlign ?? null,
      left: o.left != null ? Math.round(o.left) : null,
      top: o.top != null ? Math.round(o.top) : null,
      // Skip data URLs — they're huge and would blow up metafields / download URLs
      src: o.type === "image" && o.src && !o.src.startsWith("data:") ? o.src : null,
      width:
        o.type === "image" && o.width != null && o.scaleX != null
          ? Math.round(o.width * o.scaleX)
          : null,
      height:
        o.type === "image" && o.height != null && o.scaleY != null
          ? Math.round(o.height * o.scaleY)
          : null,
      angle: o.angle != null ? Math.round(o.angle) : null,
    }));
}

async function writeDesignMetafields(
  admin: AdminClient,
  shop: string,
  shopifyOrderGid: string,
  appOrderId: string,
  frontPreviewUrl: string,
  backPreviewUrl: string,
  frontPrintUrl: string,
  backPrintUrl: string,
  designToken: string,
): Promise<void> {
  const design = designToken ? await getDesignByToken(shop, designToken) : null;
  // Fill in URLs from DB when Shopify custom attributes didn't capture them
  if (design) {
    frontPreviewUrl = frontPreviewUrl || design.frontPreviewUrl || '';
    backPreviewUrl  = backPreviewUrl  || design.backPreviewUrl  || '';
    frontPrintUrl   = frontPrintUrl   || design.frontPrintUrl   || '';
    backPrintUrl    = backPrintUrl    || design.backPrintUrl    || '';
  }
  const frontObjects = design ? summarizeObjects(extractObjects(design.designJson, "front")) : [];
  const backObjects = design ? summarizeObjects(extractObjects(design.designJson, "back")) : [];

  const base = [
    { key: "app_order_id", value: appOrderId, type: "single_line_text_field" },
    { key: "front_preview_url", value: frontPreviewUrl, type: "single_line_text_field" },
    { key: "back_preview_url", value: backPreviewUrl, type: "single_line_text_field" },
    { key: "front_print_url", value: frontPrintUrl, type: "single_line_text_field" },
    { key: "back_print_url", value: backPrintUrl, type: "single_line_text_field" },
    { key: "design_objects", value: JSON.stringify({ frontObjects, backObjects }), type: "json" },
  ];

  const metafields = base
    .filter((m) => m.value && m.value !== "" && m.value !== "{}")
    .map((m) => ({ ...m, ownerId: shopifyOrderGid, namespace: "printlab" }));

  if (!metafields.length) return;

  try {
    const res = await admin.graphql(
      `#graphql
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      { variables: { metafields } },
    );
    const data = await res.json() as { data?: { metafieldsSet?: { userErrors?: { message: string }[] } } };
    const errors = data.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      console.error("metafieldsSet errors:", errors);
    }
  } catch (e) {
    console.error("writeDesignMetafields failed:", e);
  }
}

export async function syncOrdersFromAdmin(admin: AdminClient, shop: string): Promise<number> {
  await ensureMigrations();

  type Attr = { key: string; value: string };
  type LineItem = {
    id: string;
    name: string;
    quantity: number;
    requiresShipping: boolean;
    product?: { id: string };
    variant?: { id: string; title?: string };
    discountedTotalSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
    customAttributes: Attr[];
  };
  type ShopifyOrder = {
    id: string;
    name: string;
    createdAt: string;
    cancelledAt: string | null;
    displayFinancialStatus: string | null;
    displayFulfillmentStatus: string | null;
    customAttributes: Attr[];
    lineItems: { nodes: LineItem[] };
  };

  const res = await admin.graphql(`#graphql
    {
      orders(first: 100, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
          customAttributes { key value }
          lineItems(first: 20) {
            nodes {
              name quantity requiresShipping
              id
              product { id }
              variant { id title }
              discountedTotalSet { shopMoney { amount currencyCode } }
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

  if (data.errors) {
    const errMsg = Array.isArray(data.errors)
      ? data.errors.map((e) => e.message).join(", ")
      : String(data.errors);
    throw new Error(errMsg);
  }

  const shopifyOrders = data.data?.orders?.nodes ?? [];
  const getAttr = (attrs: Attr[], key: string) => attrs.find((a) => a.key === key)?.value;
  let added = 0;

  // Purge orders in our DB that no longer exist in Shopify (deleted by merchant).
  // Only purge within the date window of the fetched batch to avoid false positives
  // from pagination (first:100 might not cover all older orders).
  const shopifyIds = shopifyOrders.map((so) => so.id.split("/").pop() ?? so.id);
  if (shopifyIds.length > 0) {
    const oldest = shopifyOrders.reduce((min, so) =>
      so.createdAt < min ? so.createdAt : min, shopifyOrders[0].createdAt);
    await query(
      `DELETE FROM orders
       WHERE shop = $1
         AND shopify_order_id != ALL($2::text[])
         AND created_at >= $3
         AND production_status NOT IN ('shipped')`,
      [shop, shopifyIds, new Date(oldest)],
    );
  }

  for (const so of shopifyOrders) {
    const shopifyOrderId = so.id.split("/").pop() ?? so.id;

    // If Shopify order is cancelled or fully refunded, mark our record as cancelled too
    const isInactive =
      so.cancelledAt ||
      so.displayFinancialStatus === "REFUNDED" ||
      so.displayFinancialStatus === "VOIDED";
    if (isInactive) {
      await query(
        "UPDATE orders SET production_status = 'cancelled', updated_at = now() WHERE shop = $1 AND shopify_order_id = $2 AND production_status NOT IN ('cancelled', 'shipped')",
        [shop, shopifyOrderId],
      );
      continue;
    }

    // Only import design orders (must have a design_token somewhere)
    const orderToken = getAttr(so.customAttributes, "design_token");
    const designItems = so.lineItems.nodes.filter(
      (li) => getAttr(li.customAttributes, "design_token") !== undefined,
    );

    const hasDesignToken = orderToken || designItems.length > 0;
    if (!hasDesignToken) continue;

    // Always capture ALL shipping items — size variants share the same design.
    // The design_token may be on only one line item; fall back to that token for siblings.
    const sharedToken = orderToken || (designItems.length > 0 ? getAttr(designItems[0].customAttributes, "design_token") : "");
    const itemsToProcess: LineItem[] = so.lineItems.nodes.filter((li) => li.requiresShipping);
    if (itemsToProcess.length === 0) continue;

    for (const item of itemsToProcess) {
      const variantId = item.variant?.id.split("/").pop() ?? "";
      const token = getAttr(item.customAttributes, "design_token") ?? sharedToken;
      const lineItemId = item.id?.split("/").pop() ?? `${variantId}:${token || "no-design"}`;
      if (item.id) {
        await query(
          `UPDATE orders
           SET line_item_id = $4, updated_at = now()
           WHERE shop = $1
             AND shopify_order_id = $2
             AND variant_id = $3
             AND design_token = $5
             AND line_item_id = ''`,
          [shop, shopifyOrderId, variantId, lineItemId, token],
        );
      }
      const frontPreviewUrl =
        getAttr(item.customAttributes, "_front_preview_url") ??
        getAttr(so.customAttributes, "_front_preview_url") ??
        "";
      const backPreviewUrl =
        getAttr(item.customAttributes, "_back_preview_url") ??
        getAttr(so.customAttributes, "_back_preview_url") ??
        "";
      const frontPrintUrl =
        getAttr(item.customAttributes, "_front_print_url") ??
        getAttr(so.customAttributes, "_front_print_url") ??
        "";
      const backPrintUrl =
        getAttr(item.customAttributes, "_back_print_url") ??
        getAttr(so.customAttributes, "_back_print_url") ??
        "";
      const initialStatus = so.displayFulfillmentStatus === "FULFILLED" ? "shipped" : "pending";
      const lineTotalPrice = Number(item.discountedTotalSet?.shopMoney?.amount ?? 0);
      const currencyCode = item.discountedTotalSet?.shopMoney?.currencyCode ?? "";
      const id = `order_${randomBytes(8).toString("hex")}`;
      const result = await query(
        `INSERT INTO orders (id, shop, shopify_order_id, order_number, product_id, product_name,
          variant_id, variant_title, line_item_id, quantity, design_token, preview_url, production_file_url,
          customer_name, customer_email, production_status, missing_surcharge, created_at,
          line_total_price, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,$18,$19)
         ON CONFLICT DO NOTHING`,
        [
          id,
          shop,
          shopifyOrderId,
          so.name,
          item.product?.id.split("/").pop() ?? "",
          item.name ?? "",
          variantId,
          item.variant?.title ?? "",
          lineItemId,
          item.quantity ?? 1,
          token,
          frontPreviewUrl,
          frontPrintUrl,
          "Müşteri",
          "",
          initialStatus,
          new Date(so.createdAt),
          Number.isFinite(lineTotalPrice) ? lineTotalPrice : 0,
          currencyCode,
        ],
      );
      // If row already exists and is still pending, update fulfillment status
      if (!result.rowCount || result.rowCount === 0) {
        await query(
          `UPDATE orders SET
             line_total_price = CASE WHEN $4::numeric > 0 THEN $4 ELSE line_total_price END,
             currency_code = CASE WHEN $5 != '' THEN $5 ELSE currency_code END,
             production_status = CASE
               WHEN $6 = 'shipped' AND production_status NOT IN ('shipped', 'cancelled') THEN 'shipped'
               ELSE production_status
             END,
             updated_at = now()
           WHERE shop = $1 AND shopify_order_id = $2 AND line_item_id = $3`,
          [
            shop,
            shopifyOrderId,
            lineItemId,
            Number.isFinite(lineTotalPrice) ? lineTotalPrice : 0,
            currencyCode,
            initialStatus,
          ],
        );
      }
      if (result.rowCount && result.rowCount > 0) {
        // Fire-and-forget: don't block sync on Shopify metafield writes
        writeDesignMetafields(admin, shop, so.id, id, frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl, token ?? "")
          .catch((e) => console.error("[sync] writeDesignMetafields failed:", e));
        added++;
      } else if (token) {
        // Existing row — refresh metafields so app_order_id and print URLs stay current
        query<{ id: string }>(
          `SELECT id FROM orders WHERE shop = $1 AND shopify_order_id = $2 AND line_item_id = $3 LIMIT 1`,
          [shop, shopifyOrderId, lineItemId],
        ).then((r) => {
          if (r.rows.length) {
            writeDesignMetafields(admin, shop, so.id, r.rows[0].id, frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl, token)
              .catch((e) => console.error("[sync] writeDesignMetafields (refresh) failed:", e));
          }
        }).catch(() => { /* non-critical */ });
      }
    }
  }

  return added;
}

export async function getTodayOrders(shop: string, statuses?: string[]): Promise<Order[]> {
  await ensureMigrations();
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const filter = statuses && statuses.length > 0 ? `AND o.production_status = ANY($3)` : "";
  const params: unknown[] = [shop, today];
  if (statuses && statuses.length > 0) params.push(statuses);
  const result = await query<DbRow>(
    `${ORDER_SELECT} WHERE o.shop = $1 AND o.design_token != '' AND o.production_status != 'cancelled' AND o.created_at >= $2 ${filter} ORDER BY o.created_at ASC`,
    params,
  );
  return result.rows.map(rowToOrder);
}

export async function getOrdersWithPrintFiles(shop: string, statuses?: string[]): Promise<Order[]> {
  await ensureMigrations();
  const statusFilter = statuses && statuses.length > 0 ? `AND o.production_status = ANY($2)` : "";
  const params: unknown[] = [shop];
  if (statuses && statuses.length > 0) params.push(statuses);
  const result = await query<DbRow>(
    `${ORDER_SELECT}
     WHERE o.shop = $1
       AND o.design_token != ''
       AND o.production_status NOT IN ('cancelled', 'shipped')
       AND (d.front_print_url IS NOT NULL AND d.front_print_url != ''
            OR o.production_file_url IS NOT NULL AND o.production_file_url != '')
       ${statusFilter}
     ORDER BY o.created_at DESC
     LIMIT 200`,
    params,
  );
  return result.rows.map(rowToOrder);
}

export async function getSiblingOrders(shop: string, shopifyOrderId: string, excludeId: string): Promise<Order[]> {
  if (!shopifyOrderId) return [];
  await ensureMigrations();
  const result = await query<DbRow>(
    `${ORDER_SELECT} WHERE o.shop = $1 AND o.shopify_order_id = $2 AND o.id != $3 ORDER BY o.variant_title ASC`,
    [shop, shopifyOrderId, excludeId],
  );
  return result.rows.map(rowToOrder);
}

export async function getOrdersByIds(shop: string, ids: string[]): Promise<Order[]> {
  if (!ids.length) return [];
  await ensureMigrations();
  const result = await query<DbRow>(
    `${ORDER_SELECT} WHERE o.shop = $1 AND o.id = ANY($2)`,
    [shop, ids],
  );
  return result.rows.map(rowToOrder);
}

export async function bulkUpdateStatus(ids: string[], status: string): Promise<void> {
  if (!ids.length) return;
  await ensureMigrations();
  await query(
    "UPDATE orders SET production_status = $1, updated_at = now() WHERE id = ANY($2)",
    [status, ids],
  );
}

async function fulfillSingleShopifyOrder(admin: AdminClient, shopifyOrderId: string): Promise<void> {
  const orderGid = `gid://shopify/Order/${shopifyOrderId}`;

  const foRes = await admin.graphql(
    `#graphql
    query GetFulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes { id status }
        }
      }
    }`,
    { variables: { id: orderGid } },
  );
  const foData = await foRes.json() as {
    data?: { order?: { fulfillmentOrders?: { nodes?: Array<{ id: string; status: string }> } } };
    errors?: Array<{ message: string }>;
  };

  if (foData.errors) {
    const errMsg = Array.isArray(foData.errors)
      ? foData.errors.map(e => e.message).join(", ")
      : String(foData.errors);
    console.error(`[fulfill] GraphQL errors for order ${shopifyOrderId}:`, errMsg);
    throw new Error(`GraphQL errors querying fulfillment orders: ${errMsg}`);
  }

  const allFOs = foData.data?.order?.fulfillmentOrders?.nodes ?? [];
  console.log(`[fulfill] Order ${shopifyOrderId} fulfillment orders:`, JSON.stringify(allFOs));

  const openFOs = allFOs.filter(
    (fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS" || fo.status === "SCHEDULED",
  );
  if (!openFOs.length) {
    console.log(`[fulfill] No fulfillable FOs for ${shopifyOrderId} — statuses: ${allFOs.map(f => f.status).join(", ") || "none"}`);
    return;
  }

  // Fulfill each FO separately — different fulfillment services/locations cannot be
  // combined into a single FulfillmentCreate call (Shopify rejects mixed-service batches).
  for (const fo of openFOs) {
    const fulfillRes = await admin.graphql(
      `#graphql
      mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          fulfillment: {
            lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }],
            notifyCustomer: true,
          },
        },
      },
    );
    const fulfillData = await fulfillRes.json() as {
      data?: {
        fulfillmentCreate?: {
          fulfillment?: { id: string; status: string };
          userErrors?: Array<{ field: string; message: string }>;
        };
      };
    };

    const errors = fulfillData.data?.fulfillmentCreate?.userErrors ?? [];
    if (errors.length) {
      const msg = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
      console.error(`[fulfill] userErrors for FO ${fo.id} (order ${shopifyOrderId}): ${msg}`);
    } else {
      console.log(`[fulfill] FO ${fo.id} (order ${shopifyOrderId}) fulfilled successfully`);
    }
  }
}

export async function fulfillShopifyOrders(
  admin: AdminClient,
  shop: string,
  appOrderIds: string[],
): Promise<void> {
  if (!appOrderIds.length) return;
  await ensureMigrations();

  const result = await query<{ shopify_order_id: string }>(
    "SELECT DISTINCT shopify_order_id FROM orders WHERE shop = $1 AND id = ANY($2) AND shopify_order_id != ''",
    [shop, appOrderIds],
  );

  for (const row of result.rows) {
    try {
      await fulfillSingleShopifyOrder(admin, row.shopify_order_id);
    } catch (err) {
      console.error(`[fulfill] Failed for Shopify order ${row.shopify_order_id}:`, err);
    }
  }
}

export async function createOrderFromPixel(data: {
  shop: string;
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
    `INSERT INTO orders (id, shop, shopify_order_id, order_number, product_id, product_name,
      variant_id, line_item_id, design_token, preview_url, production_file_url, production_status,
      missing_surcharge)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',FALSE)
     ON CONFLICT DO NOTHING`,
    [
      id,
      data.shop,
      data.orderId,
      data.orderNumber ?? `#${data.orderId}`,
      data.productId ?? "",
      data.productName ?? "",
      data.variantId ?? "",
      `${data.variantId ?? ""}:${data.designToken}`,
      data.designToken,
      data.frontPreviewUrl ?? "",
      data.frontPrintUrl ?? "",
    ],
  );
}
