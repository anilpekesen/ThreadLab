import { type LoaderFunctionArgs } from "@remix-run/node";
import {
  getPersonalizerTemplatePublic,
  getPersonalizerTemplateByProduct,
  normalizeSide,
} from "~/models/personalizer.server";
import { buildSlotResponse } from "~/lib/slot-embed.server";

/**
 * Çoklu fotoğraflı ürünlerin müşteri sayfası.
 *
 * Sayfanın kendisi `~/lib/slot-embed.server` içinde: rota dosyasından sunucu
 * modülü ihraç etmek Remix'in istemci paketine sunucu kodu sızdırmasına yol
 * açıyor. Eski `embed/personalizer` adresi de aynı yapıcıyı çağırıyor.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";
  const side = url.searchParams.get("side") ?? "front";

  const template = templateId
    ? await getPersonalizerTemplatePublic(templateId)
    : productId
      ? await getPersonalizerTemplateByProduct(shop, productId, normalizeSide(side))
      : null;

  const res = await buildSlotResponse(template, {
    variantId: url.searchParams.get("variantId") ?? "",
    shop,
    locale: url.searchParams.get("locale") ?? "tr",
  });

  // Slotu olmayan şablon bu rotaya ait değil
  return res ?? new Response("Bu şablon çoklu fotoğraf alanı içermiyor.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
