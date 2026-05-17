import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";
import { uploadToR2 } from "~/lib/r2.server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { getUploadsDir } from "~/lib/storage.server";

export interface ShopTemplate {
  id: string;
  shop: string;
  name: string;
  category: string;
  imageUrl: string;
  sortOrder: number;
  createdAt: string;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);

export async function getShopTemplates(shop: string): Promise<ShopTemplate[]> {
  const result = await query<{
    id: string;
    shop: string;
    name: string;
    category: string;
    image_url: string;
    sort_order: number;
    created_at: string;
  }>(
    "SELECT * FROM shop_templates WHERE shop = $1 ORDER BY sort_order ASC, created_at ASC",
    [shop],
  );
  return result.rows.map((r) => ({
    id: r.id,
    shop: r.shop,
    name: r.name,
    category: r.category,
    imageUrl: r.image_url,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));
}

export async function addShopTemplate(
  shop: string,
  name: string,
  category: string,
  file: File,
  requestUrl: string,
): Promise<ShopTemplate> {
  const ext = MIME_EXT[file.type];
  if (!ext) throw new Error("PNG, JPG, WebP veya SVG gerekli");

  const buffer = Buffer.from(await file.arrayBuffer());
  let imageUrl: string;

  if (useR2) {
    imageUrl = await uploadToR2(buffer, ext, `templates/${shop.replace(".myshopify.com", "")}`);
  } else {
    const filename = `tmpl-${randomBytes(12).toString("hex")}.${ext}`;
    await writeFile(path.join(getUploadsDir(), filename), buffer);
    const base = process.env.SHOPIFY_APP_URL ?? new URL(requestUrl).origin;
    imageUrl = `${base}/uploads/${filename}`;
  }

  const id = `tpl_${randomBytes(8).toString("hex")}`;

  // Get max sort_order for this shop
  const maxResult = await query<{ max: number | null }>(
    "SELECT MAX(sort_order) AS max FROM shop_templates WHERE shop = $1",
    [shop],
  );
  const sortOrder = (maxResult.rows[0]?.max ?? -1) + 1;

  await query(
    `INSERT INTO shop_templates (id, shop, name, category, image_url, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, shop, name, category, imageUrl, sortOrder],
  );

  return { id, shop, name, category, imageUrl, sortOrder, createdAt: new Date().toISOString() };
}

export async function deleteShopTemplate(shop: string, id: string): Promise<void> {
  await query(
    "DELETE FROM shop_templates WHERE id = $1 AND shop = $2",
    [id, shop],
  );
}

export async function updateShopTemplate(
  shop: string,
  id: string,
  updates: { name?: string; category?: string; sortOrder?: number },
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
  if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
  if (updates.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(updates.sortOrder); }

  if (!fields.length) return;
  values.push(id, shop);
  await query(
    `UPDATE shop_templates SET ${fields.join(", ")} WHERE id = $${idx++} AND shop = $${idx}`,
    values,
  );
}
