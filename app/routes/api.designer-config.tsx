import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopPlan, getBgRemovalCount } from "~/models/bg-removal-usage.server";
import { PLANS } from "~/lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const shop = url.searchParams.get("shop") ?? "";

  const [config, globalSettings] = await Promise.all([
    findConfigForStorefront(productId, handle),
    getGlobalSettings(),
  ]);

  const surchargeVariantId = config?.settings?.surchargeVariantId || globalSettings.surchargeVariantId || "";

  // Background removal: plan-based, server API key required
  const hasApiKey = Boolean(
    process.env.WAVESPEED_API_KEY || globalSettings.wavespeedApiKey,
  );
  let removeBgAvailable = false;
  if (hasApiKey && shop) {
    try {
      const [planKey, usedCount] = await Promise.all([
        getShopPlan(shop),
        getBgRemovalCount(shop),
      ]);
      const plan = PLANS[planKey];
      removeBgAvailable = plan.allowRemoveBg && (plan.removeBgMonthlyQuota === -1 || usedCount < plan.removeBgMonthlyQuota);
    } catch { /* DB unavailable — deny */ }
  }

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
