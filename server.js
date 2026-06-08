import http from "node:http";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();
const UPLOAD_DIR = join(ROOT, "public", "uploads");
const ORIGINAL_UPLOAD_DIR = join(UPLOAD_DIR, "originals");
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

const PRODUCT_CATALOG = [
  { id: "prod_001", title: "Classic T-Shirt", handle: "tisort", variants: 4, productType: "apparel", surfaceMode: "front_back" },
  { id: "prod_002", title: "Premium Hoodie", handle: "sweatshirt", variants: 4, productType: "apparel", surfaceMode: "front_back" },
  { id: "prod_003", title: "Canvas Tote Bag", handle: "canta", variants: 1, productType: "bag", surfaceMode: "front_back" },
  { id: "prod_004", title: "Coffee Mug", handle: "bardak", variants: 3, productType: "mug", surfaceMode: "front_only" },
];

for (const d of [UPLOAD_DIR, ORIGINAL_UPLOAD_DIR, DATA_DIR]) {
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
    if (method === "POST" && path === "/apps/tshirt-designer/designs") {
      return storefrontCreateDesign(req, res);
    }
    if (method === "GET" && path === "/apps/tshirt-designer/personalization") {
      return storefrontPersonalization(url.searchParams.get("handle"), res);
    }
    const proxyDesignMatch = path.match(/^\/apps\/tshirt-designer\/designs\/([^/]+)(\/download)?$/);
    if (proxyDesignMatch) {
      const token = proxyDesignMatch[1];
      if (method === "GET" && proxyDesignMatch[2]) return storefrontDownloadDesign(token, res);
      if (method === "GET") return storefrontGetDesign(token, res);
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
    const ddMatch = path.match(/^\/api\/storefront\/designs\/([^/]+)\/download$/);
    if (ddMatch && method === "GET") return storefrontDownloadDesign(ddMatch[1], res);

    // Webhook
    if (path === "/api/webhooks/shopify/orders-create" && method === "POST") {
      return handleOrderWebhook(req, res);
    }

    // App proxy
    if (method === "GET" && path === "/apps/tshirt-designer") {
      return json(res, 200, { ok: true, app: "DesignKit" });
    }

    // Root → admin panel (Shopify embedded app entry point)
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      return serveFile(join(ADMIN_DIR, "index.html"), res);
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
  return json(res, 200, mock.map((p) => {
    const merged = { ...getDefaultSettings(p), ...(settings[p.id] || {}) };
    return { ...p, handle: merged.productHandle || p.handle, productType: merged.productType || p.productType, surfaceMode: merged.surfaceMode || p.surfaceMode, settings: merged, isActive: Boolean(merged.isActive) };
  }));
}

function getMockProducts() {
  return PRODUCT_CATALOG;
}

function adminGetPersonalization(productId, res) {
  const settings = readData("settings.json", {});
  const product = getMockProducts().find((item) => item.id === productId) || { id: productId, title: "Product", handle: "", variants: 1, productType: "apparel", surfaceMode: "front_back" };
  return json(res, 200, { ...getDefaultSettings(product), ...(settings[productId] || {}) });
}

async function adminSavePersonalization(productId, req, res) {
  const body = await readBody(req, 64 * 1024);
  const data = JSON.parse(body.toString());
  const settings = readData("settings.json", {});
  const product = getMockProducts().find((item) => item.id === productId) || { id: productId, title: "Product", handle: "", variants: 1, productType: "apparel", surfaceMode: "front_back" };
  settings[productId] = normalizePersonalizationSettings({ ...getDefaultSettings(product), ...data, updatedAt: new Date().toISOString() });
  writeData("settings.json", settings);
  return json(res, 200, settings[productId]);
}

function getDefaultSettings(product = {}) {
  const printDefaults = defaultPrintAreaForType(product.productType);
  return {
    isActive: false,
    productHandle: String(product.handle || ""),
    productType: String(product.productType || "apparel"),
    surfaceMode: String(product.surfaceMode || "front_back"),
    imageUpload: true,
    textUpload: true,
    maxFileSize: 8,
    allowedTypes: ["PNG", "JPG"],
    minResolution: 1000,
    removeBg: false,
    printFormat: "PNG",
    printDpi: 300,
    requireApproval: true,
    frontPrintWidthCm: printDefaults.front.widthCm,
    frontPrintHeightCm: printDefaults.front.heightCm,
    backPrintWidthCm: printDefaults.back.widthCm,
    backPrintHeightCm: printDefaults.back.heightCm,
    pricingBands: defaultPricingBands(),
    surchargeVariantMap: { front: {}, back: {} },
  };
}

function defaultPrintAreaForType(productType) {
  const type = String(productType || "apparel");
  if (type === "bag") return { front: { widthCm: 24, heightCm: 30 }, back: { widthCm: 24, heightCm: 30 } };
  if (type === "mug") return { front: { widthCm: 21, heightCm: 9 }, back: { widthCm: 21, heightCm: 9 } };
  return { front: { widthCm: 28, heightCm: 45 }, back: { widthCm: 28, heightCm: 45 } };
}

function defaultPricingBands() {
  const values = [60, 90, 120, 150, 200, 250];
  const labels = ["Kucuk", "Orta", "Buyuk", "XL", "XXL", "Tam Alan"];
  const limits = [150, 300, 500, 750, 1000, null];
  const build = () => limits.map((limit, idx) => ({
    key: limit == null ? "max" : String(limit),
    maxAreaCm2: limit,
    label: labels[idx],
    surcharge: values[idx],
  }));
  return { front: build(), back: build() };
}

function normalizeBands(sideBands) {
  if (!Array.isArray(sideBands)) return [];
  return sideBands.map((band, idx) => ({
    key: String(band?.key || band?.maxAreaCm2 || idx),
    maxAreaCm2: band?.maxAreaCm2 == null || band?.maxAreaCm2 === "" ? null : Number(band.maxAreaCm2),
    label: String(band?.label || `Band ${idx + 1}`),
    surcharge: Number(band?.surcharge || 0),
  }));
}

function normalizeSurchargeMap(input) {
  const out = { front: {}, back: {} };
  ["front", "back"].forEach((side) => {
    const source = input?.[side];
    if (!source || typeof source !== "object") return;
    Object.keys(source).forEach((key) => {
      if (source[key]) out[side][String(key)] = String(source[key]);
    });
  });
  return out;
}

function normalizePersonalizationSettings(input) {
  const normalized = {
    ...input,
    productHandle: String(input?.productHandle || ""),
    productType: String(input?.productType || "apparel"),
    surfaceMode: String(input?.surfaceMode || "front_back"),
    isActive: Boolean(input?.isActive),
    imageUpload: Boolean(input?.imageUpload),
    textUpload: Boolean(input?.textUpload),
    requireApproval: Boolean(input?.requireApproval),
    removeBg: Boolean(input?.removeBg),
    maxFileSize: Number(input?.maxFileSize || 8),
    minResolution: Number(input?.minResolution || 1000),
    allowedTypes: Array.isArray(input?.allowedTypes) ? input.allowedTypes.map((t) => String(t)) : ["PNG", "JPG"],
    printFormat: String(input?.printFormat || "PNG"),
    printDpi: Number(input?.printDpi || 300),
    frontPrintWidthCm: Number(input?.frontPrintWidthCm || 0),
    frontPrintHeightCm: Number(input?.frontPrintHeightCm || 0),
    backPrintWidthCm: Number(input?.backPrintWidthCm || 0),
    backPrintHeightCm: Number(input?.backPrintHeightCm || 0),
    pricingBands: {
      front: normalizeBands(input?.pricingBands?.front),
      back: normalizeBands(input?.pricingBands?.back),
    },
    surchargeVariantMap: normalizeSurchargeMap(input?.surchargeVariantMap),
  };
  return normalized;
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

function storefrontPersonalization(handle, res) {
  const key = String(handle || "").trim();
  const settings = readData("settings.json", {});
  let product = getMockProducts().find((item) => item.handle === key);
  if (!product) {
    const matchedEntry = Object.entries(settings).find(([, value]) => String(value?.productHandle || "").trim() === key);
    if (matchedEntry) product = getMockProducts().find((item) => item.id === matchedEntry[0]);
  }
  if (!product) return json(res, 404, { error: "Not found" });
  const merged = normalizePersonalizationSettings({ ...getDefaultSettings(product), ...(settings[product.id] || {}) });
  const areas = readData("print_areas.json", []).filter((area) => area.productId === product.id);
  return json(res, 200, {
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      productType: product.productType,
      surfaceMode: product.surfaceMode,
    },
    settings: merged,
    printAreas: areas,
  });
}

function adminGetOrders(statusFilter, res) {
  const orders = readData("orders.json", []);
  const designs = readData("designs.json", {});
  const result = statusFilter ? orders.filter((o) => o.productionStatus === statusFilter) : orders;
  return json(res, 200, [...result].reverse().map((order) => enrichOrder(order, designs)));
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

function enrichOrder(order, designs = readData("designs.json", {})) {
  const design = order.designToken ? designs[order.designToken] : null;
  const assets = Array.isArray(design?.assets) ? design.assets : [];
  const baseUrl = process.env.APP_URL || "";
  return {
    ...order,
    design: design ? {
      token: design.token,
      previewUrls: design.previewUrls || {},
      assets,
      printArea: design.printArea || {},
      sideMetrics: design.sideMetrics || {},
      pricing: design.pricing || {},
      sides: summarizeDesignSides(design.designJson),
      downloadUrl: design.downloadUrl || (baseUrl ? `${baseUrl}/api/storefront/designs/${design.token}/download` : `/api/storefront/designs/${design.token}/download`),
      createdAt: design.createdAt,
      finalizedAt: design.finalizedAt,
    } : null,
  };
}

function summarizeDesignSides(designJson) {
  const sides = {};
  for (const side of ["front", "back"]) {
    const jsonStr = typeof designJson?.[side] === "string" ? designJson[side] : "";
    let parsed = null;
    try { parsed = jsonStr ? JSON.parse(jsonStr) : null; } catch { parsed = null; }
    const objects = Array.isArray(parsed?.objects) ? parsed.objects : [];
    sides[side] = {
      objectCount: objects.length,
      imageCount: objects.filter((o) => o.type === "image").length,
      textCount: objects.filter((o) => o.type === "i-text" || o.type === "text" || o.type === "textbox").length,
      objects: objects.map((o) => ({
        type: o.type,
        text: typeof o.text === "string" ? o.text : undefined,
        assetId: o.assetId,
        filename: o.originalFilename,
        left: roundNum(o.left),
        top: roundNum(o.top),
        scaleX: roundNum(o.scaleX),
        scaleY: roundNum(o.scaleY),
        angle: roundNum(o.angle),
        width: roundNum(o.width),
        height: roundNum(o.height),
        fontFamily: o.fontFamily,
        fontSize: roundNum(o.fontSize),
        fill: typeof o.fill === "string" ? o.fill : undefined,
      })),
    };
  }
  return sides;
}

function roundNum(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

// ── Storefront API ──────────────────────────────────────────────────────────────
async function storefrontCreateDesign(req, res) {
  const body = await readBody(req, 10 * 1024 * 1024);
  const data = JSON.parse(body.toString());
  const designs = readData("designs.json", {});
  const token = `d_${randomBytes(16).toString("hex")}`;
  const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
  designs[token] = {
    token,
    productId: data.productId || "",
    productTitle: data.productTitle || "",
    variantId: data.variantId || "",
    size: data.size || "",
    sizes: Array.isArray(data.sizes) ? data.sizes : [],
    totalQuantity: Number(data.totalQuantity || 0),
    color: data.color || "",
    printMode: data.printMode || "",
    designJson: data.designJson || {},
    assets: normalizeDesignAssets(data.assets),
    printArea: normalizePrintArea(data.printArea),
    sideMetrics: normalizeSideMetrics(data.sideMetrics),
    pricing: normalizePricing(data.pricing),
    previewUrls: data.previewUrls || {},
    previewUrl: data.previewUrl || data.previewUrls?.front || data.previewUrls?.back || "",
    downloadUrl: `${baseUrl}/api/storefront/designs/${token}/download`,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
  writeData("designs.json", designs);
  return json(res, 201, { token });
}

function normalizeDesignAssets(assets) {
  if (!Array.isArray(assets)) return [];
  const seen = new Set();
  return assets
    .filter((asset) => asset && asset.assetId && !seen.has(asset.assetId) && seen.add(asset.assetId))
    .map((asset) => ({
      assetId: String(asset.assetId),
      originalUrl: String(asset.originalUrl || asset.url || ""),
      url: String(asset.url || asset.originalUrl || ""),
      filename: String(asset.filename || asset.originalFilename || "image"),
      mime: String(asset.mime || asset.originalMime || ""),
      width: Number(asset.width || asset.originalWidth || 0),
      height: Number(asset.height || asset.originalHeight || 0),
      size: Number(asset.size || asset.originalSize || 0),
    }));
}

function normalizePrintArea(printArea) {
  if (printArea?.front || printArea?.back) {
    return {
      front: {
        widthCm: Number(printArea?.front?.widthCm || 0),
        heightCm: Number(printArea?.front?.heightCm || 0),
      },
      back: {
        widthCm: Number(printArea?.back?.widthCm || 0),
        heightCm: Number(printArea?.back?.heightCm || 0),
      },
    };
  }
  return {
    front: {
      widthCm: Number(printArea?.widthCm || 0),
      heightCm: Number(printArea?.heightCm || 0),
    },
    back: {
      widthCm: Number(printArea?.widthCm || 0),
      heightCm: Number(printArea?.heightCm || 0),
    },
  };
}

function normalizeSideMetrics(sideMetrics) {
  const normalized = {};
  for (const side of ["front", "back"]) {
    const metric = sideMetrics?.[side] || {};
    normalized[side] = {
      objectCount: Number(metric.objectCount || 0),
      widthCm: Number(metric.widthCm || 0),
      heightCm: Number(metric.heightCm || 0),
      areaCm2: Number(metric.areaCm2 || 0),
      coverage: Number(metric.coverage || 0),
    };
  }
  return normalized;
}

function normalizePricing(pricing) {
  const normalized = {
    totalQuantity: Number(pricing?.totalQuantity || 0),
    baseSubtotal: Number(pricing?.baseSubtotal || 0),
    frontSubtotal: Number(pricing?.frontSubtotal || 0),
    backSubtotal: Number(pricing?.backSubtotal || 0),
    total: Number(pricing?.total || 0),
    averageBaseUnit: Number(pricing?.averageBaseUnit || 0),
  };
  for (const side of ["front", "back"]) {
    const entry = pricing?.[side] || {};
    normalized[side] = {
      hasContent: Boolean(entry.hasContent),
      surcharge: Number(entry.surcharge || 0),
      variantId: String(entry.variantId || ""),
      band: {
        key: String(entry.band?.key || ""),
        maxAreaCm2: entry.band?.maxAreaCm2 == null ? null : Number(entry.band.maxAreaCm2),
        label: String(entry.band?.label || ""),
        surcharge: Number(entry.band?.surcharge || 0),
      },
      metrics: {
        objectCount: Number(entry.metrics?.objectCount || 0),
        widthCm: Number(entry.metrics?.widthCm || 0),
        heightCm: Number(entry.metrics?.heightCm || 0),
        areaCm2: Number(entry.metrics?.areaCm2 || 0),
        coverage: Number(entry.metrics?.coverage || 0),
      },
    };
  }
  return normalized;
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

function storefrontDownloadDesign(token, res) {
  const designs = readData("designs.json", {});
  const design = designs[token];
  if (!design) return json(res, 404, { error: "Not found" });
  const payload = {
    token: design.token,
    productId: design.productId,
    productTitle: design.productTitle,
    variantId: design.variantId,
    size: design.size,
    sizes: design.sizes || [],
    totalQuantity: design.totalQuantity || 0,
    color: design.color,
    printMode: design.printMode,
    previewUrls: design.previewUrls || {},
    assets: design.assets || [],
    sides: summarizeDesignSides(design.designJson),
    designJson: design.designJson || {},
    createdAt: design.createdAt,
  };
  const filename = `${token}-design.json`;
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload, null, 2));
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
    const tokenProp = props.find((p) => p.name === "_design_token" || p.name === "design_token");
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
      previewUrl: design?.previewUrl || design?.previewUrls?.front || props.find((p) => p.name === "preview_url" || p.name === "Ön önizleme")?.value || "",
      backPreviewUrl: design?.previewUrls?.back || props.find((p) => p.name === "Arka önizleme")?.value || "",
      productionFileUrl: props.find((p) => p.name === "Ön baskı dosyası" || p.name === "On baski dosyasi")?.value || "",
      backProductionFileUrl: props.find((p) => p.name === "Arka baskı dosyası" || p.name === "Arka baski dosyasi")?.value || "",
      designDownloadUrl: design?.downloadUrl || props.find((p) => p.name === "Tasarımı indir" || p.name === "Tasarim indir")?.value || "",
      assetCount: Array.isArray(design?.assets) ? design.assets.length : 0,
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
  const isOriginal = file.purpose === "original";
  const assetId = isOriginal ? `asset_${randomBytes(12).toString("hex")}` : "";
  const filename = `${file.side || "design"}-${randomBytes(12).toString("hex")}.${ext}`;
  const targetDir = isOriginal ? ORIGINAL_UPLOAD_DIR : UPLOAD_DIR;
  await writeUploadFile(join(targetDir, filename), file.content);
  const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
  const url = `${baseUrl}/uploads/${isOriginal ? `originals/${filename}` : filename}`;

  if (isOriginal) {
    const dimensions = imageDimensions(file.content, file.contentType);
    const assets = readData("assets.json", {});
    const asset = {
      assetId,
      url,
      originalUrl: url,
      filename: file.filename || filename,
      storedFilename: filename,
      mime: file.contentType,
      width: Number(file.width || dimensions.width || 0),
      height: Number(file.height || dimensions.height || 0),
      size: file.content.length,
      createdAt: new Date().toISOString(),
    };
    assets[assetId] = asset;
    writeData("assets.json", assets);
    return json(res, 200, { url, asset });
  }

  return json(res, 200, { url });
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
  const rel = pathname.replace(/^\/uploads\//, "").replace(/\\/g, "/");
  if (rel.includes("..")) return json(res, 400, { error: "Invalid path" });
  const filePath = join(UPLOAD_DIR, rel);
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
  const fields = {};
  let image = null;
  for (const part of parts) {
    const sep = part.indexOf(Buffer.from("\r\n\r\n"));
    if (sep === -1) continue;
    const header = part.subarray(0, sep).toString("utf8");
    const content = trimPartContent(part.subarray(sep + 4));
    const name = header.match(/name="([^"]+)"/)?.[1];
    const filename = header.match(/filename="([^"]*)"/)?.[1] || "";
    if (name && !filename) fields[name] = content.toString("utf8");
    if (name === "side") side = content.toString("utf8").replace(/[^a-z0-9_-]/gi, "") || "design";
    if (name === "image") {
      image = {
        side,
        content,
        contentType: header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "",
        filename: filename.replace(/[^\w.\-() ]/g, "").slice(0, 160),
      };
    }
  }
  if (image) {
    image.purpose = String(fields.purpose || "");
    image.width = Number(fields.width || 0);
    image.height = Number(fields.height || 0);
  }
  return image;
}

function imageDimensions(buffer, contentType) {
  try {
    if (contentType === "image/png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (contentType === "image/jpeg") return jpegDimensions(buffer);
    if (contentType === "image/webp") return webpDimensions(buffer);
  } catch {
    return { width: 0, height: 0 };
  }
  return { width: 0, height: 0 };
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

function webpDimensions(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return { width: 0, height: 0 };
  const type = buffer.toString("ascii", 12, 16);
  if (type === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (type === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (type === "VP8L" && buffer.length >= 25) {
    const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return { width: 0, height: 0 };
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
