import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticateShopify, login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/auth/login") {
    return login(request);
  }

  await authenticateShopify.admin(request);
  return null;
};
