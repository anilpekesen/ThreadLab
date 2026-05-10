import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { sessionStorage } from "~/shopify.server";

async function clearSessions(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const storage = sessionStorage as any;
    await storage.client?.query?.(`DELETE FROM shopify_sessions`);
    return json({ ok: true, message: "Sessions cleared" });
  } catch (e: any) {
    return json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => clearSessions(request);
export const action = async ({ request }: ActionFunctionArgs) => clearSessions(request);
