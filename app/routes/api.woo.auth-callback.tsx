import type { ActionFunctionArgs } from "@remix-run/node";
import { connectWoo } from "~/models/woo.server";

/**
 * WooCommerce wc-auth callback: mağaza onaylayınca REST anahtarlarını buraya
 * POST eder (key_id, user_id, consumer_key, consumer_secret, key_permissions).
 * 200 dışı bir yanıtta WooCommerce kullanıcıya hata gösterir.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { return new Response("bad request", { status: 400 }); }
  const userId = String(body.user_id ?? "");
  const consumerKey = String(body.consumer_key ?? "");
  const consumerSecret = String(body.consumer_secret ?? "");
  if (!userId || !consumerKey.startsWith("ck_") || !consumerSecret.startsWith("cs_") || body.key_permissions !== "read_write") {
    return new Response("bad request", { status: 400 });
  }
  try {
    const { shop } = await connectWoo({ userId, consumerKey, consumerSecret });
    console.log(`[woo] bağlandı: ${shop}`);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[woo] bağlanılamadı:", err);
    return new Response("connection failed", { status: 400 });
  }
};

export const loader = () => new Response(null, { status: 405 });
