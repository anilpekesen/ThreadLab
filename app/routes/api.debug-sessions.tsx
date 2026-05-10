import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { sessionStorage } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const storage = sessionStorage as any;
    const rows = await storage.client?.query?.(`SELECT id, shop, scope, expires, "isOnline" FROM shopify_sessions LIMIT 20`);
    return json({ sessions: rows ?? [] });
  } catch (e: any) {
    return json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
};
