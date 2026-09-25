import { uploadToR2 } from "~/lib/r2.server";
import { scanTemplateHoles, extractHoleMask, type TemplateHole } from "~/lib/template-hole.server";
import { sortReadingOrder, type ImageSlot } from "~/lib/slots";

/**
 * Şeffaf deliklerden fotoğraf alanı üretir (bkz. api.personalizer.detect-slots).
 * Canva/PNG içe aktarma da aynı yolu kullanır.
 */

/** Tuval alanının bu oranından küçük delikler yok sayılır (harf gözleri) */
export const DEFAULT_MIN_AREA_RATIO = 0.004;
/** Tek bir taramada üretilecek üst sınır; kaza eseri yüzlerce maske yüklenmesin */
const MAX_HOLES = 60;

export type HoleSlotsResult =
  | { ok: true; slots: ImageSlot[]; scanned: { width: number; height: number; rawHoles: number } }
  | { ok: false; status: number; error?: string; message?: string; scanned?: { width: number; height: number; rawHoles: number } };

export async function holeSlots(buffer: Buffer, en: boolean, minRatio = DEFAULT_MIN_AREA_RATIO): Promise<HoleSlotsResult> {
  let scan;
  try {
    scan = await scanTemplateHoles(buffer);
  } catch (err) {
    console.error("[detect-slots] tarama hatası:", err);
    return { ok: false, status: 500, error: en ? "Couldn't scan the template" : "Şablon taranamadı" };
  }

  const total = scan.width * scan.height;
  const holes = scan.holes.filter((h) => h.pixels / total >= minRatio);

  if (holes.length === 0) {
    return {
      ok: false,
      status: 200,
      message: en
        ? "No enclosed transparent areas found. Make sure the design is a PNG, the background is opaque "
          + "and the holes don't touch the edge of the canvas."
        : "Kapalı şeffaf alan bulunamadı. Tasarımın PNG olduğundan, arka planın opak "
          + "olduğundan ve deliklerin tuvalin kenarına değmediğinden emin olun.",
      scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length },
    };
  }

  if (holes.length > MAX_HOLES) {
    return {
      ok: false,
      status: 400,
      error: en
        ? `Found ${holes.length} areas; this may be a scanning error. Raise the area threshold and try again.`
        : `${holes.length} alan bulundu; bu bir tarama hatası olabilir. `
          + "Alan eşiğini yükseltip tekrar deneyin.",
      scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length },
    };
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
    return { ok: false, status: 500, error: en ? "Couldn't create area masks" : "Alan maskeleri üretilemedi" };
  }

  const slots = sortReadingOrder(draft).map((s) => ({
    ...s,
    id: `photo_${s.order}`,
    source: `photo_${s.order}`,
    label: en ? `Photo ${s.order}` : `${s.order}. Fotoğraf`,
  }));

  return { ok: true, slots, scanned: { width: scan.width, height: scan.height, rawHoles: scan.holes.length } };
}
