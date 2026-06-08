import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // env is injected in production
  }
}

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function attr(attrs, key) {
  return attrs?.find((item) => item.key === key || item.name === key)?.value;
}

function designToken(attrs) {
  return attr(attrs, "_design_token") || attr(attrs, "design_token");
}

function moneyAmount(line) {
  const amount = Number(line.discountedTotalSet?.shopMoney?.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

async function shopifyGraphql(shop, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(`Shopify GraphQL ${res.status}: ${JSON.stringify(data.errors || data)}`);
  }
  return data.data;
}

loadEnv();

const shop = arg("shop", "iabvsb-jv.myshopify.com");
const limit = Number(arg("limit", "100"));
const onlyOrder = arg("order", "").replace(/^#/, "");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

try {
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_item_id TEXT NOT NULL DEFAULT ''");
  await pool.query("DROP INDEX IF EXISTS orders_shop_shopify_order_variant");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_shopify_order_line_item ON orders (shop, shopify_order_id, line_item_id) WHERE line_item_id != ''");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_shopify_order_variant_token_fallback ON orders (shop, shopify_order_id, variant_id, design_token) WHERE line_item_id = ''");

  const session = (await pool.query(
    'SELECT "accessToken" FROM shopify_sessions WHERE shop = $1 AND "accessToken" IS NOT NULL ORDER BY id DESC LIMIT 1',
    [shop],
  )).rows[0];
  if (!session?.accessToken) throw new Error(`No Shopify access token for ${shop}`);

  const data = await shopifyGraphql(shop, session.accessToken, `#graphql
    query RecentOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          name
          createdAt
          displayFulfillmentStatus
          cancelledAt
          customAttributes { key value }
          lineItems(first: 50) {
            nodes {
              id
              name
              quantity
              requiresShipping
              product { id }
              variant { id title }
              discountedTotalSet { shopMoney { amount currencyCode } }
              customAttributes { key value }
            }
          }
        }
      }
    }
  `, { first: limit });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const order of data.orders?.nodes ?? []) {
    const shopifyOrderId = order.id.split("/").pop();
    const orderNumber = String(order.name || "").replace(/^#/, "");
    if (onlyOrder && orderNumber !== onlyOrder && shopifyOrderId !== onlyOrder) continue;
    if (order.cancelledAt) continue;

    const orderToken = designToken(order.customAttributes);
    const designLines = order.lineItems.nodes.filter((line) => designToken(line.customAttributes));
    if (!orderToken && designLines.length === 0) continue;

    const customerName = "Müşteri";
    const customerEmail = "";
    const initialStatus = order.displayFulfillmentStatus === "FULFILLED" ? "shipped" : "pending";

    for (const line of designLines.length ? designLines : order.lineItems.nodes.filter((line) => line.requiresShipping)) {
      const lineItemId = line.id.split("/").pop();
      const variantId = line.variant?.id?.split("/").pop() || "";
      const token = designToken(line.customAttributes) || orderToken || "";
      if (!token) {
        skipped++;
        continue;
      }

      const design = (await pool.query(
        "SELECT front_preview_url, back_preview_url, front_print_url, back_print_url FROM designs WHERE shop = $1 AND token = $2",
        [shop, token],
      )).rows[0] || {};

      const frontPreviewUrl = attr(line.customAttributes, "_front_preview_url") || attr(order.customAttributes, "_front_preview_url") || design.front_preview_url || "";
      const frontPrintUrl = attr(line.customAttributes, "_front_print_url") || attr(order.customAttributes, "_front_print_url") || design.front_print_url || "";
      const currencyCode = line.discountedTotalSet?.shopMoney?.currencyCode || "";

      const existingByLine = await pool.query(
        "SELECT id FROM orders WHERE shop = $1 AND shopify_order_id = $2 AND line_item_id = $3 LIMIT 1",
        [shop, shopifyOrderId, lineItemId],
      );

      if (existingByLine.rows.length) {
        await pool.query(
          `UPDATE orders SET
             quantity = $4,
             preview_url = COALESCE(NULLIF($5, ''), preview_url),
             production_file_url = COALESCE(NULLIF($6, ''), production_file_url),
             line_total_price = CASE WHEN $7::numeric > 0 THEN $7 ELSE line_total_price END,
             currency_code = CASE WHEN $8 != '' THEN $8 ELSE currency_code END,
             updated_at = now()
           WHERE shop = $1 AND shopify_order_id = $2 AND line_item_id = $3`,
          [shop, shopifyOrderId, lineItemId, line.quantity || 1, frontPreviewUrl, frontPrintUrl, moneyAmount(line), currencyCode],
        );
        updated++;
        continue;
      }

      await pool.query(
        `UPDATE orders
         SET line_item_id = $4,
             quantity = $6,
             preview_url = COALESCE(NULLIF($7, ''), preview_url),
             production_file_url = COALESCE(NULLIF($8, ''), production_file_url),
             updated_at = now()
         WHERE shop = $1
           AND shopify_order_id = $2
           AND variant_id = $3
           AND design_token = $5
           AND line_item_id = ''`,
        [shop, shopifyOrderId, variantId, lineItemId, token, line.quantity || 1, frontPreviewUrl, frontPrintUrl],
      );

      const afterBackfill = await pool.query(
        "SELECT id FROM orders WHERE shop = $1 AND shopify_order_id = $2 AND line_item_id = $3 LIMIT 1",
        [shop, shopifyOrderId, lineItemId],
      );
      if (afterBackfill.rows.length) {
        updated++;
        continue;
      }

      await pool.query(
        `INSERT INTO orders (
           id, shop, shopify_order_id, order_number, product_id, product_name,
           variant_id, variant_title, line_item_id, quantity, design_token,
           preview_url, production_file_url, customer_name, customer_email,
           production_status, missing_surcharge, created_at, line_total_price, currency_code
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,$18,$19)
         ON CONFLICT DO NOTHING`,
        [
          `order_${randomBytes(8).toString("hex")}`,
          shop,
          shopifyOrderId,
          orderNumber || order.name || shopifyOrderId,
          line.product?.id?.split("/").pop() || "",
          line.name || "",
          variantId,
          line.variant?.title || "",
          lineItemId,
          line.quantity || 1,
          token,
          frontPreviewUrl,
          frontPrintUrl,
          customerName,
          customerEmail,
          initialStatus,
          new Date(order.createdAt),
          moneyAmount(line),
          currencyCode,
        ],
      );
      inserted++;
    }
  }

  console.log(JSON.stringify({ shop, limit, order: onlyOrder, inserted, updated, skipped }, null, 2));

  if (onlyOrder) {
    const rows = await pool.query(
      "SELECT order_number, variant_title, line_item_id, quantity, design_token FROM orders WHERE shop = $1 AND order_number = $2 ORDER BY line_item_id",
      [shop, onlyOrder],
    );
    console.log(JSON.stringify(rows.rows, null, 2));
  }
} finally {
  await pool.end();
}
