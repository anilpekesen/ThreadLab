import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export interface DesignRecord {
  token: string;
  productId?: string;
  designJson?: unknown;
  frontPreviewUrl?: string;
  backPreviewUrl?: string;
  frontPrintUrl?: string;
  backPrintUrl?: string;
  createdAt: string;
}

export interface DesignObject {
  type: string;
  src?: string;
  text?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  // Text properties
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  textAlign?: string;
  charSpacing?: number;
  lineHeight?: number;
}

type DbRow = {
  token: string;
  product_id: string | null;
  design_json: unknown;
  front_preview_url: string;
  back_preview_url: string;
  front_print_url: string;
  back_print_url: string;
  created_at: Date;
};

function rowToRecord(row: DbRow): DesignRecord {
  return {
    token: row.token,
    productId: row.product_id ?? undefined,
    designJson: row.design_json ?? undefined,
    frontPreviewUrl: row.front_preview_url || undefined,
    backPreviewUrl: row.back_preview_url || undefined,
    frontPrintUrl: row.front_print_url || undefined,
    backPrintUrl: row.back_print_url || undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export async function getDesignByToken(token: string): Promise<DesignRecord | null> {
  await ensureMigrations();
  const result = await query<DbRow>(
    "SELECT * FROM designs WHERE token = $1",
    [token],
  );
  if (!result.rows.length) return null;
  return rowToRecord(result.rows[0]);
}

export async function saveDesign(record: Omit<DesignRecord, "createdAt">): Promise<void> {
  await ensureMigrations();
  await query(
    `INSERT INTO designs (token, product_id, design_json, front_preview_url, back_preview_url, front_print_url, back_print_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (token) DO UPDATE SET
       product_id = EXCLUDED.product_id,
       design_json = EXCLUDED.design_json,
       front_preview_url = EXCLUDED.front_preview_url,
       back_preview_url = EXCLUDED.back_preview_url,
       front_print_url = EXCLUDED.front_print_url,
       back_print_url = EXCLUDED.back_print_url`,
    [
      record.token,
      record.productId ?? null,
      record.designJson ? JSON.stringify(record.designJson) : null,
      record.frontPreviewUrl ?? "",
      record.backPreviewUrl ?? "",
      record.frontPrintUrl ?? "",
      record.backPrintUrl ?? "",
    ],
  );
}

export function extractObjects(designJson: unknown, side: "front" | "back"): DesignObject[] {
  try {
    const json = designJson as Record<string, unknown>;
    let canvas = json[side] as { objects?: Record<string, unknown>[] } | string | undefined;
    if (typeof canvas === "string") {
      canvas = JSON.parse(canvas) as { objects?: Record<string, unknown>[] };
    }
    const raw = (canvas as { objects?: Record<string, unknown>[] })?.objects ?? [];
    return raw
      .filter((o) => o.type !== "rect")
      .map((o) => ({
        type: o.type as string,
        src: o.src as string | undefined,
        text: o.text as string | undefined,
        left: o.left as number | undefined,
        top: o.top as number | undefined,
        width: o.width as number | undefined,
        height: o.height as number | undefined,
        scaleX: o.scaleX as number | undefined,
        scaleY: o.scaleY as number | undefined,
        angle: o.angle as number | undefined,
        fontFamily: o.fontFamily as string | undefined,
        fontSize: o.fontSize as number | undefined,
        fill: o.fill as string | undefined,
        fontWeight: o.fontWeight as string | number | undefined,
        fontStyle: o.fontStyle as string | undefined,
        underline: o.underline as boolean | undefined,
        textAlign: o.textAlign as string | undefined,
        charSpacing: o.charSpacing as number | undefined,
        lineHeight: o.lineHeight as number | undefined,
      }));
  } catch {
    return [];
  }
}
