import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getOrdersByIds } from "~/models/orders.server";
import { query } from "~/lib/db.server";
import sharp from "sharp";

const SHEET_PRESETS: Record<string, { width: number; height: number | null; pxPerMm: number }> = {
  "a4":     { width: 2480, height: 3508, pxPerMm: 300 / 25.4 },
  "a4l":    { width: 3508, height: 2480, pxPerMm: 300 / 25.4 },
  "a3":     { width: 3508, height: 4961, pxPerMm: 300 / 25.4 },
  "a3l":    { width: 4961, height: 3508, pxPerMm: 300 / 25.4 },
  "dtf60":  { width: 3543, height: null, pxPerMm: 150 / 25.4 },
  "dtf100": { width: 5906, height: null, pxPerMm: 150 / 25.4 },
};

// Designer canvas logical size (px)
const CANVAS_LOGICAL_W = 480;
const CANVAS_LOGICAL_H = 580;

async function fetchBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1];
      if (!base64) return null;
      return Buffer.from(base64, "base64");
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

interface DesignImageInfo {
  src: string;
  renderedW: number; // canvas logical px, already accounts for scaleX
  renderedH: number;
}

// Extract the raw uploaded image src + its rendered dimensions from the design JSON.
// renderedW/H are in canvas logical coordinates (480×580 space).
async function getDesignImageInfo(
  shop: string,
  designToken: string,
  side: "front" | "back",
): Promise<DesignImageInfo | null> {
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
    const canvas = JSON.parse(sideStr) as {
      objects?: Array<{
        type: string;
        src?: string;
        width?: number;
        height?: number;
        scaleX?: number;
        scaleY?: number;
      }>;
    };
    const imageObj = canvas.objects?.find((o) => o.type === "image" && o.src);
    if (!imageObj?.src) return null;

    let src = imageObj.src;
    if (src.includes("/api/img-proxy?url=")) {
      try {
        const inner = new URL(src).searchParams.get("url");
        if (inner) src = decodeURIComponent(inner);
      } catch {}
    }

    const renderedW = Math.max(1, (imageObj.width ?? CANVAS_LOGICAL_W) * (imageObj.scaleX ?? 1));
    const renderedH = Math.max(1, (imageObj.height ?? CANVAS_LOGICAL_H) * (imageObj.scaleY ?? 1));

    return { src, renderedW, renderedH };
  } catch {
    return null;
  }
}

// Get physical print dimensions in mm for a product/side from DB
async function getPrintSizeMm(
  shop: string,
  productId: string,
  side: "front" | "back",
): Promise<{ w: number; h: number } | null> {
  if (!productId) return null;
  try {
    for (const s of [side, "front"] as const) {
      const result = await query<{ real_width_mm: number; real_height_mm: number }>(
        "SELECT real_width_mm, real_height_mm FROM product_print_areas WHERE shop = $1 AND product_id = $2 AND side = $3 LIMIT 1",
        [shop, productId, s],
      );
      const row = result.rows[0];
      if (row?.real_width_mm && row?.real_height_mm) {
        return { w: row.real_width_mm, h: row.real_height_mm };
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface GangItem {
  buffer: Buffer;
  targetW: number;
  targetH: number;
}

interface Placement {
  buffer: Buffer;
  x: number;
  y: number;
  w: number;
  h: number;
}

async function buildGangSheet(
  items: GangItem[],
  sheetWidth: number,
  fixedHeight: number | null,
  margin: number,
): Promise<Buffer> {
  const bg = { r: 0, g: 0, b: 0, alpha: 0 };

  const sorted = [...items].sort((a, b) => b.targetH - a.targetH);

  const placed: Placement[] = [];
  let curX = margin;
  let curY = margin;
  let shelfH = 0;

  for (const item of sorted) {
    let w = item.targetW;
    let h = item.targetH;
    const maxW = sheetWidth - 2 * margin;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }
    if (curX + w + margin > sheetWidth && curX > margin) {
      curY += shelfH + margin;
      curX = margin;
      shelfH = 0;
    }
    placed.push({ buffer: item.buffer, x: curX, y: curY, w, h });
    curX += w + margin;
    if (h > shelfH) shelfH = h;
  }

  const totalHeight = fixedHeight ?? curY + shelfH + margin;

  const compositeOps: sharp.OverlayOptions[] = await Promise.all(
    placed.map(async (p) => {
      const resized = await sharp(p.buffer)
        .resize(p.w, p.h, { fit: "fill", background: bg })
        .png()
        .toBuffer();
      return { input: resized, left: p.x, top: p.y } as sharp.OverlayOptions;
    }),
  );

  return sharp({
    create: { width: sheetWidth, height: Math.max(totalHeight, 100), channels: 4, background: bg },
  })
    .composite(compositeOps)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);
  const preset = url.searchParams.get("preset") ?? "dtf60";
  const margin = Math.max(0, Math.min(200, parseInt(url.searchParams.get("margin") ?? "20", 10)));
  const columns = Math.max(0, Math.min(10, parseInt(url.searchParams.get("cols") ?? "0", 10)));
  const side = url.searchParams.get("side") === "back" ? "back" : "front";

  if (!ids.length) return new Response("ids required", { status: 400 });

  const orders = await getOrdersByIds(shop, ids);
  if (!orders.length) return new Response("no orders found", { status: 404 });

  const sheetConfig = SHEET_PRESETS[preset] ?? SHEET_PRESETS["dtf60"];
  const pxPerMm = sheetConfig.pxPerMm;
  const items: GangItem[] = [];

  await Promise.all(
    orders.map(async (order) => {
      const sizeMm = await getPrintSizeMm(shop, order.productId ?? "", side);

      // ── Priority A: Raw uploaded image from design JSON ──────────────
      // Uses the original source image at the size the user set on the canvas.
      // This avoids canvas-render artifacts and gives the cleanest print file.
      if (order.designToken) {
        const info = await getDesignImageInfo(shop, order.designToken, side);
        if (info) {
          const buf = await fetchBuffer(info.src);
          if (buf) {
            let targetW: number;
            let targetH: number;
            if (sizeMm) {
              // Canvas fraction → physical mm → sheet px
              targetW = Math.max(10, Math.round((info.renderedW / CANVAS_LOGICAL_W) * sizeMm.w * pxPerMm));
              targetH = Math.max(10, Math.round((info.renderedH / CANVAS_LOGICAL_H) * sizeMm.h * pxPerMm));
            } else {
              // No print area configured: use canvas-space px × 2 (matches 2× export)
              targetW = Math.max(10, Math.round(info.renderedW * 2));
              targetH = Math.max(10, Math.round(info.renderedH * 2));
            }
            items.push({ buffer: buf, targetW, targetH });
            return;
          }
        }
      }

      // ── Priority B: Stored canvas export + transparent-edge trim ────
      // Used for text-only designs (no raw image object) or when design JSON
      // is unavailable. Trims transparent border using explicit background so
      // the result is tight around the actual content.
      const storedUrl = side === "back"
        ? order.designBackPrintUrl ?? ""
        : (order.designFrontPrintUrl || order.productionFileUrl || "");

      const rawBuf = await fetchBuffer(storedUrl);
      if (!rawBuf) return;

      let origW = CANVAS_LOGICAL_W * 2;
      let origH = CANVAS_LOGICAL_H * 2;
      try {
        const meta = await sharp(rawBuf).metadata();
        if (meta.width) origW = meta.width;
        if (meta.height) origH = meta.height;
      } catch {}

      let trimmedBuf = rawBuf;
      let contentW = origW;
      let contentH = origH;
      try {
        const { data, info } = await sharp(rawBuf)
          .ensureAlpha()
          .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
          .png()
          .toBuffer({ resolveWithObject: true });
        if (info.width > 0 && info.height > 0 && info.width <= origW && info.height <= origH
            && (info.width < origW || info.height < origH)) {
          trimmedBuf = data;
          contentW = info.width;
          contentH = info.height;
        }
      } catch {}

      let targetW: number;
      let targetH: number;
      if (sizeMm) {
        targetW = Math.max(10, Math.round((contentW / origW) * sizeMm.w * pxPerMm));
        targetH = Math.max(10, Math.round((contentH / origH) * sizeMm.h * pxPerMm));
      } else {
        targetW = contentW;
        targetH = contentH;
      }

      items.push({ buffer: trimmedBuf, targetW, targetH });
    }),
  );

  if (!items.length) return new Response("no valid print images found", { status: 404 });

  // If a column count is requested, scale items so they each fit within that column width.
  // This ensures e.g. "3 columns" → every item is at most (sheetWidth - 4×margin) / 3 px wide.
  if (columns > 0) {
    const maxItemW = Math.floor((sheetConfig.width - (columns + 1) * margin) / columns);
    for (const item of items) {
      if (item.targetW > maxItemW) {
        item.targetH = Math.round((item.targetH * maxItemW) / item.targetW);
        item.targetW = maxItemW;
      }
    }
  }

  const pngBuffer = await buildGangSheet(items, sheetConfig.width, sheetConfig.height, margin);

  const date = new Date().toISOString().slice(0, 10);
  const filename = `gang-sheet-${preset}-${date}.png`;

  return new Response(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pngBuffer.length),
    },
  });
};
