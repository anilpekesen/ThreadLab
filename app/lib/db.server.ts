import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    pool = new Pool({
      connectionString: url,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS bg_removal_usage (
      shop        TEXT NOT NULL,
      month       TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, month)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS shop_subscriptions (
      shop        TEXT PRIMARY KEY,
      plan_key    TEXT NOT NULL DEFAULT 'Pro',
      active_until TIMESTAMPTZ,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_settings (
      product_id TEXT PRIMARY KEY,
      config     JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_print_areas (
      id              TEXT PRIMARY KEY,
      product_id      TEXT NOT NULL,
      side            TEXT NOT NULL,
      name            TEXT NOT NULL,
      mockup_x        NUMERIC NOT NULL DEFAULT 0,
      mockup_y        NUMERIC NOT NULL DEFAULT 0,
      mockup_width    NUMERIC NOT NULL DEFAULT 480,
      mockup_height   NUMERIC NOT NULL DEFAULT 580,
      x               NUMERIC NOT NULL DEFAULT 0,
      y               NUMERIC NOT NULL DEFAULT 0,
      width           NUMERIC NOT NULL DEFAULT 0,
      height          NUMERIC NOT NULL DEFAULT 0,
      real_width_mm   INTEGER NOT NULL DEFAULT 0,
      real_height_mm  INTEGER NOT NULL DEFAULT 0,
      safe_margin     NUMERIC NOT NULL DEFAULT 10,
      bleed_margin    NUMERIC NOT NULL DEFAULT 5,
      dpi             INTEGER NOT NULL DEFAULT 300,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS product_print_areas_product_id
      ON product_print_areas (product_id)
  `);
  await query(`
    ALTER TABLE product_print_areas
      ADD COLUMN IF NOT EXISTS mockup_x NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mockup_y NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mockup_width NUMERIC NOT NULL DEFAULT 480,
      ADD COLUMN IF NOT EXISTS mockup_height NUMERIC NOT NULL DEFAULT 580
  `);
  await query(`
    ALTER TABLE product_print_areas
      ADD COLUMN IF NOT EXISTS mockup_image_url TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS global_settings (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      config     JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS designs (
      token            TEXT PRIMARY KEY,
      product_id       TEXT,
      design_json      JSONB,
      front_preview_url TEXT NOT NULL DEFAULT '',
      back_preview_url  TEXT NOT NULL DEFAULT '',
      front_print_url   TEXT NOT NULL DEFAULT '',
      back_print_url    TEXT NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id                  TEXT PRIMARY KEY,
      shopify_order_id    TEXT UNIQUE NOT NULL,
      order_number        TEXT NOT NULL DEFAULT '',
      customer_name       TEXT NOT NULL DEFAULT 'Müşteri',
      customer_email      TEXT NOT NULL DEFAULT '',
      product_id          TEXT NOT NULL DEFAULT '',
      product_name        TEXT NOT NULL DEFAULT '',
      variant_id          TEXT NOT NULL DEFAULT '',
      design_token        TEXT NOT NULL DEFAULT '',
      preview_url         TEXT NOT NULL DEFAULT '',
      production_file_url TEXT NOT NULL DEFAULT '',
      production_status   TEXT NOT NULL DEFAULT 'pending',
      missing_surcharge   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ
    )
  `);
}
