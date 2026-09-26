import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { query, runMigrations } from "~/lib/db.server";
import { decryptSecret, encryptSecret } from "~/lib/printful.server";
import { publicAppUrl } from "~/lib/app-url.server";
import { wooShopKey } from "~/lib/platform";
import { importOrder, type IncomingOrder, type KV } from "~/models/order-import.server";
import { designerUnitFee } from "~/lib/print-price-check.server";

/**
 * WooCommerce bağlantısı.
 *
 *   1. Eklentideki "PrintLab'e bağlan" mağazanın kendi /wc-auth/v1/authorize
 *      ekranını açar; mağaza onaylayınca WooCommerce REST anahtarlarını
 *      callback'e (api.woo.auth-callback) POST eder.
 *   2. PrintLab anahtarları o sitenin REST'ine sorarak doğrular — sahte bir
 *      POST başka bir siteyi bağlayamaz — ve sipariş webhook'larını kurar.
 *   3. Webhook gövdesi X-WC-Webhook-Signature (base64 HMAC-SHA256) ile
 *      doğrulanır; sipariş ortak içe aktarıcıdan geçer.
 *
 * Mağaza kimliği `woo:<host>` (bkz. ~/lib/platform).
 */

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface WooConnection {
  shop: string;
  siteUrl: string;
  key: string;
  secret: string;
  webhookSecret: string;
}

export async function getWooConnection(shop: string): Promise<WooConnection | null> {
  await ensureMigrations();
  const r = (await query<{ site_url: string; consumer_key_enc: string; consumer_secret_enc: string; webhook_secret_enc: string }>(
    "SELECT site_url, consumer_key_enc, consumer_secret_enc, webhook_secret_enc FROM woo_connections WHERE shop = $1", [shop])).rows[0];
  if (!r) return null;
  try {
    return {
      shop,
      siteUrl: r.site_url,
      key: decryptSecret(r.consumer_key_enc),
      secret: decryptSecret(r.consumer_secret_enc),
      webhookSecret: r.webhook_secret_enc ? decryptSecret(r.webhook_secret_enc) : "",
    };
  } catch (err) {
    console.error("[woo] anahtar çözülemedi:", err);
    return null;
  }
}

export async function wooRest<T = unknown>(
  conn: Pick<WooConnection, "siteUrl" | "key" | "secret">,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${conn.siteUrl.replace(/\/+$/, "")}/wp-json/wc/v3${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${conn.key}:${conn.secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      "User-Agent": "PrintLab/1.0",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Woo REST ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * wc-auth callback: anahtarları doğrula, sakla, webhook'ları kur.
 * `userId` bağlanma isteğinde eklentinin verdiği site adresidir.
 */
export async function connectWoo(input: { userId: string; consumerKey: string; consumerSecret: string }): Promise<{ shop: string }> {
  await ensureMigrations();
  const shop = wooShopKey(input.userId);
  if (!shop) throw new Error("invalid site");
  const siteUrl = `https://${shop.slice(4)}`;
  const probe = { siteUrl, key: input.consumerKey, secret: input.consumerSecret };
  // Anahtar bu siteye ait mi: REST'e bu anahtarla erişilebilmeli
  await wooRest(probe, "/settings/general");

  const webhookSecret = randomBytes(24).toString("hex");
  await query(
    `INSERT INTO woo_connections (shop, site_url, consumer_key_enc, consumer_secret_enc, webhook_secret_enc, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (shop) DO UPDATE SET site_url = $2, consumer_key_enc = $3, consumer_secret_enc = $4, webhook_secret_enc = $5, updated_at = now()`,
    [shop, siteUrl, encryptSecret(input.consumerKey), encryptSecret(input.consumerSecret), encryptSecret(webhookSecret)],
  );

  // Eski PrintLab webhook'larını sil, yenilerini kur (sır her bağlanmada yenilenir)
  const delivery = `${publicAppUrl()}/webhooks/woo`;
  const existing = await wooRest<Array<{ id: number; delivery_url: string }>>(probe, "/webhooks?per_page=100").catch(() => []);
  for (const w of existing.filter((w) => w.delivery_url === delivery)) {
    await wooRest(probe, `/webhooks/${w.id}?force=true`, { method: "DELETE" }).catch(() => null);
  }
  for (const topic of ["order.created", "order.updated"]) {
    await wooRest(probe, "/webhooks", {
      method: "POST",
      body: { name: `PrintLab ${topic}`, topic, delivery_url: delivery, secret: webhookSecret, status: "active" },
    });
  }
  return { shop };
}

export async function isWooConnected(shop: string): Promise<boolean> {
  await ensureMigrations();
  return (await query("SELECT 1 FROM woo_connections WHERE shop = $1", [shop])).rows.length > 0;
}

// ── Sipariş ─────────────────────────────────────────────────────────────────

type WooMeta = { key: string; value: unknown };
type WooOrder = {
  id?: number;
  number?: string;
  status?: string;
  currency?: string;
  date_created_gmt?: string;
  billing?: { first_name?: string; last_name?: string; email?: string };
  meta_data?: WooMeta[];
  line_items?: Array<{
    id?: number;
    name?: string;
    product_id?: number;
    variation_id?: number;
    quantity?: number;
    price?: number | string;
    meta_data?: WooMeta[];
  }>;
};

/**
 * Eklentinin sipariş satırına yazdığı alanlar → içe aktarıcının beklediği
 * adlar; listede olmayan `printlab_x` → `_x` (tasarımcının `_front_print_url`
 * vb. alanları). Eklenti alt çizgisiz `printlab_*` kullanıyor: WooCommerce REST
 * gizli (_ ile başlayan) satır alanlarını her sürümde döndürmüyor.
 */
const META_MAP: Record<string, string> = {
  printlab_design_token: "_design_token",
  printlab_print_file: "_print_file",
  printlab_print_files: "_print_files",
  printlab_preview_url: "_front_preview_url",
  printlab_template: "_personalizer_template",
};

function metaToProps(meta: WooMeta[] | undefined): KV[] {
  return (meta ?? []).map((m) => ({
    key: META_MAP[m.key] ?? (m.key.startsWith("printlab_") ? `_${m.key.slice(9)}` : m.key),
    value: typeof m.value === "string" ? m.value : JSON.stringify(m.value),
  }));
}

export function wooOrderToIncoming(o: WooOrder): IncomingOrder {
  return {
    id: String(o.id ?? ""),
    name: o.number ? `#${o.number}` : undefined,
    createdAt: o.date_created_gmt ? `${o.date_created_gmt}Z` : undefined,
    currency: o.currency,
    customerFirstName: o.billing?.first_name,
    customerLastName: o.billing?.last_name,
    customerEmail: (o.billing?.email ?? "").trim(),
    props: metaToProps(o.meta_data),
    lines: (o.line_items ?? []).map((li) => ({
      id: li.id,
      productId: li.product_id,
      // Basit üründe varyasyon yok: ürün kimliği varyant yerine geçer
      variantId: li.variation_id || li.product_id,
      variantTitle: null,
      quantity: li.quantity,
      unitPrice: li.price === undefined ? undefined : String(li.price),
      name: li.name,
      requiresShipping: true,
      props: metaToProps(li.meta_data),
    })),
  };
}

export function verifyWooSignature(raw: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  let given: Buffer;
  try { given = Buffer.from(signature, "base64"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleWooWebhook(raw: string, headers: Headers): Promise<number> {
  const source = headers.get("x-wc-webhook-source") ?? "";
  const shop = wooShopKey(source);
  // Kurulumda gelen "ping" (webhook_id=…) gövdesi imzasız olabilir; 200 dön
  if (!headers.get("x-wc-webhook-topic") && raw.startsWith("webhook_id=")) return 200;
  if (!shop) return 400;
  const conn = await getWooConnection(shop);
  if (!conn || !verifyWooSignature(raw, headers.get("x-wc-webhook-signature") ?? "", conn.webhookSecret)) return 401;

  const topic = headers.get("x-wc-webhook-topic") ?? "";
  if (topic === "order.created" || topic === "order.updated") {
    let order: WooOrder;
    try { order = JSON.parse(raw); } catch { return 400; }
    // İptal/iade: PrintLab'deki üretim satırları da iptal (Shopify'daki orders/cancelled karşılığı)
    if (["cancelled", "refunded"].includes(String(order.status)) && order.id) {
      const { cancelShopifyOrder } = await import("~/models/orders.server");
      await cancelShopifyOrder(shop, String(order.id));
      return 200;
    }
    // Ödenmemiş (bekleyen, başarısız) siparişler üretime girmez
    if (!["processing", "completed", "on-hold"].includes(String(order.status))) return 200;
    await importOrder(shop, wooOrderToIncoming(order));
    // Printful bağlıysa eşleşen satırlar için taslak (onay beklenir; Shopify'la aynı)
    if (order.id) {
      const { createPrintfulDraft } = await import("~/models/printful.server");
      createPrintfulDraft(shop, String(order.id)).then((r) => {
        if (r.status !== "skipped") console.log(`[printful] woo #${order.number ?? order.id}: ${r.status}${r.message ? ` (${r.message})` : ""}`);
      }).catch((err) => console.error("[printful] woo taslak hatası:", err));
    }
  }
  return 200;
}

// ── Fiyat ───────────────────────────────────────────────────────────────────

/**
 * Sepetteki tasarımın ek ücreti; eklenti sepet hesabında sunucudan sorar.
 * Tutar yalnız sunucunun kaydettiği tasarımdan gelir, tarayıcıdan değil:
 *   - kişiselleştirici: sepete eklenirken hesaplanıp kayda yazılan seçenek ücreti,
 *   - tişört tasarımcısı: kayıtlı Fabric verisinden baskı bandı ücreti
 *     (Shopify'daki sipariş sonrası kontrolle aynı hesap), `quantity` toplu
 *     indirim için aynı tasarımın sepetteki toplam adedidir.
 */
export async function quoteDesign(shop: string, token: string, quantity = 1): Promise<{ fee: number } | null> {
  const d = (await query<{ shop: string; product_id: string | null; design_json: { type?: string; optionFee?: number; front?: string; back?: string } | null }>(
    "SELECT shop, product_id, design_json FROM designs WHERE token = $1", [token])).rows[0];
  if (!d || d.shop !== shop) return null;
  const money = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0);
  if (d.design_json?.type === "personalizer-slots") return { fee: money(Number(d.design_json.optionFee ?? 0)) };

  const productId = String(d.product_id ?? "").split("/").pop() ?? "";
  if (!productId || !d.design_json) return { fee: 0 };
  const fee = await designerUnitFee(shop, productId, d.design_json, quantity);
  // Ürünün tasarımcı ayarı yoksa ücret doğrulanamaz: sepet ödemeye geçemez
  if (!fee) return null;
  return { fee: money(fee.unitFee) };
}

// ── Şablon listesi ──────────────────────────────────────────────────────────

/**
 * Eklentinin ürün ekranındaki şablon seçimi için mağazanın şablonları.
 * İstek, PrintLab'in bağlanırken kurduğu webhook'un sırrıyla imzalanır:
 * eklenti sırrı WooCommerce'in kendi webhook kaydından okur, ayrıca bir
 * anahtar saklamaz. Yeniden bağlanınca sır ikisinde birden yenilenir.
 * İmza: hex HMAC-SHA256(sır, `${shop}\n${ts}`), ts saniye, ±5 dk.
 */
export async function verifyWooSiteRequest(shop: string, ts: string, sig: string): Promise<boolean> {
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const conn = await getWooConnection(shop);
  if (!conn?.webhookSecret) return false;
  const expected = createHmac("sha256", conn.webhookSecret).update(`${shop}\n${ts}`).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function listWooTemplates(shop: string) {
  const { listPersonalizerTemplates } = await import("~/models/personalizer.server");
  // Eklentinin kutusu yalnız fotoğraf yuvalı / parçalı şablonları açabiliyor
  return (await listPersonalizerTemplates(shop, true))
    .filter((t) => (t.slots?.length ?? 0) > 0 || (t.pieces?.length ?? 0) > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      previewUrl: t.mockups?.[0]?.url || t.mockup_url || t.template_url || t.overlay_url || "",
      photos: t.slots?.length ?? 0,
    }));
}

// ── Yönetim girişi ──────────────────────────────────────────────────────────

/**
 * WordPress yönetiminden PrintLab'e giriş. Mağaza sahibi WordPress'te zaten
 * oturum açmış ("manage_woocommerce" yetkisi); eklenti bağlantıyı webhook
 * sırrıyla imzalar — Shopify'ın gömülü uygulamaya güvenmesiyle aynı mantık.
 * İmza: hex HMAC-SHA256(sır, `login\n${shop}\n${ts}\n${nonce}`), 2 dk
 * geçerli, nonce tek kullanımlık (bağlantı tarayıcı geçmişinden tekrar
 * kullanılamaz).
 */
export async function consumeWooLogin(shop: string, ts: string, nonce: string, sig: string): Promise<boolean> {
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 120) return false;
  if (!/^[a-zA-Z0-9]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const conn = await getWooConnection(shop);
  if (!conn?.webhookSecret) return false;
  const expected = createHmac("sha256", conn.webhookSecret).update(`login\n${shop}\n${ts}\n${nonce}`).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  // Tek kullanım: aynı nonce ikinci kez eklenemez
  const ins = await query("INSERT INTO woo_login_nonces (nonce, shop) VALUES ($1, $2) ON CONFLICT DO NOTHING", [nonce, shop]);
  await query("DELETE FROM woo_login_nonces WHERE used_at < now() - interval '1 day'").catch(() => null);
  return (ins.rowCount ?? 0) === 1;
}

// ── Ürünler ─────────────────────────────────────────────────────────────────

type WooProduct = {
  id: number; name: string; slug: string; type: string; status: string; price?: string;
  images?: Array<{ src: string }>; categories?: Array<{ name: string }>;
};
type WooVariation = {
  id: number; price?: string; image?: { src?: string } | null;
  attributes?: Array<{ name: string; option: string }>;
};

/**
 * Yönetim ekranlarının Shopify ürün listesiyle aynı biçimde WooCommerce
 * ürünleri. Kimlikler düz sayı ("10"): mağaza tarafı da ürünü böyle bilir.
 */
export async function fetchWooProducts(shop: string, search = "", ids?: string[]) {
  const conn = await getWooConnection(shop);
  if (!conn) return [];
  const qs = new URLSearchParams({ per_page: "50", status: "publish", orderby: "modified", order: "desc" });
  if (search) qs.set("search", search);
  if (ids?.length) qs.set("include", ids.join(","));
  const products = await wooRest<WooProduct[]>(conn, `/products?${qs}`);
  return Promise.all(products.map(async (p) => {
    const variations = p.type === "variable"
      ? await wooRest<WooVariation[]>(conn, `/products/${p.id}/variations?per_page=100`).catch(() => [])
      : [];
    const image = p.images?.[0]?.src ?? null;
    return {
      id: String(p.id),
      title: p.name,
      handle: p.slug,
      productType: p.categories?.[0]?.name ?? "",
      status: p.status === "publish" ? "ACTIVE" : p.status.toUpperCase(),
      featuredImage: image,
      images: (p.images ?? []).map((i) => i.src),
      variants: variations.length
        ? variations.map((v) => ({
            id: String(v.id),
            title: (v.attributes ?? []).map((a) => a.option).join(" / "),
            price: v.price ?? "",
            selectedOptions: (v.attributes ?? []).map((a) => ({ name: a.name, value: a.option })),
            image: v.image?.src ?? null,
          }))
        : [{ id: String(p.id), title: "Default Title", price: p.price ?? "", selectedOptions: [], image }],
    };
  }));
}

/**
 * Şablon bağlantısı WooCommerce ürününe: eklentinin okuduğu `_printlab_template`
 * alanı (Shopify'daki ürün metafield'ının karşılığı). Boş değer bağlantıyı kaldırır.
 */
export async function setWooProductTemplate(shop: string, productId: string, templateId: string): Promise<{ ok: boolean; error?: string }> {
  const conn = await getWooConnection(shop);
  if (!conn) return { ok: false, error: "WooCommerce store is not connected" };
  const id = String(productId).split("/").pop() ?? "";
  if (!/^\d+$/.test(id)) return { ok: false, error: "invalid product" };
  try {
    await wooRest(conn, `/products/${id}`, { method: "PUT", body: { meta_data: [{ key: "_printlab_template", value: templateId }] } });
    return { ok: true };
  } catch (err) {
    console.error("[woo] şablon ürüne yazılamadı:", err);
    return { ok: false, error: "Could not update the WooCommerce product" };
  }
}

// ── Sipariş durumunu geri yazma ─────────────────────────────────────────────

const STATUS_NOTE: Record<string, string> = {
  pending: "Waiting for production",
  preparing: "In production",
  printed: "Printed",
  ready: "Ready to ship",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

/**
 * PrintLab'deki üretim durumu WooCommerce siparişine: her değişiklik özel
 * (müşteriye gitmeyen) sipariş notu olur. "Gönderildi" ise siparişi
 * "Tamamlandı"ya alır; WooCommerce müşteriye kendi "sipariş tamamlandı"
 * e-postasını gönderir (Shopify'da fulfillment bildirimiyle aynı yer).
 */
export async function pushWooOrderStatus(
  shop: string,
  wooOrderId: string,
  status: string,
  tracking?: { number: string; company: string; url: string },
): Promise<void> {
  const conn = await getWooConnection(shop);
  if (!conn || !/^\d+$/.test(wooOrderId)) return;
  const label = STATUS_NOTE[status] ?? status;
  await wooRest(conn, `/orders/${wooOrderId}/notes`, {
    method: "POST",
    body: { note: `PrintLab: ${label}`, customer_note: false },
  });
  if (status === "shipped" && tracking && (tracking.number || tracking.url)) {
    // Müşteriye görünen not: WooCommerce e-postayla iletir
    const lines = [
      tracking.company && `Carrier: ${tracking.company}`,
      tracking.number && `Tracking number: ${tracking.number}`,
      tracking.url && `Track your package: ${tracking.url}`,
    ].filter(Boolean);
    await wooRest(conn, `/orders/${wooOrderId}/notes`, {
      method: "POST",
      body: { note: `Your order has shipped.\n${lines.join("\n")}`, customer_note: true },
    });
  }
  if (status === "shipped") {
    const order = await wooRest<{ status?: string }>(conn, `/orders/${wooOrderId}`);
    // İptal/iade edilmiş siparişi geri açma
    if (["processing", "on-hold"].includes(String(order.status))) {
      await wooRest(conn, `/orders/${wooOrderId}`, { method: "PUT", body: { status: "completed" } });
    }
  }
}

/**
 * WordPress'te üründe şablon seçilince eklenti PrintLab'e bildirir; böylece
 * kişiselleştirici listesindeki "bağlı ürün" sayısı ve kutunun hangi şablonu
 * açacağı iki tarafta aynı kalır. İmza: hex HMAC-SHA256(sır,
 * `link\n${shop}\n${ts}\n${productId}\n${templateId}`), ±5 dk.
 */
export async function applyWooProductLink(input: {
  shop: string; ts: string; sig: string; productId: string; templateId: string; title: string; slug: string;
}): Promise<{ ok: boolean; status: number }> {
  const t = Number(input.ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300 || !/^[0-9a-f]{64}$/.test(input.sig)) return { ok: false, status: 401 };
  if (!/^\d+$/.test(input.productId) || (input.templateId && !/^[a-zA-Z0-9_-]{6,64}$/.test(input.templateId))) return { ok: false, status: 400 };
  const conn = await getWooConnection(input.shop);
  if (!conn?.webhookSecret) return { ok: false, status: 401 };
  const expected = createHmac("sha256", conn.webhookSecret)
    .update(`link\n${input.shop}\n${input.ts}\n${input.productId}\n${input.templateId}`).digest();
  const given = Buffer.from(input.sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401 };

  if (!input.templateId) {
    await query("DELETE FROM personalizer_product_links WHERE shop = $1 AND product_id = $2", [input.shop, input.productId]);
    return { ok: true, status: 200 };
  }
  // Başka mağazanın şablonu bağlanamaz
  const own = (await query("SELECT 1 FROM personalizer_templates WHERE id = $1 AND shop = $2", [input.templateId, input.shop])).rows.length > 0;
  if (!own) return { ok: false, status: 404 };
  const { linkPersonalizerProduct } = await import("~/models/personalizer.server");
  // Ürün tek şablona bağlı: önceki bağları kaldır
  await query("DELETE FROM personalizer_product_links WHERE shop = $1 AND product_id = $2 AND template_id <> $3", [input.shop, input.productId, input.templateId]);
  await linkPersonalizerProduct({
    shop: input.shop, product_id: input.productId, template_id: input.templateId,
    product_title: input.title.slice(0, 200), product_handle: input.slug.slice(0, 200),
  });
  return { ok: true, status: 200 };
}

/**
 * "Eski siparişleri çek": son 60 günün ödenmiş siparişleri REST'ten okunup
 * webhook'la aynı içe aktarıcıdan geçer (zaten gelmiş satırlar değişmez).
 * Bağlantıdan önce verilmiş ya da bildirimi kaçmış siparişler için.
 */
export async function syncWooOrders(shop: string): Promise<number> {
  const conn = await getWooConnection(shop);
  if (!conn) throw new Error("WooCommerce store is not connected");
  const after = new Date(Date.now() - 60 * 86400_000).toISOString();
  let imported = 0;
  for (let page = 1; page <= 10; page++) {
    const orders = await wooRest<WooOrder[]>(conn, `/orders?status=processing,completed,on-hold&per_page=50&page=${page}&after=${encodeURIComponent(after)}`);
    for (const o of orders) {
      const hasDesign = (o.line_items ?? []).some((li) => (li.meta_data ?? []).some((m) => m.key === "printlab_design_token"));
      if (!hasDesign) continue;
      await importOrder(shop, wooOrderToIncoming(o));
      imported++;
    }
    if (orders.length < 50) break;
  }
  return imported;
}

/**
 * "Bağlantıları denetle" (WooCommerce): WordPress'te ürünlerin PrintLab
 * kutusunda seçili şablonları PrintLab'e çeker. Eklenti bildirimi kaçtıysa
 * ya da seçim eklenti kurulmadan önce yapıldıysa listeler böyle eşitlenir.
 * Yalnız bu mağazanın şablonları bağlanır.
 */
export async function pullWooTemplateLinks(shop: string): Promise<number> {
  const conn = await getWooConnection(shop);
  if (!conn) return 0;
  const own = new Set((await query<{ id: string }>("SELECT id FROM personalizer_templates WHERE shop = $1", [shop])).rows.map((r) => r.id));
  const { linkPersonalizerProduct } = await import("~/models/personalizer.server");
  let linked = 0;
  for (let page = 1; page <= 20; page++) {
    const products = await wooRest<Array<{ id: number; name: string; slug: string; meta_data?: WooMeta[] }>>(
      conn, `/products?per_page=100&page=${page}&status=any`);
    for (const p of products) {
      const template = String(p.meta_data?.find((m) => m.key === "_printlab_template")?.value ?? "");
      if (!template || !own.has(template)) continue;
      await query("DELETE FROM personalizer_product_links WHERE shop = $1 AND product_id = $2 AND template_id <> $3", [shop, String(p.id), template]);
      await linkPersonalizerProduct({ shop, product_id: String(p.id), template_id: template, product_title: p.name, product_handle: p.slug });
      linked++;
    }
    if (products.length < 100) break;
  }
  return linked;
}
