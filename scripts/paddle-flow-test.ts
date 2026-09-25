/**
 * Paddle faturalandırmasının uçtan uca testi — gerçek Paddle'a gitmeden.
 *
 * Aynı süreçte sahte bir Paddle API'si açılır (PADDLE_BASE_URL), gerçek
 * veritabanında ayrı bir test mağazası kullanılır ve sonunda silinir.
 * Çalıştırma (sunucuda): npx vite-node scripts/paddle-flow-test.ts
 */
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const SHOP = "woo:flowtest.printlabapp.com";
const PRICES: Record<string, string> = {
  STARTER: "pri_starter", GROWTH: "pri_growth", PRO: "pri_pro", BUSINESS: "pri_business",
  PACK100: "pri_pack100", PACK300: "pri_pack300", PACK500: "pri_pack500",
};

// ── Sahte Paddle ────────────────────────────────────────────────────────────
type Tx = { id: string; status: string; items: Array<{ price: { id: string }; quantity: number }>; subscription_id?: string | null; customer_id?: string | null; custom_data?: unknown };
type Sub = { id: string; status: string; customer_id: string; items: Array<{ price: { id: string } }>; current_billing_period: { starts_at: string; ends_at: string }; scheduled_change: null | { action: string; effective_at: string } };
const txs = new Map<string, Tx>();
const subs = new Map<string, Sub>();
let n = 0;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (data: unknown, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data })); };
    if (req.headers.authorization !== "Bearer pdl_sdbx_apikey_test") return send({ error: "auth" }, 401);
    const json = body ? JSON.parse(body) : {};
    const p = url.pathname;
    let m: RegExpMatchArray | null;
    if (req.method === "POST" && p === "/transactions") {
      const tx: Tx = { id: `txn_${++n}`, status: "draft", items: json.items.map((i: { price_id: string }) => ({ price: { id: i.price_id }, quantity: 1 })), custom_data: json.custom_data };
      txs.set(tx.id, tx);
      return send(tx, 201);
    }
    if ((m = p.match(/^\/transactions\/(.+)$/)) && req.method === "GET") return txs.has(m[1]) ? send(txs.get(m[1])) : send({}, 404);
    if ((m = p.match(/^\/subscriptions\/([^/]+)$/))) {
      const s = subs.get(m[1]);
      if (!s) return send({}, 404);
      if (req.method === "PATCH") {
        if (json.items) s.items = json.items.map((i: { price_id: string }) => ({ price: { id: i.price_id } }));
        if ("scheduled_change" in json) s.scheduled_change = json.scheduled_change;
      }
      return send(s);
    }
    if ((m = p.match(/^\/subscriptions\/([^/]+)\/cancel$/)) && req.method === "POST") {
      const s = subs.get(m[1])!;
      s.scheduled_change = { action: "cancel", effective_at: s.current_billing_period.ends_at };
      return send(s);
    }
    if ((m = p.match(/^\/customers\/([^/]+)\/portal-sessions$/))) return send({ urls: { general: { overview: `https://portal.test/${m[1]}` } } });
    send({ error: "not found" }, 404);
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;

Object.assign(process.env, {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "pdl_sdbx_apikey_test",
  PADDLE_CLIENT_TOKEN: "test_token",
  PADDLE_WEBHOOK_SECRET: "whsec_test",
  PADDLE_BASE_URL: `http://127.0.0.1:${port}`,
  ...Object.fromEntries(Object.entries(PRICES).map(([k, v]) => [`PADDLE_PRICE_${k}`, v])),
});

const { query } = await import("~/lib/db.server");
const { isPaddleReady } = await import("~/lib/paddle.server");
const { getShopSubscription } = await import("~/models/billing.server");
const { effectivePlanKey } = await import("~/lib/plans");
const pb = await import("~/models/paddle-billing.server");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}
function signed(event: string, id: string, secret = "whsec_test", tsOffset = 0) {
  const raw = JSON.stringify({ event_type: event, data: { id } });
  const ts = String(Math.floor(Date.now() / 1000) + tsOffset);
  const h1 = createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex");
  return { raw, headers: new Headers({ "paddle-signature": `ts=${ts};h1=${h1}` }) };
}
async function plan() {
  const s = await getShopSubscription(SHOP);
  return `${effectivePlanKey(s)}/${s?.subscription_status ?? "none"}`;
}
async function cleanup() {
  await query("DELETE FROM paddle_checkouts WHERE shop = $1", [SHOP]);
  await query("DELETE FROM paddle_subscriptions WHERE shop = $1", [SHOP]);
  await query("DELETE FROM shop_subscriptions WHERE shop = $1", [SHOP]);
  await query("DELETE FROM ai_credit_purchases WHERE shop = $1", [SHOP]);
}

try {
  await cleanup();
  check("ayarlar tamam", isPaddleReady());

  // 1. Ödeme başlar; ödenmeden plan değişmez
  const { transactionId } = await pb.startPaddleCheckout(SHOP, { kind: "plan", plan: "Starter" });
  await pb.reconcilePaddleCheckouts(SHOP);
  check("ödenmemiş işlem planı değiştirmez", (await plan()) === "Free/none", await plan());

  // 2. Ödeme tamamlanır (deneme süresi), imzalı bildirim gelir
  subs.set("sub_1", { id: "sub_1", status: "trialing", customer_id: "ctm_1", items: [{ price: { id: "pri_starter" } }], current_billing_period: { starts_at: "2026-09-25T00:00:00Z", ends_at: "2026-10-09T00:00:00Z" }, scheduled_change: null });
  Object.assign(txs.get(transactionId)!, { status: "completed", subscription_id: "sub_1", customer_id: "ctm_1" });
  const w1 = signed("transaction.completed", transactionId);
  check("imzalı bildirim 200", (await pb.handlePaddleWebhook(w1.raw, w1.headers)) === 200);
  check("deneme planı açıldı", (await plan()) === "Starter/trial", await plan());

  // 3. Sahte bildirimler
  const bad = signed("transaction.completed", transactionId, "wrong-secret");
  check("yanlış imza 403", (await pb.handlePaddleWebhook(bad.raw, bad.headers)) === 403);
  const stale = signed("transaction.completed", transactionId, "whsec_test", -3600);
  check("eski imza 403", (await pb.handlePaddleWebhook(stale.raw, stale.headers)) === 403);
  // Başka birinin (bizim açmadığımız) işlemi abonelik kuramaz
  txs.set("txn_foreign", { id: "txn_foreign", status: "completed", items: [{ price: { id: "pri_business" }, quantity: 1 }], subscription_id: "sub_foreign", customer_id: "ctm_x", custom_data: { printlab_shop: SHOP } });
  subs.set("sub_foreign", { id: "sub_foreign", status: "active", customer_id: "ctm_x", items: [{ price: { id: "pri_business" } }], current_billing_period: { starts_at: "2026-09-25T00:00:00Z", ends_at: "2026-10-25T00:00:00Z" }, scheduled_change: null });
  const w2 = signed("transaction.completed", "txn_foreign");
  await pb.handlePaddleWebhook(w2.raw, w2.headers);
  const w3 = signed("subscription.created", "sub_foreign");
  await pb.handlePaddleWebhook(w3.raw, w3.headers);
  check("custom_data ile sahte abonelik açılamaz", (await plan()) === "Starter/trial", await plan());

  // 4. Deneme biter, aktif olur; plan yükseltilir
  subs.get("sub_1")!.status = "active";
  const w4 = signed("subscription.activated", "sub_1");
  await pb.handlePaddleWebhook(w4.raw, w4.headers);
  check("aktif", (await plan()) === "Starter/active", await plan());
  await pb.changePaddlePlan(SHOP, "Growth");
  check("plan değişti (aynı abonelik)", (await plan()) === "Growth/active" && subs.get("sub_1")!.items[0].price.id === "pri_growth", await plan());

  // 5. İptal dönem sonunda; geri alınabilir
  await pb.cancelPaddlePlan(SHOP);
  const scheduled = await pb.getPaddleSubscription(SHOP);
  check("iptal planlandı, plan sürüyor", scheduled?.scheduled_action === "cancel" && (await plan()) === "Growth/active", `${scheduled?.scheduled_action} ${await plan()}`);
  await pb.resumePaddlePlan(SHOP);
  check("iptal geri alındı", (await pb.getPaddleSubscription(SHOP))?.scheduled_action == null);
  check("müşteri portalı", (await pb.paddlePortalUrl(SHOP)) === "https://portal.test/ctm_1");

  // 6. Dönem sonunda Paddle iptal eder
  subs.get("sub_1")!.status = "canceled";
  const w5 = signed("subscription.canceled", "sub_1");
  await pb.handlePaddleWebhook(w5.raw, w5.headers);
  check("iptal sonrası ücretsiz plan", (await plan()) === "Free/cancelled", await plan());

  // 7. AI kredisi: bir kez yüklenir, paket tutmazsa yüklenmez
  const c1 = await pb.startPaddleCheckout(SHOP, { kind: "credits", pack: "pack100" });
  txs.get(c1.transactionId)!.status = "completed";
  await pb.applyPaddleTransaction(c1.transactionId);
  await pb.applyPaddleTransaction(c1.transactionId);
  const credits = await query<{ n: string; total: string }>("SELECT count(*)::text n, COALESCE(sum(credits_added),0)::text total FROM ai_credit_purchases WHERE shop = $1", [SHOP]);
  check("kredi bir kez yüklendi", credits.rows[0].n === "1" && credits.rows[0].total === "100", JSON.stringify(credits.rows[0]));
  const c2 = await pb.startPaddleCheckout(SHOP, { kind: "credits", pack: "pack500" });
  Object.assign(txs.get(c2.transactionId)!, { status: "completed", items: [{ price: { id: "pri_pack100" }, quantity: 1 }] });
  await pb.applyPaddleTransaction(c2.transactionId);
  const after = await query<{ n: string }>("SELECT count(*)::text n FROM ai_credit_purchases WHERE shop = $1", [SHOP]);
  check("paketle eşleşmeyen işlem kredi yüklemez", after.rows[0].n === "1");

  // 8. Shopify mağazası Paddle ödemesi başlatamaz
  let blocked = false;
  try { await pb.startPaddleCheckout("demo.myshopify.com", { kind: "plan", plan: "Pro" }); } catch { blocked = true; }
  check("Shopify mağazası reddedildi", blocked);
} finally {
  await cleanup();
  server.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
