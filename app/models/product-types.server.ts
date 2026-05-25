import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopPlan } from "~/models/bg-removal-usage.server";

export interface ShopProductType {
  id: string;
  shop: string;
  name: string;
  product_type: string;
  surface_mode: "front_only" | "front_back";
  shopify_product_id: string | null;
  shopify_product_title: string | null;
  shopify_product_handle: string | null;
  created_at: string;
  updated_at: string;
}

// Returns only active (non-deleted) product types for display
export async function getProductTypesForShop(shop: string): Promise<ShopProductType[]> {
  const result = await query<ShopProductType>(
    "SELECT * FROM product_categories WHERE shop = $1 AND deleted_at IS NULL ORDER BY created_at ASC",
    [shop],
  );
  return result.rows;
}

export async function getProductTypeById(id: string, shop: string): Promise<ShopProductType | null> {
  const result = await query<ShopProductType>(
    "SELECT * FROM product_categories WHERE id = $1 AND shop = $2 AND deleted_at IS NULL",
    [id, shop],
  );
  return result.rows[0] ?? null;
}

// Active count — for display / downgrade checks
export async function getActiveProductTypeCount(shop: string): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM product_categories WHERE shop = $1 AND deleted_at IS NULL",
    [shop],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Total ever created (including deleted) — used for plan quota enforcement
export async function getTotalProductTypeCount(shop: string): Promise<number> {
  const result = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM product_categories WHERE shop = $1",
    [shop],
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function canCreateProductType(shop: string): Promise<{ allowed: boolean; used: number; limit: number; planKey: PlanKey }> {
  const [planKey, totalCreated] = await Promise.all([
    getShopPlan(shop),
    getTotalProductTypeCount(shop), // total ever created, not just active
  ]);
  const limit = PLANS[planKey].maxProductTypes;
  const allowed = limit === -1 || totalCreated < limit;
  return { allowed, used: totalCreated, limit, planKey };
}

export async function createProductType(
  shop: string,
  data: { name: string; product_type: string; surface_mode: "front_only" | "front_back" },
): Promise<ShopProductType> {
  const id = `cat_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const result = await query<ShopProductType>(
    `INSERT INTO product_categories (id, shop, name, product_type, surface_mode)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, shop, data.name, data.product_type, data.surface_mode],
  );
  return result.rows[0];
}

export async function updateProductType(
  id: string,
  shop: string,
  data: {
    name?: string;
    product_type?: string;
    surface_mode?: "front_only" | "front_back";
    shopify_product_id?: string | null;
    shopify_product_title?: string | null;
    shopify_product_handle?: string | null;
  },
): Promise<ShopProductType | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.product_type !== undefined) { fields.push(`product_type = $${idx++}`); values.push(data.product_type); }
  if (data.surface_mode !== undefined) { fields.push(`surface_mode = $${idx++}`); values.push(data.surface_mode); }
  if ("shopify_product_id" in data) { fields.push(`shopify_product_id = $${idx++}`); values.push(data.shopify_product_id ?? null); }
  if ("shopify_product_title" in data) { fields.push(`shopify_product_title = $${idx++}`); values.push(data.shopify_product_title ?? null); }
  if ("shopify_product_handle" in data) { fields.push(`shopify_product_handle = $${idx++}`); values.push(data.shopify_product_handle ?? null); }

  if (!fields.length) return getProductTypeById(id, shop);

  fields.push(`updated_at = now()`);
  values.push(id, shop);

  const result = await query<ShopProductType>(
    `UPDATE product_categories SET ${fields.join(", ")} WHERE id = $${idx++} AND shop = $${idx++} RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

// Soft delete — marks deleted_at so the slot cannot be recycled
export async function deleteProductType(id: string, shop: string): Promise<void> {
  await query(
    "UPDATE product_categories SET deleted_at = now() WHERE id = $1 AND shop = $2",
    [id, shop],
  );
}
