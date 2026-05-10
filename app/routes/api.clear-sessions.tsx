import { json, type ActionFunctionArgs } from "@remix-run/node";
import { sessionStorage } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await (sessionStorage as any).query?.(`DELETE FROM shopify_sessions`);
    return json({ ok: true, message: "Sessions cleared" });
  } catch (e: any) {
    return json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
};
