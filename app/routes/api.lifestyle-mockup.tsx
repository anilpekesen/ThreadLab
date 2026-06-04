import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import sharp from "sharp";
import path from "path";
import { MOCKUP_TEMPLATES } from "~/lib/mockup-templates";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "mockup-templates");

async function compositeMockup(
  templateFile: string,
  designBuffer: Buffer,
  area: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const { x, y, width, height } = area;

  // Şeffaf kenarları kırp → tasarım içeriğine zoom yap → template alanına sığdır
  const trimmed = await sharp(designBuffer)
    .trim({ threshold: 10 })
    .png()
    .toBuffer()
    .catch(() => designBuffer);

  const resized = await sharp(trimmed)
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const result = await sharp(path.join(TEMPLATES_DIR, templateFile))
    .composite([{ input: resized, left: x, top: y, blend: "over" }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return `data:image/jpeg;base64,${result.toString("base64")}`;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let frontDesign: string | null = null;
  let backDesign: string | null = null;

  try {
    const body = await request.json() as { frontDesign?: string; backDesign?: string };
    frontDesign = body.frontDesign ?? null;
    backDesign = body.backDesign ?? null;
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!frontDesign && !backDesign) {
    return json({ error: "No design provided" }, { status: 400 });
  }

  // base64 data URL → Buffer
  const toBuffer = (dataUrl: string): Buffer => {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64, "base64");
  };

  const frontBuf = frontDesign ? toBuffer(frontDesign) : null;
  const backBuf  = backDesign  ? toBuffer(backDesign)  : null;

  // Tüm şablonları paralel işle
  const results = await Promise.all(
    MOCKUP_TEMPLATES.map(async (template) => {
      const designBuf = template.side === "front" ? frontBuf : backBuf;
      if (!designBuf) return null;
      try {
        const imageData = await compositeMockup(template.file, designBuf, template.area);
        return { id: template.id, label: template.label, side: template.side, imageData };
      } catch {
        return null;
      }
    }),
  );

  const mockups = results.filter(Boolean);
  return json({ mockups });
};
