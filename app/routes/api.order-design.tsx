import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getOrderByShopifyId } from "~/models/orders.server";
import { getDesignByToken, extractObjects } from "~/models/designs.server";

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

  const design = order.designToken ? await getDesignByToken(order.designToken) : null;
  const frontObjects = design ? extractObjects(design.designJson, "front") : [];
  const backObjects = design ? extractObjects(design.designJson, "back") : [];

  const toSummary = (objs: ReturnType<typeof extractObjects>) =>
    objs
      .filter((o) => o.type === "i-text" || o.type === "textbox" || o.type === "image")
      .map((o) => ({
        type: o.type,
        text: o.text ?? null,
        fontFamily: o.fontFamily ?? null,
        fontSize: o.fontSize ?? null,
        fill: o.fill ?? null,
        hasImage: o.type === "image",
      }));

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
      frontObjects: toSummary(frontObjects),
      backObjects: toSummary(backObjects),
    },
    { headers: CORS },
  );
};
