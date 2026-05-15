import { type LoaderFunctionArgs } from "@remix-run/node";
import { getDesignByToken, extractObjects, type DesignObject } from "~/models/designs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  if (!token) {
    return new Response(errorPage("Geçersiz link", "Tasarım token'ı eksik."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const design = await getDesignByToken(token);
  if (!design) {
    return new Response(errorPage("Tasarım bulunamadı", "Bu tasarım artık mevcut değil veya link hatalı."), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const frontObjects = extractObjects(design.designJson, "front");
  const backObjects = extractObjects(design.designJson, "back");

  const html = renderPage(design, frontObjects, backObjects);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

function errorPage(title: string, message: string) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
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

function renderPage(design: Design, frontObjs: DesignObject[], backObjs: DesignObject[]) {
  const hasFront = design.frontPreviewUrl || frontObjs.length > 0;
  const hasBack = design.backPreviewUrl || backObjs.length > 0;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Siparişinizin Tasarımı</title>
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
    <h1>Siparişinizin Tasarımı</h1>
    <p>Aşağıda siparişinize ait tasarım detayları ve indirme linkleri yer alıyor.</p>
  </div>
  <div class="container">
    <div class="grid">
      ${hasFront ? renderSide("Ön Yüz", design.frontPreviewUrl, design.frontPrintUrl, frontObjs) : ""}
      ${hasBack ? renderSide("Arka Yüz", design.backPreviewUrl, design.backPrintUrl, backObjs) : ""}
      ${!hasFront && !hasBack ? `<div class="card full-card"><div class="card-body"><div class="no-preview">Tasarım verisi bulunamadı.</div></div></div>` : ""}
    </div>
  </div>
</body>
</html>`;
}

function renderSide(title: string, previewUrl?: string, printUrl?: string, objects: DesignObject[] = []) {
  return `
    <div class="card">
      <div class="card-header"><h2>${title}</h2></div>
      <div class="card-body">
        ${previewUrl
          ? `<img class="preview-img" src="${esc(previewUrl)}" alt="${esc(title)} önizlemesi" />`
          : `<div class="no-preview">Önizleme yok</div>`}
        <div class="btn-group">
          ${printUrl ? `<a class="btn btn-primary" href="${esc(printUrl)}" download target="_blank">⬇ Baskı Dosyasını İndir (Yüksek Kalite)</a>` : ""}
          ${previewUrl ? `<a class="btn btn-secondary" href="${esc(previewUrl)}" download target="_blank">⬇ Önizlemeyi İndir</a>` : ""}
        </div>
        ${objects.length > 0 ? `
          <div class="section-title">Tasarım Öğeleri</div>
          ${objects.map(renderObject).join("")}
        ` : ""}
      </div>
    </div>`;
}

function renderObject(obj: DesignObject) {
  const isText = obj.type === "i-text" || obj.type === "textbox";
  const isImage = obj.type === "image";
  const dark = isDark(obj.fill);
  const label = isImage ? "Görsel" : isText ? "Metin" : obj.type;

  return `<div class="obj-card">
    ${isImage && obj.src ? `<img class="obj-img" src="${esc(obj.src)}" alt="Eklenen görsel" />` : ""}
    ${isText ? `<div class="color-swatch" style="background:${esc(toHex(obj.fill))}"><span style="color:${dark ? "#fff" : "#000"};font-family:${esc(obj.fontFamily ?? "sans-serif")}">${esc(obj.text?.charAt(0) ?? "A")}</span></div>` : ""}
    <div style="flex:1;min-width:0">
      <div class="obj-label">${label}</div>
      ${isText && obj.text ? `<div class="obj-text">"${esc(obj.text)}"</div>` : ""}
      <div class="meta-row">
        ${isText && obj.fontFamily ? `<span class="meta">Font: <strong>${esc(obj.fontFamily)}</strong></span>` : ""}
        ${isText && obj.fontSize ? `<span class="meta">Boyut: <strong>${obj.fontSize}px</strong></span>` : ""}
        ${isText && obj.fill ? `<span class="meta">Renk: <span class="dot" style="background:${esc(toHex(obj.fill))};border-color:${esc(toHex(obj.fill))}"></span><strong style="font-family:monospace">${esc(toHex(obj.fill))}</strong></span>` : ""}
        ${isText && obj.fontWeight && String(obj.fontWeight) !== "normal" ? `<span class="meta">Kalınlık: <strong>${esc(String(obj.fontWeight))}</strong></span>` : ""}
        ${isText && obj.fontStyle === "italic" ? `<span class="meta"><strong>İtalik</strong></span>` : ""}
        ${isText && obj.underline ? `<span class="meta"><strong>Alt çizgili</strong></span>` : ""}
        ${isText && obj.textAlign && obj.textAlign !== "left" ? `<span class="meta">Hizalama: <strong>${esc(obj.textAlign)}</strong></span>` : ""}
        ${isImage && obj.width && obj.scaleX ? `<span class="meta">Boyut: <strong>${Math.round(obj.width * obj.scaleX)} × ${Math.round((obj.height ?? 0) * (obj.scaleY ?? 1))}px</strong></span>` : ""}
        ${obj.angle ? `<span class="meta">Açı: <strong>${Math.round(obj.angle)}°</strong></span>` : ""}
      </div>
      ${isImage && obj.src ? `<a class="download-link" href="${esc(obj.src)}" download target="_blank">Görseli İndir</a>` : ""}
    </div>
  </div>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CSS_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080",
  grey: "#808080", cyan: "#00ffff", magenta: "#ff00ff", lime: "#00ff00", navy: "#000080",
  teal: "#008080", maroon: "#800000", olive: "#808000", silver: "#c0c0c0", brown: "#a52a2a",
  transparent: "#ffffff",
};

function toHex(color?: string): string {
  if (!color) return "#000000";
  const c = color.trim().toLowerCase();
  if (c.startsWith("#")) return color.toLowerCase();
  if (CSS_COLORS[c]) return CSS_COLORS[c];
  const rgb = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return "#" + [rgb[1], rgb[2], rgb[3]].map((n) => parseInt(n).toString(16).padStart(2, "0")).join("");
  }
  return color;
}

function isDark(color?: string): boolean {
  const hex = toHex(color).replace("#", "");
  if (hex.length < 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
