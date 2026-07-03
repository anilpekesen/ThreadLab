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
