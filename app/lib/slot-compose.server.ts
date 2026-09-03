import sharp from "sharp";
import type { PrintCanvas } from "~/lib/print-spec";
import {
  isImageSlot, isTextSlot, rectToPx,
  type ImageSlot, type Slot, type TextSlot,
} from "~/lib/slots";
import { loadFont, layoutText } from "~/lib/text-render.server";

/**
 * Çoklu slot kompozisyonu — N fotoğrafı şablonun N alanına yerleştirir.
 *
 * Mevcut `personalizer-compose.server.ts` tek fotoğraflı modeli, dağıtımı ve AI
 * yolunu sürdürüyor; burası ayrı bir modül olarak duruyor ki kolaj ürünleri
 * eklenirken çalışan o yollar hiç değişmesin.
 *
 * Katman sırası:
 *
 *   arka plan (tasarım)  →  fotoğraflar  →  overlay  →  metinler
 *
 * Izgara tipi şablonlarda tasarım fotoğrafların ALTINDA durur: tasarımdaki boş
 * kutuların üstü fotoğrafla kapanır. Şeffaf delikli tasarımlarda ise aynı dosya
 * `overlayUrl` olarak verilir; fotoğraf deliğin arkasından görünür ve çerçeve,
 * süsleme, yazı fotoğrafın üstünde kalır.
 */

/** Müşterinin bir slot için yaptığı seçim */
export interface SlotFill {
  slot_id: string;
  /** Müşteri fotoğrafının adresi */
  url: string;
  /**
   * Slot içinde kaydırma; slotun kendi genişlik/yüksekliğine orandır.
   * 0 = ortalı. Kırpma bu iki sayı ve `scale` ile tam olarak tekrarlanabilir.
   */
  offset_x?: number;
  offset_y?: number;
  /** 1 = alanı tam dolduran ölçek; büyütmek yakınlaştırır */
  scale?: number;
}

export interface ComposeSlotsOptions {
  canvas: PrintCanvas;
  slots: Slot[];
  fills: SlotFill[];
  /** Metin slotlarının değerleri; slot kimliği → metin */
  texts?: Record<string, string>;
  /** Fotoğrafların ALTINDA duran tasarım */
  backgroundUrl?: string;
  /** Fotoğrafların ÜSTÜNDE duran tasarım */
  overlayUrl?: string;
  outputFormat?: "png" | "jpeg";
  quality?: number;
}

const FETCH_TIMEOUT = 30_000;

async function fetchBuffer(url: string): Promise<Buffer> {
  const safe = String(url ?? "").trim();
  if (!safe) throw new Error("Görsel adresi boş");
  const res = await fetch(safe, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Görsel indirilemedi (${res.status}): ${safe}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Tuvale tam oturan, verilen görselden üretilmiş katman */
async function fitToCanvas(buf: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(buf).resize(width, height, { fit: "fill" }).png().toBuffer();
}

/**
 * Bir fotoğrafı slotun ölçüsüne getirir.
 *
 * `cover` modunda fotoğraf alanı tamamen doldurur ve taşan kısmı kırpılır;
 * müşterinin kaydırma ve yakınlaştırma değerleri tam da bu kırpmanın nereden
 * alınacağını belirler. Değerler orana bağlı olduğu için önizlemedeki kırpma
 * ile baskıdaki kırpma birebir aynı çıkar.
 */
async function renderSlotPhoto(
  photo: Buffer,
  slot: ImageSlot,
  width: number,
  height: number,
  fill: SlotFill,
): Promise<Buffer> {
  const meta = await sharp(photo).metadata();
  const pw = meta.width ?? 0;
  const ph = meta.height ?? 0;
  if (!(pw > 0) || !(ph > 0)) throw new Error("Fotoğraf ölçüsü okunamadı");

  if (slot.fit === "contain") {
    return sharp(photo)
      .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const scale = clamp(fill.scale ?? 1, 1, 6);
  const k = Math.max(width / pw, height / ph) * scale;
  const rw = Math.max(width, Math.round(pw * k));
  const rh = Math.max(height, Math.round(ph * k));

  // Kırpma penceresi: ortadan başlar, müşterinin kaydırması kadar öteler.
  // Pencere görselin dışına taşamaz; taşarsa kenara yaslanır.
  const offX = (fill.offset_x ?? 0) * width;
  const offY = (fill.offset_y ?? 0) * height;
  const left = Math.round(clamp((rw - width) / 2 - offX, 0, rw - width));
  const top = Math.round(clamp((rh - height) / 2 - offY, 0, rh - height));

  return sharp(photo)
    .resize(rw, rh, { fit: "fill" })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
}

/** Slotun şekline göre maske uygular: yüklenmiş maske, yuvarlatılmış köşe veya hiçbiri */
async function applySlotShape(
  layer: Buffer,
  slot: ImageSlot,
  width: number,
  height: number,
  canvasWidth: number,
): Promise<Buffer> {
  if (slot.mask_url) {
    // `dest-in` maskenin ALFA kanalına bakar, parlaklığına değil. Maskeyi
    // griye çevirmek alfayı düşürüyor ve maske hiç uygulanmamış gibi
    // davranıyordu; alfayı koruyoruz.
    const mask = await sharp(await fetchBuffer(slot.mask_url))
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .png()
      .toBuffer();
    // Maskenin şeffaf olduğu yerde fotoğraf da şeffaflaşır
    return sharp(layer).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  }

  const radiusPx = slot.radius ? Math.round(slot.radius * canvasWidth) : 0;
  if (radiusPx <= 0) return layer;

  const r = Math.min(radiusPx, Math.floor(Math.min(width, height) / 2));
  const rounded = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/>
     </svg>`,
  );
  return sharp(layer).composite([{ input: rounded, blend: "dest-in" }]).png().toBuffer();
}

/**
 * Metin katmanları — her metin alanı KENDİ küçük SVG'si olarak üretilir.
 *
 * Tüm metinler tek bir tuval boyu SVG'ye konduğunda librsvg çizimi ortada
 * kesiyordu: 62 KB'lık bir SVG eksiksiz basılırken 96 KB'lık olan metnin
 * üçte birinde duruyordu. Alan başına ayrı katman, her SVG'yi o alanın
 * metniyle sınırlı tutuyor ve toplam boyutun eşiğe dayanmasını engelliyor.
 *
 * Slotun `font_url` değeri varsa metin yazı yoluna çevrilir: SVG'de font
 * referansı kalmaz, sunucuya font kurmak gerekmez, çıktı her makinede aynı
 * olur ve taşma küçültmesi gerçek ölçüme dayanır. Font yoksa ya da
 * indirilemezse font adıyla <text> yazılır — o durumda görünüm sunucuda
 * kurulu fontlara bağlıdır ve tasarımdan sapabilir.
 */
async function buildTextLayers(
  slots: TextSlot[],
  values: Record<string, string>,
  canvasWidth: number,
  canvasHeight: number,
): Promise<sharp.OverlayOptions[]> {
  const layers: sharp.OverlayOptions[] = [];

  for (const slot of slots) {
    const raw = (values[slot.id] ?? "").trim() || slot.default_value.trim();
    if (!raw) continue;

    const box = rectToPx(slot.rect, canvasWidth, canvasHeight);
    const fontSize = Math.max(1, Math.round(slot.font_size * canvasHeight));

    // Çıkıntılar (ğ, ş kuyrukları, İ noktası) kutunun dışına taşabilir;
    // katman kırpmasın diye her yönden pay bırakıyoruz.
    const pad = Math.ceil(fontSize * 0.6);
    const layerW = Math.min(canvasWidth, box.width + pad * 2);
    const layerH = Math.min(canvasHeight, box.height + pad * 2);
    const left = Math.max(0, Math.min(canvasWidth - layerW, box.x - pad));
    const top = Math.max(0, Math.min(canvasHeight - layerH, box.y - pad));

    // Katman içi koordinatlar
    const inner = { x: box.x - left, y: box.y - top, width: box.width, height: box.height };

    const font = slot.font_url ? await loadFont(slot.font_url) : null;
    let body = "";

    if (font) {
      const laid = layoutText({
        text: raw,
        font,
        fontSize,
        box: inner,
        align: slot.align,
        overflow: slot.overflow,
      });
      if (laid.paths.length === 0) continue;
      const stroke = slot.bold
        ? ` stroke="${escapeAttr(slot.color)}" stroke-width="${(laid.fontSize * 0.03).toFixed(2)}"`
        : "";
      // Harfler ayrı path'ler: tek birleşik path'te librsvg çizimi yarıda kesiyor
      body = laid.paths
        .map((d) => `<path d="${d}" fill="${escapeAttr(slot.color)}"${stroke}/>`)
        .join("");
    } else {
      if (slot.font_url) {
        console.warn(`[slot-compose] "${slot.id}" için font yüklenemedi, sistem fontuna düşüldü`);
      }
      const text = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      // Gerçek ölçüm yok; karakter sayısından tahmin ederek kutu dışına
      // taşmayı engelliyoruz. Yol yönteminde bu tahmine gerek kalmıyor.
      let size = fontSize;
      if (slot.overflow === "shrink") {
        const estimated = text.length * size * 0.55;
        if (estimated > inner.width) size = Math.max(8, Math.floor(inner.width / (text.length * 0.55)));
      }
      const anchor = slot.align === "right" ? "end" : slot.align === "center" ? "middle" : "start";
      const x = slot.align === "right" ? inner.x + inner.width
        : slot.align === "center" ? inner.x + inner.width / 2
        : inner.x;
      body = `<text x="${x}" y="${inner.y + inner.height / 2}" font-size="${size}"` +
        ` fill="${escapeAttr(slot.color)}" font-weight="${slot.bold ? "bold" : "normal"}"` +
        ` font-family="${escapeAttr(slot.font_family || "Arial, Helvetica, sans-serif")}"` +
        ` text-anchor="${anchor}" dominant-baseline="middle">${text}</text>`;
    }

    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${layerW}" height="${layerH}">${body}</svg>`,
    );
    layers.push({ input: await sharp(svg).png().toBuffer(), left, top });
  }

  return layers;
}

/**
 * Tasarımı üretir ve buffer döndürür.
 *
 * Eksik slot hata değildir: müşteri henüz doldurmadıysa o alan boş kalır ve
 * arka plandaki tasarım görünür. Önizleme akışının yarım dolu tasarımı
 * gösterebilmesi buna bağlı.
 */
export async function composeSlotDesign(opts: ComposeSlotsOptions): Promise<Buffer> {
  const { canvas, slots, fills } = opts;
  const W = canvas.canvasWidth;
  const H = canvas.canvasHeight;

  const base = opts.backgroundUrl
    ? await fitToCanvas(await fetchBuffer(opts.backgroundUrl), W, H)
    : await sharp({
        create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
      }).png().toBuffer();

  const fillById = new Map(fills.map((f) => [f.slot_id, f]));
  const composites: sharp.OverlayOptions[] = [];

  const imageSlots = slots.filter(isImageSlot).sort((a, b) => a.order - b.order);
  for (const slot of imageSlots) {
    const fill = fillById.get(slot.id);
    if (!fill?.url) continue;

    const box = rectToPx(slot.rect, W, H);
    try {
      const photo = await fetchBuffer(fill.url);
      let layer = await renderSlotPhoto(photo, slot, box.width, box.height, fill);
      layer = await applySlotShape(layer, slot, box.width, box.height, W);
      composites.push({ input: layer, left: box.x, top: box.y });
    } catch (err) {
      // Tek bir fotoğrafın indirilememesi tüm siparişi düşürmemeli; o alan boş
      // kalır, kalan alanlar basılır ve hata kayda geçer.
      console.error(`[slot-compose] "${slot.id}" alanı atlandı:`, err);
    }
  }

  if (opts.overlayUrl) {
    composites.push({ input: await fitToCanvas(await fetchBuffer(opts.overlayUrl), W, H) });
  }

  for (const layer of await buildTextLayers(slots.filter(isTextSlot), opts.texts ?? {}, W, H)) {
    composites.push(layer);
  }

  const out = sharp(base).composite(composites);
  return opts.outputFormat === "jpeg"
    ? out.jpeg({ quality: opts.quality ?? 92 }).toBuffer()
    : out.png().toBuffer();
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function escapeAttr(v: string): string {
  return String(v).replace(/"/g, "&quot;").replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;");
}
