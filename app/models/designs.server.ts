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
  sessionId?: string;
  designJson?: unknown;
  frontPreviewUrl?: string;
  backPreviewUrl?: string;
  frontPrintUrl?: string;
  backPrintUrl?: string;
  previewIssue?: boolean;
  /** Müşterinin yüklediği ham görsellerin URL'leri (işlenmemiş hali) */
  originalImageUrls?: string[];
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
  preview_issue: boolean;
  original_image_urls: string[] | null;
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
    previewIssue: row.preview_issue || false,
    originalImageUrls: Array.isArray(row.original_image_urls) ? row.original_image_urls : [],
    createdAt: row.created_at.toISOString(),
  };
}

export async function getDesignByToken(shop: string, token: string): Promise<DesignRecord | null> {
  await ensureMigrations();
  const result = await query<DbRow>(
    "SELECT * FROM designs WHERE shop = $1 AND token = $2",
    [shop, token],
  );
  if (result.rows.length) return rowToRecord(result.rows[0]);

  // PrintLabHub akışı: mağazanın siparişi üreticiye devredildiğinde üretici
  // siparişindeki design_token BAŞKA mağazanın tasarımını işaret eder.
  // Token global benzersiz olduğu için token-bazlı fallback güvenlidir.
  const fallback = await query<DbRow>(
    "SELECT * FROM designs WHERE token = $1",
    [token],
  );
  if (!fallback.rows.length) return null;
  return rowToRecord(fallback.rows[0]);
}

/** İşlenmiş (arka planı kaldırılmış) çıktıların adres desenleri */
// template-design: şablon + fotoğraf birleşimi — ham yükleme değil
const PROCESSED_SRC_PATTERNS = ["/auto-bg/", "auto-bg-", "/bg-removed/", "/template-design/"];

function isProcessedSrc(url: string): boolean {
  return PROCESSED_SRC_PATTERNS.some((p) => url.includes(p));
}

/**
 * Tasarımcı bazı görselleri /api/img-proxy?url=... sarmalayıcısıyla saklıyor.
 * Orijinali kaydederken gerçek varlık adresine indirgiyoruz, aksi halde
 * saklanan adres uygulamaya bağımlı ve okunması zor oluyor.
 */
export function unproxyImageUrl(url: string): string {
  const marker = "/api/img-proxy?url=";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const encoded = url.slice(idx + marker.length).split("&")[0];
  try {
    const decoded = decodeURIComponent(encoded);
    return decoded.startsWith("http") ? decoded : url;
  } catch {
    return url;
  }
}

/**
 * Tasarım JSON'ındaki ham görsel adreslerini toplar. İşlenmiş çıktılar
 * elenir — amaç müşterinin yüklediği orijinali saklamak.
 */
export function collectOriginalImageUrls(designJson: unknown): string[] {
  const urls = new Set<string>();
  const json = designJson as Record<string, unknown> | null | undefined;
  if (!json || typeof json !== "object") return [];

  for (const side of ["front", "back"] as const) {
    let canvas = json[side] as { objects?: Record<string, unknown>[] } | string | undefined;
    if (typeof canvas === "string") {
      try { canvas = JSON.parse(canvas) as { objects?: Record<string, unknown>[] }; } catch { continue; }
    }
    if (!canvas || typeof canvas !== "object") continue;
    for (const obj of canvas.objects ?? []) {
      const raw = obj.src;
      if (obj.type !== "image" || typeof raw !== "string") continue;
      const src = unproxyImageUrl(raw);
      if (!src.startsWith("http")) continue;   // data: URL saklamıyoruz
      if (isProcessedSrc(src)) continue;
      urls.add(src);
    }
  }
  return [...urls];
}

export async function saveDesign(
  shop: string,
  record: Omit<DesignRecord, "createdAt">,
): Promise<void> {
  await ensureMigrations();

  // Açıkça verilmediyse tasarımın kendisinden çıkar. Union SQL tarafında
  // yapıldığı için sonradan gelen kayıtlar öncekileri silmez — arka plan
  // kaldırma src'leri değiştirse bile orijinaller kalır.
  const originals = record.originalImageUrls?.length
    ? record.originalImageUrls
    : collectOriginalImageUrls(record.designJson);

  await query(
    `INSERT INTO designs (shop, token, product_id, session_id, design_json, front_preview_url, back_preview_url, front_print_url, back_print_url, preview_issue, original_image_urls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     ON CONFLICT (token) DO UPDATE SET
       shop = EXCLUDED.shop,
       product_id = EXCLUDED.product_id,
       session_id = COALESCE(EXCLUDED.session_id, designs.session_id),
       design_json = EXCLUDED.design_json,
       front_preview_url = EXCLUDED.front_preview_url,
       back_preview_url = EXCLUDED.back_preview_url,
       front_print_url = EXCLUDED.front_print_url,
       back_print_url = EXCLUDED.back_print_url,
       preview_issue = EXCLUDED.preview_issue,
       original_image_urls = (
         SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
         FROM jsonb_array_elements_text(
           designs.original_image_urls || EXCLUDED.original_image_urls
         ) AS elem
       )`,
    [
      shop,
      record.token,
      record.productId ?? null,
      record.sessionId ?? null,
      record.designJson ? JSON.stringify(record.designJson) : null,
      record.frontPreviewUrl ?? "",
      record.backPreviewUrl ?? "",
      record.frontPrintUrl ?? "",
      record.backPrintUrl ?? "",
      record.previewIssue ?? false,
      JSON.stringify(originals),
    ],
  );
}

export async function getSessionForDesignToken(shop: string, token: string): Promise<string | null> {
  const result = await query<{ session_id: string | null }>(
    "SELECT session_id FROM designs WHERE shop = $1 AND token = $2",
    [shop, token],
  );
  return result.rows[0]?.session_id ?? null;
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
