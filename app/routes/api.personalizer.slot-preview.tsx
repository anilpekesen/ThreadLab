import { json, type ActionFunctionArgs } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";
import { uploadToR2 } from "~/lib/r2.server";
import { getPersonalizerTemplatePublic, templatePieces } from "~/models/personalizer.server";
import { getPrintProductPublic } from "~/models/print-product.server";
import { printCanvas } from "~/lib/print-spec";
import { isImageSlot } from "~/lib/slots";
import { composeSlotDesign, type SlotFill } from "~/lib/slot-compose.server";

/**
 * Çoklu slot önizlemesi ve baskı çıktısı.
 *
 * Önizleme baskı çözünürlüğünde üretilmez. On beş fotoğraflı bir tasarımda
 * 3614x4795 piksel kompozit saniyeler sürer ve müşteri her düzeltmede bunu
 * bekleyemez. Slotlar oran cinsinden tutulduğu için çözünürlüğü düşürmek
 * yerleşimi hiç etkilemiyor: aynı tarif, küçük tuval.
 *
 * `mode=render` istendiğinde tam çözünürlükte üretilir; sipariş anında bir kez
 * çağrılır.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Önizlemede uzun kenarın hedef pikseli */
const PREVIEW_LONG_EDGE = 1400;

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(null, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  let body: {
    templateId?: string;
    fills?: SlotFill[];
    texts?: Record<string, string>;
    mode?: string;
    locale?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz istek" }, { status: 400, headers: CORS });
  }

  const isTr = !String(body.locale ?? "tr").toLowerCase().startsWith("en");
  const msg = {
    templateRequired: isTr ? "templateId gerekli" : "templateId is required",
    notFound: isTr ? "Şablon bulunamadı" : "Template not found",
    noSize: isTr ? "Şablona baskı ebadı bağlanmamış" : "Template has no print size",
    missing: (n: number) =>
      isTr ? `${n} fotoğraf alanı boş` : `${n} photo slots are empty`,
    failed: isTr ? "Önizleme oluşturulamadı" : "Preview could not be created",
  };

  const templateId = String(body.templateId ?? "").trim();
  if (!templateId) return json({ error: msg.templateRequired }, { status: 400, headers: CORS });

  const template = await getPersonalizerTemplatePublic(templateId);
  if (!template) return json({ error: msg.notFound }, { status: 404, headers: CORS });

  const pieces = templatePieces(template);
  const isRender = String(body.mode ?? "") === "render";

  // İstemciden gelen doldurma kayıtları temizlenir: tanınmayan slot kimlikleri
  // atılır, kaydırma ve ölçek makul aralığa çekilir. Böylece uç değerlerle
  // sunucuda devasa ara görsel üretilemez.
  const allImageSlotIds = new Set<string>();
  for (const piece of pieces) {
    for (const slot of piece.slots) if (isImageSlot(slot)) allImageSlotIds.add(slot.id);
  }
  const fills: SlotFill[] = (Array.isArray(body.fills) ? body.fills : [])
    .filter((f) => f && typeof f.url === "string" && allImageSlotIds.has(String(f.slot_id)))
    .map((f) => ({
      slot_id: String(f.slot_id),
      url: String(f.url),
      offset_x: clamp(Number(f.offset_x) || 0, -1, 1),
      offset_y: clamp(Number(f.offset_y) || 0, -1, 1),
      scale: clamp(Number(f.scale) || 1, 1, 4),
    }));

  const filled = new Set(fills.map((f) => f.slot_id));
  const missing = allImageSlotIds.size - filled.size;

  // Baskı çıktısında eksik alan kabul edilmez; önizlemede serbest, müşteri
  // doldururken sonucu görebilmeli.
  if (isRender && missing > 0) {
    return json({ error: msg.missing(missing) }, { status: 400, headers: CORS });
  }

  const texts = body.texts ?? {};
  const rendered: Array<{ id: string; name: string; url: string; width: number; height: number }> = [];

  try {
    // Parçalar sırayla basılıyor. Set ürünlerinde her parça ayrı bir fiziksel
    // ürün: üç çerçevelik bir sette üretime üç ayrı dosya gider.
    for (const piece of pieces) {
      const product = piece.print_product_id
        ? await getPrintProductPublic(piece.print_product_id)
        : null;
      if (!product) {
        return json(
          { error: `${msg.noSize} (${piece.name})` },
          { status: 400, headers: CORS },
        );
      }

      const fullCanvas = printCanvas(product);
      const canvas = isRender
        ? fullCanvas
        : printCanvas({
            ...product,
            // Oran ve mm ölçüleri aynı kalır, yalnızca dpi düşer
            dpi: previewDpi(product.width_mm, product.height_mm, product.dpi),
          });

      const pieceSlotIds = new Set(piece.slots.map((sl) => sl.id));
      const buf = await composeSlotDesign({
        canvas,
        slots: piece.slots,
        fills: fills.filter((f) => pieceSlotIds.has(f.slot_id)),
        texts,
        backgroundUrl: piece.background_url,
        overlayUrl: piece.overlay_url,
        outputFormat: isRender ? "png" : "jpeg",
        quality: 88,
        // Baskıda eksik fotoğraf hata; önizlemede tolere edilir
        strict: isRender,
      });

      const url = await uploadToR2(
        buf,
        isRender ? "png" : "jpg",
        isRender ? "personalizer-print" : "personalizer-preview",
      );
      rendered.push({
        id: piece.id,
        name: piece.name,
        url,
        width: canvas.canvasWidth,
        height: canvas.canvasHeight,
      });
    }

    // Önizlemede kayıt tutulmuyor: müşteri onlarca kez önizleyebilir, her biri
    // için tasarım kaydı açmak veritabanını çöple doldurur.
    let designToken: string | null = null;
    if (isRender) {
      designToken = randomBytes(16).toString("hex");
      // Tarif saklanıyor, yalnızca çıktı dosyaları değil: baskı dosyası
      // kaybolursa ya da bozulursa aynı tasarım birebir yeniden üretilebilsin.
      // Şablon sürümü de burada — şablon sonradan değişse bile sipariş, o
      // günkü hâliyle basılabilir.
      await query(
        `INSERT INTO designs (token, shop, front_print_url, front_preview_url, design_json, created_at)
         VALUES ($1, $2, $3, $3, $4, now())`,
        [
          designToken,
          template.shop,
          rendered[0]?.url ?? "",
          JSON.stringify({
            type: "personalizer-slots",
            templateId: template.id,
            templateVersion: template.version,
            templateName: template.name,
            pieces: rendered.map((r) => ({ id: r.id, name: r.name, url: r.url })),
            fills,
            texts,
          }),
        ],
      );
    }

    return json(
      {
        // Tek parçalı şablonlarda eski alanlar korunuyor
        url: rendered[0]?.url ?? "",
        width: rendered[0]?.width ?? 0,
        height: rendered[0]?.height ?? 0,
        pieces: rendered,
        missing,
        designToken,
        templateVersion: template.version,
      },
      { headers: CORS },
    );
  } catch (err) {
    console.error("[slot-preview] kompozit hatası:", err);
    // Baskıda hangi alanın düştüğü müşteriye söylenmeli: fotoğrafı değiştirip
    // tekrar deneyebilsin. Genel bir "hata oluştu" onu çaresiz bırakır.
    const detail = isRender && err instanceof Error ? err.message : "";
    return json(
      { error: detail || msg.failed },
      { status: 500, headers: CORS },
    );
  }
};

/** Uzun kenarı hedefe indiren dpi; asla ürünün kendi dpi'sini aşmaz */
function previewDpi(widthMm: number, heightMm: number, sourceDpi: number): number {
  const longEdgeMm = Math.max(widthMm, heightMm);
  if (!(longEdgeMm > 0)) return sourceDpi;
  const dpi = Math.round((PREVIEW_LONG_EDGE * 25.4) / longEdgeMm);
  return Math.max(24, Math.min(sourceDpi, dpi));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
