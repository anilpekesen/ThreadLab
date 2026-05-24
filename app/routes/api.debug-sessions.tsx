import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { query } from "~/lib/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await query(
      `SELECT id, shop, scope, expires, "isOnline" FROM shopify_sessions LIMIT 20`,
    );
    return json({ sessions: result.rows });
  } catch (e: unknown) {
    return json({ error: (e as Error)?.message ?? "Failed" }, { status: 500 });
  }
};
