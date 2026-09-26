import type { ActionFunctionArgs } from "@remix-run/node";
import { isPaddleWebhookSource } from "~/lib/paddle.server";
import { handlePaddleWebhook } from "~/models/paddle-billing.server";

/** Paddle bildirimleri; yalnız Paddle IP'lerinden, imza ham gövde üzerinden doğrulanır */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!(await isPaddleWebhookSource(request.headers))) {
    console.warn("[paddle] Paddle dışı IP'den bildirim reddedildi:", request.headers.get("x-real-ip"));
    return new Response(null, { status: 403 });
  }
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
