import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { handleDesignerUpload } from "~/models/uploads.server";
import { authenticate } from "~/shopify.server";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { handleWaveSpeedRemoveBackground } from "~/models/background-removal.server";
import { getDesignByToken, extractObjects } from "~/models/designs.server";

const DATA_DIR = nodePath.join(process.cwd(), "data");
const DESIGNS_FILE = nodePath.join(DATA_DIR, "designs.json");

type DesignRecord = {
  token: string;
  [key: string]: unknown;
};

async function readDesigns(): Promise<DesignRecord[]> {
  try {
    return JSON.parse(await readFile(DESIGNS_FILE, "utf8")) as DesignRecord[];
  } catch {
    return [];
  }
}

async function writeDesigns(records: DesignRecord[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DESIGNS_FILE, JSON.stringify(records, null, 2));
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const appProxy = await authenticate.public.appProxy(request);
  const path = params["*"] ?? "";

  if (path === "designer") {
    const url = new URL(request.url);
    const iframeParams = new URLSearchParams(url.searchParams);
    iframeParams.delete("shop");
    const shopDomain = appProxy.session?.shop ?? url.searchParams.get("shop") ?? "";
    if (shopDomain) iframeParams.set("shop", shopDomain);
    const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
    const designerUrl = new URL("/designer-app/", appUrl);
    designerUrl.search = iframeParams.toString();
    const iframeSrc = designerUrl.toString().replace(/&/g, "&amp;");

    // Liquid renders {{ shop.permanent_domain }} server-side and postMessages it to the iframe
    return appProxy.liquid(
      `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#f3f4f6}
  iframe{display:block;width:100%;height:100vh;border:0;background:#f3f4f6}
</style>
</head>
<body>
<iframe id="designer-frame" src="${iframeSrc}" allow="camera; microphone"></iframe>
<script>
  var frame = document.getElementById('designer-frame');
  var shop = '{{ shop.permanent_domain }}';
  function sendShop() {
    if (shop && shop !== 'null' && shop !== '') {
      frame.contentWindow.postMessage({ type: 'SHOP_INIT', shop: shop }, '*');
    }
  }
  frame.addEventListener('load', sendShop);
  // Retry after a short delay in case the frame loaded before the listener was attached
  setTimeout(sendShop, 1500);
</script>
</body>
</html>`,
      { layout: false },
    );
  }

  if (path === "personalization") {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    const config = await findConfigForStorefront(productId, handle);
    if (!config) {
      return json({ error: "Not found" }, { status: 404 });
    }
    return json({
      product: {
        id: config.productId,
        title: config.settings.productTitle,
        handle: config.settings.productHandle,
        productType: config.settings.productType,
        surfaceMode: config.settings.surfaceMode,
      },
      settings: toStorefrontSettings(config.settings),
      printAreas: config.printAreas,
    });
  }

  // GET /apps/tshirt-designer/designs/<token>
  const designsMatch = path.match(/^designs\/([^/]+)$/);
  if (designsMatch) {
    const token = decodeURIComponent(designsMatch[1]);
    const records = await readDesigns();
    const record = records.find((r) => r.token === token);
    if (!record) return json({ error: "Not found" }, { status: 404 });
    return json(record);
  }

  // GET /apps/tshirt-designer/my-order?token=<design_token>
  if (path === "my-order") {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token) {
      return new Response(myOrderErrorPage("Geçersiz link", "Tasarım token'ı eksik."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const design = await getDesignByToken(token);
    if (!design) {
      return new Response(myOrderErrorPage("Tasarım bulunamadı", "Bu tasarım artık mevcut değil veya link hatalı."), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    const frontObjs = extractObjects(design.designJson, "front");
    const backObjs = extractObjects(design.designJson, "back");
    return new Response(myOrderRenderPage(design, frontObjs, backObjs), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return json({ ok: true, path });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const proxy = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = proxy.session?.shop ?? url.searchParams.get("shop") ?? "unknown";
  const path = params["*"] ?? "";

  if (path === "upload") {
    return handleDesignerUpload(request);
  }

  if (path === "remove-background") {
    return handleWaveSpeedRemoveBackground(request, shop);
  }

  // POST /apps/tshirt-designer/designs
  if (path === "designs") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const token = `d_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const record: DesignRecord = { token, ...(body as object), createdAt: new Date().toISOString() };
    const records = await readDesigns();
    records.unshift(record);
    await writeDesigns(records.slice(0, 500));
    return json({ token });
  }

  return json({ error: "Not found" }, { status: 404 });
};

// ── my-order helpers ──────────────────────────────────────────────────────────

function myOrderErrorPage(title: string, message: string) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;}
  .box{text-align:center;padding:40px;}</style></head>
  <body><div class="box"><h2 style="color:#374151">${title}</h2><p style="color:#6b7280">${message}</p></div></body></html>`;
}

function myOrderEsc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MY_ORDER_CSS_COLORS: Record<string, string> = {
  black:"#000000",white:"#ffffff",red:"#ff0000",green:"#008000",blue:"#0000ff",
  yellow:"#ffff00",orange:"#ffa500",purple:"#800080",pink:"#ffc0cb",gray:"#808080",
  grey:"#808080",cyan:"#00ffff",magenta:"#ff00ff",lime:"#00ff00",navy:"#000080",
  teal:"#008080",maroon:"#800000",olive:"#808000",silver:"#c0c0c0",brown:"#a52a2a",transparent:"#ffffff",
};
function myOrderToHex(color?: string): string {
  if (!color) return "#000000";
  const c = color.trim().toLowerCase();
  if (c.startsWith("#")) return color.toLowerCase();
  if (MY_ORDER_CSS_COLORS[c]) return MY_ORDER_CSS_COLORS[c];
  const rgb = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return "#" + [rgb[1], rgb[2], rgb[3]].map((n) => parseInt(n).toString(16).padStart(2,"0")).join("");
  return color;
}
function myOrderIsDark(color?: string): boolean {
  const hex = myOrderToHex(color).replace("#","");
  if (hex.length < 6) return true;
  return (parseInt(hex.slice(0,2),16)*299 + parseInt(hex.slice(2,4),16)*587 + parseInt(hex.slice(4,6),16)*114)/1000 < 128;
}

function myOrderRenderObject(obj: ReturnType<typeof extractObjects>[number]) {
  const isText = obj.type === "i-text" || obj.type === "textbox";
  const isImage = obj.type === "image";
  const label = isImage ? "Görsel" : isText ? "Metin" : obj.type;
  const dark = myOrderIsDark(obj.fill);
  return `<div class="obj-card">
    ${isImage && obj.src ? `<img class="obj-img" src="${myOrderEsc(obj.src)}" alt="Eklenen görsel" />` : ""}
    ${isText ? `<div class="color-swatch" style="background:${myOrderEsc(myOrderToHex(obj.fill))}"><span style="color:${dark?"#fff":"#000"};font-family:${myOrderEsc(obj.fontFamily??"sans-serif")}">${myOrderEsc(obj.text?.charAt(0)??"A")}</span></div>` : ""}
    <div style="flex:1;min-width:0">
      <div class="obj-label">${label}</div>
      ${isText && obj.text ? `<div class="obj-text">"${myOrderEsc(obj.text)}"</div>` : ""}
      <div class="meta-row">
        ${isText && obj.fontFamily ? `<span class="meta">Font: <strong>${myOrderEsc(obj.fontFamily)}</strong></span>` : ""}
        ${isText && obj.fontSize ? `<span class="meta">Boyut: <strong>${obj.fontSize}px</strong></span>` : ""}
        ${isImage && obj.src ? `<a class="download-link" href="${myOrderEsc(obj.src)}" download target="_blank" rel="noopener">Görseli İndir</a>` : ""}
      </div>
    </div>
  </div>`;
}

function myOrderRenderSide(
  title: string,
  previewUrl: string | undefined,
  printUrl: string | undefined,
  objects: ReturnType<typeof extractObjects>,
) {
  return `<div class="card">
    <div class="card-header"><h2>${title}</h2></div>
    <div class="card-body">
      ${previewUrl ? `<img class="preview-img" src="${myOrderEsc(previewUrl)}" alt="${myOrderEsc(title)}" />` : `<div class="no-preview">Önizleme yok</div>`}
      <div class="btn-group">
        ${printUrl ? `<a class="btn btn-primary" href="${myOrderEsc(printUrl)}" download target="_blank" rel="noopener">⬇ Baskı Dosyasını İndir (Yüksek Kalite)</a>` : ""}
        ${previewUrl ? `<a class="btn btn-secondary" href="${myOrderEsc(previewUrl)}" download target="_blank" rel="noopener">⬇ Önizlemeyi İndir</a>` : ""}
      </div>
      ${objects.length > 0 ? `<div class="section-title">Tasarım Öğeleri</div>${objects.map(myOrderRenderObject).join("")}` : ""}
    </div>
  </div>`;
}

function myOrderRenderPage(
  design: { frontPreviewUrl?: string; backPreviewUrl?: string; frontPrintUrl?: string; backPrintUrl?: string },
  frontObjs: ReturnType<typeof extractObjects>,
  backObjs: ReturnType<typeof extractObjects>,
) {
  const hasFront = design.frontPreviewUrl || frontObjs.length > 0;
  const hasBack  = design.backPreviewUrl  || backObjs.length > 0;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Siparişinizin Tasarımı</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#111827;min-height:100vh}
    .header{background:#fff;border-bottom:1px solid #e5e7eb;padding:20px 24px}
    .header h1{font-size:20px;font-weight:700}
    .header p{font-size:14px;color:#6b7280;margin-top:4px}
    .container{max-width:960px;margin:0 auto;padding:24px 16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    @media(max-width:640px){.grid{grid-template-columns:1fr}}
    .card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
    .card-header{padding:16px 20px;border-bottom:1px solid #f3f4f6}
    .card-header h2{font-size:16px;font-weight:600}
    .card-body{padding:20px}
    .preview-img{width:100%;border-radius:8px;background:#f9fafb;display:block;object-fit:contain;max-height:380px}
    .no-preview{background:#f9fafb;border-radius:8px;padding:60px 20px;text-align:center;color:#9ca3af;font-size:14px}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;border:none;cursor:pointer;transition:all .15s}
    .btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
    .btn-secondary{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}.btn-secondary:hover{background:#e5e7eb}
    .btn-group{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
    .section-title{font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin:16px 0 10px}
    .obj-card{border:1px solid #e5e7eb;border-radius:8px;padding:12px;display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
    .obj-img{width:64px;height:64px;object-fit:contain;border-radius:6px;border:1px solid #e5e7eb;flex-shrink:0}
    .color-swatch{width:40px;height:40px;border-radius:6px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;font-weight:700}
    .obj-label{font-size:13px;font-weight:600;margin-bottom:4px}
    .obj-text{font-size:15px;color:#111827;margin-bottom:6px;font-style:italic}
    .meta-row{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:4px}
    .meta{font-size:12px;color:#6b7280}.meta strong{color:#374151;font-weight:500}
    .download-link{font-size:12px;color:#2563eb;text-decoration:none;margin-top:6px;display:inline-block}
    .download-link:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="header">
    <h1>Siparişinizin Tasarımı</h1>
    <p>Aşağıda siparişinize ait tasarım detayları ve indirme linkleri yer alıyor.</p>
  </div>
  <div class="container">
    <div class="grid">
      ${hasFront ? myOrderRenderSide("Ön Yüz", design.frontPreviewUrl, design.frontPrintUrl, frontObjs) : ""}
      ${hasBack  ? myOrderRenderSide("Arka Yüz", design.backPreviewUrl, design.backPrintUrl, backObjs) : ""}
      ${!hasFront && !hasBack ? `<div class="card" style="grid-column:1/-1"><div class="card-body"><div class="no-preview">Tasarım verisi bulunamadı.</div></div></div>` : ""}
    </div>
  </div>
</body>
</html>`;
}
