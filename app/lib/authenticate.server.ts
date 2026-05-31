import { redirect } from "@remix-run/node";
import { authenticateAdmin as authenticateEmbeddedAdmin } from "~/shopify.server";
import { createShopSession, getShopFromSession, getValidAccessToken } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";

function isValidShop(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function hasEmbeddedSignals(request: Request): boolean {
  const url = new URL(request.url);
  return Boolean(
    request.headers.get("authorization")
    || url.searchParams.get("id_token")
    || url.searchParams.get("host")
    || url.searchParams.get("embedded")
    || url.searchParams.get("session"),
  );
}

async function maybeBootstrapLegacySession(request: Request): Promise<never | null> {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  if (!isValidShop(shop)) return null;

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) return null;

  const cleanUrl = new URL(request.url);
  ["shop", "host", "embedded", "hmac", "id_token", "session", "timestamp"].forEach((key) => {
    cleanUrl.searchParams.delete(key);
  });

  const sameTarget = cleanUrl.pathname + cleanUrl.search === url.pathname + url.search;
  if (sameTarget) return null;

  throw redirect(`${cleanUrl.pathname}${cleanUrl.search}`, {
    headers: {
      "Set-Cookie": await createShopSession(shop),
    },
  });
}

async function authenticateWithLegacySession(request: Request) {
  await maybeBootstrapLegacySession(request);

  const shop = await getShopFromSession(request);
  if (!shop) {
    const url = new URL(request.url);
    const shopParam = url.searchParams.get("shop");
    throw redirect(shopParam ? `/auth/login?shop=${encodeURIComponent(shopParam)}` : "/");
  }

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) throw redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);

  return {
    shop,
    session: { shop },
    admin: {
      graphql: async (gqlQuery: string, opts?: { variables?: Record<string, unknown> }) => {
        const resp = await shopifyGraphQL(shop, accessToken, gqlQuery, opts?.variables);
        if (resp.status === 401 || resp.status === 403) {
          console.error(`[auth] Shopify API ${resp.status} for ${shop} — token may need rotation`);
        }
        return resp;
      },
    },
  };
}

export async function authenticate(request: Request) {
  const legacyShop = await getShopFromSession(request);
  const shouldUseEmbeddedAuth = hasEmbeddedSignals(request) || !legacyShop;

  if (shouldUseEmbeddedAuth) {
    try {
      const context = await authenticateEmbeddedAdmin(request);
      return {
        ...context,
        shop: context.session.shop,
      };
    } catch (error) {
      if (error instanceof Response) throw error;
      if (!legacyShop) {
        console.error("[auth] embedded auth failed without legacy session", error);
        throw error;
      }
      console.error("[auth] embedded auth failed, falling back to legacy session", error);
    }
  }

  return authenticateWithLegacySession(request);
}
