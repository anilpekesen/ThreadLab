import { randomBytes } from "node:crypto";
import { query, runMigrations } from "~/lib/db.server";
import { uploadToR2 } from "~/lib/r2.server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getUploadsDir } from "~/lib/storage.server";
import { publicAppUrl } from "~/lib/app-url.server";

/**
 * Klipartlar iki kapsamda tutulur:
 *   - PrintLab kütüphanesi (`shop = ''`): herkese açık, yalnızca /admin panelinden yönetilir.
 *   - Mağaza klipartı (`shop = '<mağaza>.myshopify.com'`): yalnızca o mağazanın
 *     müşterileri görür, yalnızca o mağaza yönetir.
 *
 * Değiştiren her sorgu kapsamı (`shop`) koşula ekler: bir mağaza başka bir
 * mağazanın ya da kütüphanenin kaydını kimliğini bilse bile değiştiremez.
 */
export const LIBRARY_SHOP = "";

export interface Clipart {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  /** Kütüphane klipartı mı (mağazanın değil, PrintLab'in) */
  isLibrary: boolean;
}

export const CLIPART_CATEGORIES = [
  { value: "sekil",   label: "Şekil" },
  { value: "cerceve", label: "Çerçeve" },
  { value: "spor",    label: "Spor" },
  { value: "anadolu", label: "Anadolu" },
  { value: "doga",    label: "Doğa" },
  { value: "genel",   label: "Genel" },
] as const;

const MIME_EXT: Record<string, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/webp":    "webp",
  "image/svg+xml": "svg",
};

const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);

let migrated = false;
async function ensureMigrations() {
  if (!migrated) { await runMigrations(); migrated = true; }
}

type Row = {
  id: string; name: string; category: string; shop: string;
  image_url: string; sort_order: number; is_active: boolean; created_at: string;
};

/** Bir kapsamın bütün klipartları (yönetim ekranları için) */
export async function listCliparts(shop: string): Promise<Clipart[]> {
  await ensureMigrations();
  const result = await query<Row>(
    "SELECT * FROM cliparts WHERE shop = $1 ORDER BY sort_order ASC, created_at ASC",
    [shop],
  );
  return result.rows.map(rowToClipart);
}

/**
 * Müşterinin tasarımcıda gördüğü klipartlar: kütüphanenin ve (verilirse)
 * mağazanın aktif klipartları. Mağazanın kendi klipartları önce gelir.
 */
export async function getActiveCliparts(shop?: string | null): Promise<Clipart[]> {
  await ensureMigrations();
  const result = await query<Row>(
    `SELECT * FROM cliparts
      WHERE is_active = TRUE AND (shop = '' OR shop = $1)
      ORDER BY (shop = '') ASC, sort_order ASC, created_at ASC`,
    [shop ?? ""],
  );
  return result.rows.map(rowToClipart);
}

export async function addClipart(
  shop: string,
  name: string,
  category: string,
  file: File,
  requestUrl: string,
): Promise<Clipart> {
  await ensureMigrations();
  const ext = MIME_EXT[file.type];
  if (!ext) throw new Error("PNG, JPG, WebP veya SVG gerekli");

  const buffer = Buffer.from(await file.arrayBuffer());
  let imageUrl: string;

  if (useR2) {
    imageUrl = await uploadToR2(buffer, ext, "cliparts");
  } else {
    const filename = `clipart-${randomBytes(12).toString("hex")}.${ext}`;
    await writeFile(path.join(getUploadsDir(), filename), buffer);
    const base = publicAppUrl(new URL(requestUrl).origin);
    imageUrl = `${base}/uploads/${filename}`;
  }

  const id = `cla_${randomBytes(8).toString("hex")}`;
  const maxResult = await query<{ max: number | null }>(
    "SELECT MAX(sort_order) AS max FROM cliparts WHERE shop = $1",
    [shop],
  );
  const sortOrder = (maxResult.rows[0]?.max ?? -1) + 1;

  await query(
    `INSERT INTO cliparts (id, shop, name, category, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, shop, name, category, imageUrl, sortOrder],
  );
  return {
    id, name, category, imageUrl, sortOrder, isActive: true,
    createdAt: new Date().toISOString(), isLibrary: shop === LIBRARY_SHOP,
  };
}

export async function deleteClipart(id: string, shop: string): Promise<void> {
  await ensureMigrations();
  await query("DELETE FROM cliparts WHERE id = $1 AND shop = $2", [id, shop]);
}

export async function toggleClipartActive(id: string, isActive: boolean, shop: string): Promise<void> {
  await ensureMigrations();
  await query("UPDATE cliparts SET is_active = $1 WHERE id = $2 AND shop = $3", [isActive, id, shop]);
}

export async function updateClipartOrder(id: string, sortOrder: number, shop: string): Promise<void> {
  await ensureMigrations();
  await query("UPDATE cliparts SET sort_order = $1 WHERE id = $2 AND shop = $3", [sortOrder, id, shop]);
}

function rowToClipart(r: Row): Clipart {
  return {
    id: r.id, name: r.name, category: r.category,
    imageUrl: r.image_url, sortOrder: r.sort_order,
    isActive: r.is_active, createdAt: r.created_at,
    isLibrary: (r.shop ?? "") === LIBRARY_SHOP,
  };
}
