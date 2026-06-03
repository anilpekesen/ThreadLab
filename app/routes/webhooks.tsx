import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "crypto";
import { verifyWebhookHmac } from "~/lib/shopify.server";
import { processOrderBgRemoval } from "~/models/auto-bg-removal.server";
import { getOrderByShopifyId, updateOrderStatus, setOrderDriveUpload, setShopifyOrderDriveUpload, claimDriveExport, getSiblingOrders } from "~/models/orders.server";
import { resetCustomerBgQuota } from "~/models/customer-bg-quota.server";
import { resetCustomerAiQuota } from "~/models/customer-ai-quota.server";
import { getSessionForDesignToken, getDesignByToken } from "~/models/designs.server";
import { query } from "~/lib/db.server";
import { upsertShopSubscription } from "~/models/billing.server";
import { PLAN_NAMES } from "~/lib/plans";
import { getDriveConnection } from "~/models/shop-google-drive.server";
import { CREDIT_PACKS } from "~/lib/credit-packs";
import {
  getValidAccessToken,
  ensureRootFolder,
  ensureSubfolder,
  uploadFromUrl,
  uploadText,
  getDriveFolderName,
  renameDriveFolder,
} from "~/lib/google-drive.server";

function buildOrderSummary(
  allRows: import("~/models/orders.server").Order[],
): string {
  if (!allRows.length) return "";
  const first = allRows[0];
  const multiProduct = new Set(allRows.map((r) => (r.productName || "").split(" - ")[0])).size > 1;

  const totalQty = allRows.reduce((s, r) => s + (r.quantity ?? 1), 0);
  const hasMissingSurcharge = allRows.some((r) => r.missingSurcharge);

  let variantSection: string[];
  if (multiProduct) {
    // Birden fazla ürün: ürün bazlı gruplama
    const productGroups = new Map<string, { variantTitle: string; quantity: number }[]>();
    for (const row of allRows) {
      const pName = (row.productName || "").split(" - ")[0] || "Ürün";
      if (!productGroups.has(pName)) productGroups.set(pName, []);
      productGroups.get(pName)!.push({ variantTitle: row.variantTitle, quantity: row.quantity ?? 1 });
    }
    const lines: string[] = [];
    let idx = 1;
    for (const [pName, variants] of productGroups) {
      lines.push(`  ${idx++}. ${pName}`);
      for (const v of variants) {
        lines.push(`     ${(v.variantTitle || "—").padEnd(18)} × ${v.quantity}`);
      }
    }
    variantSection = [`ÜRÜNLER`, `───────────────────────────────`, ...lines];
  } else {
    // Tek ürün: varyant listesi (order detail sayfasıyla aynı format)
    const variantRows = allRows
      .map((r) => `  ${(r.variantTitle || "—").padEnd(20)} × ${r.quantity ?? 1}`)
      .join("\n");
    variantSection = [`BEDENLER / RENKLER`, `───────────────────────────────`, variantRows || "  —"];
  }

  return [
    `SİPARİŞ`,
    `───────────────────────────────`,
    `Sipariş No   : ${first.orderNumber || first.shopifyOrderId}`,
    `Müşteri      : ${first.customerName || "—"}`,
    `E-posta      : ${first.customerEmail || "—"}`,
    `Ürün         : ${(first.productName || "").split(" - ")[0] || "—"}`,
    `Durum        : ${first.productionStatus || "—"}`,
    hasMissingSurcharge ? `⚠ Baskı ücreti eksik` : "",
    `Tarih        : ${new Date(first.createdAt).toLocaleString("tr-TR")}`,
    `Aktarma      : ${new Date().toLocaleString("tr-TR")}`,
    ``,
    ...variantSection,
    `───────────────────────────────`,
    `TOPLAM ADET  : ${totalQty}`,
  ].filter(Boolean).join("\n");
}

async function autoExportOrderToDrive(shop: string, shopifyOrderId: string): Promise<void> {
  const conn = await getDriveConnection(shop);
  if (!conn) return;

  const firstOrder = await getOrderByShopifyId(shop, shopifyOrderId);
  if (!firstOrder) return;
  if (firstOrder.driveFolderId && firstOrder.driveFolderId !== 'pending') return;

  // Tüm satırları al (farklı ürünler dahil)
  const siblings = await getSiblingOrders(shop, shopifyOrderId, "").catch(() => []);
  const allRows = [firstOrder, ...siblings.filter((s) => s.id !== firstOrder.id)];

  // Unique design_token'lar → her biri bir ürünü temsil eder
  const productRows = Array.from(
    new Map(allRows.filter((r) => r.designToken).map((r) => [r.designToken, r])).values()
  );

  // Design'ları bir kez çek, hem kontrol hem upload için kullan
  const resolvedProducts = await Promise.all(
    productRows.map(async (row) => {
      const design = row.designToken
        ? await getDesignByToken(row.shop || shop, row.designToken).catch(() => null)
        : null;
      return {
        row,
        fp: design?.frontPrintUrl || row.designFrontPrintUrl || row.productionFileUrl || "",
        bp: design?.backPrintUrl || row.designBackPrintUrl || "",
        fv: design?.frontPreviewUrl || row.designFrontPreviewUrl || row.previewUrl || "",
        bv: design?.backPreviewUrl || row.designBackPreviewUrl || "",
      };
    })
  );

  const hasAnyFile = resolvedProducts.some((p) => p.fp || p.bp || p.fv || p.bv);
  if (!hasAnyFile) {
    console.log(`[webhook] drive export skipped — no files for order=${firstOrder.orderNumber}`);
    return;
  }

  const claimed = await claimDriveExport(shop, shopifyOrderId);
  if (!claimed) return;

  const accessToken = await getValidAccessToken(shop);
  const rootId = await ensureRootFolder(shop, accessToken);
  const folderName = (firstOrder.orderNumber || shopifyOrderId).replace(/^#/, "");
  const folderId = await ensureSubfolder(accessToken, rootId, folderName);

  const tasks: Promise<unknown>[] = [];

  // Her ürün için dosyaları prefix'li yükle
  const usePrefix = resolvedProducts.length > 1;
  for (let i = 0; i < resolvedProducts.length; i++) {
    const { fp, bp, fv, bv } = resolvedProducts[i];
    const p = usePrefix ? `${i + 1}-` : "";
    if (fp) tasks.push(uploadFromUrl(accessToken, folderId, `${p}front-print.png`, fp, "image/png"));
    if (bp) tasks.push(uploadFromUrl(accessToken, folderId, `${p}back-print.png`, bp, "image/png"));
    if (fv) tasks.push(uploadFromUrl(accessToken, folderId, `${p}front-mockup.png`, fv, "image/png"));
    if (bv) tasks.push(uploadFromUrl(accessToken, folderId, `${p}back-mockup.png`, bv, "image/png"));
  }

  const summary = buildOrderSummary(allRows);
  tasks.push(uploadText(accessToken, folderId, "siparis.txt", summary, "text/plain; charset=utf-8"));

  await Promise.all(tasks);
  await setShopifyOrderDriveUpload(shop, shopifyOrderId, folderId);
  console.log(`[webhook] auto drive export: order=${firstOrder.orderNumber} products=${productRows.length} folder=${folderId}`);
}

async function markDriveFolderCancelled(shop: string, shopifyOrderId: string): Promise<void> {
  const conn = await getDriveConnection(shop);
  if (!conn) return;

  const order = await getOrderByShopifyId(shop, shopifyOrderId);
  if (!order?.driveFolderId) return;

  const accessToken = await getValidAccessToken(shop);
  const currentName = await getDriveFolderName(accessToken, order.driveFolderId);
  if (!currentName || currentName.startsWith("❌")) return; // already marked

  await renameDriveFolder(accessToken, order.driveFolderId, `❌ ${currentName}`);
  console.log(`[webhook] drive folder cancelled: "${currentName}" → "❌ ${currentName}"`);
}

async function deleteShopData(shop: string): Promise<void> {
  const tables = [
    "orders",
    "designs",
    "product_settings",
    "product_print_areas",
    "product_categories",
    "shop_subscriptions",
    "shop_settings",
    "shop_templates",
    "bg_removal_usage",
    "customer_bg_quota",
  ];
  for (const table of tables) {
    await query(`DELETE FROM ${table} WHERE shop = $1`, [shop]);
  }
  console.log(`[webhook] shop_redact: deleted all data for ${shop}`);
}

// Shopify uses both {name, value} (REST) and {key, value} (some contexts)
type Attr = { name?: string; key?: string; value: string };
type LineItem = {
  product_id?: number;
  variant_id?: number;
  variant_title?: string | null;
  quantity?: number;
  price?: string;
  price_set?: { shop_money?: { amount?: string; currency_code?: string } };
  name?: string;
  requires_shipping?: boolean;
  properties?: Attr[];
  attributes?: Attr[];
};
type OrderPayload = {
  id?: number;
  name?: string;
  created_at?: string;
  financial_status?: string;
  currency?: string;
  note_attributes?: Attr[];
  attributes?: Attr[];
  line_items?: LineItem[];
  customer?: { first_name?: string; last_name?: string; email?: string };
};

function getAttr(attrs: Attr[] | undefined, key: string): string | undefined {
  return attrs?.find((a) => (a.name ?? a.key) === key)?.value;
}

function extractDesignToken(payload: OrderPayload): string | undefined {
  const fromOrder =
    getAttr(payload.note_attributes, "design_token") ??
    getAttr(payload.attributes, "design_token");
  if (fromOrder) return fromOrder;

  for (const item of payload.line_items ?? []) {
    const token =
      getAttr(item.properties, "design_token") ??
      getAttr(item.attributes, "design_token");
    if (token) return token;
  }
  return undefined;
}

async function importOrderFromWebhook(shop: string, payload: OrderPayload): Promise<void> {
  const shopifyOrderId = String(payload.id ?? "");
  if (!shopifyOrderId) return;

  const orderToken = getAttr(payload.note_attributes, "design_token") ?? getAttr(payload.attributes, "design_token");
  const lineItems = payload.line_items ?? [];
  const designItems = lineItems.filter(
    (li) =>
      getAttr(li.properties, "design_token") !== undefined ||
      getAttr(li.attributes, "design_token") !== undefined,
  );
  const itemsToProcess =
    designItems.length > 0 ? designItems : lineItems.filter((li) => li.requires_shipping);

  if (!orderToken && designItems.length === 0) return;
  if (itemsToProcess.length === 0) return;

  const orderFrontPreviewUrl =
    getAttr(payload.note_attributes, "_front_preview_url") ??
    getAttr(payload.attributes, "_front_preview_url") ??
    "";
  const orderFrontPrintUrl =
    getAttr(payload.note_attributes, "_front_print_url") ??
    getAttr(payload.attributes, "_front_print_url") ??
    "";
  const customerName =
    [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(" ") ||
    "Müşteri";
  const customerEmail = payload.customer?.email ?? "";

  for (const item of itemsToProcess) {
    const variantId = String(item.variant_id ?? "");

    const exists = await query(
      "SELECT 1 FROM orders WHERE shop = $1 AND shopify_order_id = $2 AND variant_id = $3",
      [shop, shopifyOrderId, variantId],
    );
    if (exists.rows.length > 0) continue;

    const token =
      getAttr(item.properties, "design_token") ??
      getAttr(item.attributes, "design_token") ??
      orderToken ??
      "";
    const frontPreviewUrl =
      getAttr(item.properties, "_front_preview_url") ??
      getAttr(item.attributes, "_front_preview_url") ??
      orderFrontPreviewUrl;
    const frontPrintUrl =
      getAttr(item.properties, "_front_print_url") ??
      getAttr(item.attributes, "_front_print_url") ??
      orderFrontPrintUrl;

    const qty = item.quantity ?? 1;
    const unitPrice = Number(item.price_set?.shop_money?.amount ?? item.price ?? 0);
    const lineTotalPrice = unitPrice * qty;
    const currencyCode = item.price_set?.shop_money?.currency_code ?? payload.currency ?? "";

    const id = `order_${randomBytes(8).toString("hex")}`;
    await query(
      `INSERT INTO orders
         (id, shop, shopify_order_id, order_number, product_id, product_name,
          variant_id, variant_title, quantity, design_token, preview_url,
          production_file_url, customer_name, customer_email,
          production_status, missing_surcharge, created_at,
          line_total_price, currency_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',FALSE,$15,$16,$17)
       ON CONFLICT (shop, shopify_order_id, variant_id) DO NOTHING`,
      [
        id,
        shop,
        shopifyOrderId,
        payload.name ?? `#${shopifyOrderId}`,
        String(item.product_id ?? ""),
        item.name ?? "",
        variantId,
        item.variant_title ?? "",
        qty,
        token,
        frontPreviewUrl,
        frontPrintUrl,
        customerName,
        customerEmail,
        payload.created_at ? new Date(payload.created_at) : new Date(),
        lineTotalPrice,
        currencyCode,
      ],
    );
    console.log(
      `[webhook] imported order ${payload.name} variant=${item.variant_title ?? variantId} qty=${item.quantity ?? 1}`,
    );
  }
}

function resetCustomerQuota(shop: string, designToken: string, orderName?: string) {
  getSessionForDesignToken(shop, designToken)
    .then(async (sessionId) => {
      if (!sessionId) return;
      await Promise.all([
        resetCustomerBgQuota(shop, sessionId),
        resetCustomerAiQuota(shop, sessionId),
      ]);
    })
    .catch((err) =>
      console.error(`[webhook] customer quota reset failed for order ${orderName}:`, err),
    );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256") ?? "";

  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("X-Shopify-Topic") ?? "";
  const shop = request.headers.get("X-Shopify-Shop-Domain") ?? "";

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // ── GDPR: customers/data_request ──────────────────────────────────
  if (topic === "CUSTOMERS_DATA_REQUEST" || topic === "customers/data_request") {
    console.log(`[webhook] GDPR data_request shop=${shop}`);
    return json({ ok: true });
  }

  // ── GDPR: customers/redact ────────────────────────────────────────
  if (topic === "CUSTOMERS_REDACT" || topic === "customers/redact") {
    const body = payload as { customer?: { email?: string }; orders_to_redact?: Array<{ id: number }> };
    const email = body.customer?.email;
    console.log(`[webhook] GDPR customers_redact shop=${shop} email=${email}`);
    if (email) {
      await query(
        `UPDATE orders SET customer_name = 'Redacted', customer_email = '' WHERE shop = $1 AND customer_email = $2`,
        [shop, email],
      ).catch((err) => console.error(`[webhook] customers_redact failed:`, err));
    }
    return json({ ok: true });
  }

  // ── GDPR: shop/redact ─────────────────────────────────────────────
  if (topic === "SHOP_REDACT" || topic === "shop/redact") {
    console.log(`[webhook] GDPR shop_redact shop=${shop} — deleting all shop data`);
    deleteShopData(shop).catch((err) =>
      console.error(`[webhook] shop_redact data deletion failed for ${shop}:`, err),
    );
    return json({ ok: true });
  }

  // ── App subscription updated (trial end / cancel / reactivate) ───────
  if (topic === "APP_SUBSCRIPTIONS_UPDATE" || topic === "app_subscriptions/update") {
    const body = payload as {
      app_subscription?: {
        admin_graphql_api_id?: string;
        name?: string;
        status?: string;
      };
    };
    const sub = body.app_subscription;
    const status = sub?.status?.toUpperCase();
    const planName = sub?.name ?? "";
    const subscriptionId = sub?.admin_graphql_api_id ?? null;

    if (PLAN_NAMES.includes(planName as never) && status) {
      const subscriptionStatus =
        status === "ACTIVE" ? "active" :
        status === "TRIAL" ? "trial" :
        "cancelled";
      upsertShopSubscription(shop, {
        planKey: planName as never,
        shopifySubscriptionId: subscriptionId,
        subscriptionStatus,
      }).catch((err) =>
        console.error(`[webhook] app_subscriptions/update upsert failed for ${shop}:`, err),
      );
      console.log(`[webhook] app_subscriptions/update shop=${shop} plan=${planName} status=${subscriptionStatus}`);
    }
    return json({ ok: true });
  }

  // ── Orders created ──────────────────────────────────────────────────
  if (topic === "ORDERS_CREATE" || topic === "orders/create") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    const designToken = extractDesignToken(order);
    const financialStatus = order.financial_status ?? "pending";
    const isPaid = ["paid", "authorized", "partially_paid"].includes(financialStatus);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"} financial=${financialStatus}`);

    importOrderFromWebhook(shop, order)
      .then(() => {
        if (designToken) {
          processOrderBgRemoval(shop, designToken).catch((err) =>
            console.error(`[webhook] auto-bg failed for order ${order.name}:`, err),
          );
        }
        // Sadece ödeme onaylıysa Drive'a at — havale (pending) ise orders/paid bekle
        if (shopifyOrderId && designToken && isPaid) {
          autoExportOrderToDrive(shop, shopifyOrderId).catch((err) =>
            console.error(`[webhook] auto-drive-export failed for order ${order.name}:`, err),
          );
        } else if (!isPaid) {
          console.log(`[webhook] drive export beklemede (${financialStatus}): order=${order.name}`);
        }
      })
      .catch((err) =>
        console.error(`[webhook] importOrder failed for order ${order.name}:`, err),
      );
  }

  // ── Orders paid ──────────────────────────────────────────────────
  if (topic === "ORDERS_PAID" || topic === "orders/paid") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    const designToken = extractDesignToken(order);
    console.log(`[webhook] order=${order.name} topic=${topic} token=${designToken ?? "none"} — ödeme onaylandı`);

    importOrderFromWebhook(shop, order)
      .then(() => {
        if (designToken) {
          resetCustomerQuota(shop, designToken, order.name);
        }
        // Ödeme onaylandı → her zaman Drive'a at (havale dahil)
        if (shopifyOrderId) {
          autoExportOrderToDrive(shop, shopifyOrderId).catch((err) =>
            console.error(`[webhook] auto-drive-export (paid) failed for order ${order.name}:`, err),
          );
        }
      })
      .catch((err) =>
        console.error(`[webhook] importOrder (paid) failed for order ${order.name}:`, err),
      );
  }

  // ── Orders cancelled ─────────────────────────────────────────────
  if (topic === "ORDERS_CANCELLED" || topic === "orders/cancelled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    console.log(`[webhook] cancelled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      getOrderByShopifyId(shop, shopifyOrderId)
        .then((existing) => {
          if (existing) return updateOrderStatus(existing.id, "cancelled");
        })
        .catch((err) =>
          console.error(`[webhook] cancel status update failed for order ${order.name}:`, err),
        );

      markDriveFolderCancelled(shop, shopifyOrderId).catch((err) =>
        console.error(`[webhook] drive cancel mark failed for order ${order.name}:`, err),
      );
    }
  }

  // ── Orders deleted ───────────────────────────────────────────────
  if (topic === "ORDERS_DELETE" || topic === "orders/delete") {
    const order = payload as { id?: number };
    const shopifyOrderId = String(order.id ?? "");
    console.log(`[webhook] deleted shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      query("DELETE FROM orders WHERE shop = $1 AND shopify_order_id = $2", [
        shop,
        shopifyOrderId,
      ]).catch((err) =>
        console.error(`[webhook] delete failed for shopifyId=${shopifyOrderId}:`, err),
      );
    }
  }

  // ── One-time purchase approved (AI credit packs) ──────────────────────────
  if (topic === "APP_PURCHASES_ONE_TIME_UPDATE" || topic === "app_purchases/update") {
    const body = payload as {
      id?: number;
      admin_graphql_api_id?: string;
      status?: string;
      name?: string;
    };
    const status = body.status?.toUpperCase();
    const chargeId = body.admin_graphql_api_id;
    const packName = body.name ?? "";

    if (status === "ACTIVE" && chargeId) {
      const pack = Object.values(CREDIT_PACKS).find((p) => p.label === packName);
      if (pack) {
        query("SELECT id FROM ai_credit_purchases WHERE charge_id = $1", [chargeId])
          .then(async (existing) => {
            if (existing.rows.length > 0) return;
            const id = `acp_${randomBytes(8).toString("hex")}`;
            await query(
              `INSERT INTO ai_credit_purchases (id, shop, charge_id, pack_key, credits_added, price_usd, expires_at)
               VALUES ($1,$2,$3,$4,$5,$6, now() + interval '30 days') ON CONFLICT (charge_id) DO NOTHING`,
              [id, shop, chargeId, pack.key, pack.credits, pack.price],
            );
            console.log(
              `[webhook] credit pack applied: shop=${shop} pack=${pack.key} credits=${pack.credits}`,
            );
          })
          .catch((err) => console.error("[webhook] credit pack error:", err));
      }
    }
  }

  // ── Orders fulfilled ─────────────────────────────────────────────
  if (topic === "ORDERS_FULFILLED" || topic === "orders/fulfilled") {
    const order = payload as OrderPayload;
    const shopifyOrderId = String((order as { id?: number }).id ?? "");
    console.log(`[webhook] fulfilled order=${order.name} shopifyId=${shopifyOrderId}`);

    if (shopifyOrderId) {
      getOrderByShopifyId(shop, shopifyOrderId)
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
