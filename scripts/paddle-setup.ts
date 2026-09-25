/**
 * PrintLab'in Paddle kurulumu (WooCommerce faturalandırması).
 *
 * Çalıştırma (sunucuda, uygulama dizininde):
 *   PADDLE_ENV=sandbox PADDLE_API_KEY=... npx vite-node scripts/paddle-setup.ts
 *
 * Yaptıkları, tekrar çalıştırmaya dayanıklı (custom_data.printlab ile bulur):
 *   - "PrintLab" abonelik ürünü + 4 aylık fiyat (plans.ts'teki fiyat ve deneme)
 *   - "PrintLab AI credits" ürünü + 3 tek seferlik fiyat (credit-packs.ts)
 *   - /webhooks/paddle bildirim hedefi
 * Kimlikleri ve bildirim sırrını uygulamanın .env dosyasına yazar; sırrı
 * EKRANA YAZMAZ. Sonrasında deploy.sh ile yeniden başlatınca devreye girer.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PLANS, type PlanKey } from "~/lib/plans";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";
import { PAID_PLANS, paddleApi, paddleEnv } from "~/lib/paddle.server";

const APP_URL = (process.env.APP_URL || process.env.SHOPIFY_APP_URL || "https://app.printlabapp.com").replace(/\/$/, "");
const ENV_FILE = process.env.ENV_FILE || ".env";

type Entity = { id: string; custom_data?: Record<string, string> | null; status?: string };

async function listAll(path: string, query: Record<string, string> = {}): Promise<Entity[]> {
  return paddleApi<Entity[]>(path, { query: { per_page: "200", ...query } });
}

async function ensureProduct(tag: string, name: string, description: string): Promise<string> {
  const found = (await listAll("/products", { status: "active" })).find((p) => p.custom_data?.printlab === tag);
  if (found) return found.id;
  const p = await paddleApi<Entity>("/products", {
    method: "POST",
    body: { name, description, tax_category: "saas", custom_data: { printlab: tag } },
  });
  return p.id;
}

async function ensurePrice(productId: string, tag: string, body: Record<string, unknown>): Promise<string> {
  const found = (await listAll("/prices", { product_id: productId, status: "active" })).find((p) => p.custom_data?.printlab === tag);
  if (found) return found.id;
  const p = await paddleApi<Entity>("/prices", {
    method: "POST",
    body: { product_id: productId, custom_data: { printlab: tag }, ...body },
  });
  return p.id;
}

const EVENTS = [
  "transaction.completed",
  "transaction.paid",
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
];

async function ensureWebhook(): Promise<{ id: string; secret: string | null }> {
  const destination = `${APP_URL}/webhooks/paddle`;
  const all = await paddleApi<Array<{ id: string; destination: string; endpoint_secret_key?: string }>>("/notification-settings");
  const found = all.find((n) => n.destination === destination);
  if (found) {
    await paddleApi(`/notification-settings/${found.id}`, { method: "PATCH", body: { subscribed_events: EVENTS, active: true } });
    return { id: found.id, secret: found.endpoint_secret_key ?? null };
  }
  const n = await paddleApi<{ id: string; endpoint_secret_key: string }>("/notification-settings", {
    method: "POST",
    body: {
      description: "PrintLab (WooCommerce billing)",
      destination,
      type: "url",
      subscribed_events: EVENTS,
      include_sensitive_fields: false,
      api_version: 1,
    },
  });
  return { id: n.id, secret: n.endpoint_secret_key };
}

function writeEnv(values: Record<string, string>) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const keys = new Set(Object.keys(values));
  const kept = lines.filter((l) => !keys.has(l.split("=")[0]));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  for (const [k, v] of Object.entries(values)) kept.push(`${k}=${v}`);
  writeFileSync(ENV_FILE, `${kept.join("\n")}\n`, { mode: 0o600 });
}

const env = paddleEnv();
if (!env || !process.env.PADDLE_API_KEY) {
  console.error("PADDLE_ENV (sandbox|live) and PADDLE_API_KEY are required");
  process.exit(1);
}

const out: Record<string, string> = {};

const planProduct = await ensureProduct("plans", "PrintLab", "Product personalizer and print production for WooCommerce stores.");
for (const plan of PAID_PLANS) {
  const def = PLANS[plan as PlanKey];
  const trial = Number(def.trialDays ?? 0);
  out[`PADDLE_PRICE_${plan.toUpperCase()}`] = await ensurePrice(planProduct, `plan:${plan}`, {
    description: `PrintLab ${plan} (monthly)`,
    name: `PrintLab ${plan}`,
    unit_price: { amount: String(Math.round(Number(def.price) * 100)), currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 },
    ...(trial > 0 ? { trial_period: { interval: "day", frequency: trial } } : {}),
    quantity: { minimum: 1, maximum: 1 },
  });
}

const creditProduct = await ensureProduct("credits", "PrintLab AI credits", "AI image credits for the PrintLab designer, valid for 30 days.");
for (const key of Object.keys(CREDIT_PACKS) as PackKey[]) {
  const pack = CREDIT_PACKS[key];
  out[`PADDLE_PRICE_${key.toUpperCase()}`] = await ensurePrice(creditProduct, `pack:${key}`, {
    description: `${pack.credits} AI credits`,
    name: `${pack.credits} AI credits`,
    unit_price: { amount: String(Math.round(pack.price * 100)), currency_code: "USD" },
    quantity: { minimum: 1, maximum: 1 },
  });
}

const hook = await ensureWebhook();
if (hook.secret) out.PADDLE_WEBHOOK_SECRET = hook.secret;
else console.warn("Webhook exists but its secret was not returned; keep the current PADDLE_WEBHOOK_SECRET.");

writeEnv({ PADDLE_ENV: env, ...out });

// Yalnız herkese açık kimlikler yazdırılır; sır dosyada kalır
for (const [k, v] of Object.entries(out)) if (k !== "PADDLE_WEBHOOK_SECRET") console.log(`${k}=${v}`);
console.log(`notification setting: ${hook.id} -> ${APP_URL}/webhooks/paddle`);
console.log(`written to ${ENV_FILE}${hook.secret ? " (including PADDLE_WEBHOOK_SECRET)" : ""}`);
process.exit(0);
