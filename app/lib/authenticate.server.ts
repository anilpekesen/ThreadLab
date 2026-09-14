import { redirect } from "@remix-run/node";
import { authenticateAdmin as authenticateEmbeddedAdmin } from "~/shopify.server";
import { createShopSession, getShopFromSession, getValidAccessToken } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";
import { stripSignedShopParams, verifySignedShopRequest } from "./signed-shop-link.server";

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

/**
 * Gömülü belirteç taşımayan bir istekte oturumu sunucunun imzaladığı
 * bağlantıdan kurar (bkz. signed-shop-link.server).
 *
 * Eskiden `?shop=` tek başına yetiyordu: mağaza alan adını bilen herkes o
 * mağaza adına oturum çerezi alabiliyordu. Artık imza, yol ve süre
 * doğrulanmadan hiçbir şey yapılmaz.
 *
 * Sayfa dönüşlerinde (ödeme onayı) çerez verilip temiz adrese yönlendirilir;
 * sonraki gezinti o çerezle sürer. `/api/` altındaki indirmelerde çerez
 * verilmez, imza yalnızca o isteği doğrular: sızan bir indirme bağlantısı
 * yönetim paneline giriş sağlamamalı.
 */
async function maybeBootstrapSignedSession(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const shop = verifySignedShopRequest(url);
  if (!shop) return null;

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) return null;

  if (url.pathname.startsWith("/api/")) return shop;

  const cleanUrl = stripSignedShopParams(url);
  throw redirect(`${cleanUrl.pathname}${cleanUrl.search}`, {
    headers: {
      "Set-Cookie": await createShopSession(shop),
    },
  });
}

async function authenticateWithLegacySession(request: Request, signedShop: string | null = null) {
  const shop = signedShop ?? await getShopFromSession(request);
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
  const url = new URL(request.url);
  const hasOnlyShopReturnSignal = Boolean(url.searchParams.get("shop")) && !hasEmbeddedSignals(request);

  if (!legacyShop && hasOnlyShopReturnSignal) {
    const signedShop = await maybeBootstrapSignedSession(request);
    if (signedShop) return authenticateWithLegacySession(request, signedShop);
  }

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
