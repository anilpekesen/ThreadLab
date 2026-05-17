import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getShopTemplates } from "~/models/shop-templates.server";
import { runMigrations } from "~/lib/db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let migrated = false;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (!migrated) { await runMigrations(); migrated = true; }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  if (!shop) return json({ templates: [] }, { headers: CORS });
  const templates = await getShopTemplates(shop);
  return json({ templates }, { headers: CORS });
};
