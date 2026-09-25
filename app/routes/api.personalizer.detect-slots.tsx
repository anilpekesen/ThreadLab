import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { DEFAULT_MIN_AREA_RATIO, holeSlots } from "~/lib/hole-slots.server";

/**
 * Şeffaf deliklerden fotoğraf alanı üretir.
 *
 * Izgara üreticisi düz dizilimleri karşılıyor, ama "LOVE" yazısının harfleri
 * içine giren fotoğraflar ya da kalp biçimli alanlar dikdörtgen değil. Bu
 * şekiller ancak tasarım dosyasından okunabilir: tasarımcı fotoğrafın gireceği
 * yerleri şeffaf bırakıyor, sistem şekli birebir çıkarıyor.
 *
 * Her delik için gerçek şeklinden bir alfa maskesi üretilip saklanıyor; baskıda
 * fotoğraf o şeklin dışından kesiliyor.
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { templateUrl?: string; expected?: number; minAreaRatio?: number; _lang?: string };
  try { body = await request.json(); }
  catch { return json({ error: langFromRequest(request) === "en" ? "Invalid request" : "Geçersiz istek" }, { status: 400 }); }
  const lang = body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request);
  const en = lang === "en";

  const templateUrl = String(body.templateUrl ?? "").trim();
  if (!templateUrl) return json({ error: en ? "No template image" : "Şablon görseli yok" }, { status: 400 });

  let buffer: Buffer;
  try {
    const res = await fetch(templateUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(String(res.status));
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return json({ error: `${en ? "Couldn't download template" : "Şablon indirilemedi"}: ${String(err)}` }, { status: 502 });
  }

  const minRatio = clamp(Number(body.minAreaRatio) || DEFAULT_MIN_AREA_RATIO, 0.0001, 0.2);
  const result = await holeSlots(buffer, en, minRatio);
  if (!result.ok) {
    if (result.status === 200) return json({ found: false, slots: [], message: result.message, scanned: result.scanned });
    return json({ error: result.error, scanned: result.scanned }, { status: result.status });
  }
  const { slots } = result;

  const expected = Math.max(0, Math.floor(Number(body.expected) || 0));
  return json({
    found: true,
    slots,
    scanned: result.scanned,
    mismatch: expected > 0 && expected !== slots.length
      ? en
        ? `Expected ${expected} areas, found ${slots.length}. Delete the extras or correct the expected number.`
        : `Beklenen ${expected} alan, bulunan ${slots.length}. Fazlalıkları silin ya da beklenen sayıyı düzeltin.`
      : null,
  });
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
