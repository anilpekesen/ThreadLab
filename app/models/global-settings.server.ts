import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface GlobalSettings {
  wavespeedApiKey: string;
  surchargeVariantId: string;
}

const DEFAULTS: GlobalSettings = {
  wavespeedApiKey: "",
  surchargeVariantId: "",
};

export async function getGlobalSettings(): Promise<GlobalSettings> {
  await ensureMigrations();
  const result = await query<{ config: Record<string, unknown> }>(
    "SELECT config FROM global_settings WHERE id = 1",
  );
  if (!result.rows.length) return { ...DEFAULTS };
  const saved = result.rows[0].config as Partial<GlobalSettings & { photoroomApiKey?: string }>;
  return {
    ...DEFAULTS,
    ...saved,
    // migrate old photoroomApiKey field — keep wavespeedApiKey if set
    wavespeedApiKey: saved.wavespeedApiKey || "",
  };
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await query(
    `INSERT INTO global_settings (id, config, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = now()`,
    [JSON.stringify(settings)],
  );
}
