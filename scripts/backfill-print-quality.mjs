#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import pg from "pg";
import sharp from "sharp";

const DEFAULT_CUTOFF = "2026-06-07T20:48:10.000Z"; // 2026-06-07 23:48 TRT, 3x print export deploy
const CANVAS_W = 480;
const CANVAS_H = 580;
const MULTIPLIER = 3;
const TARGET_W = CANVAS_W * MULTIPLIER;
const TARGET_H = CANVAS_H * MULTIPLIER;

function loadEnv() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // .env is optional on platforms that inject environment variables.
  }
}

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function parseJsonCanvas(designJson, side) {
  const value = designJson?.[side];
  if (!value) return null;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function imageUrl(src) {
  if (!src || typeof src !== "string") return "";
  try {
    const parsed = new URL(src);
    if (parsed.hostname === "app.printlabapp.com" && parsed.pathname === "/api/img-proxy") {
      return parsed.searchParams.get("url") || src;
    }
  } catch {
    return src;
  }
  return src;
}

function unsupportedReason(obj) {
  if (!obj || obj.visible === false) return null;
  if (obj.type !== "image") return `unsupported object type: ${obj.type || "unknown"}`;
  if (!imageUrl(obj.src)) return "image object missing src";
  if (Number(obj.angle || 0) !== 0) return "rotated image";
  if (Number(obj.skewX || 0) !== 0 || Number(obj.skewY || 0) !== 0) return "skewed image";
  if (obj.opacity != null && Number(obj.opacity) !== 1) return "transparent image opacity";
  if (obj.globalCompositeOperation && obj.globalCompositeOperation !== "source-over") return "custom blend mode";
  if (Array.isArray(obj.filters) && obj.filters.length > 0) return "image filters";
  return null;
}

function objectLeftTop(obj, width, height) {
  const left = Number(obj.left || 0);
  const top = Number(obj.top || 0);
  const originX = obj.originX || "left";
  const originY = obj.originY || "top";

  const logicalW = width / MULTIPLIER;
  const logicalH = height / MULTIPLIER;
  const x = originX === "center" ? left - logicalW / 2 : originX === "right" ? left - logicalW : left;
  const y = originY === "center" ? top - logicalH / 2 : originY === "bottom" ? top - logicalH : top;
  return {
    left: Math.round(x * MULTIPLIER),
    top: Math.round(y * MULTIPLIER),
  };
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "PrintLab quality backfill/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`source fetch failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function currentPngMeta(url) {
  if (!url) return null;
  try {
    const buffer = await fetchBuffer(url);
    return await sharp(buffer).metadata();
  } catch {
    return null;
  }
}

async function renderImageOnlyCanvas(canvasJson) {
  const objects = Array.isArray(canvasJson?.objects) ? canvasJson.objects.filter((obj) => obj?.visible !== false) : [];
  if (!objects.length) return null;

  const unsupported = objects.map(unsupportedReason).find(Boolean);
  if (unsupported) throw new Error(unsupported);

  const overlays = [];
  for (const obj of objects) {
    const src = imageUrl(obj.src);
    let image = sharp(await fetchBuffer(src), { limitInputPixels: false }).ensureAlpha();

    const cropX = Math.max(0, Math.round(Number(obj.cropX || 0)));
    const cropY = Math.max(0, Math.round(Number(obj.cropY || 0)));
    const cropW = Math.max(1, Math.round(Number(obj.width || 1)));
    const cropH = Math.max(1, Math.round(Number(obj.height || 1)));
    if (cropX > 0 || cropY > 0) {
      image = image.extract({ left: cropX, top: cropY, width: cropW, height: cropH });
    }

    const outputW = Math.max(1, Math.round(cropW * Math.abs(Number(obj.scaleX ?? 1)) * MULTIPLIER));
    const outputH = Math.max(1, Math.round(cropH * Math.abs(Number(obj.scaleY ?? 1)) * MULTIPLIER));
    image = image.resize(outputW, outputH, { fit: "fill" });
    if (Number(obj.scaleX ?? 1) < 0 || obj.flipX) image = image.flop();
    if (Number(obj.scaleY ?? 1) < 0 || obj.flipY) image = image.flip();

    const input = await image.png({ compressionLevel: 6 }).toBuffer();
    overlays.push({ input, ...objectLeftTop(obj, outputW, outputH), blend: "over" });
  }

  return sharp({
    create: {
      width: TARGET_W,
      height: TARGET_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(overlays).png({ compressionLevel: 6 }).toBuffer();
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
}

async function uploadPrint(buffer, side) {
  const bucket = process.env.R2_BUCKET || "printlabapp-designs";
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!publicUrl) throw new Error("R2_PUBLIC_URL is missing");

  const key = `uploads/${side}-print/${randomBytes(16).toString("hex")}.png`;
  await r2Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: "image/png",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${publicUrl}/${key}`;
}

async function main() {
  loadEnv();

  const cutoff = new Date(arg("cutoff", DEFAULT_CUTOFF));
  const shop = arg("shop", "");
  const order = arg("order", "").replace(/^#/, "");
  const limit = Number(arg("limit", "50"));
  const apply = flag("apply");
  const minWidth = Number(arg("min-width", String(TARGET_W)));

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const isLocal = process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  const sql = `
    SELECT d.shop, d.token, d.design_json, d.front_print_url, d.back_print_url,
           MIN(o.created_at) AS first_order_at,
           ARRAY_AGG(DISTINCT COALESCE(NULLIF(o.order_number, ''), o.shopify_order_id)) AS orders
    FROM designs d
    JOIN orders o ON o.shop = d.shop AND o.design_token = d.token
    WHERE o.created_at < $1
      AND o.design_token != ''
      AND o.production_status != 'cancelled'
      AND ($2 = '' OR o.shop = $2 OR replace(o.shop, '.myshopify.com', '') = $2)
      AND ($4 = '' OR replace(o.order_number, '#', '') = $4 OR o.shopify_order_id = $4)
    GROUP BY d.shop, d.token, d.design_json, d.front_print_url, d.back_print_url
    ORDER BY MIN(o.created_at) DESC
    LIMIT $3
  `;

  const rows = (await pool.query(sql, [cutoff.toISOString(), shop, limit, order])).rows;
  const stats = { checked: rows.length, updated: 0, wouldUpdate: 0, skipped: 0, failed: 0 };

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", cutoff: cutoff.toISOString(), shop, order, limit, minWidth }, null, 2));

  for (const row of rows) {
    for (const side of ["front", "back"]) {
      const currentUrl = row[`${side}_print_url`];
      const current = await currentPngMeta(currentUrl);
      if (current?.width && current.width >= minWidth) {
        stats.skipped++;
        console.log(`[skip] ${row.shop} ${row.orders.join(",")} ${side}: current ${current.width}x${current.height}`);
        continue;
      }

      let canvasJson;
      try {
        canvasJson = parseJsonCanvas(row.design_json, side);
        const buffer = await renderImageOnlyCanvas(canvasJson);
        if (!buffer) {
          stats.skipped++;
          console.log(`[skip] ${row.shop} ${row.orders.join(",")} ${side}: empty design`);
          continue;
        }

        const meta = await sharp(buffer).metadata();
        if (!apply) {
          stats.wouldUpdate++;
          console.log(`[dry-run] ${row.shop} ${row.orders.join(",")} ${side}: ${current?.width || "?"}x${current?.height || "?"} -> ${meta.width}x${meta.height}`);
          continue;
        }

        const url = await uploadPrint(buffer, side);
        const column = side === "front" ? "front_print_url" : "back_print_url";
        await pool.query(`UPDATE designs SET ${column} = $1 WHERE shop = $2 AND token = $3`, [url, row.shop, row.token]);
        stats.updated++;
        console.log(`[updated] ${row.shop} ${row.orders.join(",")} ${side}: ${meta.width}x${meta.height} ${url}`);
      } catch (err) {
        stats.failed++;
        console.log(`[skip] ${row.shop} ${row.orders.join(",")} ${side}: ${err.message}`);
      }
    }
  }

  await pool.end();
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
