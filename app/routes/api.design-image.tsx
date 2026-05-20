import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getOrder } from "~/models/orders.server";
import { getDesignByToken, extractObjects } from "~/models/designs.server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id") ?? "";
  const side = (url.searchParams.get("side") ?? "front") as "front" | "back";
  const index = parseInt(url.searchParams.get("index") ?? "0", 10);

  if (!orderId) {
    return json({ error: "order_id required" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order?.designToken) {
    return json({ error: "Order not found" }, { status: 404 });
  }

  const design = await getDesignByToken(order.designToken);
  if (!design) {
    return json({ error: "Design not found" }, { status: 404 });
  }

  const allObjects = extractObjects(design.designJson, side);
  const imageObjects = allObjects.filter((o) => o.type === "image" && o.src);
  const obj = imageObjects[index];

  if (!obj?.src) {
    return json({ error: "Image not found" }, { status: 404 });
  }

  const src = obj.src;
  const filenameBase = `tasarim-gorsel-${index + 1}`;

  // Data URL: decode base64 and serve as binary
  if (src.startsWith("data:")) {
    const commaIdx = src.indexOf(",");
    if (commaIdx === -1) return json({ error: "Invalid data URL" }, { status: 400 });
    const header = src.slice(0, commaIdx);
    const b64 = src.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const ext = mime.split("/")[1]?.split("+")[0] ?? "png";
    const buffer = Buffer.from(b64, "base64");
    return new Response(buffer, {
      headers: {
        ...corsHeaders(),
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${filenameBase}.${ext}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // HTTPS URL: proxy it
  try {
    const upstream = await fetch(src);
    if (!upstream.ok) return json({ error: "Upstream error" }, { status: 502 });
    const ct = upstream.headers.get("content-type") ?? "image/png";
    const ext = ct.split("/")[1]?.split(";")[0]?.split("+")[0] ?? "png";
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders(),
        "Content-Type": ct,
        "Content-Disposition": `attachment; filename="${filenameBase}.${ext}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return json({ error: "Failed to fetch image" }, { status: 502 });
  }
};
