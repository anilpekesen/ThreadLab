import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  buildDefaultConfig,
  findConfigForStorefront,
  getProductPrintAreas,
  toStorefrontSettings,
} from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import {
  getPersonalizerTemplateByProduct,
  listTemplateSidesForProduct,
} from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";
  const variantId = (url.searchParams.get("variantId") ?? "").split("/").pop() ?? "";
  const numericProductId = String(productId).split("/").pop() ?? "";

  const [config, globalSettings, shopSettings, linkedTemplate, templateSides] = await Promise.all([
    findConfigForStorefront(shop, productId, handle),
    getGlobalSettings(),
    shop ? getShopSettings(shop) : Promise.resolve(null),
    numericProductId
      ? getPersonalizerTemplateByProduct(shop, numericProductId, "front", variantId).catch(() => null)
      : Promise.resolve(null),
    numericProductId
      ? listTemplateSidesForProduct(shop, numericProductId, variantId).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Slot ya da parça taşıyan şablonlar tasarımcıya ait değil: onları ürün
  // sayfasındaki kişiselleştirme kutusu (tema bloğu + ürün metafield'ı) açar.
  // Çok fotoğraflı çerçevelerde ikisi birden çıkıyordu — müşteri hem kutuya
  // fotoğraf yüklüyor hem de altında hiçbir işe yaramayan tasarım aracını
  // görüyordu. Bağlantı tipi ayrımı app.personalizer.$id.tsx'teki metafield
  // kuralıyla aynı olmalı, yoksa iki taraf birbirini tutmaz.
  const slotluSablon = Boolean(
    (linkedTemplate?.slots?.length ?? 0) > 0 || (linkedTemplate?.pieces?.length ?? 0) > 0,
  );

  // Personalizer bağlantısı tek başına tasarımcıyı açabilmeli. Yeni eklenen
  // Shopify ürününde henüz product_settings kaydı yoksa eski davranış 404
  // döndürüp iframe'i tamamen gizliyordu; şablon ve fotoğraf deliği doğru
  // olmasına rağmen müşteri yükleme düğmesine hiç ulaşamıyordu. Slotlu şablon
  // bu istisnaya girmez: ürünün ayrıca yapılandırılmış bir tasarımcı kaydı
  // yoksa tasarımcı hiç açılmaz.
  if (!config && (!linkedTemplate || slotluSablon)) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const inferredProductType = linkedTemplate?.category === "boxer"
    || /boxer|baksır|baksir|şort|sort/i.test(`${linkedTemplate?.name ?? ""} ${handle}`)
    ? "boxer"
    : "apparel";
  const fallbackSettings = buildDefaultConfig({
    title: linkedTemplate?.name ?? "",
    handle,
    productType: inferredProductType,
  });
  if (!config && templateSides.length === 1 && templateSides[0] === "front") {
    fallbackSettings.surfaceMode = "front_only";
  }
  const resolvedSettings = config?.settings ?? fallbackSettings;
  const resolvedProductId = config?.productId ?? numericProductId;
  const resolvedPrintAreas = config?.printAreas ?? await getProductPrintAreas(
    shop,
    resolvedProductId,
    resolvedSettings.productType,
    resolvedSettings.surfaceMode,
    resolvedSettings,
  );

  const surchargeVariantId =
    resolvedSettings.surchargeVariantId ||
    shopSettings?.surchargeVariantId ||
    globalSettings.surchargeVariantId ||
    "";

  const removeBgAvailable = Boolean(
    process.env.WAVESPEED_API_KEY || shopSettings?.wavespeedApiKey || globalSettings.wavespeedApiKey,
  );

  const storefrontSettings = toStorefrontSettings(resolvedSettings);

  const termsUrl = shopSettings?.termsUrl || "";

  // Ürüne şablon bağlıysa tasarımcı "fotoğrafını yükle" panelini gösterir;
  // fotoğraf sunucuda şablonun boşluğuna maskelenip tek görsel olarak döner.
  // Ürünün ön ve arka yüzü ayrı şablonlara bağlı olabilir; müşteri hangisini
  // isterse onu kişiselleştirir. templateDesign yer tutucu için ön yüzü
  // anlatır, templateSides ise "Fotoğrafını ekle" çağrısının hangi sekmelerde
  // çıkacağını belirler.
  return json({
    // Slotlu şablonda tasarımcının kendi "Fotoğrafını ekle" paneli de
    // susturulur: o akış tek delikli maske için yazılmış, 12 fotoğraflık
    // çerçeveyi doğru dolduramaz. Ürünün yapılandırılmış bir tasarımcı kaydı
    // varsa tasarımcı yine açılır, sadece şablon paneli çıkmaz.
    templateSides: slotluSablon ? [] : templateSides,
    templateDesign: linkedTemplate && !slotluSablon
      ? {
          id: linkedTemplate.id,
          name: linkedTemplate.name,
          description: linkedTemplate.description,
          previewUrl: linkedTemplate.template_url,
          // Dağıtımlı ve AI şablonunun hazır tasarım görseli yoktur; tasarımcı
          // yer tutucu koymadan doğrudan "fotoğrafını ekle" çağrısını gösterir.
          layoutMode: linkedTemplate.layout_mode,
        }
      : null,
    product: {
      id: resolvedProductId,
      title: resolvedSettings.productTitle,
      handle: resolvedSettings.productHandle,
      productType: resolvedSettings.productType,
      surfaceMode: resolvedSettings.surfaceMode,
    },
    settings: {
      ...storefrontSettings,
      surchargeVariantId,
      removeBgAvailable,
      termsUrl,
    },
    printAreas: resolvedPrintAreas,
    variantMockups: resolvedSettings.variantMockups ?? {},
  });
};
