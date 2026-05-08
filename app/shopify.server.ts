import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import path from "node:path";

const dbPath = path.join(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || process.cwd(),
  "data",
  "sessions.db"
);
const storage = new SQLiteSessionStorage(dbPath);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  apiVersion: ApiVersion.July25,
  scopes: process.env.SCOPES?.split(",") ?? ["write_products", "read_orders"],
  appUrl: process.env.SHOPIFY_APP_URL ?? "",
  authPathPrefix: "/auth",
  sessionStorage: storage as any,
  distribution: AppDistribution.AppStore,
  billing: {
    Starter: {
      lineItems: [{ amount: 9.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      trialDays: 7,
    },
    Growth: {
      lineItems: [{ amount: 19.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      trialDays: 7,
    },
    Pro: {
      lineItems: [{ amount: 39.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      trialDays: 7,
    },
    Business: {
      lineItems: [{ amount: 79.99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      trialDays: 7,
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
