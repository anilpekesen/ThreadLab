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

  const surchargeVariantId = config?.settings?.surchargeVariantId || globalSettings.surchargeVariantId || "";

  // Bg removal is available to all shops as long as the server API key is configured.
  // Quota enforcement happens server-side when the removal is actually requested.
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
