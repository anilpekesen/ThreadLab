import { query, runMigrations } from "~/lib/db.server";
import { deleteR2ObjectByUrl, getR2KeyFromPublicUrl } from "~/lib/r2.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

type CleanupDesignRow = {
  shop: string;
  token: string;
  design_json: unknown;
  front_preview_url: string | null;
  back_preview_url: string | null;
  front_print_url: string | null;
  back_print_url: string | null;
  created_at: Date;
};

export type DesignCleanupResult = {
  dryRun: boolean;
  olderThanDays: number;
  limit: number;
  candidates: number;
  designsDeleted: number;
  r2ObjectsFound: number;
  r2ObjectsDeleted: number;
  r2DeleteFailures: number;
  skippedBecauseOrderExists: number;
  errors: Array<{ token: string; message: string }>;
};

function collectUrlValues(value: unknown, urls: Set<string>) {
  if (!value) return;

  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && getR2KeyFromPublicUrl(value)) {
      urls.add(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrlValues(item, urls);
    return;
  }

  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUrlValues(item, urls);
    }
  }
}

function collectDesignR2Urls(row: CleanupDesignRow): string[] {
  const urls = new Set<string>();
  collectUrlValues(row.front_preview_url, urls);
  collectUrlValues(row.back_preview_url, urls);
  collectUrlValues(row.front_print_url, urls);
  collectUrlValues(row.back_print_url, urls);
  collectUrlValues(row.design_json, urls);
  return Array.from(urls);
}

async function hasOrderForDesign(shop: string, token: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM orders WHERE shop = $1 AND design_token = $2 LIMIT 1",
    [shop, token],
  );
  return result.rows.length > 0;
}

async function deleteDesignIfStillUnordered(shop: string, token: string, olderThanDays: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM designs d
     WHERE d.shop = $1
       AND d.token = $2
       AND d.created_at < now() - ($3::int * interval '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.shop = d.shop AND o.design_token = d.token
       )`,
    [shop, token, olderThanDays],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function cleanupUnorderedDesigns(options?: {
  olderThanDays?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<DesignCleanupResult> {
  await ensureMigrations();

  const olderThanDays = Math.max(1, Math.min(365, Math.floor(options?.olderThanDays ?? 7)));
  const limit = Math.max(1, Math.min(1000, Math.floor(options?.limit ?? 200)));
  const dryRun = Boolean(options?.dryRun);

  const rows = await query<CleanupDesignRow>(
    `SELECT d.shop, d.token, d.design_json, d.front_preview_url, d.back_preview_url,
            d.front_print_url, d.back_print_url, d.created_at
     FROM designs d
     WHERE d.created_at < now() - ($1::int * interval '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.shop = d.shop AND o.design_token = d.token
       )
     ORDER BY d.created_at ASC
     LIMIT $2`,
    [olderThanDays, limit],
  );

  const result: DesignCleanupResult = {
    dryRun,
    olderThanDays,
    limit,
    candidates: rows.rows.length,
    designsDeleted: 0,
    r2ObjectsFound: 0,
    r2ObjectsDeleted: 0,
    r2DeleteFailures: 0,
    skippedBecauseOrderExists: 0,
    errors: [],
  };

  for (const row of rows.rows) {
    const urls = collectDesignR2Urls(row);
    result.r2ObjectsFound += urls.length;

    if (dryRun) continue;

    if (await hasOrderForDesign(row.shop, row.token)) {
      result.skippedBecauseOrderExists += 1;
      continue;
    }

    let failed = false;
    for (const url of urls) {
      try {
        const deletedKey = await deleteR2ObjectByUrl(url);
        if (deletedKey) result.r2ObjectsDeleted += 1;
      } catch (error) {
        failed = true;
        result.r2DeleteFailures += 1;
        result.errors.push({
          token: row.token,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (failed) continue;

    const deleted = await deleteDesignIfStillUnordered(row.shop, row.token, olderThanDays);
    if (deleted) {
      result.designsDeleted += 1;
    } else {
      result.skippedBecauseOrderExists += 1;
    }
  }

  return result;
}
