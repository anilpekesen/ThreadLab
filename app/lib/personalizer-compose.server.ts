import sharp from "sharp";
import type { TextFieldDef } from "~/models/personalizer.server";
import { uploadToR2 } from "~/lib/r2.server";

export interface ComposeOptions {
  templateUrl: string;
  photoUrl: string;
  photoX: number;
  photoY: number;
  photoWidth: number;
  photoHeight: number;
  // Optional frame: design result is composited INTO the frame at these coords
  mockupUrl?: string;
  mockupX?: number;
  mockupY?: number;
  mockupWidth?: number;
  mockupHeight?: number;
  textFields: TextFieldDef[];
  textValues: Record<string, string>;
  outputFormat?: "png" | "jpeg";
  quality?: number;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Görsel indirilemedi (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function makeTextSvgOverlay(
  fields: TextFieldDef[],
  values: Record<string, string>,
  width: number,
  height: number,
): Buffer {
  const lines = fields
    .map((f) => {
      const text = (values[f.id] ?? "").trim();
      if (!text) return "";
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const anchor = f.align === "right" ? "end" : f.align === "center" ? "middle" : "start";
      const weight = f.bold ? "bold" : "normal";
      return `<text
        x="${f.x}"
        y="${f.y}"
        font-size="${f.font_size}"
        fill="${f.color}"
        font-weight="${weight}"
        font-family="Arial, Helvetica, sans-serif"
        text-anchor="${anchor}"
        dominant-baseline="middle"
      >${escaped}</text>`;
    })
    .filter(Boolean)
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines}</svg>`;
  return Buffer.from(svg);
}

export async function composePersonalizerImage(opts: ComposeOptions): Promise<string> {
  const {
    templateUrl, photoUrl,
    photoX, photoY, photoWidth, photoHeight,
    mockupUrl, mockupX = 0, mockupY = 0, mockupWidth = 0, mockupHeight = 0,
    textFields, textValues,
    outputFormat = "png", quality = 90,
  } = opts;

  const photoBuf = await fetchBuffer(photoUrl);
  let designBuf: Buffer;

  if (templateUrl) {
    // ── Mod A: karikatür → tasarım şablonu → (opsiyonel çerçeve) ─────────────
    const templateBuf = await fetchBuffer(templateUrl);
    const templateMeta = await sharp(templateBuf).metadata();
    const templateW = templateMeta.width ?? 2480;
    const templateH = templateMeta.height ?? 3508;

    const safeX = Math.max(0, Math.min(photoX, templateW - 1));
    const safeY = Math.max(0, Math.min(photoY, templateH - 1));
    const safeW = Math.max(1, Math.min(photoWidth, templateW - safeX));
    const safeH = Math.max(1, Math.min(photoHeight, templateH - safeY));

    const resizedPhoto = await sharp(photoBuf)
      .resize(safeW, safeH, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const composites: sharp.OverlayOptions[] = [{ input: resizedPhoto, left: safeX, top: safeY }];
    if (textFields.length > 0) {
      composites.push({ input: makeTextSvgOverlay(textFields, textValues, templateW, templateH) });
    }
    designBuf = await sharp(templateBuf).composite(composites).png().toBuffer();

  } else if (mockupUrl && mockupWidth > 0 && mockupHeight > 0) {
    // ── Mod B: şablon yok — karikatür doğrudan çerçeveye ────────────────────
    // (çerçeve koordinatlarını fotoğraf koordinatı olarak kullan)
    const frameBuf = await fetchBuffer(mockupUrl);
    const frameMeta = await sharp(frameBuf).metadata();
    const frameW = frameMeta.width ?? 1000;
    const frameH = frameMeta.height ?? 1000;

    const fX = Math.max(0, Math.min(mockupX, frameW - 1));
    const fY = Math.max(0, Math.min(mockupY, frameH - 1));
    const fW = Math.max(1, Math.min(mockupWidth, frameW - fX));
    const fH = Math.max(1, Math.min(mockupHeight, frameH - fY));

    const resizedPhoto = await sharp(photoBuf)
      .resize(fW, fH, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const composites: sharp.OverlayOptions[] = [{ input: resizedPhoto, left: fX, top: fY }];
    if (textFields.length > 0) {
      composites.push({ input: makeTextSvgOverlay(textFields, textValues, frameW, frameH) });
    }
    designBuf = await sharp(frameBuf).composite(composites).png().toBuffer();

    // Mod B'de zaten çerçeveye yerleştirdik, ikinci adım gerekmiyor
    const outBuf = outputFormat === "jpeg"
      ? await sharp(designBuf).jpeg({ quality }).toBuffer()
      : designBuf;
    return uploadToR2(outBuf, outputFormat === "jpeg" ? "jpg" : "png", "personalizer");

  } else {
    // Hiç görsel yok — fotoğrafı olduğu gibi kullan
    designBuf = await sharp(photoBuf).png().toBuffer();
  }

  // ── Adım 2 (Mod A için): tasarım → çerçeve ───────────────────────────────
  if (mockupUrl && mockupWidth > 0 && mockupHeight > 0) {
    const frameBuf = await fetchBuffer(mockupUrl);
    const frameMeta = await sharp(frameBuf).metadata();
    const frameW = frameMeta.width ?? 1000;
    const frameH = frameMeta.height ?? 1000;

    const fX = Math.max(0, Math.min(mockupX, frameW - 1));
    const fY = Math.max(0, Math.min(mockupY, frameH - 1));
    const fW = Math.max(1, Math.min(mockupWidth, frameW - fX));
    const fH = Math.max(1, Math.min(mockupHeight, frameH - fY));

    const scaledDesign = await sharp(designBuf)
      .resize(fW, fH, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    designBuf = await sharp(frameBuf)
      .composite([{ input: scaledDesign, left: fX, top: fY }])
      .png()
      .toBuffer();
  }

  const outBuf = outputFormat === "jpeg"
    ? await sharp(designBuf).jpeg({ quality }).toBuffer()
    : designBuf;

  return uploadToR2(outBuf, outputFormat === "jpeg" ? "jpg" : "png", "personalizer");
}

export async function composePreview(opts: ComposeOptions): Promise<string> {
  return composePersonalizerImage({ ...opts, outputFormat: "jpeg", quality: 80 });
}

export async function composeFinalRender(opts: ComposeOptions): Promise<string> {
  return composePersonalizerImage({ ...opts, outputFormat: "png", quality: 100 });
}
