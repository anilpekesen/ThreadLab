import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlanKey } from "~/lib/plans";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";

/**
 * Paddle Billing istemcisi. WooCommerce mağazaları Shopify faturalandırmasını
 * kullanamadığı için abonelik ve AI kredisi Paddle'dan satılır (Paddle
 * "merchant of record": faturayı ve vergiyi o üstlenir).
 *
 * Yapı genderapi2'deki çalışan entegrasyondan uyarlandı:
 *   - Ortam (sandbox | live) BİLEREK varsayılansız; belirsizse Paddle'a hiç
 *     istek atılmaz. Anahtarın ön eki öteki ortama aitse reddedilir.
 *   - Webhook bir ZİLDİR: imza doğrulanır, durum her zaman API'den okunur.
 *
 * Ortam değişkenleri:
 *   PADDLE_ENV, PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_WEBHOOK_SECRET
 *   PADDLE_PRICE_STARTER / _GROWTH / _PRO / _BUSINESS   (aylık plan fiyatları)
 *   PADDLE_PRICE_PACK100 / _PACK300 / _PACK500          (tek seferlik kredi)
 * Fiyatlar ve webhook adresi `scripts/paddle-setup.ts` ile oluşturulur.
 */

export type PaddleEnv = "sandbox" | "live";

/** Paddle'dan satılan planlar (ücretsiz plan satılmaz) */
export const PAID_PLANS: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];

const BASE_URLS: Record<PaddleEnv, string> = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
};

const PREFIXES: Record<PaddleEnv, { apiKey: string; clientToken: string }> = {
  sandbox: { apiKey: "pdl_sdbx_apikey_", clientToken: "test_" },
  live: { apiKey: "pdl_live_apikey_", clientToken: "live_" },
};

export function paddleEnv(): PaddleEnv | null {
  const env = process.env.PADDLE_ENV ?? "";
  return env === "sandbox" || env === "live" ? env : null;
}

/** Kurulumu engelleyen her şey, okunur biçimde. Boş dizi = kullanılabilir. */
export function paddleProblems(): string[] {
  const problems: string[] = [];
  const env = paddleEnv();
  if (!env) problems.push("PADDLE_ENV must be sandbox or live");
  const other: PaddleEnv = env === "live" ? "sandbox" : "live";
  const key = process.env.PADDLE_API_KEY ?? "";
  if (!key) problems.push("PADDLE_API_KEY is not set");
  else if (env && key.startsWith(PREFIXES[other].apiKey)) problems.push(`PADDLE_API_KEY belongs to ${other}`);
  const token = process.env.PADDLE_CLIENT_TOKEN ?? "";
  if (!token) problems.push("PADDLE_CLIENT_TOKEN is not set");
  else if (env && token.startsWith(PREFIXES[other].clientToken)) problems.push(`PADDLE_CLIENT_TOKEN belongs to ${other}`);
  if (!process.env.PADDLE_WEBHOOK_SECRET) problems.push("PADDLE_WEBHOOK_SECRET is not set");
  for (const plan of PAID_PLANS) {
    if (!planPriceId(plan)) problems.push(`PADDLE_PRICE_${plan.toUpperCase()} is not set`);
  }
  return problems;
}

export function isPaddleReady(): boolean {
  return paddleProblems().length === 0;
}

/** Tarayıcıdaki Paddle.js için: yalnız herkese açık istemci token'ı ve ortam */
export function paddleClientConfig(): { environment: PaddleEnv; token: string } | null {
  const env = paddleEnv();
  const token = process.env.PADDLE_CLIENT_TOKEN ?? "";
  return env && token ? { environment: env, token } : null;
}

export function planPriceId(plan: PlanKey): string {
  return process.env[`PADDLE_PRICE_${plan.toUpperCase()}`] ?? "";
}

export function packPriceId(pack: PackKey): string {
  return process.env[`PADDLE_PRICE_${pack.toUpperCase()}`] ?? "";
}

/** Fiyat kimliği hangi plana ait; bilinmiyorsa null (elle açılmış fiyat) */
export function planForPrice(priceId: string): PlanKey | null {
  if (!priceId) return null;
  return PAID_PLANS.find((p) => planPriceId(p) === priceId) ?? null;
}

export function packForPrice(priceId: string): PackKey | null {
  if (!priceId) return null;
  return (Object.keys(CREDIT_PACKS) as PackKey[]).find((k) => packPriceId(k) === priceId) ?? null;
}

export class PaddleError extends Error {
  constructor(message: string, public status: number, public body: string) {
    super(message);
    this.name = "PaddleError";
  }
}

/** Paddle API çağrısı; `data` alanını döndürür */
export async function paddleApi<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const env = paddleEnv();
  const key = process.env.PADDLE_API_KEY ?? "";
  if (!env || !key) throw new PaddleError("Paddle is not configured", 0, "");
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`${BASE_URLS[env]}${path}${qs}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new PaddleError(`Paddle ${init.method ?? "GET"} ${path} → ${res.status}`, res.status, text.slice(0, 500));
  const json = text ? JSON.parse(text) : {};
  return (json.data ?? json) as T;
}

/**
 * `Paddle-Signature: ts=<unix>;h1=<hmac>` doğrulaması. İmzalanan metin
 * `<ts>:<ham gövde>`; zaman damgası 5 dakikadan eskiyse (tekrar oynatma)
 * reddedilir. Sır yenilenirken başlıkta birden çok h1 olabilir; biri yeter.
 */
export function verifyPaddleSignature(header: string | null, raw: string, secret: string, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  let ts = "";
  const h1s: string[] = [];
  for (const piece of header.split(";")) {
    const [k, v] = piece.trim().split("=", 2);
    if (k === "ts") ts = v ?? "";
    else if (k === "h1" && v) h1s.push(v);
  }
  if (!/^\d+$/.test(ts) || !h1s.length) return false;
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${raw}`).digest();
  return h1s.some((h) => {
    const given = Buffer.from(h, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
