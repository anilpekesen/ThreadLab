import type { LoaderFunctionArgs } from "@remix-run/node";
import { getOrdersByIds } from "~/models/orders.server";
import { query } from "~/lib/db.server";
import sharp from "sharp";

// Preset sheet widths in px, based on physical size at the given DPI
// dtf60 = 60cm at 150dpi, dtf100 = 100cm at 150dpi, A4/A3 at 300dpi
const SHEET_PRESETS: Record<string, { width: number; height: number | null; pxPerMm: number }> = {
  "a4":     { width: 2480, height: 3508, pxPerMm: 300 / 25.4 },
  "a4l":    { width: 3508, height: 2480, pxPerMm: 300 / 25.4 },
  "a3":     { width: 3508, height: 4961, pxPerMm: 300 / 25.4 },
  "a3l":    { width: 4961, height: 3508, pxPerMm: 300 / 25.4 },
  "dtf60":  { width: 3543, height: null, pxPerMm: 150 / 25.4 },
  "dtf100": { width: 5906, height: null, pxPerMm: 150 / 25.4 },
};

// Designer canvas internal resolution (px per mm at source)
const CANVAS_W_PX = 480 * 2; // exportPng(2) = 2x → 960px
const CANVAS_H_PX = 580 * 2; // exportPng(2) = 2x → 1160px

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

// Extract the raw user-uploaded image URL from design_json (no product mockup)
async function getCleanPrintUrl(shop: string, designToken: string, side: "front" | "back"): Promise<string | null> {
  if (!designToken) return null;
  try {
    const result = await query<{ design_json: { front?: string; back?: string } }>(
      "SELECT design_json FROM designs WHERE shop = $1 AND token = $2 LIMIT 1",
      [shop, designToken],
    );
    const row = result.rows[0];
    if (!row?.design_json) return null;

    const sideStr = row.design_json[side];
    if (!sideStr) return null;

    const canvas = JSON.parse(sideStr) as {
      objects?: Array<{ type: string; src?: string }>;
    };

    // Use first image object — backgroundImage (mockup) is a separate top-level key, not in objects[]
    const imageObj = canvas.objects?.find((o) => o.type === "image" && o.src);
    if (!imageObj?.src) return null;

    // Unwrap /api/img-proxy?url= to the direct CDN URL
    const src = imageObj.src;
    if (src.includes("/api/img-proxy?url=")) {
      try {
        const inner = new URL(src).searchParams.get("url");
        if (inner) return decodeURIComponent(inner);
      } catch {}
    }
    return src;
  } catch {
    return null;
  }
}

// Fetch realWidthMm / realHeightMm for a product from DB
async function getPrintSizeMm(productId: string): Promise<{ w: number; h: number } | null> {
  if (!productId) return null;
  try {
    const result = await query<{ real_width_mm: number; real_height_mm: number }>(
      "SELECT real_width_mm, real_height_mm FROM product_print_areas WHERE product_id = $1 AND side = 'front' LIMIT 1",
      [productId],
    );
    const row = result.rows[0];
    if (!row || !row.real_width_mm || !row.real_height_mm) return null;
    return { w: row.real_width_mm, h: row.real_height_mm };
  } catch {
    return null;
  }
}

interface GangItem {
  buffer: Buffer;
  // target pixel size on sheet (after scaling to physical size)
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
  transparent: boolean,
): Promise<Buffer> {
  const bg = transparent
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 255, g: 255, b: 255, alpha: 255 };

  // Sort tallest first for better shelf packing
  const sorted = [...items].sort((a, b) => b.targetH - a.targetH);

  const placed: Placement[] = [];
  let curX = margin;
  let curY = margin;
  let shelfH = 0;

  for (const item of sorted) {
    let w = item.targetW;
    let h = item.targetH;

    // Scale down if wider than the sheet
    const maxW = sheetWidth - 2 * margin;
    if (w > maxW) {
      h = Math.round((h * maxW) / w);
      w = maxW;
    }

    // New shelf if needed
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
        .resize(p.w, p.h, {
          fit: "fill", // exact size: design fills the target print area
          background: bg,
        })
        .png()
        .toBuffer();

      return { input: resized, left: p.x, top: p.y } as sharp.OverlayOptions;
    }),
  );

  return sharp({
    create: {
      width: sheetWidth,
      height: Math.max(totalHeight, 100),
      channels: 4,
      background: bg,
    },
  })
    .composite(compositeOps)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);
  const preset = url.searchParams.get("preset") ?? "dtf60";
  const margin = Math.max(0, Math.min(200, parseInt(url.searchParams.get("margin") ?? "20", 10)));
  const transparent = url.searchParams.get("bg") === "transparent";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";

  if (!ids.length) {
    return new Response("ids required", { status: 400 });
  }

  const orders = await getOrdersByIds(shop, ids);
  if (!orders.length) {
    return new Response("no orders found", { status: 404 });
  }

  const sheetConfig = SHEET_PRESETS[preset] ?? SHEET_PRESETS["dtf60"];
  const pxPerMm = sheetConfig.pxPerMm;

  const items: GangItem[] = [];

  await Promise.all(
    orders.map(async (order) => {
      // Prefer raw image from design_json — never contains the product mockup background.
      // Fall back to stored print URL (new orders after cleanBg fix, or text-only designs).
      const cleanUrl = order.designToken
        ? await getCleanPrintUrl(shop, order.designToken, side)
        : null;
      const printUrl = cleanUrl || (
        side === "back"
          ? order.designBackPrintUrl ?? ""
          : order.designFrontPrintUrl || order.productionFileUrl || ""
      );

      const buf = await fetchBuffer(printUrl);
      if (!buf) return;

      // Get physical print size from product config
      const sizeMm = await getPrintSizeMm(order.productId ?? "");

      let targetW: number;
      let targetH: number;

      if (sizeMm) {
        // Scale to physical size at sheet DPI
        targetW = Math.round(sizeMm.w * pxPerMm);
        targetH = Math.round(sizeMm.h * pxPerMm);
      } else {
        // Fallback: use actual image pixels (no scaling)
        try {
          const meta = await sharp(buf).metadata();
          targetW = meta.width ?? CANVAS_W_PX;
          targetH = meta.height ?? CANVAS_H_PX;
        } catch {
          return;
        }
      }

      items.push({ buffer: buf, targetW, targetH });
    }),
  );

  if (!items.length) {
    return new Response("no valid print images found", { status: 404 });
  }

  const pngBuffer = await buildGangSheet(
    items,
    sheetConfig.width,
    sheetConfig.height,
    margin,
    transparent,
  );

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
