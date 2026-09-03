import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_PRINT_PRODUCTS,
  printCanvas,
  type PrintCanvas,
  type PrintProduct,
  type WrapKind,
} from "~/lib/print-spec";

export type { PrintProduct };

/**
 * Baskı ürünü kayıtları — ebat, çözünürlük ve taşma payı.
 *
 * Kayıtlar mağaza bazlıdır: uygulamayı satın alan her mağaza kendi ebatlarını
 * tanımlar. Kod hiçbir yerde belirli bir kimliğe bağlı değildir; varsayılanlar
 * yalnızca ilk kurulumda boş panelle karşılaşılmasın diye tohumlanır.
 */

function normalizeWrap(raw: unknown): WrapKind {
  return String(raw ?? "") === "cylindrical" ? "cylindrical" : "flat";
}

/** pg sürücüsü sayısal kolonları duruma göre string döndürebiliyor; tek yerde toparlıyoruz. */
function mapRow(row: Record<string, unknown>): PrintProduct {
  return {
    id: String(row.id),
    shop: String(row.shop),
    name: String(row.name ?? ""),
    width_mm: Number(row.width_mm),
    height_mm: Number(row.height_mm),
    dpi: Number(row.dpi),
    bleed_mm: Number(row.bleed_mm),
    safe_mm: Number(row.safe_mm),
    wrap: normalizeWrap(row.wrap),
    mockup_url: String(row.mockup_url ?? ""),
    active: row.active === true,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listPrintProducts(shop: string, activeOnly = false): Promise<PrintProduct[]> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM print_products
      WHERE shop = $1 ${activeOnly ? "AND active = TRUE" : ""}
      ORDER BY sort_order ASC, created_at ASC`,
    [shop],
  );
  return res.rows.map(mapRow);
}

export async function getPrintProduct(id: string, shop: string): Promise<PrintProduct | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM print_products WHERE id = $1 AND shop = $2`,
    [id, shop],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

/** Müşteri tarafı: mağaza doğrulaması olmadan, yalnızca yayındaki kayıtlar */
export async function getPrintProductPublic(id: string): Promise<PrintProduct | null> {
  const res = await query<Record<string, unknown>>(
    `SELECT * FROM print_products WHERE id = $1 AND active = TRUE`,
    [id],
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export interface PrintProductInput {
  name: string;
  width_mm: number;
  height_mm: number;
  dpi?: number;
  bleed_mm?: number;
  safe_mm?: number;
  wrap?: WrapKind;
  mockup_url?: string;
  sort_order?: number;
}

export async function createPrintProduct(shop: string, input: PrintProductInput): Promise<PrintProduct> {
  const id = randomBytes(12).toString("hex");
  const res = await query<Record<string, unknown>>(
    `INSERT INTO print_products
       (id, shop, name, width_mm, height_mm, dpi, bleed_mm, safe_mm, wrap, mockup_url, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      id, shop, input.name,
      input.width_mm, input.height_mm,
      input.dpi ?? 300,
      input.bleed_mm ?? 3,
      input.safe_mm ?? 5,
      normalizeWrap(input.wrap),
      input.mockup_url ?? "",
      input.sort_order ?? 0,
    ],
  );
  return mapRow(res.rows[0]);
}

export async function updatePrintProduct(
  id: string,
  shop: string,
  input: Partial<PrintProductInput> & { active?: boolean },
): Promise<PrintProduct | null> {
  const allowed = new Set([
    "name", "width_mm", "height_mm", "dpi", "bleed_mm", "safe_mm",
    "wrap", "mockup_url", "sort_order", "active",
  ]);
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || !allowed.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(k === "wrap" ? normalizeWrap(v) : v);
  }
  if (sets.length === 0) return getPrintProduct(id, shop);

  sets.push("updated_at = now()");
  vals.push(id, shop);
  const res = await query<Record<string, unknown>>(
    `UPDATE print_products SET ${sets.join(", ")}
      WHERE id = $${i++} AND shop = $${i}
      RETURNING *`,
    vals,
  );
  return res.rows[0] ? mapRow(res.rows[0]) : null;
}

export async function deletePrintProduct(id: string, shop: string): Promise<boolean> {
  const res = await query(`DELETE FROM print_products WHERE id = $1 AND shop = $2`, [id, shop]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Mağazanın hiç baskı ürünü yoksa varsayılanları ekler.
 *
 * Yalnızca boş mağazada çalışır: mağaza sahibi varsayılanları silmişse geri
 * gelmemeli, yoksa her açılışta sildiği kayıtlarla uğraşır.
 */
export async function seedPrintProducts(shop: string): Promise<PrintProduct[]> {
  const existing = await listPrintProducts(shop);
  if (existing.length > 0) return existing;

  const created: PrintProduct[] = [];
  let order = 0;
  for (const seed of DEFAULT_PRINT_PRODUCTS) {
    order += 10;
    created.push(await createPrintProduct(shop, { ...seed, sort_order: order }));
  }
  return created;
}

/** Şablonun yerleşim hesapları için ihtiyaç duyduğu türetilmiş ölçüler */
export function canvasOf(product: PrintProduct): PrintCanvas {
  return printCanvas(product);
}
