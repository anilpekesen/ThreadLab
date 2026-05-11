import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate, login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  console.log("[auth-route] path:", url.pathname, "params:", Object.fromEntries(url.searchParams.entries()));
  if (url.pathname === "/auth/login") {
    return login(request);
  }
  try {
    const { redirect } = await authenticate.admin(request);
    console.log("[auth-route] authenticate.admin succeeded for", url.pathname);
    if (url.pathname === "/auth") {
      const returnTo = url.searchParams.get("returnTo") || "/app";
      throw redirect(returnTo, { target: "_self" });
    }
  } catch (e: unknown) {
    if (e instanceof Response) {
      console.log("[auth-route] Response thrown status:", e.status, "location:", e.headers.get("location"));
      throw e;
    }
    console.error("[auth-route] Error:", String(e));
    throw e;
  }
  return json({ ok: true });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/auth/login") {
    return login(request);
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
