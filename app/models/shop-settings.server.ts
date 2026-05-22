import { query, runMigrations } from "~/lib/db.server";
import { getGlobalSettings } from "~/models/global-settings.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface ShopSettings {
  surchargeVariantId: string;
  customerBgLimit: number;
}

const DEFAULTS: ShopSettings = {
  surchargeVariantId: "",
  customerBgLimit: 5,
};

export async function getShopSettings(shop: string): Promise<ShopSettings> {
  await ensureMigrations();
  const result = await query<{ config: Record<string, unknown> }>(
    "SELECT config FROM shop_settings WHERE shop = $1",
    [shop],
  );

  if (!result.rows.length) {
    // One-time migration: fall back to global_settings for existing data
    const globalFallback = await getGlobalSettings().catch(() => null);
    return {
      surchargeVariantId: globalFallback?.surchargeVariantId ?? DEFAULTS.surchargeVariantId,
      customerBgLimit: Number(globalFallback?.customerBgLimit) > 0
        ? Number(globalFallback?.customerBgLimit)
        : DEFAULTS.customerBgLimit,
    };
  }

  const saved = result.rows[0].config as Partial<ShopSettings>;
  return {
    surchargeVariantId: saved.surchargeVariantId ?? DEFAULTS.surchargeVariantId,
    customerBgLimit: Number(saved.customerBgLimit) > 0
      ? Number(saved.customerBgLimit)
      : DEFAULTS.customerBgLimit,
  };
}

export async function saveShopSettings(shop: string, settings: Partial<ShopSettings>): Promise<void> {
  await ensureMigrations();
  const current = await getShopSettings(shop);
  const merged = { ...current, ...settings };
  await query(
    `INSERT INTO shop_settings (shop, config, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (shop) DO UPDATE SET config = $2, updated_at = now()`,
    [shop, JSON.stringify(merged)],
  );
}
