import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import sharp from "sharp";
import { uploadToR2 } from "~/lib/r2.server";
import { getPersonalizerTemplateByProduct } from "~/models/personalizer.server";
import {
  scanTemplateHoles,
  scanHoleFromPoint,
  buildMaskedPhotoLayer,
  punchHoleInTemplate,
} from "~/lib/template-hole.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Müşterinin fotoğrafını, ürüne bağlı şablonun boşluğuna maskeleyip tek bir
 * PNG olarak döndürür. Tasarımcı bu PNG'yi normal bir görsel nesnesi gibi
 * tişörtün üzerine koyar; taşıma, ölçekleme, baskı alanı ve fiyat hesabı
 * mevcut akışta olduğu gibi çalışır.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  try {
    const form = await unstable_parseMultipartFormData(
      request,
      unstable_createMemoryUploadHandler({ maxPartSize: 15 * 1024 * 1024 }),
    );

    const shop = String(form.get("shop") ?? "").trim();
    const productId = String(form.get("productId") ?? "").trim();
    const photo = form.get("photo");

    if (!shop || !productId) {
      return json({ error: "shop ve productId gerekli" }, { status: 400, headers: CORS });
    }
    if (!(photo instanceof File) || photo.size === 0) {
      return json({ error: "Fotoğraf yüklenmedi" }, { status: 400, headers: CORS });
    }

    const template = await getPersonalizerTemplateByProduct(shop, productId);
    if (!template?.template_url) {
      return json({ error: "Bu ürüne bağlı şablon yok" }, { status: 404, headers: CORS });
    }

    const tplRes = await fetch(template.template_url, { signal: AbortSignal.timeout(20_000) });
    if (!tplRes.ok) {
      return json({ error: `Şablon indirilemedi (${tplRes.status})` }, { status: 502, headers: CORS });
    }
    const templateBuf = Buffer.from(await tplRes.arrayBuffer());
    const photoBuf = Buffer.from(await photo.arrayBuffer());

    // Mağaza sahibi boşluğa tıkladıysa o nokta, yoksa şeffaf delik otomatik
    const useSeed = template.hole_seed_x >= 0 && template.hole_seed_y >= 0;
    const scan = useSeed
      ? await scanHoleFromPoint(templateBuf, template.hole_seed_x, template.hole_seed_y)
      : await scanTemplateHoles(templateBuf);

    const hole = scan?.holes[0];
    if (!scan || !hole) {
      return json(
        { error: "Şablonda fotoğrafın gireceği boşluk bulunamadı. Yönetim panelinden boşluğa tıklayarak seçin." },
        { status: 422, headers: CORS },
      );
    }

    const photoLayer = await buildMaskedPhotoLayer(photoBuf, scan, hole);
    const topLayer = useSeed ? await punchHoleInTemplate(templateBuf, scan, hole) : templateBuf;
    const composed = await sharp(photoLayer).composite([{ input: topLayer }]).png().toBuffer();

    const url = await uploadToR2(composed, "png", "uploads/template-design");
    const meta = await sharp(composed).metadata();

    console.log(
      `[template-compose] ${template.name}: delik ${hole.width}x${hole.height} ` +
      `(${useSeed ? "tiklama" : "otomatik"}) -> ${url}`,
    );

    return json(
      {
        url,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        templateName: template.name,
        hole: { width: hole.width, height: hole.height },
      },
      { headers: CORS },
    );
  } catch (err) {
    console.error("[template-compose]", err);
    return json({ error: `Tasarım oluşturulamadı: ${String(err)}` }, { status: 500, headers: CORS });
  }
};
