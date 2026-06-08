import { readFileSync } from "node:fs";
import pg from "pg";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] != null) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch {}
}

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function driveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson(accessToken, path, init = {}) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(pool, shop, conn) {
  if (conn.access_token && conn.access_token_expires_at && new Date(conn.access_token_expires_at).getTime() - Date.now() > 60_000) {
    return conn.access_token;
  }
  const body = new URLSearchParams({
    refresh_token: conn.refresh_token,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google refresh ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 3600) * 1000);
  await pool.query(
    "UPDATE shop_google_drive SET access_token = $2, access_token_expires_at = $3, updated_at = now() WHERE shop = $1",
    [shop, data.access_token, expiresAt],
  );
  return data.access_token;
}

async function createFolder(accessToken, name, parentId) {
  const data = await driveJson(accessToken, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return data.id;
}

async function findSubfolder(accessToken, parentId, name) {
  const q = [`'${driveQueryValue(parentId)}' in parents`, `name = '${driveQueryValue(name)}'`, "mimeType = 'application/vnd.google-apps.folder'", "trashed = false"].join(" and ");
  const data = await driveJson(accessToken, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  return data.files?.[0]?.id || null;
}

async function ensureRootFolder(pool, shop, accessToken, conn) {
  if (conn.root_folder_id) return conn.root_folder_id;
  const id = await createFolder(accessToken, "PrintLab Tasarımları");
  await pool.query("UPDATE shop_google_drive SET root_folder_id = $2, updated_at = now() WHERE shop = $1", [shop, id]);
  return id;
}

function isGenerated(name) {
  return /^(\d+-)?(front|back)-(print(-\d+)?|mockup)\.png$/i.test(name)
    || /^(\d+-)?design\.json$/i.test(name)
    || /^(siparis|order|quality-report)\.(txt|json)$/i.test(name);
}

async function clearGenerated(accessToken, folderId) {
  const q = [`'${driveQueryValue(folderId)}' in parents`, "trashed = false"].join(" and ");
  const data = await driveJson(accessToken, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=100`);
  const files = (data.files || []).filter((file) => file.mimeType !== "application/vnd.google-apps.folder" && isGenerated(file.name));
  for (const file of files) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Drive delete ${res.status}: ${await res.text()}`);
  }
  return files.length;
}

async function uploadBytes(accessToken, folderId, name, mimeType, bytes) {
  const boundary = `boundary-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const body = new Uint8Array(headBytes.length + bytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(bytes, headBytes.length);
  body.set(tailBytes, headBytes.length + bytes.length);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${await res.text()}`);
  return res.json();
}

async function uploadFromUrl(accessToken, folderId, name, url) {
  if (!url) return 0;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Source fetch failed (${res.status}): ${url}`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  await uploadBytes(accessToken, folderId, name, mime, new Uint8Array(await res.arrayBuffer()));
  return 1;
}

function first(values) {
  return values.find((value) => value && String(value).trim()) || "";
}

function productPrefix(index, total) {
  return total > 1 ? `${index + 1}-` : "";
}

function printFileName(side, index, total, copy, quantity) {
  const suffix = quantity > 1 ? `-${String(copy + 1).padStart(2, "0")}` : "";
  return `${productPrefix(index, total)}${side}-print${suffix}.png`;
}

function summary(rows) {
  const firstRow = rows[0];
  const lines = rows.map((row) => `  ${(row.variant_title || "-").padEnd(20)} x ${row.quantity || 1}`);
  const total = rows.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
  return [
    "SIPARIS",
    "-------------------------------",
    `Siparis No   : ${firstRow.order_number || firstRow.shopify_order_id}`,
    `Musteri      : ${firstRow.customer_name || "-"}`,
    `E-posta      : ${firstRow.customer_email || "-"}`,
    `Urun         : ${(firstRow.product_name || "").split(" - ")[0] || "-"}`,
    `Durum        : ${firstRow.production_status || "-"}`,
    `Tarih        : ${new Date(firstRow.created_at).toLocaleString("tr-TR")}`,
    `Aktarma      : ${new Date().toLocaleString("tr-TR")}`,
    "",
    "BEDENLER / RENKLER",
    "-------------------------------",
    ...lines,
    "-------------------------------",
    `TOPLAM ADET  : ${total}`,
  ].join("\n");
}

loadEnv();

const shop = arg("shop", "iabvsb-jv.myshopify.com");
const order = arg("order", "");
if (!order) throw new Error("--order required");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? undefined : { rejectUnauthorized: false },
});

try {
  const rows = (await pool.query(
    `SELECT o.*, d.front_preview_url AS design_front_preview_url, d.back_preview_url AS design_back_preview_url,
            d.front_print_url AS design_front_print_url, d.back_print_url AS design_back_print_url,
            d.design_json
     FROM orders o
     LEFT JOIN designs d ON d.shop = o.shop AND d.token = o.design_token
     WHERE o.shop = $1 AND (replace(o.order_number, '#', '') = $2 OR o.shopify_order_id = $2)
       AND o.design_token != '' AND o.production_status != 'cancelled'
     ORDER BY o.line_item_id, o.variant_title`,
    [shop, order.replace(/^#/, "")],
  )).rows;
  if (!rows.length) throw new Error(`Order not found: ${order}`);

  const conn = (await pool.query("SELECT * FROM shop_google_drive WHERE shop = $1", [shop])).rows[0];
  if (!conn) throw new Error(`Google Drive not connected: ${shop}`);
  const accessToken = await refreshAccessToken(pool, shop, conn);
  const rootId = await ensureRootFolder(pool, shop, accessToken, conn);
  const folderName = (rows[0].order_number || rows[0].shopify_order_id).replace(/^#/, "");
  const folderId = await findSubfolder(accessToken, rootId, folderName) || await createFolder(accessToken, folderName, rootId);

  const deleted = await clearGenerated(accessToken, folderId);
  const groups = new Map();
  for (const row of rows) {
    const key = row.design_token ? `design:${row.design_token}` : `row:${row.id}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  let uploaded = 0;
  const products = Array.from(groups.values());
  for (let index = 0; index < products.length; index++) {
    const group = products[index];
    const row = group[0];
    const quantity = Math.max(1, group.reduce((sum, item) => sum + Number(item.quantity || 1), 0));
    const frontPrint = first([row.design_front_print_url, ...group.map((item) => item.production_file_url)]);
    const backPrint = first([row.design_back_print_url]);
    const frontPreview = first([row.design_front_preview_url, ...group.map((item) => item.preview_url)]);
    const backPreview = first([row.design_back_preview_url]);

    for (let copy = 0; copy < quantity; copy++) {
      uploaded += await uploadFromUrl(accessToken, folderId, printFileName("front", index, products.length, copy, quantity), frontPrint);
      uploaded += await uploadFromUrl(accessToken, folderId, printFileName("back", index, products.length, copy, quantity), backPrint);
    }
    const prefix = productPrefix(index, products.length);
    uploaded += await uploadFromUrl(accessToken, folderId, `${prefix}front-mockup.png`, frontPreview);
    uploaded += await uploadFromUrl(accessToken, folderId, `${prefix}back-mockup.png`, backPreview);
    if (row.design_json) {
      await uploadBytes(accessToken, folderId, `${prefix}design.json`, "application/json", new TextEncoder().encode(JSON.stringify(row.design_json, null, 2)));
      uploaded++;
    }
  }
  await uploadBytes(accessToken, folderId, "siparis.txt", "text/plain; charset=utf-8", new TextEncoder().encode(summary(rows)));
  uploaded++;

  await pool.query("UPDATE orders SET drive_folder_id = $3, drive_uploaded_at = now() WHERE shop = $1 AND shopify_order_id = $2", [shop, rows[0].shopify_order_id, folderId]);
  console.log(JSON.stringify({ shop, order, rows: rows.length, products: products.length, deleted, uploaded, folderId }, null, 2));
  console.log(summary(rows));
} finally {
  await pool.end();
}
