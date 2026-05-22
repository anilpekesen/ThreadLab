import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getOrdersByIds } from "~/models/orders.server";
import archiver from "archiver";
import { PassThrough } from "stream";

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
  await authenticate.admin(request);

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);

  if (!ids.length) {
    return new Response("ids required", { status: 400 });
  }

  const orders = await getOrdersByIds(ids);
  if (!orders.length) {
    return new Response("no orders found", { status: 404 });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Add files to archive
  const addPromises = orders.map(async (order) => {
    const folder = sanitize(order.orderNumber || order.id);
    const frontUrl = order.designFrontPrintUrl || order.productionFileUrl || "";
    const backUrl = order.designBackPrintUrl || "";

    const [frontBuf, backBuf] = await Promise.all([
      fetchBuffer(frontUrl),
      fetchBuffer(backUrl),
    ]);

    if (frontBuf) {
      archive.append(frontBuf, { name: `${folder}/on-baski.png` });
    }
    if (backBuf) {
      archive.append(backBuf, { name: `${folder}/arka-baski.png` });
    }
    if (!frontBuf && !backBuf) {
      archive.append(
        `Sipariş: ${order.orderNumber}\nMüşteri: ${order.customerName}\nÜrün: ${order.productName}\nBaskı dosyası bulunamadı.`,
        { name: `${folder}/DOSYA-YOK.txt` },
      );
    }
  });

  await Promise.all(addPromises);
  await archive.finalize();

  const date = new Date().toISOString().slice(0, 10);
  const filename = `baski-dosyalari-${date}.zip`;

  const readableStream = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
