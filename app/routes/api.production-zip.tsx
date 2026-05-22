import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getOrdersByIds } from "~/models/orders.server";
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
      const frontUrl = order.designFrontPrintUrl || order.productionFileUrl || "";
      const backUrl = order.designBackPrintUrl || "";

      const [frontBuf, backBuf] = await Promise.all([
        fetchBuffer(frontUrl),
        fetchBuffer(backUrl),
      ]);

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
