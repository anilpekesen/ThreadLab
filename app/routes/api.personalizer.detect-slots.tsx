import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { uploadToR2 } from "~/lib/r2.server";
import { scanTemplateHoles, extractHoleMask, type TemplateHole } from "~/lib/template-hole.server";
import { sortReadingOrder, type ImageSlot } from "~/lib/slots";

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

/** Tuval alanının bu oranından küçük delikler yok sayılır (harf gözleri) */
const DEFAULT_MIN_AREA_RATIO = 0.004;
/** Tek bir taramada üretilecek üst sınır; kaza eseri yüzlerce maske yüklenmesin */
const MAX_HOLES = 60;

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

  let scan;
  try {
    scan = await scanTemplateHoles(buffer);
  } catch (err) {
    console.error("[detect-slots] tarama hatası:", err);
    return json({ error: en ? "Couldn't scan the template" : "Şablon taranamadı" }, { status: 500 });
  }

  const total = scan.width * scan.height;
  const minRatio = clamp(Number(body.minAreaRatio) || DEFAULT_MIN_AREA_RATIO, 0.0001, 0.2);
  const holes = scan.holes.filter((h) => h.pixels / total >= minRatio);

  if (holes.length === 0) {
    return json({
      found: false,
      slots: [],
      message: en
        ? "No enclosed transparent areas found. Make sure the design is a PNG, the background is opaque "
          + "and the holes don't touch the edge of the canvas."
        : "Kapalı şeffaf alan bulunamadı. Tasarımın PNG olduğundan, arka planın opak "
          + "olduğundan ve deliklerin tuvalin kenarına değmediğinden emin olun.",
      scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length },
    });
  }

  if (holes.length > MAX_HOLES) {
    return json({
      error: en
        ? `Found ${holes.length} areas; this may be a scanning error. Raise the area threshold and try again.`
        : `${holes.length} alan bulundu; bu bir tarama hatası olabilir. `
          + "Alan eşiğini yükseltip tekrar deneyin.",
      scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length },
    }, { status: 400 });
  }

  // Maskeler yüklenip slotlar kuruluyor. Sıralama önce okuma sırasına göre
  // düzeltiliyor: flood fill delikleri tarama sırasına göre döndürüyor ve
  // müşteriye gösterilecek numaralandırma soldan sağa, yukarıdan aşağıya olmalı.
  const draft: ImageSlot[] = [];
  try {
    for (let i = 0; i < holes.length; i++) {
      const hole: TemplateHole = holes[i];
      const mask = await extractHoleMask(scan, hole);
      const maskUrl = await uploadToR2(mask, "png", "personalizer-mask");
      const id = `photo_${i + 1}`;
      draft.push({
        id,
        kind: "image",
        source: id,
        rect: {
          x: hole.x / scan.width,
          y: hole.y / scan.height,
          w: hole.width / scan.width,
          h: hole.height / scan.height,
        },
        mask_url: maskUrl,
        fit: "cover",
        allow: { pan: true, zoom: true, rotate: false },
        label: "",
        order: i + 1,
      });
    }
  } catch (err) {
    console.error("[detect-slots] maske üretimi başarısız:", err);
    return json({ error: en ? "Couldn't create area masks" : "Alan maskeleri üretilemedi" }, { status: 500 });
  }

  const slots = sortReadingOrder(draft).map((s) => ({
    ...s,
    id: `photo_${s.order}`,
    source: `photo_${s.order}`,
    label: en ? `Photo ${s.order}` : `${s.order}. Fotoğraf`,
  }));

  const expected = Math.max(0, Math.floor(Number(body.expected) || 0));
  return json({
    found: true,
    slots,
    scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length },
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
