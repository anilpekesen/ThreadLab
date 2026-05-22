import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getOrdersByIds } from "~/models/orders.server";
import { query } from "~/lib/db.server";
import { zipSync } from "fflate";

async function fetchBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1];
      if (!base64) return null;
      return Buffer.from(base64, "base64");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Extract the raw uploaded image src from design_json for orders that have no
// separate print URL (e.g. older designs that only stored a preview URL).
async function getRawImageSrc(
  shop: string,
  designToken: string,
  side: "front" | "back",
): Promise<string | null> {
  if (!designToken) return null;
  try {
    const result = await query<{ design_json: Record<string, string> }>(
      "SELECT design_json FROM designs WHERE shop = $1 AND token = $2 LIMIT 1",
      [shop, designToken],
    );
    const row = result.rows[0];
    if (!row?.design_json) return null;
    const sideStr = row.design_json[side];
    if (!sideStr) return null;
    const canvas = JSON.parse(sideStr) as { objects?: Array<{ type: string; src?: string }> };
    const imageObj = canvas.objects?.find((o) => o.type === "image" && o.src);
    if (!imageObj?.src) return null;
    let src = imageObj.src;
    if (src.includes("/api/img-proxy?url=")) {
      try {
        const inner = new URL(src).searchParams.get("url");
        if (inner) src = decodeURIComponent(inner);
      } catch {}
    }
    return src;
  } catch {
    return null;
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-#]/g, "_").slice(0, 40);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);

  if (!ids.length) {
    return new Response("ids required", { status: 400 });
  }

  const orders = await getOrdersByIds(shop, ids);
  if (!orders.length) {
    return new Response("no orders found", { status: 404 });
  }

  const files: Record<string, Uint8Array> = {};

  await Promise.all(
    orders.map(async (order) => {
      const folder = sanitize(order.orderNumber || order.id);

      // ── Front print file ─────────────────────────────────────────────
      // Priority: stored print URL → raw image from design JSON
      let frontBuf = await fetchBuffer(order.designFrontPrintUrl ?? "");
      if (!frontBuf && order.designToken) {
        const rawSrc = await getRawImageSrc(shop, order.designToken, "front");
        if (rawSrc) frontBuf = await fetchBuffer(rawSrc);
      }
      if (!frontBuf) {
        frontBuf = await fetchBuffer(order.productionFileUrl || "");
      }

      // ── Back print file ──────────────────────────────────────────────
      let backBuf = await fetchBuffer(order.designBackPrintUrl ?? "");
      if (!backBuf && order.designToken) {
        const rawSrc = await getRawImageSrc(shop, order.designToken, "back");
        if (rawSrc) backBuf = await fetchBuffer(rawSrc);
      }

      if (frontBuf) {
        files[`${folder}/on-baski.png`] = new Uint8Array(frontBuf);
      }
      if (backBuf) {
        files[`${folder}/arka-baski.png`] = new Uint8Array(backBuf);
      }
      if (!frontBuf && !backBuf) {
        const msg = `Sipariş: ${order.orderNumber}\nMüşteri: ${order.customerName}\nÜrün: ${order.productName}\nBaskı dosyası bulunamadı.`;
        files[`${folder}/DOSYA-YOK.txt`] = new TextEncoder().encode(msg);
      }
    }),
  );

  const zipBuffer = zipSync(files, { level: 6 });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `baski-dosyalari-${date}.zip`;

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
};
