import type { LoaderFunctionArgs } from "@remix-run/node";
import { getOrdersByIds } from "~/models/orders.server";
import sharp from "sharp";

const SHEET_PRESETS: Record<string, { width: number; height: number | null }> = {
  "a4":      { width: 2480, height: 3508 },
  "a4l":     { width: 3508, height: 2480 },
  "a3":      { width: 3508, height: 4961 },
  "a3l":     { width: 4961, height: 3508 },
  "dtf60":   { width: 3543, height: null },
  "dtf100":  { width: 5906, height: null },
};

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

interface GangItem {
  buffer: Buffer;
  w: number;
  h: number;
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
  // Sort tallest first for better shelf utilization
  const sorted = [...items].sort((a, b) => b.h - a.h);

  const placed: Placement[] = [];
  let curX = margin;
  let curY = margin;
  let shelfH = 0;

  for (const item of sorted) {
    let w = item.w;
    let h = item.h;

    // Scale down if item wider than sheet
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

  const bg = transparent
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 255, g: 255, b: 255, alpha: 255 };

  const compositeOps: sharp.OverlayOptions[] = await Promise.all(
    placed.map(async (p) => {
      const resized =
        p.w !== p.buffer.length
          ? await sharp(p.buffer)
              .resize(p.w, p.h, {
                fit: "contain",
                background: transparent
                  ? { r: 0, g: 0, b: 0, alpha: 0 }
                  : { r: 255, g: 255, b: 255, alpha: 255 },
              })
              .png()
              .toBuffer()
          : p.buffer;

      return {
        input: resized,
        left: p.x,
        top: p.y,
      } as sharp.OverlayOptions;
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
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").filter(Boolean);
  const preset = url.searchParams.get("preset") ?? "dtf60";
  const margin = Math.max(0, Math.min(200, parseInt(url.searchParams.get("margin") ?? "20", 10)));
  const transparent = url.searchParams.get("bg") === "transparent";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";

  if (!ids.length) {
    return new Response("ids required", { status: 400 });
  }

  const orders = await getOrdersByIds(ids);
  if (!orders.length) {
    return new Response("no orders found", { status: 404 });
  }

  const sheetConfig = SHEET_PRESETS[preset] ?? SHEET_PRESETS["dtf60"];

  // Fetch print images
  const items: GangItem[] = [];

  await Promise.all(
    orders.map(async (order) => {
      const printUrl =
        side === "back"
          ? order.designBackPrintUrl ?? ""
          : order.designFrontPrintUrl || order.productionFileUrl || "";

      const buf = await fetchBuffer(printUrl);
      if (!buf) return;

      try {
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height) return;
        items.push({ buffer: buf, w: meta.width, h: meta.height });
      } catch {
        // skip corrupt images
      }
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
