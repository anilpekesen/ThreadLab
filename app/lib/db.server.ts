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

export async function withAdvisoryLock<T>(
  namespace: string,
  key: string,
  callback: () => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext($1), hashtext($2))",
      [namespace, key],
    );
    return await callback();
  } finally {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
        [namespace, key],
      );
    } finally {
      client.release();
    }
  }
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
    CREATE TABLE IF NOT EXISTS shopify_sessions (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      "isOnline" BOOLEAN NOT NULL DEFAULT FALSE,
      scope TEXT,
      expires INTEGER,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "refreshTokenExpires" BIGINT,
      "userId" BIGINT,
      "firstName" TEXT,
      "lastName" TEXT,
      email TEXT,
      "accountOwner" BOOLEAN,
      locale TEXT,
      collaborator BOOLEAN,
      "emailVerified" BOOLEAN
    )
  `);
  await query(`
    ALTER TABLE shopify_sessions
      ADD COLUMN IF NOT EXISTS "refreshToken" TEXT,
      ADD COLUMN IF NOT EXISTS "refreshTokenExpires" BIGINT,
      ADD COLUMN IF NOT EXISTS "userId" BIGINT,
      ADD COLUMN IF NOT EXISTS "firstName" TEXT,
      ADD COLUMN IF NOT EXISTS "lastName" TEXT,
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS "accountOwner" BOOLEAN,
      ADD COLUMN IF NOT EXISTS locale TEXT,
      ADD COLUMN IF NOT EXISTS collaborator BOOLEAN,
      ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN
  `);
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
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      commission_rate NUMERIC NOT NULL DEFAULT 20,
      password_hash TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    ALTER TABLE partners
      ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS partner_shop_assignments (
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partner_id, shop)
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_shop_assignments_shop_unique
      ON partner_shop_assignments (shop)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS partner_assignment_requests (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_assignment_requests_pending_unique
      ON partner_assignment_requests (partner_id, shop)
      WHERE status = 'pending'
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS partner_assignment_requests_status_idx
      ON partner_assignment_requests (status, created_at DESC)
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
      placement_width_mm  INTEGER NOT NULL DEFAULT 0,
      placement_height_mm INTEGER NOT NULL DEFAULT 0,
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
    ALTER TABLE product_print_areas
      ADD COLUMN IF NOT EXISTS placement_width_mm INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS placement_height_mm INTEGER NOT NULL DEFAULT 0
  `);
  // Eski ürünlerde tek ölçü hem yerleşim hem maksimum baskı olarak kullanılıyordu.
  // Yeni alanları eski ölçüyle doldurunca mevcut ürünlerin görünümü değişmez.
  await query(`
    UPDATE product_print_areas
    SET placement_width_mm = real_width_mm
    WHERE placement_width_mm <= 0 AND real_width_mm > 0
  `);
  await query(`
    UPDATE product_print_areas
    SET placement_height_mm = real_height_mm
    WHERE placement_height_mm <= 0 AND real_height_mm > 0
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
    CREATE TABLE IF NOT EXISTS ai_generation_usage (
      shop        TEXT NOT NULL,
      month       TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, month)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS customer_ai_quota (
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
    CREATE INDEX IF NOT EXISTS customer_ai_quota_shop
      ON customer_ai_quota (shop, updated_at)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS customer_ip_quota (
      shop        TEXT NOT NULL,
      feature     TEXT NOT NULL,
      ip_hash     TEXT NOT NULL,
      day         TEXT NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, feature, ip_hash, day)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS customer_ip_quota_shop_feature_updated
      ON customer_ip_quota (shop, feature, updated_at)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id            TEXT PRIMARY KEY,
      shop          TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      product_id    TEXT,
      product_name  TEXT,
      template_id   TEXT,
      template_name TEXT,
      template_kind TEXT,
      design_token  TEXT,
      session_id    TEXT,
      value_numeric NUMERIC,
      metadata      JSONB NOT NULL DEFAULT '{}',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS analytics_events_shop_type_created
      ON analytics_events (shop, event_type, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS analytics_events_shop_template
      ON analytics_events (shop, template_kind, template_id)
  `);
  await query(`
    DELETE FROM analytics_events
    WHERE created_at < now() - interval '24 months'
  `);
  await query(`
    DELETE FROM customer_ip_quota
    WHERE updated_at < now() - interval '30 days'
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

  // Line-item bazlı arka yüz önizlemesi — bedene göre ölçeklenen önizlemede
  // her beden satırının kendi görseli olur (preview_url ön yüz için zaten var)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS back_preview_url TEXT NOT NULL DEFAULT ''`);

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

  // Re-key product_settings to (shop, product_id) — only run if still on old single-col PK
  await query(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'product_settings_pkey'
          AND contype = 'p'
          AND array_length(conkey, 1) = 1
      ) THEN
        ALTER TABLE product_settings DROP CONSTRAINT product_settings_pkey;
        -- Deduplicate before adding composite PK
        DELETE FROM product_settings a USING product_settings b
          WHERE a.ctid < b.ctid AND a.shop = b.shop AND a.product_id = b.product_id;
        ALTER TABLE product_settings ADD PRIMARY KEY (shop, product_id);
      ELSIF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_settings_pkey'
      ) THEN
        DELETE FROM product_settings a USING product_settings b
          WHERE a.ctid < b.ctid AND a.shop = b.shop AND a.product_id = b.product_id;
        ALTER TABLE product_settings ADD PRIMARY KEY (shop, product_id);
      END IF;
    END $$
  `);

  // Drop old single-column unique on shopify_order_id, add shop-scoped unique
  await query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shopify_order_id_key`);
  // Drop old (shop, shopify_order_id) unique — replaced by line-item unique below
  await query(`DROP INDEX IF EXISTS orders_shop_shopify_order_id`);

  // Indexes for shop-scoped queries
  await query(`CREATE INDEX IF NOT EXISTS orders_shop_idx ON orders (shop, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS designs_shop_idx ON designs (shop)`);
  await query(`CREATE INDEX IF NOT EXISTS designs_shop_created_at_idx ON designs (shop, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS orders_shop_design_token_idx ON orders (shop, design_token)`);
  await query(`CREATE INDEX IF NOT EXISTS product_print_areas_shop_product ON product_print_areas (shop, product_id)`);

  // ── Quantity and variant title ───────────────────────────────────────────
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_title TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT NOT NULL DEFAULT 'Müşteri'`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_total_price NUMERIC NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_item_id TEXT NOT NULL DEFAULT ''`);

  // ── Ensure per-line-item unique indexes exist (re-run safe) ─────────────
  // variant_id is not unique inside a Shopify order: two separate line items can
  // share the same size/color variant but carry different design_token values.
  await query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shopify_order_id_key`);
  await query(`DROP INDEX IF EXISTS orders_shop_shopify_order_id`);
  await query(`DROP INDEX IF EXISTS orders_shop_shopify_order_variant`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_shopify_order_line_item
      ON orders (shop, shopify_order_id, line_item_id)
      WHERE line_item_id != ''
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_shopify_order_variant_token_fallback
      ON orders (shop, shopify_order_id, variant_id, design_token)
      WHERE line_item_id = ''
  `);

  // ── Soft delete for product_categories (prevents slot-cycling exploit) ────
  await query(`ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL`);

  await query(`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
      ADD COLUMN IF NOT EXISTS drive_uploaded_at TIMESTAMPTZ
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS shop_google_drive (
      shop                     TEXT PRIMARY KEY,
      refresh_token            TEXT NOT NULL,
      access_token             TEXT,
      access_token_expires_at  TIMESTAMPTZ,
      root_folder_id           TEXT,
      connected_email          TEXT,
      connected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

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

  // ── Deactivate all product_settings not linked to an active product_category ─
  // product_categories is now the single source of truth. Any product_settings
  // record that has no active (non-deleted) product_category link should be
  // treated as inactive so it does not show the designer on the storefront.
  await query(`
    UPDATE product_settings ps
    SET config = config || '{"isActive": false}'::jsonb, updated_at = now()
    WHERE (config->>'isActive')::boolean IS NOT FALSE
      AND NOT EXISTS (
        SELECT 1 FROM product_categories pc
        WHERE pc.shop = ps.shop
          AND pc.shopify_product_id = ps.product_id
          AND pc.deleted_at IS NULL
      )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_prompt_logs (
      id            TEXT PRIMARY KEY,
      shop          TEXT NOT NULL,
      user_prompt   TEXT NOT NULL,
      final_prompt  TEXT NOT NULL DEFAULT '',
      result_url    TEXT NOT NULL DEFAULT '',
      success       BOOLEAN NOT NULL DEFAULT TRUE,
      error_msg     TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS ai_prompt_logs_shop_created
      ON ai_prompt_logs (shop, created_at DESC)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ai_credit_purchases (
      id            TEXT PRIMARY KEY,
      shop          TEXT NOT NULL,
      charge_id     TEXT NOT NULL UNIQUE,
      pack_key      TEXT NOT NULL,
      credits_added INTEGER NOT NULL,
      price_usd     NUMERIC NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
    )
  `);
  await query(`ALTER TABLE ai_credit_purchases ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')`);
  await query(`
    CREATE INDEX IF NOT EXISTS ai_credit_purchases_shop
      ON ai_credit_purchases (shop, created_at DESC)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id            TEXT PRIMARY KEY,
      shop          TEXT NOT NULL,
      subject       TEXT NOT NULL,
      message       TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open',
      priority      TEXT NOT NULL DEFAULT 'normal',
      admin_reply   TEXT,
      replied_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS support_tickets_shop_created
      ON support_tickets (shop, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS support_tickets_status_created
      ON support_tickets (status, created_at DESC)
  `);
  // Konuşma thread'i için messages JSONB kolonu
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]'`);
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general'`);
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_merchant_reply_at TIMESTAMPTZ`);
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_admin_reply_at TIMESTAMPTZ`);
  await query(`
    UPDATE support_tickets
       SET last_merchant_reply_at = COALESCE(last_merchant_reply_at, created_at)
     WHERE last_merchant_reply_at IS NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS support_tickets_shop_status_updated
      ON support_tickets (shop, status, updated_at DESC)
  `);
  await query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS preview_issue BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS color_mismatch BOOLEAN NOT NULL DEFAULT FALSE`);
  // Müşterinin yüklediği ham görsellerin URL'leri. Arka plan kaldırma
  // tasarım JSON'ındaki src'yi işlenmiş dosyayla değiştirdiği için orijinal
  // adres kayboluyordu; yeniden işleme ve müşteri talepleri için saklanıyor.
  await query(`ALTER TABLE designs ADD COLUMN IF NOT EXISTS original_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb`);
  // Şablonda fotoğrafın gireceği boşluğa mağaza sahibinin tıkladığı nokta.
  // -1 = tıklanmadı; o zaman şeffaf delik otomatik aranır.
  await query(`ALTER TABLE personalizer_templates
    ADD COLUMN IF NOT EXISTS hole_seed_x INTEGER NOT NULL DEFAULT -1,
    ADD COLUMN IF NOT EXISTS hole_seed_y INTEGER NOT NULL DEFAULT -1`);
  // Şablon tipi: 'mask' = fotoğraf tasarımın boşluğuna maskelenir (kalpli tişört),
  // 'scatter' = kafa kesiti + süsleme baskı alanına dağıtılır (Hepsi Benim boxer).
  await query(`ALTER TABLE personalizer_templates
    ADD COLUMN IF NOT EXISTS layout_mode TEXT NOT NULL DEFAULT 'mask',
    ADD COLUMN IF NOT EXISTS scatter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS decoration_url TEXT NOT NULL DEFAULT ''`);
  // Müşteriye açılan ayarlar. Boş nesne = hiçbiri açık değil; şablon eskisi
  // gibi tek bir sabit sonuç üretir.
  await query(`ALTER TABLE personalizer_templates
    ADD COLUMN IF NOT EXISTS customer_options JSONB NOT NULL DEFAULT '{}'::jsonb`);
  // AI şablonu ('ai' layout_mode) ayarları: sağlayıcı, model ve müşteriye
  // açılan stil listesi. Diğer tiplerde kullanılmaz.
  await query(`ALTER TABLE personalizer_templates
    ADD COLUMN IF NOT EXISTS ai_config JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`
    CREATE TABLE IF NOT EXISTS cliparts (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'genel',
      image_url   TEXT NOT NULL,
      sort_order  INT  NOT NULL DEFAULT 0,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS cliparts_category_sort
      ON cliparts (category, sort_order ASC)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS personalizer_templates (
      id           TEXT PRIMARY KEY,
      shop         TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      template_url TEXT NOT NULL DEFAULT '',
      mockup_url   TEXT NOT NULL DEFAULT '',
      photo_x      INTEGER NOT NULL DEFAULT 0,
      photo_y      INTEGER NOT NULL DEFAULT 0,
      photo_width  INTEGER NOT NULL DEFAULT 400,
      photo_height INTEGER NOT NULL DEFAULT 400,
      text_fields  JSONB NOT NULL DEFAULT '[]',
      ai_style     TEXT NOT NULL DEFAULT 'caricature',
      active       BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS personalizer_templates_shop_sort
      ON personalizer_templates (shop, sort_order, active)
  `);
  await query(`
    ALTER TABLE personalizer_templates
      ADD COLUMN IF NOT EXISTS mockup_x      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mockup_y      INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mockup_width  INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mockup_height INTEGER NOT NULL DEFAULT 0
  `);

  // Çerçeve seçenekleri — her template'in birden fazla frame seçeneği olabilir
  await query(`
    CREATE TABLE IF NOT EXISTS personalizer_frames (
      id         TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES personalizer_templates(id) ON DELETE CASCADE,
      name       TEXT NOT NULL DEFAULT '',
      mockup_url TEXT NOT NULL DEFAULT '',
      mockup_x   INTEGER NOT NULL DEFAULT 0,
      mockup_y   INTEGER NOT NULL DEFAULT 0,
      mockup_width  INTEGER NOT NULL DEFAULT 0,
      mockup_height INTEGER NOT NULL DEFAULT 0,
      text_fields JSONB NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    ALTER TABLE personalizer_frames
      ADD COLUMN IF NOT EXISTS text_fields JSONB NOT NULL DEFAULT '[]'
  `);
  // 21 Ağustos 2026 şablon veri onarımları. Koşullar eski değerlerle sınırlı:
  // mağaza sahibi daha sonra alanları değiştirirse uygulama açılışında ezilmez.
  await query(`
    UPDATE personalizer_frames
       SET name = 'Kırmızı kalp'
     WHERE id = '9848c39c1bd25f0cf1df49a2'
       AND template_id = '8e2ce0e4b4011025c5dc8acc'
       AND name = '1d5a4daa 6c4c 483a 8b2d c4e4fb958088'
  `);
  await query(`
    UPDATE personalizer_frames pf
       SET text_fields = (
         SELECT COALESCE(jsonb_agg(
           CASE
             WHEN field->>'id' = '1lnd575q'
              AND COALESCE((field->>'y')::integer, 0) > 685
             THEN field || jsonb_build_object('x', 400, 'y', 625, 'font_size', 40)
             ELSE field
           END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(pf.text_fields) AS field
       )
     WHERE pf.id = '9848c39c1bd25f0cf1df49a2'
       AND pf.template_id = '8e2ce0e4b4011025c5dc8acc'
  `);
  await query(`
    UPDATE personalizer_templates
       SET description = 'Fotoğrafınızı yükleyin ve isminizi ekleyin.'
     WHERE id = '8e2ce0e4b4011025c5dc8acc'
       AND description = 'I Love My Boyfriend'
  `);
  await query(`
    UPDATE personalizer_templates pt
       SET text_fields = (
         SELECT COALESCE(jsonb_agg(
           CASE
             WHEN field->>'id' = 't1' AND NOT (field ? 'default_value')
             THEN field || jsonb_build_object('label', 'Birinci satır', 'default_value', 'Hepsi')
             WHEN field->>'id' = 't2' AND NOT (field ? 'default_value')
             THEN field || jsonb_build_object('label', 'İkinci satır', 'default_value', 'Benim')
             ELSE field
           END
         ), '[]'::jsonb)
         FROM jsonb_array_elements(pt.text_fields) AS field
       )
     WHERE pt.id = 'sc177f44a7f4b0c7db819515'
  `);
  await query(`
    UPDATE personalizer_templates
       SET description = 'Fotoğrafınızı yükleyin, yüzünüz eğlenceli bir baskı desenine dönüşsün.'
     WHERE id = 'sc177f44a7f4b0c7db819515'
       AND description = 'Müşterinin yüzü kesilip baskı alanına dağıtılır.'
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS personalizer_frames_template
      ON personalizer_frames (template_id, sort_order)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS personalizer_product_links (
      shop          TEXT NOT NULL,
      product_id    TEXT NOT NULL,
      template_id   TEXT NOT NULL REFERENCES personalizer_templates(id) ON DELETE CASCADE,
      product_title TEXT NOT NULL DEFAULT '',
      product_handle TEXT NOT NULL DEFAULT '',
      variant_id    TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, product_id)
    )
  `);
  // Bir ürünün ön ve arka yüzü ayrı şablonlara bağlanabilir. Müşteri istediği
  // yüzü kişiselleştirir; ikisi de zorunlu değil.
  await query(`ALTER TABLE personalizer_product_links
    ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'front'`);
  // Birincil anahtarı (shop, product_id) → (shop, product_id, side) yap.
  // Yalnızca anahtar hâlâ iki kolonluyken çalışır, tekrar çalıştırılabilir.
  await query(`
    DO $$
    DECLARE pk_name TEXT;
    BEGIN
      SELECT c.conname INTO pk_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'personalizer_product_links'
         AND c.contype = 'p'
         AND array_length(c.conkey, 1) = 2;
      IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE personalizer_product_links DROP CONSTRAINT %I', pk_name);
        ALTER TABLE personalizer_product_links
          ADD CONSTRAINT personalizer_product_links_pkey PRIMARY KEY (shop, product_id, side);
      END IF;
    END $$;
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS personalizer_product_links_template
      ON personalizer_product_links (template_id)
  `);
  // Aynı ürünün farklı varyantları farklı şablona bağlanabilmeli: "3'lü
  // çerçeve seti"nde Tam Alan ile Beyaz Kenarlı ayrı yerleşimler, yani ayrı
  // şablonlar. Birincil anahtara varyant ekleniyor; boş varyant o ürünün
  // varsayılanı olarak kalıyor ve tek şablonlu ürünler aynen çalışıyor.
  // Yalnızca anahtar hâlâ üç kolonluyken çalışır, tekrar çalıştırılabilir.
  await query(`
    DO $$
    DECLARE pk_name TEXT;
    BEGIN
      SELECT c.conname INTO pk_name
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'personalizer_product_links'
         AND c.contype = 'p'
         AND array_length(c.conkey, 1) = 3;
      IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE personalizer_product_links DROP CONSTRAINT %I', pk_name);
        ALTER TABLE personalizer_product_links
          ADD CONSTRAINT personalizer_product_links_pkey
          PRIMARY KEY (shop, product_id, side, variant_id);
      END IF;
    END $$;
  `);

  // Giriş yapmış müşterilerin "Kayıtlı Tasarımlar"ı — localStorage yerine hesapla
  // taşınabilir kayıt. id istemci tarafında üretilir, bu yüzden PK müşteriye
  // bileşiktir ki bir müşteri başka müşterinin kaydını ezemesin.
  await query(`
    CREATE TABLE IF NOT EXISTS customer_saved_designs (
      shop        TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      id          TEXT NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      thumbnail   TEXT NOT NULL DEFAULT '',
      front_json  TEXT NOT NULL DEFAULT '',
      back_json   TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, customer_id, id)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS customer_saved_designs_lookup
      ON customer_saved_designs (shop, customer_id, created_at DESC)
  `);

  // ── Baskı ürünleri ────────────────────────────────────────────────────────
  // Bir tasarımın fiziksel karşılığı: ebat, çözünürlük, taşma payı, sarma türü.
  // Şablondan ayrı tutuluyor çünkü aynı yerleşim birden fazla ebatta satılıyor;
  // ebat şablona gömülü olsaydı her ebat için şablon kopyalamak gerekirdi.
  await query(`
    CREATE TABLE IF NOT EXISTS print_products (
      id         TEXT PRIMARY KEY,
      shop       TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      width_mm   DOUBLE PRECISION NOT NULL DEFAULT 200,
      height_mm  DOUBLE PRECISION NOT NULL DEFAULT 200,
      dpi        INTEGER NOT NULL DEFAULT 300,
      bleed_mm   DOUBLE PRECISION NOT NULL DEFAULT 3,
      safe_mm    DOUBLE PRECISION NOT NULL DEFAULT 5,
      wrap       TEXT NOT NULL DEFAULT 'flat',
      mockup_url TEXT NOT NULL DEFAULT '',
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS print_products_shop_sort
      ON print_products (shop, sort_order, active)
  `);

  // ── Çoklu slot ────────────────────────────────────────────────────────────
  // Şablon artık tek fotoğraf alanı yerine N alan taşıyabiliyor. Eski
  // photo_x/photo_y/photo_width/photo_height kolonları YERİNDE BIRAKILDI:
  // slots boşsa okuma anında onlardan tek slotluk bir dizi türetiliyor
  // (bkz. slotsFromLegacyTemplate). Böylece mevcut şablonlar veri taşımadan
  // yeni motora giriyor ve bir aksilikte eski yol hâlâ çalışıyor.
  await query(`
    ALTER TABLE personalizer_templates
      ADD COLUMN IF NOT EXISTS slots            JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS grid_config      JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS print_product_id TEXT  NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS overlay_url      TEXT  NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS expected_slots   INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS version          INTEGER NOT NULL DEFAULT 1
  `);

  // Set ürünleri: bir sipariş satırı birden fazla baskı dosyası üretebilir.
  // "3'lü çerçeve seti"nde üç ayrı 30x30 dosya gerekiyor; hepsini tek tuvale
  // koymak yanlış olur, çünkü onlar üç ayrı çerçeve ve her birinin kendi taşma
  // payı olmalı. Boş dizi = tek parçalı şablon, eski davranış.
  await query(`
    ALTER TABLE personalizer_templates
      ADD COLUMN IF NOT EXISTS pieces JSONB NOT NULL DEFAULT '[]'
  `);

  // Varyanta göre ürün görselleri. Çerçeve rengi baskıyı değiştirmiyor, ama
  // müşteri fotoğrafını seçtiği renkteki çerçevenin içinde görmeli.
  await query(`
    ALTER TABLE personalizer_templates
      ADD COLUMN IF NOT EXISTS mockups JSONB NOT NULL DEFAULT '[]'
  `);

  // ── Şablon sürümleri ──────────────────────────────────────────────────────
  // Yayındaki bir şablon değiştirilirse eski siparişlerin baskı dosyası artık
  // yeniden üretilemez: müşteri A tasarımını onaylamışken B basılır. Her kayıtta
  // o anki hâlin tam kopyası saklanıyor; sipariş hangi sürümle üretildiğini
  // tuttuğu sürece aylar sonra bile aynı dosya çıkar.
  await query(`
    CREATE TABLE IF NOT EXISTS personalizer_template_versions (
      template_id TEXT NOT NULL REFERENCES personalizer_templates(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,
      snapshot    JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (template_id, version)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS personalizer_template_versions_recent
      ON personalizer_template_versions (template_id, version DESC)
  `);
}
