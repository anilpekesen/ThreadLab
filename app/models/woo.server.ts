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
    // Ödenmemiş (bekleyen, başarısız) siparişler üretime girmez
    if (!["processing", "completed", "on-hold"].includes(String(order.status))) return 200;
    await importOrder(shop, wooOrderToIncoming(order));
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
