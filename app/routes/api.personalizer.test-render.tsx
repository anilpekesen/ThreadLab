import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { uploadToR2 } from "~/lib/r2.server";
import { getPersonalizerTemplate, templatePieces } from "~/models/personalizer.server";
import { getPrintProduct } from "~/models/print-product.server";
import { printCanvas } from "~/lib/print-spec";
import { isImageSlot, isTextSlot, validateSlots, type SlotIssue } from "~/lib/slots";
import { composeSlotDesign, type SlotFill } from "~/lib/slot-compose.server";

/**
 * Deneme çıktısı — şablonu örnek fotoğraflarla doldurup yöneticiye gösterir.
 *
 * Amaç, şablonu ilk kez müşterinin denememesi. Slot sırası, maske kalitesi,
 * metin taşması ve font sorunları bu ekranda tek bakışta görünüyor; canlıya
 * çıkmadan önce düzeltilebiliyor.
 *
 * Örnek fotoğraflar süreç içinde üretilip `data:` adresiyle veriliyor: depoya
 * çöp dosya bırakmamak için. Kasıtlı olarak farklı en-boy oranındalar, çünkü
 * kırpmanın doğru çalıştığı ancak dikey, yatay ve kare görsellerle anlaşılır.
 */

const PREVIEW_LONG_EDGE = 1400;
/** Örnek görsellerin dönüşümlü en-boy oranları */
const SAMPLE_SHAPES: Array<[number, number]> = [
  [1400, 900], [900, 1400], [1200, 1200], [1600, 900], [1000, 1500], [1200, 800],
];
const SAMPLE_COLORS = [
  "#e8635a", "#5aa9e8", "#6fbf73", "#e8a33d", "#9b6fd1", "#3fb8b0",
  "#d94f8a", "#7a8b99", "#c2a24a", "#5f7fd9", "#b05fd9", "#4aa06a",
];

async function samplePhoto(index: number): Promise<string> {
  const [w, h] = SAMPLE_SHAPES[index % SAMPLE_SHAPES.length];
  const color = SAMPLE_COLORS[index % SAMPLE_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${color}"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.36}" fill="rgba(255,255,255,.22)"/>
    <text x="${w / 2}" y="${h / 2}" font-size="${Math.min(w, h) * 0.4}" fill="#fff"
      font-family="Helvetica, Arial" font-weight="bold" text-anchor="middle"
      dominant-baseline="middle">${index + 1}</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { templateId?: string };
  try { body = await request.json(); }
  catch { return json({ error: "Geçersiz istek" }, { status: 400 }); }

  const template = await getPersonalizerTemplate(String(body.templateId ?? ""), session.shop);
  if (!template) return json({ error: "Şablon bulunamadı" }, { status: 404 });

  const pieces = templatePieces(template);

  const allImageSlots = pieces.flatMap((piece) => piece.slots.filter(isImageSlot));
  if (allImageSlots.length === 0) {
    return json({ error: "Şablonda fotoğraf alanı yok" }, { status: 400 });
  }

  // Aynı kaynağı gösteren slotlar aynı örnek fotoğrafı almalı; şablon "tek
  // fotoğraf, çok yerleşim" kuruyorsa deneme çıktısı da öyle görünmeli.
  const bySource = new Map<string, string>();
  const fills: SlotFill[] = [];
  for (const slot of allImageSlots) {
    const source = slot.source || slot.id;
    if (!bySource.has(source)) bySource.set(source, await samplePhoto(bySource.size));
    fills.push({ slot_id: slot.id, url: bySource.get(source)!, offset_x: 0, offset_y: 0, scale: 1 });
  }

  // Metin alanları örnek değerle dolduruluyor; boş bırakılırsa taşma ve font
  // sorunları görünmez kalır
  const texts: Record<string, string> = {};
  for (const piece of pieces) {
    for (const slot of piece.slots) {
      if (isTextSlot(slot)) texts[slot.id] = slot.default_value.trim() || örnekMetin(slot.max_length);
    }
  }

  const issues: SlotIssue[] = [];
  const rendered: Array<{ id: string; name: string; url: string }> = [];

  try {
    for (const piece of pieces) {
      const product = piece.print_product_id
        ? await getPrintProduct(piece.print_product_id, session.shop)
        : null;
      if (!product) {
        return json(
          { error: `"${piece.name}" parçasına baskı ebadı bağlanmamış` },
          { status: 400 },
        );
      }

      // Önizleme ölçeği: mm ve oran aynı kalır, yalnızca dpi düşer
      const longEdgeMm = Math.max(product.width_mm, product.height_mm);
      const dpi = Math.max(24, Math.min(product.dpi, Math.round((PREVIEW_LONG_EDGE * 25.4) / longEdgeMm)));
      const canvas = printCanvas({ ...product, dpi });

      const ids = new Set(piece.slots.map((sl) => sl.id));
      const buf = await composeSlotDesign({
        canvas,
        slots: piece.slots,
        fills: fills.filter((f) => ids.has(f.slot_id)),
        texts,
        backgroundUrl: piece.background_url,
        overlayUrl: piece.overlay_url,
        outputFormat: "jpeg",
        quality: 86,
      });
      const url = await uploadToR2(buf, "jpg", "personalizer-test");
      rendered.push({ id: piece.id, name: piece.name, url });

      const pieceIssues = validateSlots(piece.slots, canvas, {
        expected_image_slots: pieces.length === 1 ? template.expected_slots : 0,
        // 12 MP'lik tipik bir telefon fotoğrafının kısa kenarı
        typical_photo_px: 3000,
      });
      for (const issue of pieceIssues) {
        issues.push(pieces.length > 1
          ? { ...issue, message: `${piece.name}: ${issue.message}` }
          : issue);
      }
    }

    // Fontu olmayan metin alanı: baskıda sistem fontuna düşer
    for (const piece of pieces) {
      for (const slot of piece.slots) {
        if (isTextSlot(slot) && slot.mode !== "fixed" && !slot.font_url) {
          issues.push({
            level: "warning",
            slot_id: slot.id,
            message: `"${slot.label || slot.id}" için font yüklenmemiş; baskıda tasarımdan farklı görünecek.`,
          });
        }
      }
    }

    return json({
      url: rendered[0]?.url ?? "",
      pieces: rendered,
      issues,
      photoCount: bySource.size,
      version: template.version,
    });
  } catch (err) {
    console.error("[test-render] hata:", err);
    return json({ error: "Deneme çıktısı üretilemedi" }, { status: 500 });
  }
};

/** Taşmayı görünür kılacak kadar uzun, kutuyu patlatmayacak kadar kısa örnek */
function örnekMetin(maxLength: number): string {
  const base = "Örnek Yazı ĞÜŞİÖÇ";
  if (maxLength > 0 && maxLength < base.length) return base.slice(0, maxLength);
  return base;
}
