import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createOrderFromPixel } from "~/models/orders.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const body = await request.json() as {
      shop?: string;
      orderId?: string;
      orderNumber?: string;
      designToken?: string;
      frontPreviewUrl?: string;
      frontPrintUrl?: string;
      productName?: string;
      variantId?: string;
      productId?: string;
    };

    if (!body.designToken) {
      return json({ error: "missing design_token" }, { status: 400, headers: CORS });
    }

    await createOrderFromPixel({ ...body, shop: body.shop ?? "" });
    return json({ ok: true }, { headers: CORS });
  } catch (e) {
    return json({ error: String(e) }, { status: 500, headers: CORS });
  }
};

// Web pixels call via fetch; OPTIONS preflight must be handled
export const loader = async () => {
  return new Response(null, { status: 405, headers: CORS });
};
