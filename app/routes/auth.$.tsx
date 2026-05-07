import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate, login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/auth/login") {
    return json(await login(request));
  }

  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/auth/login") {
    return json(await login(request));
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
