import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

const REQUIRED_SCOPES = ["read_products", "write_products", "read_orders", "write_app_proxy"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSessionStorage(): any {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new PostgreSQLSessionStorage(new URL(url));
  }
  return new MemorySessionStorage();
}

function resolveScopes() {
  const envScopes = (process.env.SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return Array.from(new Set([...envScopes, ...REQUIRED_SCOPES]));
}

export const appScopes = resolveScopes();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  apiVersion: ApiVersion.July25,
  scopes: appScopes,
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  authPathPrefix: "/auth",
  sessionStorage: buildSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.July25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

export async function clearShopSessions(shop: string) {
  const storage = sessionStorage as {
    findSessionsByShop?: (shop: string) => Promise<Array<{ id?: string }>>;
    deleteSessions?: (ids: string[]) => Promise<boolean>;
  };

  const sessions = (await storage.findSessionsByShop?.(shop)) ?? [];
  const sessionIds = sessions
    .map((session) => session.id)
    .filter((id): id is string => Boolean(id));

  if (sessionIds.length > 0) {
    await storage.deleteSessions?.(sessionIds);
  }
}

export function buildInstallUrl(shop: string) {
  const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    scope: appScopes.join(","),
  });

  return `https://${cleanShop}/admin/oauth/install?${params.toString()}`;
}
