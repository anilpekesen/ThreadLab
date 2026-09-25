import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Printful API v2 istemcisi (https://api.printful.com/v2).
 *
 * Mağaza sahibi kendi Printful hesabının özel anahtarını (private token)
 * girer; anahtar veritabanında AES-256-GCM ile şifreli durur. Sınır 120
 * istek/dk; 429'da `retry-after` kadar beklenip bir kez daha denenir.
 */

const BASE = "https://api.printful.com/v2";

export class PrintfulError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: string) {
    super(message);
  }
}

// ── Anahtar şifreleme ────────────────────────────────────────────────────────

function key(): Buffer {
  const secret = process.env.POD_SECRET || process.env.SHOPIFY_API_SECRET || "";
  if (!secret) throw new Error("POD şifreleme anahtarı yok");
  return createHash("sha256").update(`printlab-pod:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(sealed: string): string {
  const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function pf<T = unknown>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; storeId?: number | null } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.storeId ? { "X-PF-Store-Id": String(init.storeId) } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(30, Number(res.headers.get("retry-after")) || 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) {
      // RFC 9457: title + detail
      throw new PrintfulError(res.status, String(body?.title ?? body?.error?.message ?? `HTTP ${res.status}`), String(body?.detail ?? ""));
    }
    return body as T;
  }
  throw new PrintfulError(429, "Too many requests");
}

// ── Katalog ──────────────────────────────────────────────────────────────────

export interface PfPlacement {
  placement: string;
  technique: string;
  print_area_width: number;
  print_area_height: number;
}

export interface PfProduct {
  id: number;
  name: string;
  image: string;
  techniques: Array<{ key: string; display_name: string; is_default: boolean }>;
  placements: PfPlacement[];
}

export interface PfVariant {
  id: number;
  name: string;
  size: string;
  color: string;
  color_code: string;
}

export async function getCatalogProduct(token: string, id: number): Promise<PfProduct> {
  return (await pf<{ data: PfProduct }>(token, `/catalog-products/${id}`)).data;
}

export async function listCatalogVariants(token: string, id: number): Promise<PfVariant[]> {
  const out: PfVariant[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await pf<{ data: PfVariant[] }>(token, `/catalog-products/${id}/catalog-variants?limit=100&offset=${offset}`);
    out.push(...r.data);
    if (r.data.length < 100) break;
  }
  return out;
}

export async function listStores(token: string): Promise<Array<{ id: number; name: string; type: string }>> {
  return (await pf<{ data: Array<{ id: number; name: string; type: string }> }>(token, "/stores")).data;
}

// ── Webhook imzası ───────────────────────────────────────────────────────────

/** `x-pf-webhook-signature`: gövdenin HMAC-SHA256'sı (onaltılık); anahtar onaltılık gelir */
export function verifyPrintfulSignature(rawBody: string, signatureHex: string, secretHex: string): boolean {
  if (!signatureHex || !secretHex) return false;
  const expected = createHmac("sha256", Buffer.from(secretHex, "hex")).update(rawBody).digest();
  let given: Buffer;
  try { given = Buffer.from(signatureHex, "hex"); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
