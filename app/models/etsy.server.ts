import { randomBytes } from "node:crypto";
import { query, runMigrations, withAdvisoryLock } from "~/lib/db.server";
import { publicAppUrl } from "~/lib/app-url.server";
import { decryptSecret, encryptSecret } from "~/lib/printful.server";
import {
  etsyApi,
  etsyAuthorizeUrl,
  exchangeEtsyCode,
  money,
  pkcePair,
  refreshEtsyTokens,
} from "~/lib/etsy.server";
import { importOrder, type IncomingOrder } from "~/models/order-import.server";

/**
 * Etsy bağlantısı: bir PrintLab mağazasına (Shopify ya da WooCommerce) ek
 * satış kanalı olarak bağlanır. Etsy siparişleri aynı üretim ekranına düşer.
 *
 *   - Sipariş kimliği `etsy:<receipt_id>`: öteki platformların kimlikleriyle
 *     çakışmaz ve durum geri yazımı hangi kanala gideceğini buradan bilir.
 *   - Satırlarda PrintLab tasarımı yok; müşterinin yazdığı kişiselleştirme
 *     metni `orders.personalization` alanına yazılır.
 *   - Etsy'de sipariş webhook'u yok: /api/cron/etsy-sync düzenli çağrılır.
 *
 * Alıcının adı ve e-postası yalnız sipariş satırında tutulur (Shopify ve
 * WooCommerce siparişleriyle aynı); adres saklanmaz.
 */

let migrationsRan = false;
async function ensureMigrations() {
  if (migrationsRan) return;
  await runMigrations();
  await query(`
    CREATE TABLE IF NOT EXISTS etsy_connections (
      shop            TEXT PRIMARY KEY,
      etsy_user_id    TEXT NOT NULL DEFAULT '',
      etsy_shop_id    TEXT NOT NULL,
      etsy_shop_name  TEXT NOT NULL DEFAULT '',
      access_enc      TEXT NOT NULL,
      refresh_enc     TEXT NOT NULL,
      expires_at      TIMESTAMPTZ NOT NULL,
      last_synced_at  TIMESTAMPTZ,
      last_error      TEXT NOT NULL DEFAULT '',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS etsy_oauth_states (
      state        TEXT PRIMARY KEY,
      shop         TEXT NOT NULL,
      verifier_enc TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  migrationsRan = true;
}

export function etsyRedirectUrl(): string {
  return `${publicAppUrl()}/auth/etsy/callback`;
}

type ConnRow = {
  etsy_shop_id: string; etsy_shop_name: string; access_enc: string; refresh_enc: string;
  expires_at: Date; last_synced_at: Date | null; last_error: string; created_at: Date;
};

export interface EtsyConnection {
  shop: string;
  etsyShopId: string;
  etsyShopName: string;
  token: string;
  lastSyncedAt: Date | null;
  lastError: string;
  createdAt: Date;
}

const CONN_SQL = `SELECT etsy_shop_id, etsy_shop_name, access_enc, refresh_enc, expires_at, last_synced_at, last_error, created_at
  FROM etsy_connections WHERE shop = $1`;

/**
 * Bağlantı ve geçerli erişim anahtarı. Süresi 5 dakikadan az kaldıysa kilit
 * altında yenilenir (Etsy yenileme anahtarını da değiştirir).
 */
export async function getEtsyConnection(shop: string): Promise<EtsyConnection | null> {
  await ensureMigrations();
  let r = (await query<ConnRow>(CONN_SQL, [shop])).rows[0];
  if (!r) return null;
  const expiring = (row: ConnRow) => new Date(row.expires_at).getTime() - Date.now() < 5 * 60_000;
  if (expiring(r)) {
    try {
      r = await withAdvisoryLock("etsy-refresh", shop, async () => {
        const fresh = (await query<ConnRow>(CONN_SQL, [shop])).rows[0];
        if (!fresh || !expiring(fresh)) return fresh;
        const t = await refreshEtsyTokens(decryptSecret(fresh.refresh_enc));
        await query(
          "UPDATE etsy_connections SET access_enc = $2, refresh_enc = $3, expires_at = $4, updated_at = now() WHERE shop = $1",
          [shop, encryptSecret(t.accessToken), encryptSecret(t.refreshToken), t.expiresAt],
        );
        return { ...fresh, access_enc: encryptSecret(t.accessToken), refresh_enc: encryptSecret(t.refreshToken), expires_at: t.expiresAt };
      });
    } catch (err) {
      console.error(`[etsy] ${shop} anahtar yenilenemedi:`, err);
      await query("UPDATE etsy_connections SET last_error = $2 WHERE shop = $1", [shop, "Etsy bağlantısının süresi doldu; yeniden bağlanın."]).catch(() => null);
      return null;
    }
    if (!r) return null;
  }
  return {
    shop,
    etsyShopId: r.etsy_shop_id,
    etsyShopName: r.etsy_shop_name,
    token: decryptSecret(r.access_enc),
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

/** Sayfa için: anahtar yenilemeden yalnız durum */
export async function getEtsyStatus(shop: string) {
  await ensureMigrations();
  const r = (await query<{ etsy_shop_name: string; last_synced_at: Date | null; last_error: string }>(
    "SELECT etsy_shop_name, last_synced_at, last_error FROM etsy_connections WHERE shop = $1", [shop])).rows[0];
  return r ? { shopName: r.etsy_shop_name, lastSyncedAt: r.last_synced_at?.toISOString() ?? null, lastError: r.last_error } : null;
}

// ── Bağlanma ────────────────────────────────────────────────────────────────

export async function startEtsyOAuth(shop: string): Promise<string> {
  await ensureMigrations();
  const state = randomBytes(24).toString("hex");
  const { verifier, challenge } = pkcePair();
  await query("INSERT INTO etsy_oauth_states (state, shop, verifier_enc) VALUES ($1,$2,$3)", [state, shop, encryptSecret(verifier)]);
  await query("DELETE FROM etsy_oauth_states WHERE created_at < now() - interval '1 day'").catch(() => null);
  return etsyAuthorizeUrl(state, challenge, etsyRedirectUrl());
}

/** Etsy izin ekranından dönüş; state tek kullanımlık ve 15 dk. Mağazayı döndürür. */
export async function completeEtsyOAuth(state: string, code: string): Promise<string | null> {
  await ensureMigrations();
  const row = (await query<{ shop: string; verifier_enc: string }>(
    "DELETE FROM etsy_oauth_states WHERE state = $1 AND created_at > now() - interval '15 minutes' RETURNING shop, verifier_enc",
    [state],
  )).rows[0];
  if (!row) return null;
  const t = await exchangeEtsyCode(code, decryptSecret(row.verifier_enc), etsyRedirectUrl());
  const me = await etsyApi<{ user_id?: number; shop_id?: number }>(t.accessToken, "/application/users/me");
  if (!me.shop_id) throw new Error("This Etsy account has no shop");
  const shopInfo = await etsyApi<{ shop_name?: string }>(t.accessToken, `/application/shops/${me.shop_id}`).catch(() => ({ shop_name: "" }));
  await query(
    `INSERT INTO etsy_connections (shop, etsy_user_id, etsy_shop_id, etsy_shop_name, access_enc, refresh_enc, expires_at, last_error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'',now())
     ON CONFLICT (shop) DO UPDATE SET etsy_user_id = $2, etsy_shop_id = $3, etsy_shop_name = $4, access_enc = $5,
       refresh_enc = $6, expires_at = $7, last_error = '', updated_at = now()`,
    [row.shop, String(me.user_id ?? t.userId), String(me.shop_id), shopInfo.shop_name ?? "", encryptSecret(t.accessToken), encryptSecret(t.refreshToken), t.expiresAt],
  );
  return row.shop;
}

export async function disconnectEtsy(shop: string): Promise<void> {
  await ensureMigrations();
  await query("DELETE FROM etsy_connections WHERE shop = $1", [shop]);
}

// ── Siparişler ──────────────────────────────────────────────────────────────

type Variation = { formatted_name?: string; formatted_value?: string; property_id?: number; question_id?: number | null };
type Transaction = {
  transaction_id: number; listing_id?: number; product_id?: number; title?: string; quantity?: number;
  price?: { amount?: number; divisor?: number; currency_code?: string }; is_digital?: boolean; variations?: Variation[];
};
export type EtsyReceipt = {
  receipt_id: number; name?: string; buyer_email?: string; status?: string; is_paid?: boolean;
  created_timestamp?: number; create_timestamp?: number; message_from_buyer?: string; transactions?: Transaction[];
};

// Etsy'nin kişiselleştirme alanı: eski ilanlarda "Personalization" özelliği,
// yenilerde soru (question_id) olarak gelir
const PERSONALIZATION = /personali[sz]ation|ki[şs]iselle[şs]tirme|personnalisation|personalisierung|personalizaci[óo]n/i;

export function etsyReceiptToIncoming(r: EtsyReceipt): IncomingOrder {
  const [first, ...rest] = String(r.name ?? "").trim().split(/\s+/);
  return {
    id: `etsy:${r.receipt_id}`,
    name: `Etsy #${r.receipt_id}`,
    source: "etsy",
    createdAt: new Date(((r.created_timestamp ?? r.create_timestamp) || Date.now() / 1000) * 1000).toISOString(),
    currency: r.transactions?.[0]?.price?.currency_code,
    customerFirstName: first || undefined,
    customerLastName: rest.join(" ") || undefined,
    customerEmail: (r.buyer_email ?? "").trim(),
    lines: (r.transactions ?? []).map((t) => {
      const vars = t.variations ?? [];
      const personal = vars.filter((v) => v.question_id || PERSONALIZATION.test(v.formatted_name ?? ""));
      const options = vars.filter((v) => !personal.includes(v));
      const text = personal.map((v) => v.formatted_value ?? "").filter(Boolean).join("\n");
      return {
        id: String(t.transaction_id),
        productId: t.listing_id ? `etsy:${t.listing_id}` : undefined,
        variantId: t.product_id ? `etsy:${t.product_id}` : `etsy:${t.listing_id ?? t.transaction_id}`,
        variantTitle: options.map((v) => v.formatted_value).filter(Boolean).join(" / ") || null,
        quantity: t.quantity ?? 1,
        unitPrice: String(money(t.price)),
        currency: t.price?.currency_code,
        name: t.title ?? "",
        requiresShipping: !t.is_digital,
        personalization: [text, !text && r.message_from_buyer ? r.message_from_buyer : ""].filter(Boolean).join("\n"),
        props: [],
      };
    }),
  };
}

const CANCELLED = new Set(["canceled", "cancelled", "fully refunded"]);

/**
 * Son eşitlemeden bu yana değişen siparişleri çeker. İlk eşitlemede son 30
 * gün. İçe aktarma tekrar çalıştırılabilir (satır kimliği tekil).
 */
export async function syncEtsyOrders(shop: string): Promise<{ imported: number; cancelled: number }> {
  const conn = await getEtsyConnection(shop);
  if (!conn) return { imported: 0, cancelled: 0 };
  const startedAt = new Date();
  const since = conn.lastSyncedAt
    ? Math.floor(conn.lastSyncedAt.getTime() / 1000) - 600
    : Math.floor(Date.now() / 1000) - 30 * 86400;
  let imported = 0;
  let cancelled = 0;
  try {
    for (let offset = 0; offset < 2000; offset += 100) {
      const page = await etsyApi<{ count?: number; results?: EtsyReceipt[] }>(conn.token, `/application/shops/${conn.etsyShopId}/receipts`, {
        query: { min_last_modified: since, limit: 100, offset, sort_on: "updated", sort_order: "asc" },
      });
      for (const r of page.results ?? []) {
        if (CANCELLED.has(String(r.status ?? "").toLowerCase())) {
          const { cancelShopifyOrder } = await import("~/models/orders.server");
          await cancelShopifyOrder(shop, `etsy:${r.receipt_id}`);
          cancelled++;
        } else if (r.is_paid) {
          await importOrder(shop, etsyReceiptToIncoming(r));
          imported++;
        }
      }
      if ((page.results?.length ?? 0) < 100) break;
    }
    await query("UPDATE etsy_connections SET last_synced_at = $2, last_error = '' WHERE shop = $1", [shop, startedAt]);
  } catch (err) {
    console.error(`[etsy] ${shop} eşitlenemedi:`, err);
    await query("UPDATE etsy_connections SET last_error = $2 WHERE shop = $1", [shop, String(err instanceof Error ? err.message : err).slice(0, 300)]);
    throw err;
  }
  return { imported, cancelled };
}

/** Zamanlanmış görev: bağlı bütün mağazalar */
export async function syncAllEtsyShops(): Promise<Record<string, string>> {
  await ensureMigrations();
  const out: Record<string, string> = {};
  for (const { shop } of (await query<{ shop: string }>("SELECT shop FROM etsy_connections")).rows) {
    try {
      const r = await syncEtsyOrders(shop);
      out[shop] = `imported ${r.imported}, cancelled ${r.cancelled}`;
    } catch (err) {
      out[shop] = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    }
  }
  return out;
}

/**
 * PrintLab'de "gönderildi": Etsy siparişi gönderildi olarak işaretlenir.
 * Takip numarası varsa gönderi kaydıyla (Etsy müşteriye bildirir), yoksa
 * yalnız durum.
 */
export async function markEtsyShipped(
  shop: string,
  receiptId: string,
  tracking?: { code: string; carrier: string; url?: string },
): Promise<void> {
  const conn = await getEtsyConnection(shop);
  if (!conn || !/^\d+$/.test(receiptId)) return;
  const path = `/application/shops/${conn.etsyShopId}/receipts/${receiptId}`;
  if (tracking?.code && tracking.carrier) {
    try {
      await etsyApi(conn.token, `${path}/tracking`, {
        method: "POST",
        json: { tracking_code: tracking.code, carrier_name: tracking.carrier, ...(tracking.url ? { note_to_buyer: `Track your package: ${tracking.url}` } : {}) },
      });
      return;
    } catch (err) {
      // Etsy tanımadığı kargo adını reddediyor: takipsiz "gönderildi"ye düş
      console.warn(`[etsy] takip bilgisi yazılamadı (${tracking.carrier}), yalnız gönderildi işaretleniyor:`, err instanceof Error ? err.message : err);
    }
  }
  await etsyApi(conn.token, path, { method: "PUT", form: { was_shipped: "true" } });
}
