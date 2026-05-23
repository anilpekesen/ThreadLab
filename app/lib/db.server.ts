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
  // Exclusive advisory lock so two PM2 workers starting simultaneously don't
  // both run DDL at the same time (race condition on DROP/ADD PRIMARY KEY etc.)
  await query(`SELECT pg_advisory_lock(9876543210)`);
  try {
    await _runMigrationsLocked();
  } finally {
    await query(`SELECT pg_advisory_unlock(9876543210)`);
  }
}

async function _runMigrationsLocked() {
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
    ALTER TABLE shop_subscriptions
      ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS shopify_subscription_id TEXT
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS shop_templates (
      id         TEXT PRIMARY KEY,
      shop       TEXT NOT NULL,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT 'custom',
      image_url  TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS shop_templates_shop
      ON shop_templates (shop, sort_order)
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
    CREATE TABLE IF NOT EXISTS product_categories (
      id                     TEXT PRIMARY KEY,
      shop                   TEXT NOT NULL,
      name                   TEXT NOT NULL,
      product_type           TEXT NOT NULL DEFAULT 'apparel',
      surface_mode           TEXT NOT NULL DEFAULT 'front_back',
      shopify_product_id     TEXT,
      shopify_product_title  TEXT,
      shopify_product_handle TEXT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_product_categories_shop
      ON product_categories (shop, created_at)
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
    CREATE TABLE IF NOT EXISTS shop_settings (
      shop       TEXT PRIMARY KEY,
      config     JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS customer_bg_quota (
      shop          TEXT NOT NULL,
      session_id    TEXT NOT NULL,
      count         INTEGER NOT NULL DEFAULT 0,
      reset_count   INTEGER NOT NULL DEFAULT 0,
      last_order_at TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, session_id)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS customer_bg_quota_shop
      ON customer_bg_quota (shop, updated_at)
  `);
  await query(`
    ALTER TABLE designs ADD COLUMN IF NOT EXISTS session_id TEXT
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

  // ── Multi-tenant shop isolation ──────────────────────────────────────────
  // Add shop column to all tenant-scoped tables
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS shop TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_settings ADD COLUMN IF NOT EXISTS shop TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE product_print_areas ADD COLUMN IF NOT EXISTS shop TEXT NOT NULL DEFAULT ''`);

  // Backfill existing rows (single shop, safe to hardcode once)
  await query(`UPDATE orders SET shop = 'whanotify-dev.myshopify.com' WHERE shop = ''`);
  await query(`UPDATE designs SET shop = 'whanotify-dev.myshopify.com' WHERE shop = ''`);
  await query(`UPDATE product_settings SET shop = 'whanotify-dev.myshopify.com' WHERE shop = ''`);
  await query(`UPDATE product_print_areas SET shop = 'whanotify-dev.myshopify.com' WHERE shop = ''`);

  // Re-key product_settings to (shop, product_id)
  await query(`ALTER TABLE product_settings DROP CONSTRAINT IF EXISTS product_settings_pkey`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_settings_pkey'
      ) THEN
        ALTER TABLE product_settings ADD PRIMARY KEY (shop, product_id);
      END IF;
    END $$
  `);

  // Drop old single-column unique on shopify_order_id, add shop-scoped unique
  await query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shopify_order_id_key`);
  // Drop old (shop, shopify_order_id) unique — replaced by per-variant unique below
  await query(`DROP INDEX IF EXISTS orders_shop_shopify_order_id`);
  // One row per (shop, shopify_order_id, variant_id): supports multi-variant orders
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_shopify_order_variant
      ON orders (shop, shopify_order_id, variant_id)
  `);

  // Indexes for shop-scoped queries
  await query(`CREATE INDEX IF NOT EXISTS orders_shop_idx ON orders (shop, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS designs_shop_idx ON designs (shop)`);
  await query(`CREATE INDEX IF NOT EXISTS product_print_areas_shop_product ON product_print_areas (shop, product_id)`);

  // ── Quantity and variant title ───────────────────────────────────────────
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_title TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT 'Müşteri'`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT ''`);

  // ── Clean up duplicate orders caused by empty variant_id migration ───────
  // Old records have variant_id=''. After per-variant migration, real variant
  // records were inserted alongside them creating duplicates. Delete the old
  // empty-variant_id records where proper variant records now exist.
  await query(`
    DELETE FROM orders
    WHERE variant_id = ''
      AND shopify_order_id IN (
        SELECT DISTINCT shopify_order_id FROM orders WHERE variant_id != ''
      )
  `);
}
