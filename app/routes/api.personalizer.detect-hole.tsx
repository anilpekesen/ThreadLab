import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import {
  scanHoleFromPoint,
  scanTemplateHoles,
  type HoleScan,
} from "~/lib/template-hole.server";

/**
 * Mağaza sahibi şablonda fotoğrafın gireceği boşluğa tıklayınca çağrılır.
 * O noktadan yayılarak şekli bulur ve önizleme için küçük bir maske görseli
 * döndürür — böylece kaydetmeden önce doğru alanı seçtiğini görür.
 *
 * x/y verilmezse şablonun kendi şeffaf deliği otomatik aranır.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);

  let body: { templateUrl?: string; x?: number; y?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const templateUrl = String(body.templateUrl ?? "").trim();
  if (!templateUrl) return json({ error: "Şablon görseli yok" }, { status: 400 });

  let buffer: Buffer;
  try {
    const res = await fetch(templateUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(String(res.status));
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return json({ error: `Şablon indirilemedi: ${String(err)}` }, { status: 502 });
  }

  const hasPoint = Number.isFinite(body.x) && Number.isFinite(body.y);
  let scan: HoleScan | null = null;
  let mode: "point" | "auto" = "auto";

  try {
    if (hasPoint) {
      mode = "point";
      scan = await scanHoleFromPoint(buffer, Number(body.x), Number(body.y));
    } else {
      scan = await scanTemplateHoles(buffer);
      if (!scan.holes.length) scan = null;
    }
  } catch (err) {
    return json({ error: `Alan taranamadı: ${String(err)}` }, { status: 500 });
  }

  const hole = scan?.holes[0];
  if (!scan || !hole) {
    return json({
      found: false,
      mode,
      message: hasPoint
        ? "Bu noktadan bir alan bulunamadı. Tasarımın boş kısmına tıklayın."
        : "Şablonda kapalı şeffaf alan yok. Boş kısma tıklayarak elle seçin.",
    });
  }

  // Bulunan şekli küçük bir önizleme olarak çiz: mor dolgu = fotoğrafın
  // görüneceği yer. Ölçek küçültülür, yalnızca doğrulama amaçlı.
  const { width: w, height: h } = scan;
  const overlay = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    if (scan.labels[i] !== hole.id) continue;
    overlay[i * 4] = 99;
    overlay[i * 4 + 1] = 102;
    overlay[i * 4 + 2] = 241;
    overlay[i * 4 + 3] = 150;
  }
  const previewWidth = Math.min(520, w);
  const previewPng = await sharp(overlay, { raw: { width: w, height: h, channels: 4 } })
    .resize(previewWidth)
    .png({ compressionLevel: 9 })
    .toBuffer();

  return json({
    found: true,
    mode,
    hole: { x: hole.x, y: hole.y, width: hole.width, height: hole.height, pixels: hole.pixels },
    templateWidth: w,
    templateHeight: h,
    coverage: Math.round((hole.pixels / (w * h)) * 1000) / 10,
    maskPreview: `data:image/png;base64,${previewPng.toString("base64")}`,
  });
};
