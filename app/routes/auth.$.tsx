import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticateShopify } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateShopify.admin(request);
  return null;
};
