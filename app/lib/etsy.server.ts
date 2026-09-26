import { createHash, randomBytes } from "node:crypto";

/**
 * Etsy Open API v3 istemcisi.
 *
 * Etsy'de ürün sayfasına tasarımcı eklenemiyor; PrintLab Etsy siparişlerini
 * (müşterinin yazdığı kişiselleştirme metniyle) üretim ekranına getirir ve
 * gönderim bilgisini geri yazar.
 *
 * Uygulama etsy.com/developers adresinde kayıtlıdır:
 *   ETSY_API_KEY        uygulamanın keystring'i (OAuth client_id)
 *   ETSY_SHARED_SECRET  paylaşılan sır (x-api-key başlığında keystring ile)
 * Dönüş adresi orada tanımlı olmalı: <APP_URL>/auth/etsy/callback
 *
 * OAuth 2.0 + PKCE (S256). Erişim anahtarı 1 saat, yenileme anahtarı 90 gün.
 * Etsy'de sipariş webhook'u yok: siparişler düzenli aralıkla sorgulanır.
 */

const API = "https://openapi.etsy.com/v3";
const CONNECT = "https://www.etsy.com/oauth/connect";
const TOKEN = "https://api.etsy.com/v3/public/oauth/token";
export const ETSY_SCOPES = ["transactions_r", "transactions_w", "shops_r"];

export function etsyConfigured(): boolean {
  return Boolean(process.env.ETSY_API_KEY && process.env.ETSY_SHARED_SECRET);
}

export class EtsyError extends Error {
  constructor(readonly status: number, message: string, readonly detail = "") {
    super(message);
    this.name = "EtsyError";
  }
}

/** PKCE: doğrulayıcı (saklanır) ve challenge (Etsy'ye gider) */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function etsyAuthorizeUrl(state: string, challenge: string, redirectUri: string): string {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ETSY_API_KEY ?? "",
    redirect_uri: redirectUri,
    scope: ETSY_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${CONNECT}?${qs}`;
}

export interface EtsyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** Etsy erişim anahtarı "<user_id>.<...>" biçiminde */
  userId: string;
}

async function tokenRequest(fields: Record<string, string>): Promise<EtsyTokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: process.env.ETSY_API_KEY ?? "", ...fields }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* aşağıda */ }
  if (!res.ok || !body.access_token || !body.refresh_token) {
    throw new EtsyError(res.status, "oauth_token", String(body.error_description ?? body.error ?? text.slice(0, 200)));
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000),
    userId: body.access_token.split(".")[0] ?? "",
  };
}

export function exchangeEtsyCode(code: string, verifier: string, redirectUri: string): Promise<EtsyTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
}

export function refreshEtsyTokens(refreshToken: string): Promise<EtsyTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** v3 çağrısı: her istekte x-api-key (keystring:shared_secret) ve Bearer anahtar */
export async function etsyApi<T = unknown>(
  accessToken: string,
  path: string,
  init: { method?: string; query?: Record<string, string | number | boolean>; json?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(Object.entries(init.query).map(([k, v]) => [k, String(v)]))}` : "";
  const headers: Record<string, string> = {
    "x-api-key": `${process.env.ETSY_API_KEY ?? ""}:${process.env.ETSY_SHARED_SECRET ?? ""}`,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  else if (init.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(init.form).toString(); }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API}${path}${qs}`, { method: init.method ?? "GET", headers, body, signal: AbortSignal.timeout(30_000) });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, Math.min(30, Number(res.headers.get("retry-after")) || 5) * 1000));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new EtsyError(res.status, `Etsy ${init.method ?? "GET"} ${path} → ${res.status}`, text.slice(0, 300));
    return (text ? JSON.parse(text) : {}) as T;
  }
  throw new EtsyError(429, "rate_limited");
}

type Money = { amount?: number; divisor?: number; currency_code?: string };
export const money = (m?: Money) => (m?.amount !== undefined && m.divisor ? m.amount / m.divisor : 0);
