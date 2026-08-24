import sharp from "sharp";
import { unproxyImageUrl } from "~/models/designs.server";

/**
 * Baskı dosyasını tasarım JSON'undan sunucuda yeniden üretir.
 *
 * Normalde bu dosya müşterinin tarayıcısında fabric canvas'tan export ediliyor.
 * Mobil Safari'nin canvas tavanı aşıldığında export sessizce boş dönüyordu ve
 * sipariş kullanılamaz bir dosyayla geçiyordu (bkz. exportPrintFile). Burası o
 * siparişleri kurtarmak için: aynı geometriyi sharp ile yeniden çiziyoruz.
 *
 * Metin nesneleri BİLEREK atlanıyor — müşterinin gördüğü yazı tipi sunucuda
 * yoksa farklı bir font ile basılır ve bu, eksik dosyadan daha kötüdür. Atlanan
 * nesneler `skipped` ile bildiriliyor ki çağıran taraf dosyayı sessizce
 * "tamam" diye sunmasın.
 */

export interface PrintAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedPrintFile {
  buffer: Buffer;
  width: number;
  height: number;
  /** Çizilemeyen nesnelerin tipleri (ör. "i-text") */
  skipped: string[];
  /** Çizilen nesne sayısı */
  drawn: number;
}

/** Sunucu tarafı üretimde izin verilen en büyük çıktı. */
const MAX_OUTPUT_PIXELS = 60_000_000;

interface FabricObject {
  type?: string;
  src?: string;
  sourceUrl?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  cropX?: number;
  cropY?: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  originX?: string;
  originY?: string;
  visible?: boolean;
}

function parseSide(designJson: unknown, side: "front" | "back"): FabricObject[] | null {
  if (!designJson || typeof designJson !== "object") return null;
  let value = (designJson as Record<string, unknown>)[side];
  // Bazı kayıtlarda taraf JSON'u string olarak saklanıyor, bazılarında nesne
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const objects = (value as Record<string, unknown>).objects;
  return Array.isArray(objects) ? (objects as FabricObject[]) : null;
}

async function fetchImageBuffer(rawUrl: string): Promise<Buffer | null> {
  const url = String(rawUrl ?? "").trim();
  if (!url) return null;

  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma === -1) return null;
    return Buffer.from(url.slice(comma + 1), "base64");
  }

  try {
    const res = await fetch(unproxyImageUrl(url), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Katmanı çıktı tuvaline yerleştirir.
 *
 * sharp negatif composite koordinatı kabul etmiyor; tuval dışına taşan katmanlar
 * için görünen bölgeyi kırpıp koordinatı sıfıra çekiyoruz.
 */
async function placeLayer(
  layer: Buffer,
  layerW: number,
  layerH: number,
  left: number,
  top: number,
  outW: number,
  outH: number,
): Promise<sharp.OverlayOptions | null> {
  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const visibleRight = Math.min(outW, left + layerW);
  const visibleBottom = Math.min(outH, top + layerH);

  const visibleW = Math.round(visibleRight - visibleLeft);
  const visibleH = Math.round(visibleBottom - visibleTop);
  if (visibleW <= 0 || visibleH <= 0) return null;

  // Tamamen içerideyse kırpmaya gerek yok
  if (left >= 0 && top >= 0 && left + layerW <= outW && top + layerH <= outH) {
    return { input: layer, left: Math.round(left), top: Math.round(top) };
  }

  const cropped = await sharp(layer)
    .extract({
      left: Math.round(visibleLeft - left),
      top: Math.round(visibleTop - top),
      width: visibleW,
      height: visibleH,
    })
    .png()
    .toBuffer();

  return { input: cropped, left: Math.round(visibleLeft), top: Math.round(visibleTop) };
}

async function buildImageLayer(
  obj: FabricObject,
  area: PrintAreaRect,
  scale: number,
  outW: number,
  outH: number,
): Promise<sharp.OverlayOptions | null> {
  const source = obj.sourceUrl || obj.src || "";
  const buffer = await fetchImageBuffer(source);
  if (!buffer) return null;

  let pipeline = sharp(buffer, { limitInputPixels: false });
  const meta = await pipeline.metadata();
  const sourceW = meta.width ?? 0;
  const sourceH = meta.height ?? 0;
  if (!sourceW || !sourceH) return null;

  // Fabric'te width/height kırpılmış ölçü, cropX/cropY kaynak içindeki offset
  const cropX = Math.max(0, Math.round(obj.cropX ?? 0));
  const cropY = Math.max(0, Math.round(obj.cropY ?? 0));
  const cropW = Math.round(obj.width ?? sourceW);
  const cropH = Math.round(obj.height ?? sourceH);
  const needsCrop = cropX > 0 || cropY > 0 || cropW < sourceW || cropH < sourceH;
  if (needsCrop) {
    const safeW = Math.min(cropW, sourceW - cropX);
    const safeH = Math.min(cropH, sourceH - cropY);
    if (safeW <= 0 || safeH <= 0) return null;
    pipeline = pipeline.extract({ left: cropX, top: cropY, width: safeW, height: safeH });
  }

  // Canvas ölçüsü → çıktı ölçüsü
  const renderedW = Math.max(1, Math.round((obj.width ?? cropW) * (obj.scaleX ?? 1) * scale));
  const renderedH = Math.max(1, Math.round((obj.height ?? cropH) * (obj.scaleY ?? 1) * scale));
  pipeline = pipeline.resize(renderedW, renderedH, { fit: "fill" });

  if (obj.flipX) pipeline = pipeline.flop();
  if (obj.flipY) pipeline = pipeline.flip();

  const opacity = obj.opacity ?? 1;
  if (opacity < 1) {
    // Alfa kanalını opaklıkla çarp
    pipeline = pipeline.composite([
      {
        input: Buffer.from([255, 255, 255, Math.round(Math.max(0, opacity) * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in",
      },
    ]);
  }

  const angle = obj.angle ?? 0;
  if (angle) {
    pipeline = pipeline.rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const layer = await pipeline.png().toBuffer();
  // Döndürme tuvali büyüttüğü için gerçek ölçüyü yeniden oku
  const layerMeta = await sharp(layer).metadata();
  const layerW = layerMeta.width ?? renderedW;
  const layerH = layerMeta.height ?? renderedH;

  // Nesne merkezinin çıktıdaki konumu
  const originX = obj.originX ?? "left";
  const originY = obj.originY ?? "top";
  const objLeft = obj.left ?? 0;
  const objTop = obj.top ?? 0;
  const centerCanvasX = originX === "center"
    ? objLeft
    : originX === "right"
      ? objLeft - (obj.width ?? cropW) * (obj.scaleX ?? 1) / 2
      : objLeft + (obj.width ?? cropW) * (obj.scaleX ?? 1) / 2;
  const centerCanvasY = originY === "center"
    ? objTop
    : originY === "bottom"
      ? objTop - (obj.height ?? cropH) * (obj.scaleY ?? 1) / 2
      : objTop + (obj.height ?? cropH) * (obj.scaleY ?? 1) / 2;

  const centerOutX = (centerCanvasX - area.x) * scale;
  const centerOutY = (centerCanvasY - area.y) * scale;

  return placeLayer(layer, layerW, layerH, centerOutX - layerW / 2, centerOutY - layerH / 2, outW, outH);
}

export async function renderPrintFile(opts: {
  designJson: unknown;
  side: "front" | "back";
  area: PrintAreaRect;
  targetWidthPx: number;
}): Promise<RenderedPrintFile | null> {
  const { designJson, side, area, targetWidthPx } = opts;
  const objects = parseSide(designJson, side);
  if (!objects || objects.length === 0) return null;
  if (area.width <= 0 || area.height <= 0) return null;

  const scale = targetWidthPx / area.width;
  let outW = Math.max(1, Math.round(area.width * scale));
  let outH = Math.max(1, Math.round(area.height * scale));

  if (outW * outH > MAX_OUTPUT_PIXELS) {
    const shrink = Math.sqrt(MAX_OUTPUT_PIXELS / (outW * outH));
    outW = Math.max(1, Math.round(outW * shrink));
    outH = Math.max(1, Math.round(outH * shrink));
  }
  const effectiveScale = outW / area.width;

  const skipped: string[] = [];
  const ops: sharp.OverlayOptions[] = [];

  for (const obj of objects) {
    if (obj.visible === false) continue;
    if (obj.type !== "image") {
      skipped.push(obj.type ?? "unknown");
      continue;
    }
    const op = await buildImageLayer(obj, area, effectiveScale, outW, outH);
    if (op) ops.push(op);
    else skipped.push(obj.type ?? "image");
  }

  if (ops.length === 0) return null;

  const buffer = await sharp({
    create: {
      width: outW,
      height: outH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
    limitInputPixels: false,
  })
    .composite(ops)
    .png()
    .toBuffer();

  return { buffer, width: outW, height: outH, skipped, drawn: ops.length };
}
