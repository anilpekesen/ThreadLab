import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { getOrdersByIds } from "~/models/orders.server";
import { getShopSubscription } from "~/models/billing.server";
import { planKeyFromName } from "~/lib/billing.server";
import { query } from "~/lib/db.server";
import sharp from "sharp";
import { strToU8, zipSync } from "fflate";

const SHEET_PRESETS: Record<string, { width: number; height: number | null; pxPerMm: number }> = {
  a4: { width: 2480, height: 3508, pxPerMm: 300 / 25.4 },
  a4l: { width: 3508, height: 2480, pxPerMm: 300 / 25.4 },
  a3: { width: 3508, height: 4961, pxPerMm: 300 / 25.4 },
  a3l: { width: 4961, height: 3508, pxPerMm: 300 / 25.4 },
  dtf60: { width: 3543, height: null, pxPerMm: 150 / 25.4 },
  dtf100: { width: 5906, height: null, pxPerMm: 150 / 25.4 },
};

const CANVAS_LOGICAL_W = 960;
const CANVAS_LOGICAL_H = 1160;

type Side = "front" | "back";

function canUsePrintQueue(planKey: string, subscriptionStatus?: string | null): boolean {
  return (planKey === "Pro" || planKey === "Business")
    && (subscriptionStatus === "active" || subscriptionStatus === "trial");
}

interface PrintItem {
  buffer: Buffer;
  targetW: number;
  targetH: number;
  label: string;
  orderNumber: string;
  productName: string;
  variantTitle: string;
  side: Side;
}

interface Placement {
  item: PrintItem;
  x: number;
  y: number;
  w: number;
  h: number;
  imageH: number;
}

interface SheetResult {
  buffer: Buffer;
  width: number;
  height: number;
  utilization: number;
  placements: Placement[];
}

function xml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csv(input: string | number): string {
  return `"${String(input ?? "").replace(/"/g, '""')}"`;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function printArea(shop: string, productId: string, side: Side) {
  if (!productId) return null;
  for (const s of [side, "front"] as const) {
    const result = await query<{
      real_width_mm: number;
      real_height_mm: number;
      width: number;
      height: number;
    }>(
      "SELECT real_width_mm, real_height_mm, width, height FROM product_print_areas WHERE shop = $1 AND product_id = $2 AND side = $3 LIMIT 1",
      [shop, productId, s],
    );
    const row = result.rows[0];
    if (row?.real_width_mm && row?.real_height_mm) {
      return {
        sizeMm: { w: row.real_width_mm, h: row.real_height_mm },
        canvasW: row.width || 480,
        canvasH: row.height || 580,
      };
    }
  }
  return null;
}

async function trimArtwork(raw: Buffer) {
  let buffer = raw;
  let width = CANVAS_LOGICAL_W;
  let height = CANVAS_LOGICAL_H;
  try {
    const meta = await sharp(raw).metadata();
    if (meta.width) width = meta.width;
    if (meta.height) height = meta.height;

    const { data: pixels, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgba = Buffer.from(pixels);
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (r > 240 && g > 240 && b > 240) rgba[i + 3] = 0;
    }
    const transparent = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    const trimmed = await sharp(transparent)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (trimmed.info.width > 0 && trimmed.info.height > 0) {
      buffer = trimmed.data;
      width = trimmed.info.width;
      height = trimmed.info.height;
    }
  } catch {
    // Use original if trim fails.
  }
  return { buffer, width, height };
}

async function buildItems(
  shop: string,
  orders: Awaited<ReturnType<typeof getOrdersByIds>>,
  side: Side,
  pxPerMm: number,
  columns: number,
  sheetWidth: number,
  margin: number,
): Promise<PrintItem[]> {
  const items: PrintItem[] = [];
  await Promise.all(orders.map(async (order) => {
    const source = side === "front"
      ? (order.designFrontPrintUrl || order.productionFileUrl || "")
      : (order.designBackPrintUrl || "");
    const raw = await fetchBuffer(source);
    if (!raw) return;

    const originalMeta = await sharp(raw).metadata().catch(() => ({ width: CANVAS_LOGICAL_W, height: CANVAS_LOGICAL_H }));
    const origW = originalMeta.width || CANVAS_LOGICAL_W;
    const origH = originalMeta.height || CANVAS_LOGICAL_H;
    const trimmed = await trimArtwork(raw);
    const area = await printArea(shop, order.productId ?? "", side);

    let targetW = trimmed.width;
    let targetH = trimmed.height;
    if (area) {
      const refW = (area.canvasW / 480) * origW;
      const refH = (area.canvasH / 580) * origH;
      targetW = Math.max(10, Math.round((trimmed.width / refW) * area.sizeMm.w * pxPerMm));
      targetH = Math.max(10, Math.round((trimmed.height / refH) * area.sizeMm.h * pxPerMm));
    }

    const qty = Math.max(1, order.quantity ?? 1);
    for (let i = 1; i <= qty; i++) {
      items.push({
        buffer: trimmed.buffer,
        targetW,
        targetH,
        label: `${order.orderNumber} · ${order.variantTitle || "STD"} · ${i}/${qty}`,
        orderNumber: order.orderNumber,
        productName: order.productName || "",
        variantTitle: order.variantTitle || "",
        side,
      });
    }
  }));

  if (columns > 0) {
    const maxItemW = Math.floor((sheetWidth - (columns + 1) * margin) / columns);
    for (const item of items) {
      if (item.targetW > maxItemW) {
        item.targetH = Math.round((item.targetH * maxItemW) / item.targetW);
        item.targetW = maxItemW;
      }
    }
  }

  return items.sort((a, b) => b.targetH - a.targetH);
}

async function buildSheet(
  items: PrintItem[],
  sheetWidth: number,
  fixedHeight: number | null,
  margin: number,
  labels: boolean,
): Promise<SheetResult | null> {
  if (!items.length) return null;
  const labelH = labels ? 42 : 0;
  const bg = { r: 0, g: 0, b: 0, alpha: 0 };
  const maxW = sheetWidth - 2 * margin;
  const maxH = fixedHeight ? fixedHeight - 2 * margin : Infinity;
  const placements: Placement[] = [];

  let x = margin;
  let y = margin;
  let rowH = 0;
  for (const item of items) {
    let w = item.targetW;
    let imageH = item.targetH;
    if (w > maxW) {
      imageH = Math.round((imageH * maxW) / w);
      w = maxW;
    }
    if (imageH + labelH > maxH) {
      const available = Math.max(10, Math.round(maxH) - labelH);
      w = Math.round((w * available) / imageH);
      imageH = available;
    }
    const h = imageH + labelH;
    if (x > margin && x + w + margin > sheetWidth) {
      y += rowH + margin;
      x = margin;
      rowH = 0;
    }
    placements.push({ item, x, y, w, h, imageH });
    x += w + margin;
    rowH = Math.max(rowH, h);
  }

  const height = Math.max(fixedHeight ?? y + rowH + margin, 100);
  const overlays = (
    await Promise.all(placements.map(async (p) => {
      const image = await sharp(p.item.buffer)
        .ensureAlpha()
        .resize(p.w, p.imageH, { fit: "inside", withoutEnlargement: false, background: bg })
        .png()
        .toBuffer();
      const ops: sharp.OverlayOptions[] = [{ input: image, left: p.x, top: p.y + labelH }];
      if (labels) {
        const svg = Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${labelH}">
            <rect width="${p.w}" height="${labelH}" rx="5" fill="rgba(255,255,255,.94)" stroke="rgba(15,23,42,.45)" />
            <text x="8" y="17" font-family="Arial" font-size="13" font-weight="700" fill="#0f172a">${xml(p.item.label)}</text>
            <text x="8" y="33" font-family="Arial" font-size="11" fill="#475569">${xml(p.item.productName.slice(0, 45))}</text>
          </svg>
        `);
        ops.unshift({ input: svg, left: p.x, top: p.y });
      }
      return ops;
    }))
  ).flat();

  const buffer = await sharp({
    create: { width: sheetWidth, height, channels: 4, background: bg },
  }).composite(overlays).png({ compressionLevel: 6 }).toBuffer();

  const used = placements.reduce((sum, p) => sum + p.w * p.h, 0);
  const utilization = Math.round((used / (sheetWidth * height)) * 1000) / 10;
  return { buffer, width: sheetWidth, height, utilization, placements };
}

function cutList(results: Array<SheetResult | null>) {
  const rows = [["Order", "Product", "Variant", "Side", "Label", "X", "Y", "Width", "Height"]];
  for (const result of results) {
    for (const p of result?.placements ?? []) {
      rows.push([
        p.item.orderNumber,
        p.item.productName,
        p.item.variantTitle,
        p.item.side,
        p.item.label,
        String(p.x),
        String(p.y),
        String(p.w),
        String(p.h),
      ]);
    }
  }
  return rows.map((row) => row.map(csv).join(",")).join("\n");
}

function summaryHtml(args: {
  date: string;
  preset: string;
  orders: Awaited<ReturnType<typeof getOrdersByIds>>;
  front: SheetResult | null;
  back: SheetResult | null;
}) {
  const totalQty = args.orders.reduce((sum, o) => sum + Math.max(1, o.quantity ?? 1), 0);
  const rows = args.orders.map((o) => `
    <tr><td>${xml(o.orderNumber)}</td><td>${xml(o.productName)}</td><td>${xml(o.variantTitle)}</td><td>${o.quantity ?? 1}</td><td>${xml(o.productionStatus)}</td></tr>
  `).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Print Queue Summary</title>
  <style>body{font-family:Arial,sans-serif;margin:32px;color:#111827}h1{margin:0 0 6px}.muted{color:#64748b}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px}.value{font-size:24px;font-weight:800}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}th{background:#f8fafc}</style>
  </head><body><h1>Print Queue Auto Build</h1><div class="muted">${xml(args.date)} · ${xml(args.preset)}</div>
  <div class="cards"><div class="card"><div class="value">${args.orders.length}</div><div>Orders</div></div><div class="card"><div class="value">${totalQty}</div><div>Units</div></div><div class="card"><div class="value">${args.front?.utilization ?? 0}%</div><div>Front fill</div></div><div class="card"><div class="value">${args.back?.utilization ?? 0}%</div><div>Back fill</div></div></div>
  <table><thead><tr><th>Order</th><th>Product</th><th>Variant</th><th>Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const sub = await getShopSubscription(shop);
  const planKey = planKeyFromName(sub?.plan_key) ?? "Pro";
  if (!canUsePrintQueue(planKey, sub?.subscription_status)) {
    return new Response("Pro or Business plan required", { status: 403 });
  }

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  if (!ids.length) return new Response("ids required", { status: 400 });

  const preset = url.searchParams.get("preset") ?? "dtf60";
  const config = SHEET_PRESETS[preset] ?? SHEET_PRESETS.dtf60;
  const margin = Math.max(0, Math.min(200, Number(url.searchParams.get("margin") ?? 20)));
  const columns = Math.max(0, Math.min(10, Number(url.searchParams.get("cols") ?? 0)));
  const labels = url.searchParams.get("labels") !== "0";
  const date = new Date().toISOString().slice(0, 10);

  const orders = await getOrdersByIds(shop, ids);
  if (!orders.length) return new Response("no orders found", { status: 404 });

  const [frontItems, backItems] = await Promise.all([
    buildItems(shop, orders, "front", config.pxPerMm, columns, config.width, margin),
    buildItems(shop, orders, "back", config.pxPerMm, columns, config.width, margin),
  ]);
  const [front, back] = await Promise.all([
    buildSheet(frontItems, config.width, config.height, margin, labels),
    buildSheet(backItems, config.width, config.height, margin, labels),
  ]);
  if (!front && !back) return new Response("no valid print images found", { status: 404 });

  const manifest = {
    preset,
    date,
    orderCount: orders.length,
    unitCount: orders.reduce((sum, o) => sum + Math.max(1, o.quantity ?? 1), 0),
    front: front ? { width: front.width, height: front.height, utilization: front.utilization, waste: Math.round((100 - front.utilization) * 10) / 10 } : null,
    back: back ? { width: back.width, height: back.height, utilization: back.utilization, waste: Math.round((100 - back.utilization) * 10) / 10 } : null,
  };

  const files: Record<string, Uint8Array> = {
    "cut-list.csv": strToU8(cutList([front, back])),
    "orders-summary.html": strToU8(summaryHtml({ date, preset, orders, front, back })),
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  };
  if (front) files[`print-queue-front-${date}.png`] = new Uint8Array(front.buffer);
  if (back) files[`print-queue-back-${date}.png`] = new Uint8Array(back.buffer);

  const zip = zipSync(files, { level: 6 });
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="print-queue-${date}.zip"`,
      "X-Front-Utilization": String(front?.utilization ?? 0),
      "X-Back-Utilization": String(back?.utilization ?? 0),
    },
  });
};
