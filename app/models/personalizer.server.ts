import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";

export interface TextFieldDef {
  id: string;
  label: string;
  placeholder: string;
  x: number;
  y: number;
  font_size: number;
  color: string;
  bold: boolean;
  max_length: number;
  align: "left" | "center" | "right";
}

export interface PersonalizerTemplate {
  id: string;
  shop: string;
  name: string;
  description: string;
  template_url: string;   // design template (karikatürün yerleşeceği tasarım)
  mockup_url: string;     // frame/lifestyle (tasarımın gireceği çerçeve)
  photo_x: number;        // karikatür → tasarım üzerindeki alan
  photo_y: number;
  photo_width: number;
  photo_height: number;
  mockup_x: number;       // tasarım → çerçeve üzerindeki alan
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields: TextFieldDef[];
  ai_style: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type Row = PersonalizerTemplate;

export async function listPersonalizerTemplates(shop: string, activeOnly = false): Promise<PersonalizerTemplate[]> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates
     WHERE shop = $1 ${activeOnly ? "AND active = TRUE" : ""}
     ORDER BY sort_order ASC, created_at DESC`,
    [shop],
  );
  return res.rows;
}

export async function getPersonalizerTemplate(id: string, shop: string): Promise<PersonalizerTemplate | null> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates WHERE id = $1 AND shop = $2`,
    [id, shop],
  );
  return res.rows[0] ?? null;
}

export async function getPersonalizerTemplatePublic(id: string): Promise<PersonalizerTemplate | null> {
  const res = await query<Row>(
    `SELECT * FROM personalizer_templates WHERE id = $1 AND active = TRUE`,
    [id],
  );
  return res.rows[0] ?? null;
}

export interface CreatePersonalizerTemplateInput {
  shop: string;
  name: string;
  description?: string;
  template_url: string;
  mockup_url?: string;
  photo_x: number;
  photo_y: number;
  photo_width: number;
  photo_height: number;
  mockup_x?: number;
  mockup_y?: number;
  mockup_width?: number;
  mockup_height?: number;
  text_fields?: TextFieldDef[];
  ai_style?: string;
  sort_order?: number;
}

export async function createPersonalizerTemplate(input: CreatePersonalizerTemplateInput): Promise<PersonalizerTemplate> {
  const id = randomBytes(12).toString("hex");
  const res = await query<Row>(
    `INSERT INTO personalizer_templates
       (id, shop, name, description, template_url, mockup_url,
        photo_x, photo_y, photo_width, photo_height,
        mockup_x, mockup_y, mockup_width, mockup_height,
        text_fields, ai_style, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      id, input.shop, input.name, input.description ?? "",
      input.template_url, input.mockup_url ?? "",
      input.photo_x, input.photo_y, input.photo_width, input.photo_height,
      input.mockup_x ?? 0, input.mockup_y ?? 0, input.mockup_width ?? 0, input.mockup_height ?? 0,
      JSON.stringify(input.text_fields ?? []),
      input.ai_style ?? "caricature",
      input.sort_order ?? 0,
    ],
  );
  return res.rows[0];
}

export interface UpdatePersonalizerTemplateInput {
  name?: string;
  description?: string;
  template_url?: string;
  mockup_url?: string;
  photo_x?: number;
  photo_y?: number;
  photo_width?: number;
  photo_height?: number;
  mockup_x?: number;
  mockup_y?: number;
  mockup_width?: number;
  mockup_height?: number;
  text_fields?: TextFieldDef[];
  ai_style?: string;
  active?: boolean;
  sort_order?: number;
}

export async function updatePersonalizerTemplate(
  id: string,
  shop: string,
  input: UpdatePersonalizerTemplateInput,
): Promise<PersonalizerTemplate | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(k === "text_fields" ? JSON.stringify(v) : v);
  }
  if (sets.length === 0) return getPersonalizerTemplate(id, shop);

  sets.push(`updated_at = now()`);
  vals.push(id, shop);

  const res = await query<Row>(
    `UPDATE personalizer_templates SET ${sets.join(", ")} WHERE id = $${i} AND shop = $${i + 1} RETURNING *`,
    vals,
  );
  return res.rows[0] ?? null;
}

export async function deletePersonalizerTemplate(id: string, shop: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM personalizer_templates WHERE id = $1 AND shop = $2`,
    [id, shop],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Frame (çerçeve seçeneği) ────────────────────────────────────────────────

export interface PersonalizerFrame {
  id: string;
  template_id: string;
  name: string;
  mockup_url: string;
  mockup_x: number;
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields: TextFieldDef[];
  sort_order: number;
  created_at: string;
}

export async function listPersonalizerFrames(templateId: string): Promise<PersonalizerFrame[]> {
  const res = await query<PersonalizerFrame>(
    `SELECT * FROM personalizer_frames WHERE template_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [templateId],
  );
  return res.rows;
}

export async function getPersonalizerFramePublic(id: string): Promise<PersonalizerFrame | null> {
  const res = await query<PersonalizerFrame>(
    `SELECT * FROM personalizer_frames WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function createPersonalizerFrame(input: {
  template_id: string;
  name: string;
  mockup_url: string;
  mockup_x: number;
  mockup_y: number;
  mockup_width: number;
  mockup_height: number;
  text_fields?: TextFieldDef[];
  sort_order?: number;
}): Promise<PersonalizerFrame> {
  const id = randomBytes(12).toString("hex");
  const res = await query<PersonalizerFrame>(
    `INSERT INTO personalizer_frames
       (id, template_id, name, mockup_url, mockup_x, mockup_y, mockup_width, mockup_height, text_fields, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      id,
      input.template_id,
      input.name,
      input.mockup_url,
      input.mockup_x,
      input.mockup_y,
      input.mockup_width,
      input.mockup_height,
      JSON.stringify(input.text_fields ?? []),
      input.sort_order ?? 0,
    ],
  );
  return res.rows[0];
}

export async function updatePersonalizerFrame(
  id: string,
  input: { name?: string; mockup_url?: string; mockup_x?: number; mockup_y?: number; mockup_width?: number; mockup_height?: number; text_fields?: TextFieldDef[]; sort_order?: number },
): Promise<PersonalizerFrame | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(k === "text_fields" ? JSON.stringify(v) : v);
  }
  if (sets.length === 0) return getPersonalizerFramePublic(id);
  vals.push(id);
  const res = await query<PersonalizerFrame>(
    `UPDATE personalizer_frames SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return res.rows[0] ?? null;
}

export async function deletePersonalizerFrame(id: string, templateId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM personalizer_frames WHERE id = $1 AND template_id = $2`,
    [id, templateId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Product links ───────────────────────────────────────────────────────────

export interface PersonalizerProductLink {
  shop: string;
  product_id: string;
  template_id: string;
  product_title: string;
  product_handle: string;
  variant_id: string;
  created_at: string;
  updated_at: string;
}

export async function linkPersonalizerProduct(input: {
  shop: string;
  product_id: string;
  template_id: string;
  product_title?: string;
  product_handle?: string;
  variant_id?: string;
}): Promise<PersonalizerProductLink> {
  const res = await query<PersonalizerProductLink>(
    `INSERT INTO personalizer_product_links
       (shop, product_id, template_id, product_title, product_handle, variant_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (shop, product_id)
     DO UPDATE SET
       template_id = EXCLUDED.template_id,
       product_title = EXCLUDED.product_title,
       product_handle = EXCLUDED.product_handle,
       variant_id = EXCLUDED.variant_id,
       updated_at = now()
     RETURNING *`,
    [
      input.shop,
      input.product_id,
      input.template_id,
      input.product_title ?? "",
      input.product_handle ?? "",
      input.variant_id ?? "",
    ],
  );
  return res.rows[0];
}

export async function listPersonalizerProductLinks(templateId: string): Promise<PersonalizerProductLink[]> {
  const res = await query<PersonalizerProductLink>(
    `SELECT * FROM personalizer_product_links WHERE template_id = $1 ORDER BY updated_at DESC`,
    [templateId],
  );
  return res.rows;
}

export async function getPersonalizerTemplateByProduct(shop: string, productId: string): Promise<PersonalizerTemplate | null> {
  const res = await query<PersonalizerTemplate>(
    `SELECT pt.*
       FROM personalizer_product_links ppl
       JOIN personalizer_templates pt ON pt.id = ppl.template_id
      WHERE ppl.shop = $1 AND ppl.product_id = $2 AND pt.active = TRUE
      LIMIT 1`,
    [shop, productId],
  );
  return res.rows[0] ?? null;
}
