import http from "node:http";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const UPLOAD_DIR = join(ROOT, "public", "uploads");
const DATA_DIR = join(ROOT, "data");
const ADMIN_DIR = join(ROOT, "admin");
const MAX_UPLOAD = 25 * 1024 * 1024;

const UPLOAD_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

for (const d of [UPLOAD_DIR, DATA_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ── JSON storage ────────────────────────────────────────────────────────────────
function readData(file, fallback) {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

function writeData(file, value) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(value, null, 2));
}

// Seed demo data if empty
function seedDemoData() {
  if (!existsSync(join(DATA_DIR, "orders.json"))) {
    const orders = [
      {
        id: "order_demo001",
        shopifyOrderId: "5001",
        orderNumber: "#1001",
        customerName: "Ahmet Yılmaz",
        customerEmail: "ahmet@example.com",
        productId: "prod_001",
        productName: "Classic T-Shirt",
        variantId: "v001",
        designToken: "d_demo001",
        previewUrl: "",
        productionFileUrl: "",
        productionStatus: "pending",
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: "order_demo002",
        shopifyOrderId: "5002",
        orderNumber: "#1002",
        customerName: "Zeynep Kaya",
        customerEmail: "zeynep@example.com",
        productId: "prod_001",
        productName: "Classic T-Shirt",
        variantId: "v002",
        designToken: "d_demo002",
        previewUrl: "",
        productionFileUrl: "",
        productionStatus: "preparing",
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      },
      {
        id: "order_demo003",
        shopifyOrderId: "5003",
        orderNumber: "#1003",
        customerName: "Mehmet Demir",
        customerEmail: "mehmet@example.com",
        productId: "prod_002",
        productName: "Premium Hoodie",
        variantId: "v003",
        designToken: "d_demo003",
        previewUrl: "",
        productionFileUrl: "",
        productionStatus: "printed",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "order_demo004",
        shopifyOrderId: "5004",
        orderNumber: "#1004",
        customerName: "Elif Şahin",
        customerEmail: "elif@example.com",
        productId: "prod_001",
        productName: "Classic T-Shirt",
        variantId: "v001",
        designToken: "d_demo004",
        previewUrl: "",
        productionFileUrl: "",
        productionStatus: "ready",
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ];
    writeData("orders.json", orders);
  }
}

seedDemoData();

// ── HTTP server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method;
  const path = url.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Shopify-Hmac-Sha256");
  // Shopify embedded app: iframe içinde yüklenebilmesi için
  res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://whanotify-dev.myshopify.com;");
  if (method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    // Admin panel static
    if (method === "GET" && (path === "/admin" || path === "/admin/")) {
      return serveFile(join(ADMIN_DIR, "index.html"), res);
    }
    if (method === "GET" && path.startsWith("/admin/")) {
      return serveFile(join(ADMIN_DIR, path.slice(7)), res);
    }

    // Storefront upload
    if (method === "POST" && path === "/apps/tshirt-designer/upload") {
      return handleUpload(req, res);
    }
    if (method === "GET" && path.startsWith("/uploads/")) {
      return serveUpload(path, res);
    }

    // Admin API
    if (path === "/api/admin/dashboard" && method === "GET") {
      return adminDashboard(res);
    }
    if (path === "/api/admin/products" && method === "GET") {
      return adminProducts(res);
    }

    const psMatch = path.match(/^\/api\/admin\/products\/([^/]+)\/personalization$/);
    if (psMatch) {
      if (method === "GET") return adminGetPersonalization(psMatch[1], res);
      if (method === "POST" || method === "PUT") return adminSavePersonalization(psMatch[1], req, res);
    }

    if (path === "/api/admin/print-areas" && method === "GET") {
      return adminGetPrintAreas(url.searchParams.get("productId"), res);
    }
    if (path === "/api/admin/print-areas" && method === "POST") {
      return adminCreatePrintArea(req, res);
    }
    const paMatch = path.match(/^\/api\/admin\/print-areas\/([^/]+)$/);
    if (paMatch && method === "PUT") return adminUpdatePrintArea(paMatch[1], req, res);
    if (paMatch && method === "DELETE") return adminDeletePrintArea(paMatch[1], res);

    if (path === "/api/admin/orders" && method === "GET") {
      return adminGetOrders(url.searchParams.get("status"), res);
    }
    const osMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
    if (osMatch && method === "PUT") return adminUpdateOrderStatus(osMatch[1], req, res);

    // Storefront API
    if (path === "/api/storefront/designs" && method === "POST") {
      return storefrontCreateDesign(req, res);
    }
    const dsMatch = path.match(/^\/api\/storefront\/designs\/([^/]+)(\/finalize)?$/);
    if (dsMatch) {
      const token = dsMatch[1];
      if (method === "GET") return storefrontGetDesign(token, res);
      if (method === "PUT") return storefrontUpdateDesign(token, req, res);
      if (method === "POST" && dsMatch[2]) return storefrontFinalizeDesign(token, req, res);
    }

    // Webhook
    if (path === "/api/webhooks/shopify/orders-create" && method === "POST") {
      return handleOrderWebhook(req, res);
    }

    // App proxy
    if (method === "GET" && path === "/apps/tshirt-designer") {
      return json(res, 200, { ok: true, app: "Bikafa Tisort Tasarim" });
    }

    // Root → admin panel (Shopify embedded app entry point)
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      // Shopify opens root; redirect to admin panel
      res.writeHead(302, { Location: "/admin" });
      return res.end();
    }

    // React designer app (new)
    if (method === "GET" && (path === "/designer-app" || path === "/designer-app/")) {
      return serveFile(join(ROOT, "public", "designer-app", "index.html"), res);
    }
    if (method === "GET" && path.startsWith("/designer-app/assets/")) {
      return serveFile(join(ROOT, "public", path.slice(1)), res);
    }
    // App proxy route for the React designer
    if (method === "GET" && path === "/apps/tshirt-designer/designer") {
      return serveFile(join(ROOT, "public", "designer-app", "index.html"), res);
    }

    // Customer designer (served via app proxy or direct)
    if (method === "GET" && path === "/designer") {
      return serveFile(join(ROOT, "index.html"), res);
    }
    if (method === "GET") {
      return serveFile(join(ROOT, path.replace(/^\//, "")), res);
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log(`Admin:  http://127.0.0.1:${PORT}/admin`);
});

// ── Admin API ──────────────────────────────────────────────────────────────────
function adminDashboard(res) {
  const orders = readData("orders.json", []);
  const today = new Date().toDateString();
  const pending = orders.filter((o) => o.productionStatus === "pending").length;
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today).length;

  const productCounts = {};
  for (const o of orders) {
    const k = o.productName || "Unknown";
    productCounts[k] = (productCounts[k] || 0) + 1;
  }
  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return json(res, 200, {
    total: orders.length,
    today: todayOrders,
    pendingProduction: pending,
    topProducts,
    recentOrders: [...orders].reverse().slice(0, 5),
  });
}

function adminProducts(res) {
  const settings = readData("settings.json", {});
  const mock = getMockProducts();
  return json(res, 200, mock.map((p) => ({ ...p, settings: settings[p.id] || null, isActive: Boolean(settings[p.id]?.isActive) })));
}

function getMockProducts() {
  return [
    { id: "prod_001", title: "Classic T-Shirt", variants: 4 },
    { id: "prod_002", title: "Premium Hoodie", variants: 4 },
    { id: "prod_003", title: "Canvas Tote Bag", variants: 1 },
    { id: "prod_004", title: "Coffee Mug", variants: 3 },
    { id: "prod_005", title: "Phone Case", variants: 6 },
  ];
}

function adminGetPersonalization(productId, res) {
  const settings = readData("settings.json", {});
  return json(res, 200, settings[productId] || getDefaultSettings());
}

async function adminSavePersonalization(productId, req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const settings = readData("settings.json", {});
  settings[productId] = { ...getDefaultSettings(), ...data, updatedAt: new Date().toISOString() };
  writeData("settings.json", settings);
  return json(res, 200, settings[productId]);
}

function getDefaultSettings() {
  return {
    isActive: false,
    imageUpload: true,
    textUpload: true,
    maxFileSize: 8,
    allowedTypes: ["PNG", "JPG"],
    minResolution: 1000,
    removeBg: false,
    printFormat: "PNG",
    printDpi: 300,
    requireApproval: true,
  };
}

function adminGetPrintAreas(productId, res) {
  const areas = readData("print_areas.json", []);
  return json(res, 200, productId ? areas.filter((a) => a.productId === productId) : areas);
}

async function adminCreatePrintArea(req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const areas = readData("print_areas.json", []);
  const area = {
    id: `area_${randomBytes(8).toString("hex")}`,
    productId: data.productId || "",
    name: data.name || "Print Area",
    side: data.side || "front",
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    width: Number(data.width) || 100,
    height: Number(data.height) || 100,
    realWidthMm: Number(data.realWidthMm) || 200,
    realHeightMm: Number(data.realHeightMm) || 250,
    safeMargin: Number(data.safeMargin) || 10,
    bleedMargin: Number(data.bleedMargin) || 5,
    dpi: Number(data.dpi) || 300,
    createdAt: new Date().toISOString(),
  };
  areas.push(area);
  writeData("print_areas.json", areas);
  return json(res, 201, area);
}

async function adminUpdatePrintArea(id, req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const areas = readData("print_areas.json", []);
  const idx = areas.findIndex((a) => a.id === id);
  if (idx === -1) return json(res, 404, { error: "Not found" });
  areas[idx] = { ...areas[idx], ...data, id, updatedAt: new Date().toISOString() };
  writeData("print_areas.json", areas);
  return json(res, 200, areas[idx]);
}

function adminDeletePrintArea(id, res) {
  const areas = readData("print_areas.json", []);
  writeData("print_areas.json", areas.filter((a) => a.id !== id));
  return json(res, 200, { ok: true });
}

function adminGetOrders(statusFilter, res) {
  const orders = readData("orders.json", []);
  const result = statusFilter ? orders.filter((o) => o.productionStatus === statusFilter) : orders;
  return json(res, 200, [...result].reverse());
}

async function adminUpdateOrderStatus(id, req, res) {
  const body = await readBody(req, 1024);
  const { status } = JSON.parse(body.toString());
  const orders = readData("orders.json", []);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return json(res, 404, { error: "Not found" });
  orders[idx].productionStatus = status;
  orders[idx].updatedAt = new Date().toISOString();
  writeData("orders.json", orders);
  return json(res, 200, orders[idx]);
}

// ── Storefront API ──────────────────────────────────────────────────────────────
async function storefrontCreateDesign(req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const designs = readData("designs.json", {});
  const token = `d_${randomBytes(16).toString("hex")}`;
  designs[token] = {
    token,
    productId: data.productId || "",
    designJson: data.designJson || {},
    previewUrl: data.previewUrl || "",
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  writeData("designs.json", designs);
  return json(res, 201, { token });
}

function storefrontGetDesign(token, res) {
  const designs = readData("designs.json", {});
  const design = designs[token];
  if (!design) return json(res, 404, { error: "Not found" });
  return json(res, 200, design);
}

async function storefrontUpdateDesign(token, req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const designs = readData("designs.json", {});
  if (!designs[token]) return json(res, 404, { error: "Not found" });
  designs[token] = { ...designs[token], ...data, token, updatedAt: new Date().toISOString() };
  writeData("designs.json", designs);
  return json(res, 200, designs[token]);
}

async function storefrontFinalizeDesign(token, req, res) {
  const designs = readData("designs.json", {});
  if (!designs[token]) return json(res, 404, { error: "Not found" });
  if (designs[token].status === "finalized") return json(res, 200, designs[token]);
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  designs[token] = { ...designs[token], ...data, status: "finalized", finalizedAt: new Date().toISOString() };
  writeData("designs.json", designs);
  return json(res, 200, designs[token]);
}

// ── Webhook ─────────────────────────────────────────────────────────────────────
async function handleOrderWebhook(req, res) {
  const body = await readBody(req, 1 * 1024 * 1024);
  let orderData;
  try { orderData = JSON.parse(body.toString()); } catch { return json(res, 400, { error: "Invalid JSON" }); }

  const orders = readData("orders.json", []);
  const shopifyOrderId = String(orderData.id);
  if (orders.some((o) => o.shopifyOrderId === shopifyOrderId)) {
    return json(res, 200, { ok: true, message: "Already processed" });
  }

  for (const item of (orderData.line_items || [])) {
    const props = item.properties || [];
    const tokenProp = props.find((p) => p.name === "design_token");
    if (!tokenProp) continue;
    const designs = readData("designs.json", {});
    const design = designs[tokenProp.value];
    orders.push({
      id: `order_${randomBytes(8).toString("hex")}`,
      shopifyOrderId,
      orderNumber: `#${orderData.order_number || orderData.id}`,
      customerName: `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Customer",
      customerEmail: orderData.customer?.email || "",
      productId: String(item.product_id),
      productName: item.name || item.title,
      variantId: String(item.variant_id),
      designToken: tokenProp.value,
      previewUrl: design?.previewUrl || props.find((p) => p.name === "preview_url" || p.name === "Ön önizleme")?.value || "",
      productionFileUrl: props.find((p) => p.name === "Ön baskı dosyası" || p.name === "On baski dosyasi")?.value || "",
      backProductionFileUrl: props.find((p) => p.name === "Arka baskı dosyası" || p.name === "Arka baski dosyasi")?.value || "",
      productionStatus: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  writeData("orders.json", orders);
  return json(res, 200, { ok: true });
}

// ── Upload ──────────────────────────────────────────────────────────────────────
async function handleUpload(req, res) {
  const contentType = req.headers["content-type"] || "";
  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_UPLOAD) return json(res, 422, { error: "Image is too large" });
  const boundary = getBoundary(contentType);
  if (!boundary) return json(res, 422, { error: "Multipart form data is required" });
  const body = await readBody(req, MAX_UPLOAD);
  const file = parseMultipartFile(body, boundary);
  if (!file || !UPLOAD_TYPES.has(file.contentType)) return json(res, 422, { error: "PNG, JPG or WEBP required" });
  const ext = UPLOAD_TYPES.get(file.contentType);
  const filename = `${file.side || "design"}-${randomBytes(12).toString("hex")}.${ext}`;
  await writeUploadFile(join(UPLOAD_DIR, filename), file.content);
  const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
  return json(res, 200, { url: `${baseUrl}/uploads/${filename}` });
}

// ── Static serving ──────────────────────────────────────────────────────────────
function serveFile(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  if (!existsSync(filePath)) return json(res, 404, { error: "Not found" });
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) json(res, 404, { error: "Not found" });
    else res.destroy();
  });
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  stream.pipe(res);
}

function serveUpload(pathname, res) {
  const ext = extname(pathname).toLowerCase();
  const filename = pathname.split("/").pop() || "";
  const filePath = join(UPLOAD_DIR, filename);
  if (!existsSync(filePath)) return json(res, 404, { error: "Not found" });
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) json(res, 404, { error: "Not found" });
    else res.destroy();
  });
  res.writeHead(200, { "Content-Type": MIME[ext] || "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" });
  stream.pipe(res);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error("Too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getBoundary(contentType) {
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return m?.[1] || m?.[2] || "";
}

function parseMultipartFile(body, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = body.indexOf(marker);
  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length);
    if (next === -1) break;
    parts.push(body.subarray(cursor + marker.length, next));
    cursor = next;
  }
  let side = "design";
  let image = null;
  for (const part of parts) {
    const sep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (sep === -1) continue;
    const header = part.subarray(0, sep).toString("utf8");
    const content = trimPartContent(part.subarray(sep + 4));
    const name = header.match(/name="([^"]+)"/)?.[1];
    if (name === "side") side = content.toString("utf8").replace(/[^a-z0-9_-]/gi, "") || "design";
    if (name === "image") image = { side, content, contentType: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "" };
  }
  return image;
}

function trimPartContent(content) {
  let end = content.length;
  while (end > 0 && (content[end - 1] === 10 || content[end - 1] === 13)) end--;
  return content.subarray(0, end);
}

function writeUploadFile(path, content) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path, { flags: "wx" });
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end(content);
  });
}
