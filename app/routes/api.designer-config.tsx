import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  const [config, globalSettings, shopSettings] = await Promise.all([
    findConfigForStorefront(productId, handle),
    getGlobalSettings(),
    shop ? getShopSettings(shop) : Promise.resolve(null),
  ]);

  const surchargeVariantId =
    config?.settings?.surchargeVariantId ||
    shopSettings?.surchargeVariantId ||
    globalSettings.surchargeVariantId ||
    "";

  const removeBgAvailable = Boolean(
    process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey,
  );

  if (!config) {
    return json({
      settings: { surchargeVariantId, removeBgAvailable },
    });
  }

  const storefrontSettings = toStorefrontSettings(config.settings);

  return json({
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
    },
    printAreas: config.printAreas,
  });
};
