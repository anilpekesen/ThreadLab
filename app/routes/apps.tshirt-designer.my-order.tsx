import { type LoaderFunctionArgs } from "@remix-run/node";
import { getDesignByToken, extractObjects, type DesignObject } from "~/models/designs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const shop = url.searchParams.get("shop") ?? "";
  const copy = myOrderCopy(resolveMyOrderLang(url, shop));

  if (!token) {
    return new Response(errorPage(copy.errorInvalidTitle, copy.errorInvalidMessage, copy.lang), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const design = await getDesignByToken(shop, token);
  if (!design) {
    return new Response(errorPage(copy.errorNotFoundTitle, copy.errorNotFoundMessage, copy.lang), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const frontObjects = extractObjects(design.designJson, "front");
  const backObjects = extractObjects(design.designJson, "back");

  const html = renderPage(design, frontObjects, backObjects, copy);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

type MyOrderLang = "tr" | "en";

function resolveMyOrderLang(url: URL, shop: string): MyOrderLang {
  const explicit = (url.searchParams.get("lang") || url.searchParams.get("locale") || "").toLowerCase();
  if (explicit.startsWith("en")) return "en";
  if (explicit.startsWith("tr")) return "tr";
  const shopKey = shop.toLowerCase();
  if (shopKey.includes("iabvsb-jv") || shopKey.includes("bikafa") || shopKey.includes("whanotify-dev")) return "tr";
  return "en";
}

function myOrderCopy(lang: MyOrderLang) {
  const tr = lang === "tr";
  return {
    lang,
    title: tr ? "Siparişinizin Tasarımı" : "Your Order Design",
    subtitle: tr
      ? "Aşağıda siparişinize ait tasarım detayları ve indirme linkleri yer alıyor."
      : "Your order design details and download links are shown below.",
    front: tr ? "Ön Yüz" : "Front Side",
    back: tr ? "Arka Yüz" : "Back Side",
    noData: tr ? "Tasarım verisi bulunamadı." : "No design data found.",
    noPreview: tr ? "Önizleme yok" : "No preview available",
    previewAltSuffix: tr ? "önizlemesi" : "preview",
    downloadPrint: tr ? "Baskı Dosyasını İndir (Yüksek Kalite)" : "Download Print File (High Quality)",
    downloadPreview: tr ? "Önizlemeyi İndir" : "Download Preview",
    errorInvalidTitle: tr ? "Geçersiz link" : "Invalid link",
    errorInvalidMessage: tr ? "Tasarım token'ı eksik." : "Design token is missing.",
    errorNotFoundTitle: tr ? "Tasarım bulunamadı" : "Design not found",
    errorNotFoundMessage: tr
      ? "Bu tasarım artık mevcut değil veya link hatalı."
      : "This design is no longer available or the link is incorrect.",
  };
}

function errorPage(title: string, message: string, lang: MyOrderLang) {
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;}
  .box{text-align:center;padding:40px;}</style></head>
  <body><div class="box"><h2 style="color:#374151">${title}</h2><p style="color:#6b7280">${message}</p></div></body></html>`;
}

interface Design {
  frontPreviewUrl?: string;
  backPreviewUrl?: string;
  frontPrintUrl?: string;
  backPrintUrl?: string;
}

function renderPage(design: Design, frontObjs: DesignObject[], backObjs: DesignObject[], copy: ReturnType<typeof myOrderCopy>) {
  const hasFront = design.frontPreviewUrl || frontObjs.length > 0;
  const hasBack = design.backPreviewUrl || backObjs.length > 0;

  return `<!DOCTYPE html>
<html lang="${copy.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${copy.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; color: #111827; min-height: 100vh; }
    .header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 20px 24px; }
    .header h1 { font-size: 20px; font-weight: 700; color: #111827; }
    .header p { font-size: 14px; color: #6b7280; margin-top: 4px; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .card-header { padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
    .card-header h2 { font-size: 16px; font-weight: 600; }
    .card-body { padding: 20px; }
    .preview-img { width: 100%; border-radius: 8px; background: #f9fafb; display: block; object-fit: contain; max-height: 380px; }
    .no-preview { background: #f9fafb; border-radius: 8px; padding: 60px 20px; text-align: center; color: #9ca3af; font-size: 14px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; border: none; cursor: pointer; transition: all .15s; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .section-title { font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; margin: 16px 0 10px; }
    .obj-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .obj-card:last-child { margin-bottom: 0; }
    .color-swatch { width: 40px; height: 40px; border-radius: 6px; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; font-weight: 700; }
    .obj-img { width: 64px; height: 64px; object-fit: contain; border-radius: 6px; border: 1px solid #e5e7eb; flex-shrink: 0; }
    .obj-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .obj-text { font-size: 15px; color: #111827; margin-bottom: 6px; font-style: italic; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 4px; }
    .meta { font-size: 12px; color: #6b7280; }
    .meta strong { color: #374151; font-weight: 500; }
    .meta .dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid #d1d5db; vertical-align: middle; margin: 0 3px; }
    .download-link { font-size: 12px; color: #2563eb; text-decoration: none; margin-top: 6px; display: inline-block; }
    .download-link:hover { text-decoration: underline; }
    .full-card { grid-column: 1 / -1; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${copy.title}</h1>
    <p>${copy.subtitle}</p>
  </div>
  <div class="container">
    <div class="grid">
      ${hasFront ? renderSide(copy.front, design.frontPreviewUrl, design.frontPrintUrl, copy) : ""}
      ${hasBack ? renderSide(copy.back, design.backPreviewUrl, design.backPrintUrl, copy) : ""}
      ${!hasFront && !hasBack ? `<div class="card full-card"><div class="card-body"><div class="no-preview">${copy.noData}</div></div></div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

function renderSide(title: string, previewUrl: string | undefined, printUrl: string | undefined, copy: ReturnType<typeof myOrderCopy>) {
  return `
    <div class="card">
      <div class="card-header"><h2>${title}</h2></div>
      <div class="card-body">
        ${previewUrl
          ? `<img class="preview-img" src="${esc(previewUrl)}" alt="${esc(title)} ${copy.previewAltSuffix}" />`
          : `<div class="no-preview">${copy.noPreview}</div>`}
        <div class="btn-group">
          ${printUrl ? `<a class="btn btn-primary" href="${esc(printUrl)}" download target="_blank">⬇ ${copy.downloadPrint}</a>` : ""}
          ${previewUrl ? `<a class="btn btn-secondary" href="${esc(previewUrl)}" download target="_blank">⬇ ${copy.downloadPreview}</a>` : ""}
        </div>
      </div>
    </div>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
