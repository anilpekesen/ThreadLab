import { query } from "~/lib/db.server";

export interface GlobalSettings {
  photoroomApiKey: string;
  surchargeVariantId: string;
}

const DEFAULTS: GlobalSettings = {
  photoroomApiKey: "",
  surchargeVariantId: "",
};

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const result = await query<{ config: GlobalSettings }>(
    "SELECT config FROM global_settings WHERE id = 1",
  );
  if (!result.rows.length) return { ...DEFAULTS };
  return { ...DEFAULTS, ...result.rows[0].config };
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await query(
    `INSERT INTO global_settings (id, config, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = now()`,
    [JSON.stringify(settings)],
  );
}
