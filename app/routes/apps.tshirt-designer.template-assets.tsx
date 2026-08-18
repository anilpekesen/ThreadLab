import { json, type LoaderFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { getPersonalizerTemplateByProduct } from "~/models/personalizer.server";
import { scanTemplateHoles, scanHoleFromPoint } from "~/lib/template-hole.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * Tasarımcının müşteriye canlı ayar penceresi gösterebilmesi için şablonu ve
 * deliğin maskesini döndürür.
 *
 * Maske istemciye gönderildiği için kompozisyonun tamamı tarayıcıda yapılır:
 * müşterinin gördüğü görsel, basılacak görselin ta kendisi olur. İki ayrı
 * hesap olmadığı için önizleme ile baskı arasında uyuşmazlık riski kalmaz.
 *
 * Maske tipik olarak 2 KB civarındadır (tek renk, PNG çok iyi sıkışır), bu
 * yüzden ayrı dosya yerine gömülü gönderilir.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const productId = (url.searchParams.get("productId") ?? "").split("/").pop() ?? "";
  if (!shop || !productId) {
    return json({ error: "shop ve productId gerekli" }, { status: 400, headers: CORS });
  }

  const template = await getPersonalizerTemplateByProduct(shop, productId).catch(() => null);
  if (!template?.template_url) {
    return json({ error: "Bu ürüne bağlı şablon yok" }, { status: 404, headers: CORS });
  }

  // Dağıtımlı şablonda tasarım dosyası yok: müşteriye yalnızca tip, metin
  // alanları ve süsleme önizlemesi gerekir. Delik taramasına gerek yok.
  if (template.layout_mode === "scatter") {
    return json(
      {
        templateId: template.id,
        templateName: template.name,
        layoutMode: "scatter" as const,
        decorationUrl: template.decoration_url || null,
        textFields: (template.text_fields ?? []).map((f) => ({
          id: f.id,
          label: f.label,
          placeholder: f.placeholder,
          maxLength: f.max_length,
        })),
      },
      { headers: { ...CORS, "Cache-Control": "public, max-age=300" } },
    );
  }

  let templateBuf: Buffer;
  try {
    const res = await fetch(template.template_url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(String(res.status));
    templateBuf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return json({ error: `Şablon indirilemedi: ${String(err)}` }, { status: 502, headers: CORS });
  }

  const useSeed = template.hole_seed_x >= 0 && template.hole_seed_y >= 0;
  const scan = useSeed
    ? await scanHoleFromPoint(templateBuf, template.hole_seed_x, template.hole_seed_y).catch(() => null)
    : await scanTemplateHoles(templateBuf).catch(() => null);

  const hole = scan?.holes[0];
  if (!scan || !hole) {
    return json(
      { error: "Şablonda fotoğrafın gireceği boşluk bulunamadı" },
      { status: 422, headers: CORS },
    );
  }

  // Delik opak beyaz, gerisi saydam — tarayıcıda hem fotoğrafı kırpmak
  // (destination-in) hem şablonu delmek (destination-out) için kullanılır.
  const maskRaw = Buffer.alloc(scan.width * scan.height * 4);
  for (let i = 0; i < scan.width * scan.height; i++) {
    if (scan.labels[i] !== hole.id) continue;
    maskRaw[i * 4] = 255;
    maskRaw[i * 4 + 1] = 255;
    maskRaw[i * 4 + 2] = 255;
    maskRaw[i * 4 + 3] = 255;
  }
  const maskPng = await sharp(maskRaw, {
    raw: { width: scan.width, height: scan.height, channels: 4 },
  }).png({ compressionLevel: 9, palette: true }).toBuffer();

  return json(
    {
      templateId: template.id,
      templateName: template.name,
      layoutMode: "mask" as const,
      templateUrl: template.template_url,
      width: scan.width,
      height: scan.height,
      hole: { x: hole.x, y: hole.y, width: hole.width, height: hole.height },
      maskDataUrl: `data:image/png;base64,${maskPng.toString("base64")}`,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=300" } },
  );
};
