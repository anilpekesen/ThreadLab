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
    templateUrl,
    photoUrl,
    photoX,
    photoY,
    photoWidth,
    photoHeight,
    textFields,
    textValues,
    outputFormat = "png",
    quality = 90,
  } = opts;

  const [templateBuf, photoBuf] = await Promise.all([
    fetchBuffer(templateUrl),
    fetchBuffer(photoUrl),
  ]);

  const templateMeta = await sharp(templateBuf).metadata();
  const templateW = templateMeta.width ?? 2480;
  const templateH = templateMeta.height ?? 3508;

  // Resize photo to fit the photo area (cover, centered crop)
  const resizedPhoto = await sharp(photoBuf)
    .resize(photoWidth, photoHeight, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: resizedPhoto, left: photoX, top: photoY },
  ];

  if (textFields.length > 0) {
    const textSvg = makeTextSvgOverlay(textFields, textValues, templateW, templateH);
    composites.push({ input: textSvg });
  }

  const outBuf = await sharp(templateBuf)
    .composite(composites)
    [outputFormat]({ quality })
    .toBuffer();

  const ext = outputFormat;
  const url = await uploadToR2(outBuf, ext, "personalizer");
  return url;
}

export async function composePreview(opts: ComposeOptions): Promise<string> {
  return composePersonalizerImage({ ...opts, outputFormat: "jpeg", quality: 80 });
}

export async function composeFinalRender(opts: ComposeOptions): Promise<string> {
  return composePersonalizerImage({ ...opts, outputFormat: "png", quality: 100 });
}
