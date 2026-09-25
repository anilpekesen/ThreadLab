import type { ActionFunctionArgs } from "@remix-run/node";
import { handleWooWebhook } from "~/models/woo.server";

/** WooCommerce sipariş webhook'u; imza gövdenin ham baytları üzerinden */
export const action = async ({ request }: ActionFunctionArgs) => {
  const raw = await request.text();
  try {
    return new Response(null, { status: await handleWooWebhook(raw, request.headers) });
  } catch (err) {
    console.error("[woo] webhook işlenemedi:", err);
    return new Response(null, { status: 500 });
  }
};

export const loader = () => new Response(null, { status: 405 });
