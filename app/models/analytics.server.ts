import { randomBytes } from "crypto";
import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export type AnalyticsEventType =
  | "design_created"
  | "template_applied"
  | "cart_add";

export async function trackAnalyticsEvent(input: {
  shop: string;
  eventType: AnalyticsEventType;
  productId?: string;
  productName?: string;
  templateId?: string;
  templateName?: string;
  templateKind?: string;
  designToken?: string;
  sessionId?: string;
  valueNumeric?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const shop = input.shop.trim();
  if (!shop) return;
  await ensureMigrations();
  await query(
    `INSERT INTO analytics_events (
      id, shop, event_type, product_id, product_name, template_id, template_name,
      template_kind, design_token, session_id, value_numeric, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      `evt_${randomBytes(10).toString("hex")}`,
      shop,
      input.eventType,
      input.productId ?? null,
      input.productName ?? null,
      input.templateId ?? null,
      input.templateName ?? null,
      input.templateKind ?? null,
      input.designToken ?? null,
      input.sessionId ?? null,
      typeof input.valueNumeric === "number" && Number.isFinite(input.valueNumeric)
        ? input.valueNumeric
        : null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export interface DashboardAnalyticsDetail {
  conversion: {
    designs: number;
    cartAdds: number;
    orders: number;
    designToCartPercent: number;
    cartToOrderPercent: number;
    designToOrderPercent: number;
  };
  topProducts: Array<{ productId: string; productName: string; orders: number; quantity: number }>;
  topTemplates: Array<{ templateId: string; templateName: string; templateKind: string; uses: number }>;
  productionStatus: Array<{ status: string; count: number }>;
  designDuration: { avgSeconds: number | null; samples: number };
  fileHealth: {
    missingDesign: number;
    missingPrintFile: number;
    missingPreview: number;
    incompleteDesignData: number;
  };
  aiEfficiency: {
    bgUses: number;
    bgCustomers: number;
    ordersWithBgSession: number;
    bgToOrderPercent: number;
  };
  revenueImpact: {
    customOrders: number;
    customUnits: number;
    valueTracked: boolean;
    customOrderValue: number | null;
    avgCustomOrderValue: number | null;
    currencyCode: string;
  };
  recentActivity: Array<{
    type: string;
    label: string;
    detail: string;
    createdAt: string;
  }>;
}

function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export async function getDashboardAnalyticsDetail(shop: string): Promise<DashboardAnalyticsDetail> {
  await ensureMigrations();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    designs,
    cartAdds,
    orders,
    topProducts,
    topTemplates,
    productionStatus,
    duration,
    fileHealth,
    bgStats,
    revenueImpact,
    recentOrders,
    recentEvents,
  ] = await Promise.all([
    query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM designs WHERE shop = $1 AND created_at >= $2",
      [shop, thirtyDaysAgo],
    ),
    query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM analytics_events WHERE shop = $1 AND event_type = 'cart_add' AND created_at >= $2",
      [shop, thirtyDaysAgo],
    ),
    query<{ count: string }>(
      "SELECT COUNT(DISTINCT shopify_order_id) AS count FROM orders WHERE shop = $1 AND design_token != '' AND production_status != 'cancelled' AND created_at >= $2",
      [shop, thirtyDaysAgo],
    ),
    query<{ product_id: string | null; product_name: string | null; orders: string; quantity: string }>(
      `SELECT product_id, COALESCE(NULLIF(product_name, ''), 'Unknown product') AS product_name,
        COUNT(DISTINCT shopify_order_id) AS orders, SUM(quantity) AS quantity
       FROM orders
       WHERE shop = $1 AND design_token != '' AND production_status != 'cancelled' AND created_at >= $2
       GROUP BY product_id, product_name
       ORDER BY orders DESC, quantity DESC
       LIMIT 5`,
      [shop, thirtyDaysAgo],
    ),
    query<{ template_id: string | null; template_name: string | null; template_kind: string | null; uses: string }>(
      `SELECT template_id, COALESCE(NULLIF(template_name, ''), template_id, 'Template') AS template_name,
        COALESCE(NULLIF(template_kind, ''), 'text') AS template_kind, COUNT(*) AS uses
       FROM analytics_events
       WHERE shop = $1 AND event_type = 'template_applied' AND created_at >= $2
       GROUP BY template_id, template_name, template_kind
       ORDER BY uses DESC
       LIMIT 5`,
      [shop, thirtyDaysAgo],
    ),
    query<{ status: string; count: string }>(
      `SELECT COALESCE(NULLIF(production_status, ''), 'pending') AS status, COUNT(*) AS count
       FROM orders
       WHERE shop = $1 AND design_token != '' AND production_status != 'cancelled'
       GROUP BY status
       ORDER BY count DESC`,
      [shop],
    ),
    query<{ avg_seconds: string | null; samples: string }>(
      `SELECT ROUND(AVG(value_numeric)::numeric, 0) AS avg_seconds, COUNT(*) AS samples
       FROM analytics_events
       WHERE shop = $1 AND event_type = 'cart_add' AND value_numeric IS NOT NULL AND created_at >= $2`,
      [shop, thirtyDaysAgo],
    ),
    query<{
      missing_design: string;
      missing_print_file: string;
      missing_preview: string;
      incomplete_design_data: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE d.token IS NULL) AS missing_design,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(d.front_print_url, ''), NULLIF(d.back_print_url, ''), NULLIF(o.production_file_url, '')) IS NULL
        ) AS missing_print_file,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(d.front_preview_url, ''), NULLIF(d.back_preview_url, ''), NULLIF(o.preview_url, '')) IS NULL
        ) AS missing_preview,
        COUNT(*) FILTER (
          WHERE d.token IS NOT NULL AND d.design_json IS NULL
            AND COALESCE(NULLIF(d.front_print_url, ''), NULLIF(d.back_print_url, ''), NULLIF(o.production_file_url, '')) IS NOT NULL
        ) AS incomplete_design_data
       FROM orders o
       LEFT JOIN designs d ON d.shop = o.shop AND d.token = o.design_token
       WHERE o.shop = $1 AND o.design_token != '' AND o.production_status != 'cancelled'`,
      [shop],
    ),
    query<{ bg_uses: string; bg_customers: string; orders_with_bg_session: string }>(
      `SELECT
        COALESCE((SELECT count FROM bg_removal_usage WHERE shop = $1 AND month = $2), 0) AS bg_uses,
        COALESCE((SELECT COUNT(*) FROM customer_bg_quota WHERE shop = $1 AND updated_at >= $3 AND count > 0), 0) AS bg_customers,
        COALESCE((
          SELECT COUNT(DISTINCT o.shopify_order_id)
          FROM orders o
          JOIN designs d ON d.shop = o.shop AND d.token = o.design_token
          WHERE o.shop = $1 AND o.created_at >= $3 AND d.session_id IS NOT NULL AND d.session_id != ''
            AND o.production_status != 'cancelled'
        ), 0) AS orders_with_bg_session`,
      [shop, `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`, monthStart],
    ),
    query<{ custom_orders: string; custom_units: string; custom_order_value: string; currency_code: string | null }>(
      `SELECT COUNT(DISTINCT shopify_order_id) AS custom_orders,
        COALESCE(SUM(quantity), 0) AS custom_units,
        COALESCE(SUM(line_total_price), 0) AS custom_order_value,
        MAX(NULLIF(currency_code, '')) AS currency_code
       FROM orders
       WHERE shop = $1 AND design_token != '' AND production_status != 'cancelled' AND created_at >= $2`,
      [shop, thirtyDaysAgo],
    ),
    query<{ type: string; label: string; detail: string; created_at: Date }>(
      `SELECT 'order' AS type, order_number AS label, product_name AS detail, created_at
       FROM orders
       WHERE shop = $1 AND design_token != ''
       ORDER BY created_at DESC
       LIMIT 5`,
      [shop],
    ),
    query<{ type: string; label: string; detail: string; created_at: Date }>(
      `SELECT event_type AS type,
        COALESCE(NULLIF(template_name, ''), NULLIF(design_token, ''), event_type) AS label,
        COALESCE(NULLIF(product_name, ''), NULLIF(template_kind, ''), '') AS detail,
        created_at
       FROM analytics_events
       WHERE shop = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [shop],
    ),
  ]);

  const designCount = Number(designs.rows[0]?.count ?? 0);
  const cartAddCount = Number(cartAdds.rows[0]?.count ?? 0);
  const orderCount = Number(orders.rows[0]?.count ?? 0);
  const bgUses = Number(bgStats.rows[0]?.bg_uses ?? 0);
  const ordersWithBgSession = Number(bgStats.rows[0]?.orders_with_bg_session ?? 0);
  const customOrders = Number(revenueImpact.rows[0]?.custom_orders ?? 0);
  const customOrderValue = Number(revenueImpact.rows[0]?.custom_order_value ?? 0);

  const recentActivity = [...recentOrders.rows, ...recentEvents.rows]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 8)
    .map((row) => ({
      type: row.type,
      label: row.label || row.type,
      detail: row.detail || "",
      createdAt: row.created_at.toISOString(),
    }));

  return {
    conversion: {
      designs: designCount,
      cartAdds: cartAddCount,
      orders: orderCount,
      designToCartPercent: percent(cartAddCount, designCount),
      cartToOrderPercent: percent(orderCount, cartAddCount),
      designToOrderPercent: percent(orderCount, designCount),
    },
    topProducts: topProducts.rows.map((row) => ({
      productId: row.product_id ?? "",
      productName: row.product_name ?? "Unknown product",
      orders: Number(row.orders),
      quantity: Number(row.quantity ?? 0),
    })),
    topTemplates: topTemplates.rows.map((row) => ({
      templateId: row.template_id ?? "",
      templateName: row.template_name ?? "Template",
      templateKind: row.template_kind ?? "text",
      uses: Number(row.uses),
    })),
    productionStatus: productionStatus.rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    })),
    designDuration: {
      avgSeconds: duration.rows[0]?.avg_seconds ? Number(duration.rows[0].avg_seconds) : null,
      samples: Number(duration.rows[0]?.samples ?? 0),
    },
    fileHealth: {
      missingDesign: Number(fileHealth.rows[0]?.missing_design ?? 0),
      missingPrintFile: Number(fileHealth.rows[0]?.missing_print_file ?? 0),
      missingPreview: Number(fileHealth.rows[0]?.missing_preview ?? 0),
      incompleteDesignData: Number(fileHealth.rows[0]?.incomplete_design_data ?? 0),
    },
    aiEfficiency: {
      bgUses,
      bgCustomers: Number(bgStats.rows[0]?.bg_customers ?? 0),
      ordersWithBgSession,
      bgToOrderPercent: percent(ordersWithBgSession, bgUses),
    },
    revenueImpact: {
      customOrders,
      customUnits: Number(revenueImpact.rows[0]?.custom_units ?? 0),
      valueTracked: customOrderValue > 0,
      customOrderValue: customOrderValue > 0 ? customOrderValue : null,
      avgCustomOrderValue: customOrderValue > 0 && customOrders > 0
        ? Math.round((customOrderValue / customOrders) * 100) / 100
        : null,
      currencyCode: revenueImpact.rows[0]?.currency_code ?? "",
    },
    recentActivity,
  };
}
