import sharp from "sharp";
import { computeScatterLayout, DEFAULT_SCATTER, type ScatterConfig } from "~/lib/scatter-layout.server";
import { extractHeadCutout, applySoftOvalMask } from "~/lib/face-detect.server";
import { removeBackgroundFromBuffer } from "~/models/auto-bg-removal.server";
import type { TextFieldDef } from "~/models/personalizer.server";

/**
 * Dağıtımlı şablon kompoziti.
 *
 * Müşterinin fotoğrafından kafa kesilir, baskı alanına tohumlu bir yerleşimle
 * dağıtılır; süsleme ve düzenlenebilir yazı eklenir. Sonuç saydam zeminli tek
 * PNG'dir ve tasarımcıya normal bir görsel olarak verilir.
 */

export interface ScatterComposeOptions {
  photo: Buffer;
  /** Süsleme görseli (kalp vb.); yoksa yalnızca kafalar dağıtılır */
  decoration?: Buffer | null;
  areaWidth: number;
  areaHeight: number;
  config?: Partial<ScatterConfig>;
  textFields?: TextFieldDef[];
  textValues?: Record<string, string>;
  /** WaveSpeed anahtarı; yoksa arka plan silme atlanır */
  wavespeedKey?: string;
}

export interface ScatterComposeResult {
  buffer: Buffer;
  /** Kafa Vision ile mi bulundu, yoksa tahmine mi düşüldü */
  headDetected: boolean;
  placed: { faces: number; decorations: number };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildTextOverlay(
  fields: TextFieldDef[],
  values: Record<string, string>,
  width: number,
  height: number,
): Buffer | null {
  const lines = fields
    .map((f) => {
      const raw = (values[f.id] ?? "").trim();
      if (!raw) return "";
      const anchor = f.align === "left" ? "start" : f.align === "right" ? "end" : "middle";
      return `<text x="${f.x}" y="${f.y}" font-family="Georgia, serif" font-size="${f.font_size}"` +
        ` font-weight="${f.bold ? "bold" : "normal"}" fill="${f.color || "#000000"}"` +
        ` text-anchor="${anchor}">${escapeXml(raw)}</text>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!lines) return null;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines}</svg>`);
}

export async function composeScatterDesign(opts: ScatterComposeOptions): Promise<ScatterComposeResult> {
  const { photo, decoration, areaWidth, areaHeight } = opts;
  const config: ScatterConfig = { ...DEFAULT_SCATTER, ...(opts.config ?? {}) };

  // 1) Arka planı kaldır — kafa kesimi saydam zemin üzerinde çalışır
  let subject = photo;
  if (opts.wavespeedKey) {
    subject = await removeBackgroundFromBuffer(opts.wavespeedKey, photo, "scatter-photo")
      .catch((err) => {
        console.error("[scatter] arka plan kaldirilamadi, ham foto kullaniliyor:", err);
        return photo;
      });
  }

  // 2) Kafayı kes ve oval maskele — kare kesitte kalan omuz/kazak artıkları
  //    koyu üründe görünür dikdörtgen oluşturuyor
  const head = await extractHeadCutout(subject);
  const headPiece = await applySoftOvalMask(head.buffer).catch(() => head.buffer);

  // 3) Yerleşimi hesapla
  const items = computeScatterLayout(areaWidth, areaHeight, config);

  // 4) Parçaları yerleştir
  const composites: sharp.OverlayOptions[] = [];
  let faces = 0;
  let decorations = 0;

  for (const item of items) {
    if (item.kind === "decoration" && !decoration) continue;
    const source = item.kind === "face" ? headPiece : decoration!;
    const w = Math.max(4, Math.round(item.width));

    let piece = sharp(source).resize(w, w, { fit: "inside" });
    if (item.angle) piece = piece.rotate(item.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const buf = await piece.png().toBuffer();
    const meta = await sharp(buf).metadata();

    composites.push({
      input: buf,
      left: Math.round(item.x - (meta.width ?? w) / 2),
      top: Math.round(item.y - (meta.height ?? w) / 2),
    });
    if (item.kind === "face") faces++; else decorations++;
  }

  // 5) Yazılar en üstte
  const overlay = buildTextOverlay(opts.textFields ?? [], opts.textValues ?? {}, areaWidth, areaHeight);
  if (overlay) composites.push({ input: overlay });

  const buffer = await sharp({
    create: { width: areaWidth, height: areaHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites).png().toBuffer();

  return { buffer, headDetected: head.detected, placed: { faces, decorations } };
}
