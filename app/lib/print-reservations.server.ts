import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";

/**
 * Baskı dosyası için önceden ayrılan R2 adresleri.
 *
 * Sepete eklerken 6-17 MB'lık 300 DPI baskı dosyasını beklemek müşteriyi
 * 20+ saniye tutuyordu. Artık adres önce ayrılıyor, ürün bu adresle hemen sepete
 * ekleniyor ve dosya arka planda o adrese yükleniyor. Müşteri yükleme bitmeden
 * sayfadan ayrılırsa `uploaded_at` boş kalır; sipariş ekranı bunu "baskı dosyası
 * eksik" olarak gösterir.
 *
 * Yükleme endpoint'i yalnızca burada kayıtlı ve süresi dolmamış bir anahtara yazar;
 * böylece istemci rastgele bir R2 nesnesinin üzerine yazamaz.
 */

export type PrintSide = "front-print" | "back-print";
const SIDES: PrintSide[] = ["front-print", "back-print"];

/** Ayrılan adrese bu süre boyunca yazılabilir (yeniden denemeler dahil). */
const RESERVATION_WRITABLE_MINUTES = 60;
/** Yükleme bu kadar gecikmişse sipariş ekranında eksik sayılır. */
export const MISSING_AFTER_MINUTES = 3;

const KEY_PATTERN = /^uploads\/(front-print|back-print)\/[0-9a-f]{32}\.png$/;

let tableReady: Promise<void> | null = null;

export function ensurePrintReservationsTable() {
  tableReady ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS print_upload_reservations (
        key           TEXT PRIMARY KEY,
        side          TEXT NOT NULL,
        design_token  TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        uploaded_at   TIMESTAMPTZ
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS print_upload_reservations_token
        ON print_upload_reservations (design_token)
    `);
  })().catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

export function isPrintSide(value: unknown): value is PrintSide {
  return typeof value === "string" && (SIDES as string[]).includes(value);
}

export async function reservePrintKeys(sides: PrintSide[]): Promise<Array<{ side: PrintSide; key: string }>> {
  await ensurePrintReservationsTable();
  const out: Array<{ side: PrintSide; key: string }> = [];
  for (const side of sides) {
    const key = `uploads/${side}/${randomBytes(16).toString("hex")}.png`;
    await query("INSERT INTO print_upload_reservations (key, side) VALUES ($1, $2)", [key, side]);
    out.push({ side, key });
  }
  return out;
}

/** Yükleme öncesi: anahtar biçimi, taraf ve süre geçerli mi? */
export async function canWriteReservation(key: string, side: string): Promise<boolean> {
  if (!KEY_PATTERN.test(key) || !key.startsWith(`uploads/${side}/`)) return false;
  await ensurePrintReservationsTable();
  const { rowCount } = await query(
    `SELECT 1 FROM print_upload_reservations
      WHERE key = $1 AND side = $2
        AND created_at > now() - ($3 || ' minutes')::interval`,
    [key, side, String(RESERVATION_WRITABLE_MINUTES)],
  );
  return (rowCount ?? 0) > 0;
}

export async function markReservationUploaded(key: string) {
  await ensurePrintReservationsTable();
  await query("UPDATE print_upload_reservations SET uploaded_at = COALESCE(uploaded_at, now()) WHERE key = $1", [key]);
}

/** Tasarım kaydedilince ayrılan adresleri tasarıma bağla (eksik dosya tespiti için). */
export async function attachReservationsToDesign(keys: string[], designToken: string) {
  const valid = keys.filter((k) => typeof k === "string" && KEY_PATTERN.test(k));
  if (!valid.length || !designToken) return;
  await ensurePrintReservationsTable();
  await query(
    "UPDATE print_upload_reservations SET design_token = $1 WHERE key = ANY($2) AND design_token IS NULL",
    [designToken, valid],
  );
}

/** Verilen tasarımlardan, ayrılan adresine dosyası hiç yüklenmemiş olanlar. */
export async function designTokensWithMissingPrint(tokens: string[]): Promise<Set<string>> {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return new Set();
  await ensurePrintReservationsTable();
  const { rows } = await query<{ design_token: string }>(
    `SELECT DISTINCT design_token FROM print_upload_reservations
      WHERE design_token = ANY($1)
        AND uploaded_at IS NULL
        AND created_at < now() - ($2 || ' minutes')::interval`,
    [unique, String(MISSING_AFTER_MINUTES)],
  );
  return new Set(rows.map((r) => r.design_token));
}
