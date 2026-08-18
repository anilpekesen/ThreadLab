import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { getPersonalizerTemplateByProduct } from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  const [config, globalSettings, shopSettings] = await Promise.all([
    findConfigForStorefront(shop, productId, handle),
    getGlobalSettings(),
    shop ? getShopSettings(shop) : Promise.resolve(null),
  ]);

  const surchargeVariantId =
    config?.settings?.surchargeVariantId ||
    shopSettings?.surchargeVariantId ||
    globalSettings.surchargeVariantId ||
    "";

  const removeBgAvailable = Boolean(
    process.env.WAVESPEED_API_KEY || shopSettings?.wavespeedApiKey || globalSettings.wavespeedApiKey,
  );

  if (!config) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const storefrontSettings = toStorefrontSettings(config.settings);

  const termsUrl = shopSettings?.termsUrl || "";

  // Ürüne şablon bağlıysa tasarımcı "fotoğrafını yükle" panelini gösterir;
  // fotoğraf sunucuda şablonun boşluğuna maskelenip tek görsel olarak döner.
  const numericProductId = String(config.productId).split("/").pop() ?? "";
  const linkedTemplate = await getPersonalizerTemplateByProduct(shop, numericProductId).catch(() => null);

  return json({
    templateDesign: linkedTemplate
      ? {
          id: linkedTemplate.id,
          name: linkedTemplate.name,
          description: linkedTemplate.description,
          previewUrl: linkedTemplate.template_url,
        }
      : null,
    product: {
      id: config.productId,
      title: config.settings.productTitle,
      handle: config.settings.productHandle,
      productType: config.settings.productType,
      surfaceMode: config.settings.surfaceMode,
    },
    settings: {
      ...storefrontSettings,
      surchargeVariantId,
      removeBgAvailable,
      termsUrl,
    },
    printAreas: config.printAreas,
    variantMockups: config.settings.variantMockups ?? {},
  });
};
