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
  const variantId = url.searchParams.get("variantId") ?? "";

  // Ürün kimliği varsa önce ürün+varyant bağlantısı; yoksa şablon kimliği.
  // Bkz. embed.personalizer içindeki aynı sıralama.
  const template =
    (productId
      ? await getPersonalizerTemplateByProduct(shop, productId, normalizeSide(side), variantId)
      : null)
    ?? (templateId ? await getPersonalizerTemplatePublic(templateId) : null);

  const res = await buildSlotResponse(template, {
    variantId,
    shop,
    locale: url.searchParams.get("locale") ?? "tr",
    // Tema, seçili varyantın seçenek değerlerini gönderiyor ("Ceviz|Tam Alan").
    // Admin API'ye gitmeden doğru mockup'ı seçebilmek için en ucuz yol bu.
    optionValues: (url.searchParams.get("options") ?? "").split("|").filter(Boolean),
  });

  // Slotu olmayan şablon bu rotaya ait değil
  return res ?? new Response("Bu şablon çoklu fotoğraf alanı içermiyor.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
