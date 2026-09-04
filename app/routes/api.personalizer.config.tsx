import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  getPersonalizerTemplatePublic,
  getPersonalizerTemplateByProduct,
  normalizeSide,
} from "~/models/personalizer.server";
import { buildSlotData } from "~/lib/slot-embed.server";

/**
 * Varyanta göre yapılandırma.
 *
 * Müşteri rengi ya da bordürü değiştirdiğinde sayfa yeniden yüklenmemeli:
 * yüklediği fotoğraflar kaybolur ve baştan başlamak zorunda kalır. Bu uç,
 * yeni varyantın yerleşimini ve görsellerini JSON olarak veriyor; arayüz
 * fotoğrafları koruyarak kendini yeniden çiziyor.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(null, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  let body: {
    templateId?: string;
    productId?: string;
    variantId?: string;
    shop?: string;
    side?: string;
    locale?: string;
    optionValues?: string[];
  };
  try { body = await request.json(); }
  catch { return json({ error: "Geçersiz istek" }, { status: 400, headers: CORS }); }

  const shop = String(body.shop ?? "");
  const productId = String(body.productId ?? "");
  const variantId = String(body.variantId ?? "");

  // Ürün bağlantısı önce; bkz. embed.personalizer içindeki aynı sıralama
  const template =
    (productId
      ? await getPersonalizerTemplateByProduct(shop, productId, normalizeSide(body.side), variantId)
      : null)
    ?? (body.templateId ? await getPersonalizerTemplatePublic(String(body.templateId)) : null);

  if (!template) return json({ error: "Şablon bulunamadı" }, { status: 404, headers: CORS });

  const built = await buildSlotData(template, {
    variantId,
    shop,
    productId,
    locale: String(body.locale ?? "tr"),
    optionValues: Array.isArray(body.optionValues) ? body.optionValues.map(String) : [],
  });

  if (!built) return json({ error: "Bu şablon çoklu alan içermiyor" }, { status: 400, headers: CORS });
  if ("page" in built) return json({ error: "Şablon eksik kurulmuş" }, { status: 400, headers: CORS });

  return json({ data: built.data }, { headers: CORS });
};
