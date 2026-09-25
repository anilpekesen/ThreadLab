import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";

/**
 * Platformdan bağımsız sipariş içe aktarma.
 *
 * Her platform kendi sipariş gövdesini `IncomingOrder`'a çevirir (Shopify:
 * `shopifyOrderToIncoming`); satırların `orders` tablosuna yazılması tek
 * yerde ve aynı kurallarla yapılır. Özellik listeleri sıralı ve iki grup
 * hâlinde tutulur (`props` önce, `extraProps` sonra): tasarım anahtarı ve
 * baskı dosyası aramaları bu sırayla yapılıyor, tek sözlüğe birleştirmek
 * bazı durumlarda farklı bir değer seçerdi.
 */

export type KV = { name?: string; key?: string; value: string };

export interface IncomingLine {
  /** Platformun satır kimliği; yoksa varyant + tasarım anahtarından türetilir */
  id?: string | number;
  productId?: string | number;
  variantId?: string | number;
  variantTitle?: string | null;
  quantity?: number;
  /** Mağaza para biriminde birim fiyat (metin) */
  unitPrice?: string;
  currency?: string;
  name?: string;
  requiresShipping?: boolean;
  props?: KV[];
  extraProps?: KV[];
}

export interface IncomingOrder {
  id: string;
  name?: string;
  createdAt?: string;
  currency?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail: string;
  props?: KV[];
  extraProps?: KV[];
  lines: IncomingLine[];
}

export function getAttr(attrs: KV[] | undefined, key: string): string | undefined {
  return attrs?.find((a) => (a.name ?? a.key) === key)?.value;
}

export function getDesignToken(attrs: KV[] | undefined): string | undefined {
  return getAttr(attrs, "_design_token") ?? getAttr(attrs, "design_token");
}

function normalizeColorValue(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

// Tasarımcıda müşterinin seçtiği renk (_pl_color) ile mağazaya giden
// varyantın rengi uyuşuyor mu — uyuşmazsa yanlış renkte üretim riski var
function hasColorMismatch(variantTitle: string | undefined, selectedColor: string | undefined): boolean {
  if (!selectedColor || !variantTitle) return false;
  const segments = variantTitle.split("/").map(normalizeColorValue);
  return !segments.includes(normalizeColorValue(selectedColor));
}

export async function importOrder(shop: string, order: IncomingOrder): Promise<void> {
  const shopifyOrderId = String(order.id ?? "");
  if (!shopifyOrderId) return;

  const orderToken = getDesignToken(order.props) ?? getDesignToken(order.extraProps);
  const lineItems = order.lines ?? [];
  const designItems = lineItems.filter(
    (li) =>
      getDesignToken(li.props) !== undefined ||
      getDesignToken(li.extraProps) !== undefined ||
      Boolean(getAttr(li.props, "_front_print_url")) ||
      Boolean(getAttr(li.extraProps, "_front_print_url")),
  );
  const itemsToProcess =
    designItems.length > 0 ? designItems : lineItems.filter((li) => li.requiresShipping);

  if (!orderToken && designItems.length === 0) return;
  if (itemsToProcess.length === 0) return;

  const orderFrontPreviewUrl =
    getAttr(order.props, "_front_preview_url") ??
    getAttr(order.extraProps, "_front_preview_url") ??
    "";
  const orderFrontPrintUrl =
    getAttr(order.props, "_front_print_url") ??
    getAttr(order.extraProps, "_front_print_url") ??
    "";
  const customerName =
    [order.customerFirstName, order.customerLastName].filter(Boolean).join(" ") ||
    "Müşteri";
  const customerEmail = order.customerEmail;

  for (const item of itemsToProcess) {
    const variantId = String(item.variantId ?? "");
    const token =
      getDesignToken(item.props) ??
      getDesignToken(item.extraProps) ??
      orderToken ??
      "";
    const lineItemId = item.id ? String(item.id) : `${variantId}:${token || "no-design"}`;
    const itemHasOwnDesignToken = Boolean(
      getDesignToken(item.props) ?? getDesignToken(item.extraProps),
    );
    const allowOrderLevelDesignUrls = !itemHasOwnDesignToken && designItems.length === 0;

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

    let frontPreviewUrl =
      getAttr(item.props, "_front_preview_url") ??
      getAttr(item.extraProps, "_front_preview_url") ??
      (allowOrderLevelDesignUrls ? orderFrontPreviewUrl : "");
    // Kişiselleştirici baskı dosyasını "_print_file" adıyla yazıyor; eski
    // tasarımcı akışı "_front_print_url" kullanıyor. İkisini de kabul ediyoruz,
    // yoksa yeni ürünlerin siparişleri baskı dosyasız düşüyor.
    let frontPrintUrl =
      getAttr(item.props, "_front_print_url") ??
      getAttr(item.extraProps, "_front_print_url") ??
      getAttr(item.props, "_print_file") ??
      getAttr(item.extraProps, "_print_file") ??
      (allowOrderLevelDesignUrls ? orderFrontPrintUrl : "");

    // Set ürünlerinde üretime birden fazla dosya gidiyor. Virgülle ayrılmış
    // liste sipariş satırında; tek dosyalı ürünlerde bu alan boş kalıyor ve
    // production_file_url tek başına yeterli oluyor.
    const printFilesRaw =
      getAttr(item.props, "_print_files") ??
      getAttr(item.extraProps, "_print_files") ??
      "";
    const productionFiles = printFilesRaw
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    // Ek ücretli kişiselleştirici satırı sepet fonksiyonunca "ürün + ücret"
    // olarak bölünüyor; ürün satırında yalnız tasarım anahtarı kalıyor, baskı
    // dosyaları satır grubunda. Dosyalar tasarım kaydından tamamlanır.
    if (productionFiles.length === 0 && !frontPrintUrl && itemHasOwnDesignToken && token) {
      const d = (await query<{ front_print_url: string | null; front_preview_url: string | null; design_json: { type?: string; pieces?: { url?: string }[] } | null }>(
        "SELECT front_print_url, front_preview_url, design_json FROM designs WHERE token = $1 AND shop = $2",
        [token, shop],
      ).catch(() => ({ rows: [] }))).rows[0];
      if (d?.design_json?.type === "personalizer-slots") {
        frontPrintUrl = d.front_print_url ?? "";
        if (!frontPreviewUrl) frontPreviewUrl = d.front_preview_url ?? "";
        const urls = (d.design_json.pieces ?? []).map((p) => String(p.url ?? "")).filter(Boolean);
        if (urls.length > 1) productionFiles.push(...urls);
      }
    }
    if (productionFiles.length === 0 && frontPrintUrl) productionFiles.push(frontPrintUrl);

    const qty = item.quantity ?? 1;
    const unitPrice = Number(item.unitPrice ?? 0);
    const lineTotalPrice = unitPrice * qty;
    const currencyCode = item.currency ?? order.currency ?? "";

    const selectedColor =
      getAttr(item.props, "_pl_color") ?? getAttr(item.extraProps, "_pl_color");
    const colorMismatch = hasColorMismatch(item.variantTitle ?? undefined, selectedColor);
    if (colorMismatch) {
      console.warn(
        `[webhook] renk uyuşmazlığı: order=${order.name} variant="${item.variantTitle}" seçilen="${selectedColor}"`,
      );
    }

    const id = `order_${randomBytes(8).toString("hex")}`;
    await query(
      `INSERT INTO orders
         (id, shop, shopify_order_id, order_number, product_id, product_name,
          variant_id, variant_title, line_item_id, quantity, design_token, preview_url,
          production_file_url, production_files, customer_name, customer_email,
          production_status, missing_surcharge, created_at,
          line_total_price, currency_code, color_mismatch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending',FALSE,$17,$18,$19,$20)
       ON CONFLICT DO NOTHING`,
      [
        id,
        shop,
        shopifyOrderId,
        order.name ?? `#${shopifyOrderId}`,
        String(item.productId ?? ""),
        item.name ?? "",
        variantId,
        item.variantTitle ?? "",
        lineItemId,
        qty,
        token,
        frontPreviewUrl,
        frontPrintUrl,
        JSON.stringify(productionFiles),
        customerName,
        customerEmail,
        order.createdAt ? new Date(order.createdAt) : new Date(),
        lineTotalPrice,
        currencyCode,
        colorMismatch,
      ],
    );
    console.log(
      `[webhook] imported order ${order.name} variant=${item.variantTitle ?? variantId} qty=${item.quantity ?? 1}`,
    );
  }
}

// ── Shopify ─────────────────────────────────────────────────────────────────

type ShopifyLineItem = {
  id?: number;
  product_id?: number;
  variant_id?: number;
  variant_title?: string | null;
  quantity?: number;
  price?: string;
  price_set?: { shop_money?: { amount?: string; currency_code?: string } };
  name?: string;
  requires_shipping?: boolean;
  properties?: KV[];
  attributes?: KV[];
};

export type ShopifyOrderPayload = {
  id?: number;
  name?: string;
  created_at?: string;
  currency?: string;
  email?: string;
  contact_email?: string;
  note_attributes?: KV[];
  attributes?: KV[];
  line_items?: ShopifyLineItem[];
  customer?: { first_name?: string; last_name?: string; email?: string };
};

/** Shopify REST sipariş gövdesi → ortak yapı (alanlar birebir taşınır) */
export function shopifyOrderToIncoming(payload: ShopifyOrderPayload): IncomingOrder {
  return {
    id: String(payload.id ?? ""),
    name: payload.name,
    createdAt: payload.created_at,
    currency: payload.currency,
    customerFirstName: payload.customer?.first_name,
    customerLastName: payload.customer?.last_name,
    // Shopify müşteri e-postasını üç ayrı alanda gönderebiliyor; customer
    // objesi olmayan (misafir) siparişlerde yalnız üst seviyedekiler dolu
    customerEmail: (payload.customer?.email || payload.email || payload.contact_email || "").trim(),
    props: payload.note_attributes,
    extraProps: payload.attributes,
    lines: (payload.line_items ?? []).map((li) => ({
      id: li.id,
      productId: li.product_id,
      variantId: li.variant_id,
      variantTitle: li.variant_title,
      quantity: li.quantity,
      unitPrice: li.price_set?.shop_money?.amount ?? li.price,
      currency: li.price_set?.shop_money?.currency_code,
      name: li.name,
      requiresShipping: li.requires_shipping,
      props: li.properties,
      extraProps: li.attributes,
    })),
  };
}
