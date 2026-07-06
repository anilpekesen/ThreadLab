import { query } from "~/lib/db.server";

export interface CustomerSavedDesign {
  id: string;
  name: string;
  thumbnail: string;
  frontJson: string;
  backJson: string;
  createdAt: number;
}

// Tasarımcı localStorage'da 20 kayıt tutuyor; hesap tarafında da aynı limit
const MAX_SAVED_PER_CUSTOMER = 20;

interface Row {
  id: string;
  name: string;
  thumbnail: string;
  front_json: string;
  back_json: string;
  created_at: Date;
}

export async function listCustomerDesigns(
  shop: string,
  customerId: string,
): Promise<CustomerSavedDesign[]> {
  const res = await query<Row>(
    `SELECT id, name, thumbnail, front_json, back_json, created_at
       FROM customer_saved_designs
      WHERE shop = $1 AND customer_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [shop, customerId, MAX_SAVED_PER_CUSTOMER],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    thumbnail: r.thumbnail,
    frontJson: r.front_json,
    backJson: r.back_json,
    createdAt: r.created_at.getTime(),
  }));
}

export async function saveCustomerDesign(
  shop: string,
  customerId: string,
  design: CustomerSavedDesign,
): Promise<void> {
  await query(
    `INSERT INTO customer_saved_designs
       (shop, customer_id, id, name, thumbnail, front_json, back_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
     ON CONFLICT (shop, customer_id, id) DO UPDATE SET
       name = EXCLUDED.name,
       thumbnail = EXCLUDED.thumbnail,
       front_json = EXCLUDED.front_json,
       back_json = EXCLUDED.back_json`,
    [
      shop,
      customerId,
      design.id,
      design.name,
      design.thumbnail,
      design.frontJson,
      design.backJson,
      design.createdAt || Date.now(),
    ],
  );
  // Limit üstündeki en eski kayıtları düşür
  await query(
    `DELETE FROM customer_saved_designs
      WHERE shop = $1 AND customer_id = $2
        AND id NOT IN (
          SELECT id FROM customer_saved_designs
           WHERE shop = $1 AND customer_id = $2
           ORDER BY created_at DESC
           LIMIT $3
        )`,
    [shop, customerId, MAX_SAVED_PER_CUSTOMER],
  );
}

export async function deleteCustomerDesign(
  shop: string,
  customerId: string,
  id: string,
): Promise<void> {
  await query(
    `DELETE FROM customer_saved_designs
      WHERE shop = $1 AND customer_id = $2 AND id = $3`,
    [shop, customerId, id],
  );
}
