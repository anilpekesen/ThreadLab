import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getShopTemplates } from "~/models/shop-templates.server";
import { runMigrations } from "~/lib/db.server";

let migrated = false;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!migrated) { await runMigrations(); migrated = true; }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  if (!shop) return json({ templates: [] });
  const templates = await getShopTemplates(shop);
  return json({ templates });
};
