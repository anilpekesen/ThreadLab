import crypto from "crypto";

const API_VERSION = "2026-07";

export function verifyHmac(query: URLSearchParams): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;

  const params = new URLSearchParams();
  query.forEach((value, key) => {
    if (key !== "hmac") params.append(key, value);
  });

  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const expected = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(sortedParams)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export function verifyProxyHmac(query: URLSearchParams): boolean {
  const signature = query.get("signature");
  if (!signature) return false;

  const params = new URLSearchParams();
  query.forEach((value, key) => {
    if (key !== "signature") params.append(key, value);
  });

  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const expected = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(sortedParams)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export function buildAuthUrl(shop: string, state: string): string {
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/auth/callback`;
  const scopes =
    process.env.SCOPES ??
    "read_products,write_products,read_orders,write_orders,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,write_app_proxy,write_cart_transforms,write_script_tags";

  return (
    `https://${shop}/admin/oauth/authorize?` +
    new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY ?? "",
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    }).toString()
  );
}

export interface TokenData {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<TokenData> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  return {
    accessToken: data.access_token,
    expiresAt,
    refreshToken: data.refresh_token ?? null,
  };
}

export async function refreshAccessToken(shop: string, refreshToken: string): Promise<TokenData> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  return {
    accessToken: data.access_token,
    expiresAt,
    refreshToken: data.refresh_token ?? null,
  };
}

export async function migrateToExpiringToken(shop: string, currentToken: string): Promise<TokenData | null> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY ?? "",
      client_secret: process.env.SHOPIFY_API_SECRET ?? "",
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: currentToken,
      subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    }).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[token-migrate] Failed for ${shop}: ${response.status} ${text.slice(0, 300)}`);
    return null;
  }

  let data: { access_token?: string; expires_in?: number; refresh_token?: string };
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[token-migrate] Invalid JSON response for ${shop}:`, text.slice(0, 200));
    return null;
  }

  console.log(`[token-migrate] keys=${Object.keys(data).join(",")}, expires_in=${data.expires_in}, has_token=${!!data.access_token}, has_refresh=${!!data.refresh_token}`);

  if (!data.access_token) {
    console.error(`[token-migrate] No access_token in response for ${shop}`);
    return null;
  }

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  return {
    accessToken: data.access_token,
    expiresAt,
    refreshToken: data.refresh_token ?? null,
  };
}

export async function shopifyGraphQL(
  shop: string,
  accessToken: string,
  gqlQuery: string,
  variables?: Record<string, unknown>,
): Promise<Response> {
  const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: gqlQuery, variables }),
  });
  if (resp.status !== 200) {
    const body = await resp.clone().text();
    console.error(`[graphql] ${resp.status} from ${shop}:`, body.slice(0, 300));
  }
  return resp;
}

export function verifyWebhookHmac(rawBody: string, hmacHeader: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hmacHeader, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export function liquidResponse(body: string, options?: { layout?: boolean }): Response {
  const content = options?.layout === false ? `{% layout none %} ${body}` : body;
  return new Response(content, {
    headers: { "Content-Type": "application/liquid" },
  });
}
