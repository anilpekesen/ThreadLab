import sharp from "sharp";
import path from "path";
import { MOCKUP_TEMPLATES } from "./mockup-templates";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "mockup-templates");

// Design PNG'yi URL'den indir
async function fetchDesignBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Design fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Tek bir mockup üret → buffer döner
export async function renderMockup(
  templateId: string,
  designBuffer: Buffer,
): Promise<Buffer> {
  const template = MOCKUP_TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);

  const { x, y, width, height } = template.area;
  const templatePath = path.join(TEMPLATES_DIR, path.basename(template.file));

  // Tasarımı template alanına göre resize et
  const resized = await sharp(designBuffer)
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(templatePath)
    .composite([{ input: resized, left: x, top: y, blend: "over" }])
    .png()
    .toBuffer();
}

// Tüm mockup'ları üret → { templateId: buffer } map döner
export async function generateAllMockups(
  frontPrintUrl: string | null | undefined,
  backPrintUrl: string | null | undefined,
): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>();

  const [frontBuf, backBuf] = await Promise.all([
    frontPrintUrl ? fetchDesignBuffer(frontPrintUrl).catch(() => null) : null,
    backPrintUrl  ? fetchDesignBuffer(backPrintUrl).catch(() => null)  : null,
  ]);

  await Promise.all(
    MOCKUP_TEMPLATES.map(async (template) => {
      const designBuf = template.side === "front" ? frontBuf : backBuf;
      if (!designBuf) return;
      try {
        const buf = await renderMockup(template.id, designBuf);
        results.set(template.id, buf);
      } catch (err) {
        console.error(`[mockup] render failed for ${template.id}:`, err);
      }
    }),
  );

  return results;
}
