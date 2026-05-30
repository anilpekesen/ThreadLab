import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface ShopDriveConnection {
  shop: string;
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  rootFolderId: string | null;
  connectedEmail: string | null;
  connectedAt: Date;
  updatedAt: Date;
}

type Row = {
  shop: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: Date | null;
  root_folder_id: string | null;
  connected_email: string | null;
  connected_at: Date;
  updated_at: Date;
};

function rowToConn(r: Row): ShopDriveConnection {
  return {
    shop: r.shop,
    refreshToken: r.refresh_token,
    accessToken: r.access_token,
    accessTokenExpiresAt: r.access_token_expires_at,
    rootFolderId: r.root_folder_id,
    connectedEmail: r.connected_email,
    connectedAt: r.connected_at,
    updatedAt: r.updated_at,
  };
}

export async function getDriveConnection(shop: string): Promise<ShopDriveConnection | null> {
  await ensureMigrations();
  const res = await query<Row>(
    `SELECT * FROM shop_google_drive WHERE shop = $1`,
    [shop],
  );
  return res.rows[0] ? rowToConn(res.rows[0]) : null;
}

export async function saveDriveConnection(params: {
  shop: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  connectedEmail: string;
}): Promise<void> {
  await ensureMigrations();
  await query(
    `INSERT INTO shop_google_drive
       (shop, refresh_token, access_token, access_token_expires_at, connected_email, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now(), now())
     ON CONFLICT (shop) DO UPDATE SET
       refresh_token           = EXCLUDED.refresh_token,
       access_token            = EXCLUDED.access_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       connected_email         = EXCLUDED.connected_email,
       root_folder_id          = NULL,
       updated_at              = now()`,
    [
      params.shop,
      params.refreshToken,
      params.accessToken,
      params.accessTokenExpiresAt,
      params.connectedEmail,
    ],
  );
}

export async function updateDriveAccessToken(
  shop: string,
  accessToken: string,
  expiresAt: Date,
): Promise<void> {
  await query(
    `UPDATE shop_google_drive
        SET access_token = $2,
            access_token_expires_at = $3,
            updated_at = now()
      WHERE shop = $1`,
    [shop, accessToken, expiresAt],
  );
}

export async function updateRootFolderId(shop: string, folderId: string): Promise<void> {
  await query(
    `UPDATE shop_google_drive SET root_folder_id = $2, updated_at = now() WHERE shop = $1`,
    [shop, folderId],
  );
}

export async function deleteDriveConnection(shop: string): Promise<void> {
  await query(`DELETE FROM shop_google_drive WHERE shop = $1`, [shop]);
}
