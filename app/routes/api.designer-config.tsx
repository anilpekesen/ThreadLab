import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";

  const [config, globalSettings] = await Promise.all([
    findConfigForStorefront(productId, handle),
    getGlobalSettings(),
  ]);

  if (!config) {
    // Even without product-specific config, return global surcharge so Cart Transform works
    return json({
      settings: { surchargeVariantId: globalSettings.surchargeVariantId || "" },
    });
  }

  const storefrontSettings = toStorefrontSettings(config.settings);

  // Global fallbacks: surchargeVariantId and photoroomApiKey
  const surchargeVariantId =
    config.settings.surchargeVariantId || globalSettings.surchargeVariantId || "";
  const removeBgAvailable = Boolean(
    config.settings.removeBg &&
      (config.settings.photoroomApiKey || globalSettings.photoroomApiKey),
  );

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
