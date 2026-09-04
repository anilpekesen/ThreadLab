import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
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

// Look up the complete rendered print URL from the designs table.
// This is the full canvas export (image + text + all elements), stored when
// the customer finishes designing. Falls back to empty string if not found.
async function getDesignPrintUrls(
  designToken: string,
): Promise<{ frontPrintUrl: string; backPrintUrl: string; pieces: Array<{ name?: string; url?: string }> }> {
  if (!designToken) return { frontPrintUrl: "", backPrintUrl: "", pieces: [] };
  try {
    const result = await query<{
      front_print_url: string;
      back_print_url: string;
      design_json: { pieces?: Array<{ name?: string; url?: string }> } | null;
    }>(
      "SELECT front_print_url, back_print_url, design_json FROM designs WHERE token = $1 LIMIT 1",
      [designToken],
    );
    const row = result.rows[0];
    return {
      frontPrintUrl: row?.front_print_url ?? "",
      backPrintUrl: row?.back_print_url ?? "",
      // Set ürünlerinde parça listesi burada; sipariş kaydında liste yoksa
      // (düzeltmeden önce gelen siparişler) tek kaynak bu.
      pieces: Array.isArray(row?.design_json?.pieces) ? row!.design_json!.pieces! : [],
    };
  } catch {
    return { frontPrintUrl: "", backPrintUrl: "", pieces: [] };
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-#]/g, "_").slice(0, 40);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
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
      // Priority:
      // 1. order.designFrontPrintUrl  (copied from designs table at order time)
      // 2. designs.front_print_url    (the full canvas render: image + text)
      // 3. order.productionFileUrl    (legacy field)
      let frontUrl = order.designFrontPrintUrl ?? "";
      let backUrl = order.designBackPrintUrl ?? "";
      let parcalar: Array<{ name?: string; url?: string }> = [];

      if ((!frontUrl || !backUrl) && order.designToken) {
        const { frontPrintUrl, backPrintUrl, pieces } = await getDesignPrintUrls(order.designToken);
        if (!frontUrl && frontPrintUrl) frontUrl = frontPrintUrl;
        if (!backUrl && backPrintUrl) backUrl = backPrintUrl;
        parcalar = pieces;
      }

      if (!frontUrl) frontUrl = order.productionFileUrl || "";

      // ── Set ürünleri ─────────────────────────────────────────────────
      // Bir sipariş satırı birden fazla dosya taşıyorsa hepsi klasöre girmeli;
      // yalnızca ilkini koymak üretime eksik iş çıkarır.
      const setUrls = (order.productionFiles ?? []).filter(Boolean);
      if (setUrls.length > 1 || parcalar.length > 1) {
        const liste = setUrls.length > 1
          ? setUrls.map((u, i) => ({ url: u, name: parcalar[i]?.name }))
          : parcalar.map((p) => ({ url: p.url ?? "", name: p.name }));

        const bufs = await Promise.all(liste.map((x) => fetchBuffer(x.url)));
        let eklenen = 0;
        bufs.forEach((buf, i) => {
          if (!buf) return;
          const ad = sanitize(liste[i].name || `parca-${i + 1}`);
          files[`${folder}/${String(i + 1).padStart(2, "0")}-${ad}.png`] = new Uint8Array(buf);
          eklenen++;
        });
        if (eklenen > 0) return;
      }

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
