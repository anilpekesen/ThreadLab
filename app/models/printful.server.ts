import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { query, runMigrations, withAdvisoryLock } from "~/lib/db.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";
import {
  decryptSecret, encryptSecret, getCatalogProduct, listCatalogVariants, listStores, pf,
  PrintfulError, verifyPrintfulSignature, type PfProduct, type PfVariant,
  exchangePrintfulCode,
  printfulAuthorizeUrl,
  refreshPrintfulTokens,
} from "~/lib/printful.server";
import { publicAppUrl } from "~/lib/app-url.server";
import { isWooShop } from "~/lib/platform";

/**
 * Printful entegrasyonu: bağlantı, varyant eşleştirme, taslak sipariş,
 * onaylama ve kargo takibinin Shopify'a yazılması.
 *
 * Akış (kullanıcı kararı: onayla gönder):
 *   1. Tasarımlı sipariş gelince eşleşen satırlar için Printful'da TASLAK
 *      sipariş açılır (external_id = "pl-<Shopify sipariş no>"). Taslak ücret
 *      çekmez, üretime girmez.
 *   2. Mağaza sahibi Üretim ekranında tasarımı kontrol edip onaylar →
 *      /orders/{id}/confirmation.
 *   3. Printful kargoya verince (shipment_sent webhook) yalnız Printful'a
 *      giden satırlar takip numarasıyla Shopify'da gönderildi olur.
 *
 * Müşterinin adı/adresi/telefonu hiçbir tabloda tutulmaz: taslak açılırken
 * Shopify'dan okunup doğrudan Printful'a iletilir (korunan müşteri verisi).
 */

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface PodConnection {
  shop: string;
  token: string;
  storeId: number | null;
  storeName: string;
  webhookSecret: string;
  autoDraft: boolean;
}

type ConnRow = {
  token_enc: string; store_id: string | null; store_name: string; webhook_secret_enc: string; auto_draft: boolean;
  auth_type: string; refresh_token_enc: string; token_expires_at: Date | null;
};

const CONN_SQL = `SELECT token_enc, store_id, store_name, webhook_secret_enc, auto_draft, auth_type, refresh_token_enc, token_expires_at
  FROM pod_connections WHERE shop = $1 AND provider = 'printful'`;

/**
 * Bağlantı ve kullanılabilir erişim anahtarı. OAuth bağlantısında anahtarın
 * süresi 5 dakikadan az kaldıysa yenilenir. Printful her yenilemede yenileme
 * anahtarını da değiştirdiği için yenileme veritabanı kilidi altında yapılır:
 * iki worker aynı anda yenilerse biri geçersiz anahtarla kalırdı.
 */
export async function getPrintfulConnection(shop: string): Promise<PodConnection | null> {
  await ensureMigrations();
  let r = (await query<ConnRow>(CONN_SQL, [shop])).rows[0];
  if (!r) return null;
  const expiring = (row: ConnRow) => row.auth_type === "oauth" && (!row.token_expires_at || new Date(row.token_expires_at).getTime() - Date.now() < 5 * 60_000);
  if (expiring(r)) {
    try {
      r = await withAdvisoryLock("printful-refresh", shop, async () => {
        const fresh = (await query<ConnRow>(CONN_SQL, [shop])).rows[0];
        if (!fresh || !expiring(fresh)) return fresh;
        const t = await refreshPrintfulTokens(decryptSecret(fresh.refresh_token_enc));
        await query(
          "UPDATE pod_connections SET token_enc = $2, refresh_token_enc = $3, token_expires_at = $4, updated_at = now() WHERE shop = $1",
          [shop, encryptSecret(t.accessToken), encryptSecret(t.refreshToken), t.expiresAt],
        );
        return { ...fresh, token_enc: encryptSecret(t.accessToken), refresh_token_enc: encryptSecret(t.refreshToken), token_expires_at: t.expiresAt };
      });
    } catch (err) {
      // Yenileme anahtarı 90 gün kullanılmayınca ölür: mağaza yeniden bağlanmalı
      console.error(`[printful] ${shop} anahtar yenilenemedi:`, err);
      return null;
    }
    if (!r) return null;
  }
  try {
    return {
      shop,
      token: decryptSecret(r.token_enc),
      storeId: r.store_id ? Number(r.store_id) : null,
      storeName: r.store_name,
      webhookSecret: r.webhook_secret_enc ? decryptSecret(r.webhook_secret_enc) : "",
      autoDraft: r.auto_draft,
    };
  } catch (err) {
    console.error("[printful] anahtar çözülemedi:", err);
    return null;
  }
}

function appUrl(): string {
  return publicAppUrl();
}

/**
 * Anahtarı doğrular, mağazayı seçer ve webhook'u kurar. Birden çok Printful
 * mağazası varsa ilki (ya da verilen) kullanılır.
 */
export async function connectPrintful(
  shop: string,
  token: string,
  storeId?: number,
  oauth?: { refreshToken: string; expiresAt: Date },
): Promise<{ storeName: string; stores: number }> {
  const stores = await listStores(token);
  if (!stores.length) throw new PrintfulError(400, "no_store");
  const store = stores.find((s) => s.id === storeId) ?? stores[0];

  // Webhook: gizli anahtar yalnız kurulumda bir kez döner
  const wh = await pf<{ data: { secret_key: string } }>(token, "/webhooks", {
    method: "POST",
    storeId: store.id,
    body: {
      default_url: `${appUrl()}/webhooks/printful`,
      events: [
        { type: "shipment_sent" },
        { type: "order_failed" },
        { type: "order_canceled" },
        { type: "order_put_hold" },
      ],
    },
  });

  await query(
    `INSERT INTO pod_connections (shop, provider, token_enc, store_id, store_name, webhook_secret_enc, auth_type, refresh_token_enc, token_expires_at, updated_at)
     VALUES ($1, 'printful', $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (shop) DO UPDATE SET token_enc = $2, store_id = $3, store_name = $4, webhook_secret_enc = $5,
       auth_type = $6, refresh_token_enc = $7, token_expires_at = $8, updated_at = now()`,
    [shop, encryptSecret(token), store.id, store.name, encryptSecret(wh.data.secret_key),
      oauth ? "oauth" : "token", oauth ? encryptSecret(oauth.refreshToken) : "", oauth?.expiresAt ?? null],
  );
  return { storeName: store.name, stores: stores.length };
}

// ── OAuth ile bağlanma ──────────────────────────────────────────────────────

export function printfulRedirectUrl(): string {
  return `${appUrl()}/auth/printful/callback`;
}

/** Printful'ın izin ekranının adresi; state mağazayı taşır, 15 dk ve tek kullanımlık */
export async function startPrintfulOAuth(shop: string): Promise<string> {
  await ensureMigrations();
  const state = randomBytes(24).toString("hex");
  await query("INSERT INTO printful_oauth_states (state, shop) VALUES ($1, $2)", [state, shop]);
  await query("DELETE FROM printful_oauth_states WHERE created_at < now() - interval '1 day'").catch(() => null);
  return printfulAuthorizeUrl(state, printfulRedirectUrl());
}

/** İzin ekranından dönüş: kodu anahtara çevirip bağlantıyı kurar; mağazayı döndürür */
export async function completePrintfulOAuth(state: string, code: string): Promise<string | null> {
  await ensureMigrations();
  const row = (await query<{ shop: string }>(
    "DELETE FROM printful_oauth_states WHERE state = $1 AND created_at > now() - interval '15 minutes' RETURNING shop",
    [state],
  )).rows[0];
  if (!row) return null;
  const t = await exchangePrintfulCode(code);
  await connectPrintful(row.shop, t.accessToken, undefined, { refreshToken: t.refreshToken, expiresAt: t.expiresAt });
  return row.shop;
}

export async function disconnectPrintful(shop: string): Promise<void> {
  const conn = await getPrintfulConnection(shop);
  if (conn) {
    await pf(conn.token, "/webhooks", { method: "DELETE", storeId: conn.storeId }).catch((err) =>
      console.error("[printful] webhook silinemedi:", err));
  }
  await query("DELETE FROM pod_connections WHERE shop = $1", [shop]);
}

export async function setAutoDraft(shop: string, on: boolean): Promise<void> {
  await query("UPDATE pod_connections SET auto_draft = $2, updated_at = now() WHERE shop = $1", [shop, on]);
}

// ── Eşleştirme ───────────────────────────────────────────────────────────────

export interface VariantMap {
  shopify_variant_id: string;
  catalog_product_id: number;
  catalog_variant_id: number;
  technique: string;
}

export async function listVariantMaps(shop: string, shopifyProductId?: string): Promise<VariantMap[]> {
  await ensureMigrations();
  const r = await query<VariantMap>(
    `SELECT shopify_variant_id, catalog_product_id, catalog_variant_id, technique FROM pod_variant_maps
      WHERE shop = $1 ${shopifyProductId ? "AND shopify_product_id = $2" : ""}`,
    shopifyProductId ? [shop, shopifyProductId] : [shop],
  );
  return r.rows;
}

export async function saveVariantMaps(
  shop: string,
  shopifyProductId: string,
  catalogProductId: number,
  technique: string,
  rows: Array<{ shopifyVariantId: string; catalogVariantId: number | null }>,
): Promise<number> {
  await query("DELETE FROM pod_variant_maps WHERE shop = $1 AND shopify_product_id = $2", [shop, shopifyProductId]);
  let n = 0;
  for (const r of rows) {
    if (!r.catalogVariantId) continue;
    await query(
      `INSERT INTO pod_variant_maps (shop, shopify_product_id, shopify_variant_id, catalog_product_id, catalog_variant_id, technique)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (shop, shopify_variant_id) DO UPDATE SET shopify_product_id = $2, catalog_product_id = $4, catalog_variant_id = $5, technique = $6, updated_at = now()`,
      [shop, shopifyProductId, r.shopifyVariantId, catalogProductId, r.catalogVariantId, technique],
    );
    n++;
  }
  return n;
}

const TR_COLORS: Record<string, string[]> = {
  siyah: ["black"], beyaz: ["white"], lacivert: ["navy"], kirmizi: ["red"], gri: ["grey", "gray", "athletic heather", "sport grey"],
  antrasit: ["charcoal", "dark grey", "dark heather", "asphalt"], mavi: ["blue", "royal", "royal blue"], yesil: ["green", "kelly", "forest"],
  sari: ["yellow", "gold"], pembe: ["pink"], mor: ["purple"], turuncu: ["orange"], bej: ["beige", "sand", "natural", "tan"],
  kahverengi: ["brown", "chocolate"], bordo: ["maroon", "burgundy", "cardinal"], haki: ["khaki", "olive", "military green"],
  krem: ["cream", "natural", "ivory"], acikmavi: ["light blue", "baby blue", "carolina blue"],
};
const SIZE_ALIASES: Record<string, string> = { "2xl": "xxl", "3xl": "xxxl", "xxxl": "xxxl", "2x": "xxl", "3x": "xxxl" };

const n = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9 ]/g, "").trim();
const nSize = (s: string) => { const v = n(s).replace(/\s+/g, ""); return SIZE_ALIASES[v] ?? v; };

function colorMatches(shopColor: string, pfColor: string): boolean {
  const a = n(shopColor), b = n(pfColor);
  if (!a) return false;
  if (a === b) return true;
  const key = a.replace(/\s+/g, "");
  return (TR_COLORS[key] ?? []).some((c) => c === b);
}

/**
 * Shopify varyantlarını seçenek değerlerinden (renk + beden) Printful
 * varyantlarıyla eşleştirir; tek seçenekli ürünlerde yalnız beden ya da renk.
 */
export function autoMatch(
  shopVariants: Array<{ id: string; options: string[] }>,
  pfVariants: PfVariant[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const v of shopVariants) {
    const sizes = v.options.map(nSize);
    const hit = pfVariants.filter((p) => sizes.includes(nSize(p.size)))
      .find((p) => v.options.some((o) => colorMatches(o, p.color)) || new Set(pfVariants.map((x) => x.color)).size === 1);
    out[v.id] = hit?.id ?? null;
  }
  return out;
}

export async function loadCatalog(token: string, catalogProductId: number): Promise<{ product: PfProduct; variants: PfVariant[] }> {
  const [product, variants] = await Promise.all([
    getCatalogProduct(token, catalogProductId),
    listCatalogVariants(token, catalogProductId),
  ]);
  return { product, variants };
}

// ── Sipariş ─────────────────────────────────────────────────────────────────

const productCache = new Map<string, { at: number; product: PfProduct }>();
async function cachedProduct(token: string, id: number): Promise<PfProduct> {
  const k = `${token.slice(-6)}:${id}`;
  const c = productCache.get(k);
  if (c && Date.now() - c.at < 6 * 3600_000) return c.product;
  const product = await getCatalogProduct(token, id);
  productCache.set(k, { at: Date.now(), product });
  return product;
}

/** Baskı dosyasının fiziksel ölçüsü (inç): PNG başlığındaki piksel + DPI */
async function fileInches(url: string): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-131071" }, signal: AbortSignal.timeout(20_000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const m = await sharp(buf).metadata();
    if (!m.width || !m.height) return null;
    const dpi = m.density && m.density >= 72 ? m.density : 300;
    return { w: m.width / dpi, h: m.height / dpi };
  } catch {
    return null;
  }
}

/**
 * Dosya gerçek ölçüsüyle, baskı alanının üstüne ortalı yerleşir; alandan
 * büyükse orantılı küçülür. Konum verilmezse Printful ortalar ve ölçeği
 * kendisi seçer — tasarımın gerçek boyu kaybolur.
 */
async function layerFor(url: string, area: { print_area_width: number; print_area_height: number } | undefined) {
  const layer: Record<string, unknown> = { type: "file", url };
  const inch = area ? await fileInches(url) : null;
  if (area && inch) {
    const k = Math.min(1, area.print_area_width / inch.w, area.print_area_height / inch.h);
    const width = Math.max(0.3, Math.round(inch.w * k * 1000) / 1000);
    const height = Math.max(0.3, Math.round(inch.h * k * 1000) / 1000);
    layer.position = { width, height, top: 0, left: Math.round(((area.print_area_width - width) / 2) * 1000) / 1000 };
  }
  return layer;
}

type DraftResult = { status: "draft" | "skipped" | "needs_access" | "error"; message?: string; printfulOrderId?: number };

type Recipient = Record<string, string | undefined>;
type RecipientResult = { recipient: Recipient } | { status: "needs_access" | "error"; error: string };

async function shopifyRecipient(shop: string, shopifyOrderId: string): Promise<RecipientResult> {
  const token = await getValidAccessToken(shop);
  if (!token) return { status: "error", error: "no_session" };
  const res = await (await shopifyGraphQL(shop, token, `query($id: ID!) { order(id: $id) {
      email phone shippingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } } }`,
    { id: `gid://shopify/Order/${shopifyOrderId}` })).json();
  const denied = (res?.errors ?? []).some((e: { extensions?: { code?: string } }) => e.extensions?.code === "ACCESS_DENIED");
  const a = res?.data?.order?.shippingAddress;
  if (denied || !a?.address1) {
    return denied
      ? { status: "needs_access", error: "Shopify müşteri adresi iznini henüz onaylamadı" }
      : { status: "error", error: "Siparişte kargo adresi yok" };
  }
  return {
    recipient: {
      name: a.name, company: a.company ?? undefined, address1: a.address1, address2: a.address2 ?? undefined,
      city: a.city, state_code: a.provinceCode ?? undefined, country_code: a.countryCodeV2, zip: a.zip ?? undefined,
      phone: a.phone ?? res.data.order.phone ?? undefined, email: res.data.order.email ?? undefined,
    },
  };
}

/** Siparişin alıcısı; Printful'a gönderilmek için o anda okunur, saklanmaz */
export function orderRecipient(shop: string, orderId: string): Promise<RecipientResult> {
  return isWooShop(shop) ? wooRecipient(shop, orderId) : shopifyRecipient(shop, orderId);
}

/** WooCommerce: kargo adresi yoksa fatura adresi (dijital olmayan siparişte ikisi aynı olabilir) */
async function wooRecipient(shop: string, orderId: string): Promise<RecipientResult> {
  const { getWooConnection, wooRest } = await import("~/models/woo.server");
  const conn = await getWooConnection(shop);
  if (!conn) return { status: "error", error: "WooCommerce store is not connected" };
  type Addr = { first_name?: string; last_name?: string; company?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string; phone?: string; email?: string };
  const o = await wooRest<{ shipping?: Addr; billing?: Addr }>(conn, `/orders/${encodeURIComponent(orderId)}`);
  const a = o.shipping?.address_1 ? o.shipping : o.billing;
  if (!a?.address_1 || !a.country) return { status: "error", error: "Siparişte kargo adresi yok" };
  // WooCommerce eyaleti ülke önekiyle tutabiliyor (TR06); Printful yalın kodu ister
  const state = (a.state ?? "").replace(new RegExp(`^${a.country}`), "") || undefined;
  return {
    recipient: {
      name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(), company: a.company || undefined,
      address1: a.address_1, address2: a.address_2 || undefined, city: a.city, state_code: state,
      country_code: a.country, zip: a.postcode || undefined,
      phone: a.phone || o.billing?.phone || undefined, email: o.billing?.email || undefined,
    },
  };
}

export async function createPrintfulDraft(shop: string, shopifyOrderId: string, opts: { force?: boolean } = {}): Promise<DraftResult> {
  const conn = await getPrintfulConnection(shop);
  if (!conn) return { status: "skipped", message: "not_connected" };
  if (!conn.autoDraft && !opts.force) return { status: "skipped", message: "auto_off" };

  const existing = (await query<{ printful_order_id: string | null; status: string }>(
    "SELECT printful_order_id, status FROM pod_orders WHERE shop = $1 AND shopify_order_id = $2", [shop, shopifyOrderId])).rows[0];
  if (existing?.printful_order_id) return { status: "skipped", message: "exists", printfulOrderId: Number(existing.printful_order_id) };

  const rows = (await query<{ variant_id: string; quantity: number; line_item_id: string; design_token: string; production_file_url: string; order_number: string }>(
    `SELECT variant_id, quantity, line_item_id, design_token, production_file_url, order_number
       FROM orders WHERE shop = $1 AND shopify_order_id = $2`, [shop, shopifyOrderId])).rows;
  const maps = new Map((await listVariantMaps(shop)).map((m) => [m.shopify_variant_id, m]));
  const mapped = rows.filter((r) => maps.has(String(r.variant_id)));
  if (!mapped.length) return { status: "skipped", message: "no_mapped_items" };
  const orderName = rows[0]?.order_number ?? "";

  const record = async (status: string, error = "", pfId: number | null = null) => query(
    `INSERT INTO pod_orders (shop, shopify_order_id, order_name, printful_order_id, status, error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (shop, shopify_order_id) DO UPDATE SET printful_order_id = COALESCE($4, pod_orders.printful_order_id), status = $5, error = $6, updated_at = now()`,
    [shop, shopifyOrderId, orderName, pfId, status, error],
  );

  // Alıcı: yalnız bu anda okunur, saklanmaz
  const got = await orderRecipient(shop, shopifyOrderId);
  if ("error" in got) {
    await record(got.status, got.error);
    return { status: got.status, message: got.error };
  }
  const recipient = got.recipient;

  try {
    const items = [];
    for (const r of mapped) {
      const m = maps.get(String(r.variant_id))!;
      const product = await cachedProduct(conn.token, m.catalog_product_id);
      const area = (placement: string) => product.placements.find((p) => p.placement === placement && p.technique === m.technique)
        ?? product.placements.find((p) => p.placement === placement);
      const back = r.design_token
        ? (await query<{ back_print_url: string }>("SELECT back_print_url FROM designs WHERE token = $1", [r.design_token])).rows[0]?.back_print_url ?? ""
        : "";
      const placements = [];
      if (r.production_file_url) placements.push({ placement: "front", technique: m.technique, layers: [await layerFor(r.production_file_url, area("front"))] });
      if (back) placements.push({ placement: "back", technique: m.technique, layers: [await layerFor(back, area("back"))] });
      if (!placements.length) continue;
      items.push({ source: "catalog", catalog_variant_id: m.catalog_variant_id, quantity: r.quantity || 1, external_id: r.line_item_id || undefined, placements });
    }
    if (!items.length) {
      await record("error", "Baskı dosyası bulunamadı");
      return { status: "error", message: "no_files" };
    }
    const created = await pf<{ data: { id: number; status: string } }>(conn.token, "/orders", {
      method: "POST",
      storeId: conn.storeId,
      body: { external_id: `pl-${shopifyOrderId}`, shipping: "STANDARD", recipient, order_items: items },
    });
    await record("draft", "", created.data.id);
    return { status: "draft", printfulOrderId: created.data.id };
  } catch (err) {
    const msg = err instanceof PrintfulError ? `${err.message}${err.detail ? `: ${err.detail}` : ""}` : String(err);
    console.error(`[printful] ${shop} ${shopifyOrderId} taslak açılamadı:`, msg);
    await record("error", msg.slice(0, 500));
    return { status: "error", message: msg };
  }
}

export async function confirmPrintfulOrder(shop: string, shopifyOrderId: string): Promise<{ ok: boolean; message?: string }> {
  const conn = await getPrintfulConnection(shop);
  const row = (await query<{ printful_order_id: string | null }>(
    "SELECT printful_order_id FROM pod_orders WHERE shop = $1 AND shopify_order_id = $2", [shop, shopifyOrderId])).rows[0];
  if (!conn || !row?.printful_order_id) return { ok: false, message: "no_draft" };
  try {
    const r = await pf<{ data: { status: string } }>(conn.token, `/orders/${row.printful_order_id}/confirmation`, { method: "POST", storeId: conn.storeId });
    await query("UPDATE pod_orders SET status = $3, error = '', updated_at = now() WHERE shop = $1 AND shopify_order_id = $2",
      [shop, shopifyOrderId, r.data?.status || "pending"]);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof PrintfulError ? `${err.message}${err.detail ? `: ${err.detail}` : ""}` : String(err);
    await query("UPDATE pod_orders SET error = $3, updated_at = now() WHERE shop = $1 AND shopify_order_id = $2", [shop, shopifyOrderId, msg.slice(0, 500)]);
    return { ok: false, message: msg };
  }
}

export async function listPodOrders(shop: string, shopifyOrderIds: string[]) {
  await ensureMigrations();
  if (!shopifyOrderIds.length) return [];
  return (await query<{ shopify_order_id: string; printful_order_id: string | null; status: string; error: string; tracking_url: string }>(
    "SELECT shopify_order_id, printful_order_id, status, error, tracking_url FROM pod_orders WHERE shop = $1 AND shopify_order_id = ANY($2)",
    [shop, shopifyOrderIds])).rows;
}

// ── Webhook ─────────────────────────────────────────────────────────────────

/** Printful'dan gelen olay. İmza doğrulanmadan hiçbir şey yapılmaz. */
export async function handlePrintfulWebhook(raw: string, signature: string): Promise<{ status: number }> {
  await ensureMigrations();
  let event: { type?: string; store_id?: number; data?: { order?: { external_id?: string; status?: string }; shipment?: { tracking_number?: string; tracking_url?: string }; reason?: string } };
  try { event = JSON.parse(raw); } catch { return { status: 400 }; }
  const storeId = Number(event.store_id);
  const shops = (await query<{ shop: string }>("SELECT shop FROM pod_connections WHERE store_id = $1", [storeId])).rows;
  let conn: PodConnection | null = null;
  for (const s of shops) {
    const c = await getPrintfulConnection(s.shop);
    if (c && verifyPrintfulSignature(raw, signature, c.webhookSecret)) { conn = c; break; }
  }
  if (!conn) return { status: 401 };

  const ext = String(event.data?.order?.external_id ?? "");
  const shopifyOrderId = ext.startsWith("pl-") ? ext.slice(3) : "";
  if (!shopifyOrderId) return { status: 200 };

  if (event.type === "shipment_sent") {
    const sh = event.data?.shipment ?? {};
    await query(
      "UPDATE pod_orders SET status = 'shipped', tracking_number = $3, tracking_url = $4, updated_at = now() WHERE shop = $1 AND shopify_order_id = $2",
      [conn.shop, shopifyOrderId, sh.tracking_number ?? "", sh.tracking_url ?? ""],
    );
    const ship = isWooShop(conn.shop) ? fulfillOnWoo : fulfillOnShopify;
    await ship(conn.shop, shopifyOrderId, sh.tracking_number ?? "", sh.tracking_url ?? "").catch((err) =>
      console.error("[printful] gönderim mağazaya yazılamadı:", err));
  } else if (event.type === "order_failed" || event.type === "order_canceled" || event.type === "order_put_hold") {
    const status = event.type === "order_failed" ? "failed" : event.type === "order_canceled" ? "canceled" : "on_hold";
    await query("UPDATE pod_orders SET status = $3, error = $4, updated_at = now() WHERE shop = $1 AND shopify_order_id = $2",
      [conn.shop, shopifyOrderId, status, String(event.data?.reason ?? "").slice(0, 500)]);
  }
  return { status: 200 };
}

/**
 * WooCommerce: takip bilgisi müşteriye görünen sipariş notu olur (WooCommerce
 * müşteriye e-postayla iletir), sipariş tamamlanır. Çekirdek WooCommerce'te
 * ayrı bir takip alanı yok.
 */
async function fulfillOnWoo(shop: string, orderId: string, number: string, url: string) {
  const { getWooConnection, wooRest } = await import("~/models/woo.server");
  const conn = await getWooConnection(shop);
  if (!conn) return;
  const tracking = [number && `Tracking number: ${number}`, url && `Track your package: ${url}`].filter(Boolean).join("\n");
  await wooRest(conn, `/orders/${encodeURIComponent(orderId)}/notes`, {
    method: "POST",
    body: { note: `Your order has shipped.${tracking ? `\n${tracking}` : ""}`, customer_note: true },
  });
  const o = await wooRest<{ status?: string }>(conn, `/orders/${encodeURIComponent(orderId)}`);
  if (["processing", "on-hold"].includes(String(o.status))) {
    await wooRest(conn, `/orders/${encodeURIComponent(orderId)}`, { method: "PUT", body: { status: "completed" } });
  }
}

/** Yalnız Printful'a giden satırlar gönderildi olarak işaretlenir */
async function fulfillOnShopify(shop: string, shopifyOrderId: string, number: string, url: string) {
  const token = await getValidAccessToken(shop);
  if (!token) return;
  const sentLines = new Set((await query<{ line_item_id: string }>(
    `SELECT o.line_item_id FROM orders o JOIN pod_variant_maps m ON m.shop = o.shop AND m.shopify_variant_id = o.variant_id
      WHERE o.shop = $1 AND o.shopify_order_id = $2`, [shop, shopifyOrderId])).rows.map((r) => String(r.line_item_id)));
  const fo = await (await shopifyGraphQL(shop, token, `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 20) { nodes {
      id status lineItems(first: 100) { nodes { id remainingQuantity lineItem { id } } } } } } }`,
    { id: `gid://shopify/Order/${shopifyOrderId}` })).json();
  const groups = [];
  for (const f of fo?.data?.order?.fulfillmentOrders?.nodes ?? []) {
    if (!["OPEN", "IN_PROGRESS"].includes(f.status)) continue;
    const lines = f.lineItems.nodes
      .filter((l: { remainingQuantity: number; lineItem: { id: string } }) => l.remainingQuantity > 0 && sentLines.has(l.lineItem.id.split("/").pop()!))
      .map((l: { id: string; remainingQuantity: number }) => ({ id: l.id, quantity: l.remainingQuantity }));
    if (lines.length) groups.push({ fulfillmentOrderId: f.id, fulfillmentOrderLineItems: lines });
  }
  if (!groups.length) return;
  const r = await (await shopifyGraphQL(shop, token, `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { userErrors { message } } }`, {
    f: { lineItemsByFulfillmentOrder: groups, notifyCustomer: true, trackingInfo: { number: number || undefined, url: url || undefined } },
  })).json();
  const errs = r?.data?.fulfillmentCreate?.userErrors ?? [];
  if (errs.length) console.error("[printful] fulfillmentCreate:", JSON.stringify(errs));
}
