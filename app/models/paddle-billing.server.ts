import { randomBytes } from "node:crypto";
import { query, runMigrations } from "~/lib/db.server";
import { isWooShop } from "~/lib/platform";
import type { PlanKey } from "~/lib/plans";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";
import {
  packForPrice,
  packPriceId,
  paddleApi,
  planForPrice,
  planPriceId,
  verifyPaddleSignature,
} from "~/lib/paddle.server";
import { upsertShopSubscription, type SubscriptionStatus } from "~/models/billing.server";

/**
 * WooCommerce mağazalarının aboneliği ve AI kredisi — Paddle Billing.
 *
 * Güven kuralları (genderapi2'deki entegrasyonla aynı):
 *   - Ödeme işlemini SUNUCU açar ve `paddle_checkouts`a yazar. Bir işlemin
 *     hangi mağazaya ait olduğu oradan okunur; tarayıcının ya da Paddle'daki
 *     custom_data'nın söylediğinden değil.
 *   - Webhook yalnız tetikler. Abonelik ve işlem durumu her seferinde Paddle
 *     API'sinden okunur; geç gelen eski bildirim güncel durumu ezemez.
 *   - Aynı işlem iki kez işlenirse kredi bir kez yüklenir (charge_id tekil).
 *
 * Mağazanın kullandığı plan, her zamanki gibi `shop_subscriptions`tan
 * okunur (effectivePlanKey); buradaki eşitleme o satırı günceller.
 */

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

type PaddlePrice = { id?: string };
type PaddleItem = { price?: PaddlePrice; price_id?: string; quantity?: number };
type PaddleTransaction = {
  id: string;
  status?: string;
  subscription_id?: string | null;
  customer_id?: string | null;
  origin?: string;
  items?: PaddleItem[];
};
type PaddleSubscription = {
  id: string;
  status?: string;
  customer_id?: string;
  items?: PaddleItem[];
  current_billing_period?: { starts_at?: string; ends_at?: string } | null;
  scheduled_change?: { action?: string; effective_at?: string } | null;
};

const PAID_TX = new Set(["completed", "paid"]);

export type CheckoutItem = { kind: "plan"; plan: PlanKey } | { kind: "credits"; pack: PackKey };

// ── Ödeme başlatma ──────────────────────────────────────────────────────────

/**
 * Paddle'da işlem açar; tarayıcı Paddle.js ile bu işlemin ödeme penceresini
 * açar. Tutar Paddle'daki fiyattır, bizden ya da tarayıcıdan gelmez.
 */
export async function startPaddleCheckout(shop: string, item: CheckoutItem): Promise<{ transactionId: string }> {
  if (!isWooShop(shop)) throw new Error("Paddle checkout is only for WooCommerce stores");
  await ensureMigrations();
  const priceId = item.kind === "plan" ? planPriceId(item.plan) : packPriceId(item.pack);
  if (!priceId) throw new Error("This item is not for sale yet");
  const key = item.kind === "plan" ? item.plan : item.pack;
  const tx = await paddleApi<PaddleTransaction>("/transactions", {
    method: "POST",
    body: {
      items: [{ price_id: priceId, quantity: 1 }],
      // Destek için iz: Paddle panelinden bir ödemenin hangi mağazaya ait
      // olduğu görülsün. Karar için KULLANILMAZ (bkz. paddle_checkouts).
      custom_data: { printlab_shop: shop, printlab_kind: item.kind, printlab_item: key },
    },
  });
  await query(
    "INSERT INTO paddle_checkouts (transaction_id, shop, kind, item_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [tx.id, shop, item.kind, key],
  );
  return { transactionId: tx.id };
}

// ── İşlem ve abonelik eşitleme ─────────────────────────────────────────────

/**
 * Bir işlemi Paddle'dan okuyup uygular: sunucunun açtığı ve ödenmiş işlem
 * ise aboneliği kurar ya da krediyi yükler. Yenileme işlemleri yalnız
 * bilinen aboneliği tazeler.
 */
export async function applyPaddleTransaction(transactionId: string): Promise<void> {
  await ensureMigrations();
  const tx = await paddleApi<PaddleTransaction>(`/transactions/${encodeURIComponent(transactionId)}`);
  const checkout = (await query<{ shop: string; kind: string; item_key: string; completed_at: Date | null }>(
    "SELECT shop, kind, item_key, completed_at FROM paddle_checkouts WHERE transaction_id = $1", [tx.id])).rows[0];

  if (!checkout) {
    // Bizim açmadığımız işlem: yenileme ya da plan değişikliği farkı olabilir
    if (tx.subscription_id) await syncPaddleSubscription(tx.subscription_id);
    return;
  }
  if (!PAID_TX.has(String(tx.status))) return;

  if (checkout.kind === "credits") {
    const pack = CREDIT_PACKS[checkout.item_key as PackKey];
    const priceId = tx.items?.[0]?.price?.id ?? tx.items?.[0]?.price_id ?? "";
    // İşlemin kalemi gerçekten o paket mi (işlem panelden değiştirilmiş olabilir)
    if (!pack || packForPrice(priceId) !== checkout.item_key) {
      console.error(`[paddle] kredi işlemi paketle eşleşmiyor ${tx.id}`);
      return;
    }
    await query(
      `INSERT INTO ai_credit_purchases (id, shop, charge_id, pack_key, credits_added, price_usd, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, now() + interval '30 days') ON CONFLICT (charge_id) DO NOTHING`,
      [`acp_${randomBytes(8).toString("hex")}`, checkout.shop, `paddle:${tx.id}`, pack.key, pack.credits, pack.price],
    );
  } else if (tx.subscription_id) {
    await query(
      `INSERT INTO paddle_subscriptions (subscription_id, shop, customer_id) VALUES ($1,$2,$3)
       ON CONFLICT (subscription_id) DO NOTHING`,
      [tx.subscription_id, checkout.shop, tx.customer_id ?? ""],
    );
    await syncPaddleSubscription(tx.subscription_id);
  }
  await query("UPDATE paddle_checkouts SET completed_at = now() WHERE transaction_id = $1 AND completed_at IS NULL", [tx.id]);
}

function shopStatus(paddleStatus: string): SubscriptionStatus {
  // past_due: Paddle kartı yeniden deniyor; bu sürede hizmet kesilmez
  if (paddleStatus === "active" || paddleStatus === "past_due") return "active";
  if (paddleStatus === "trialing") return "trial";
  return "cancelled";
}

/**
 * Aboneliğin güncel durumunu Paddle'dan okur ve mağazanın planını yazar.
 * Tanınmayan abonelik için satır AÇMAZ (satır yalnız bizim işlemimizle açılır).
 */
export async function syncPaddleSubscription(subscriptionId: string): Promise<void> {
  await ensureMigrations();
  const row = (await query<{ shop: string }>("SELECT shop FROM paddle_subscriptions WHERE subscription_id = $1", [subscriptionId])).rows[0];
  if (!row) {
    console.info(`[paddle] tanınmayan abonelik atlandı ${subscriptionId}`);
    return;
  }
  const sub = await paddleApi<PaddleSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const priceId = sub.items?.[0]?.price?.id ?? sub.items?.[0]?.price_id ?? "";
  const plan = planForPrice(priceId);
  await query(
    `UPDATE paddle_subscriptions SET customer_id = $2, price_id = $3, plan_key = $4, status = $5,
       period_ends_at = $6, scheduled_action = $7, scheduled_at = $8, updated_at = now()
     WHERE subscription_id = $1`,
    [
      subscriptionId,
      sub.customer_id ?? "",
      priceId,
      plan ?? "",
      sub.status ?? "",
      sub.current_billing_period?.ends_at ?? null,
      sub.scheduled_change?.action ?? null,
      sub.scheduled_change?.effective_at ?? null,
    ],
  );
  await refreshShopPlan(row.shop);
}

/**
 * Mağazanın planı: sürmekte olan (aktif/deneme/ödeme bekleyen) en yeni
 * aboneliği. Hiçbiri yoksa abonelik iptal sayılır ve ücretsiz plana düşer.
 */
async function refreshShopPlan(shop: string): Promise<void> {
  const live = (await query<{ subscription_id: string; plan_key: string; status: string }>(
    `SELECT subscription_id, plan_key, status FROM paddle_subscriptions
      WHERE shop = $1 AND status IN ('active','trialing','past_due') AND plan_key <> ''
      ORDER BY updated_at DESC LIMIT 1`,
    [shop],
  )).rows[0];
  if (live) {
    await upsertShopSubscription(shop, { planKey: live.plan_key as PlanKey, shopifySubscriptionId: null, subscriptionStatus: shopStatus(live.status) });
    return;
  }
  const last = (await query<{ plan_key: string }>(
    "SELECT plan_key FROM paddle_subscriptions WHERE shop = $1 AND plan_key <> '' ORDER BY updated_at DESC LIMIT 1", [shop])).rows[0];
  if (last) await upsertShopSubscription(shop, { planKey: last.plan_key as PlanKey, shopifySubscriptionId: null, subscriptionStatus: "cancelled" });
}

/**
 * Bildirim kaçtıysa: mağazanın son bir gün içinde açılıp tamamlanmamış
 * işlemlerini Paddle'a sorar. Faturalama sayfası açılınca çalışır; ödeme
 * penceresi kapanır kapanmaz sayfa yenilendiğinde plan hemen görünür.
 */
export async function reconcilePaddleCheckouts(shop: string): Promise<void> {
  await ensureMigrations();
  const pending = await query<{ transaction_id: string }>(
    `SELECT transaction_id FROM paddle_checkouts
      WHERE shop = $1 AND completed_at IS NULL AND created_at > now() - interval '1 day'
      ORDER BY created_at DESC LIMIT 5`,
    [shop],
  );
  for (const r of pending.rows) {
    await applyPaddleTransaction(r.transaction_id).catch((err) => console.error("[paddle] işlem denetlenemedi:", err));
  }
}

// ── Aboneliği yönetme ──────────────────────────────────────────────────────

export async function getPaddleSubscription(shop: string) {
  await ensureMigrations();
  return (await query<{
    subscription_id: string; customer_id: string; plan_key: string; status: string;
    period_ends_at: Date | null; scheduled_action: string | null; scheduled_at: Date | null;
  }>(
    `SELECT subscription_id, customer_id, plan_key, status, period_ends_at, scheduled_action, scheduled_at
       FROM paddle_subscriptions
      WHERE shop = $1 AND status IN ('active','trialing','past_due')
      ORDER BY updated_at DESC LIMIT 1`,
    [shop],
  )).rows[0] ?? null;
}

/**
 * Plan değişikliği mevcut aboneliğin üzerinde yapılır (ikinci abonelik
 * açılmaz). Fark kıst olarak hemen tahsil/iade edilir.
 */
export async function changePaddlePlan(shop: string, plan: PlanKey): Promise<void> {
  const sub = await getPaddleSubscription(shop);
  if (!sub) throw new Error("No active subscription");
  const priceId = planPriceId(plan);
  if (!priceId) throw new Error("This plan is not for sale yet");
  await paddleApi(`/subscriptions/${encodeURIComponent(sub.subscription_id)}`, {
    method: "PATCH",
    body: {
      items: [{ price_id: priceId, quantity: 1 }],
      // Denemedeki abonelikte tahsilat olmaz; deneme sonunda yeni fiyat geçerli
      proration_billing_mode: sub.status === "trialing" ? "do_not_bill" : "prorated_immediately",
    },
  });
  await syncPaddleSubscription(sub.subscription_id);
}

/** İptal dönem sonunda geçerli olur; o güne kadar plan kullanılabilir */
export async function cancelPaddlePlan(shop: string): Promise<void> {
  const sub = await getPaddleSubscription(shop);
  if (!sub) return;
  await paddleApi(`/subscriptions/${encodeURIComponent(sub.subscription_id)}/cancel`, {
    method: "POST",
    body: { effective_from: "next_billing_period" },
  });
  await syncPaddleSubscription(sub.subscription_id);
}

/** İptali geri al: dönem sonundaki iptal planlanmışsa kaldırılır */
export async function resumePaddlePlan(shop: string): Promise<void> {
  const sub = await getPaddleSubscription(shop);
  if (!sub || sub.scheduled_action !== "cancel") return;
  await paddleApi(`/subscriptions/${encodeURIComponent(sub.subscription_id)}`, {
    method: "PATCH",
    body: { scheduled_change: null },
  });
  await syncPaddleSubscription(sub.subscription_id);
}

/** Paddle'ın müşteri portalı: kart bilgisi, faturalar */
export async function paddlePortalUrl(shop: string): Promise<string | null> {
  const sub = await getPaddleSubscription(shop);
  const customerId = sub?.customer_id || (await query<{ customer_id: string }>(
    "SELECT customer_id FROM paddle_subscriptions WHERE shop = $1 AND customer_id <> '' ORDER BY updated_at DESC LIMIT 1", [shop])).rows[0]?.customer_id;
  if (!customerId) return null;
  const session = await paddleApi<{ urls?: { general?: { overview?: string } } }>(
    `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    { method: "POST", body: sub ? { subscription_ids: [sub.subscription_id] } : {} },
  );
  return session.urls?.general?.overview ?? null;
}

// ── Bildirim ────────────────────────────────────────────────────────────────

const TX_EVENTS = new Set(["transaction.completed", "transaction.paid"]);

export async function handlePaddleWebhook(raw: string, headers: Headers): Promise<number> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";
  // Sır yokken uç kapalı: boş sırla doğrulamak her imzayı geçerli saymak olur
  if (!secret) return 404;
  if (!verifyPaddleSignature(headers.get("paddle-signature"), raw, secret)) return 403;
  let payload: { event_type?: string; data?: { id?: string; subscription_id?: string } };
  try { payload = JSON.parse(raw); } catch { return 400; }
  const event = String(payload.event_type ?? "");
  const id = String(payload.data?.id ?? "");
  if (!id) return 200;
  if (TX_EVENTS.has(event)) await applyPaddleTransaction(id);
  else if (event.startsWith("subscription.")) await syncPaddleSubscription(id);
  return 200;
}
