import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MemorySessionStorage } from "@shopify/shopify-app-session-storage-memory";
import { PostgreSQLSessionStorage } from "@shopify/shopify-app-session-storage-postgresql";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSessionStorage(): any {
  const url = process.env.DATABASE_URL;
  if (url) {
    return new PostgreSQLSessionStorage(new URL(url));
  }
  return new MemorySessionStorage();
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  apiVersion: ApiVersion.July25,
  scopes: process.env.SCOPES?.split(",") ?? ["write_products", "read_orders", "write_app_proxy"],
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  authPathPrefix: "/auth",
  sessionStorage: buildSessionStorage(),
  distribution: AppDistribution.AppStore,
  useOnlineTokens: true,
  billing: {
    Starter: {
      trialDays: 7,
      lineItems: [{ amount: 9.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    Growth: {
      trialDays: 7,
      lineItems: [{ amount: 19.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    Pro: {
      trialDays: 7,
      lineItems: [{ amount: 39.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    Business: {
      trialDays: 7,
      lineItems: [{ amount: 79.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
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
