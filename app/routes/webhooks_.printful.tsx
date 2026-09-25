import type { ActionFunctionArgs } from "@remix-run/node";
import { handlePrintfulWebhook } from "~/models/printful.server";

/**
 * Printful webhook (v2). Gövde ham okunur: imza bayt bayt aynı gövdenin
 * HMAC-SHA256'sı. İmzası tutmayan olay 401 ile reddedilir.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const raw = await request.text();
  const signature = request.headers.get("x-pf-webhook-signature") ?? "";
  try {
    const r = await handlePrintfulWebhook(raw, signature);
    return new Response(null, { status: r.status });
  } catch (err) {
    console.error("[printful] webhook işlenemedi:", err);
    // Printful yeniden dener
    return new Response(null, { status: 500 });
  }
};

export const loader = () => new Response(null, { status: 405 });
