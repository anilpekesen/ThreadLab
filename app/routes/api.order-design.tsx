import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getOrderByShopifyId } from "~/models/orders.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  // Accept either "gid://shopify/Order/12345" or just "12345"
  const raw = url.searchParams.get("shopify_order_id") ?? "";
  const shopifyOrderId = raw.includes("/") ? raw.split("/").pop()! : raw;

  if (!shopifyOrderId) {
    return json({ error: "shopify_order_id required" }, { status: 400, headers: CORS });
  }

  const order = await getOrderByShopifyId(shopifyOrderId);
  if (!order) {
    return json({ found: false }, { status: 200, headers: CORS });
  }

  const frontPreviewUrl = order.designFrontPreviewUrl || order.previewUrl || null;
  const backPreviewUrl = order.designBackPreviewUrl || null;
  const frontPrintUrl = order.designFrontPrintUrl || order.productionFileUrl || null;
  const backPrintUrl = order.designBackPrintUrl || null;

  return json(
    {
      found: true,
      orderNumber: order.orderNumber,
      productName: order.productName,
      designToken: order.designToken,
      productionStatus: order.productionStatus,
      frontPreviewUrl,
      backPreviewUrl,
      frontPrintUrl,
      backPrintUrl,
    },
    { headers: CORS },
  );
};
