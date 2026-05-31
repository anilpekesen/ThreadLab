import "@shopify/shopify-app-remix/server/adapters/node";
import { ApiVersion, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

const scopes = (process.env.SCOPES ?? "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const sessionStorage = process.env.DATABASE_URL
  ? new PostgreSQLSessionStorage(process.env.DATABASE_URL)
  : undefined;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  apiVersion: ApiVersion.April26,
  scopes,
  sessionStorage,
  isEmbeddedApp: true,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const authenticateShopify = shopify.authenticate;
export const authenticateAdmin = shopify.authenticate.admin;
export const login = shopify.login;

export function addDocumentResponseHeaders(request: Request, headers: Headers) {
  shopify.addDocumentResponseHeaders(request, headers);
}
