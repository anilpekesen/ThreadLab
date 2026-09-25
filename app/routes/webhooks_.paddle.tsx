import type { ActionFunctionArgs } from "@remix-run/node";
import { handlePaddleWebhook } from "~/models/paddle-billing.server";

/** Paddle bildirimleri; imza ham gövde üzerinden doğrulanır */
export const action = async ({ request }: ActionFunctionArgs) => {
  const raw = await request.text();
  try {
    return new Response(null, { status: await handlePaddleWebhook(raw, request.headers) });
  } catch (err) {
    // 500: Paddle bildirimi yeniden dener
    console.error("[paddle] webhook işlenemedi:", err);
    return new Response(null, { status: 500 });
  }
};

export const loader = () => new Response(null, { status: 405 });
