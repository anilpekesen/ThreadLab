import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { loadFont } from "~/lib/text-render.server";
import { isLibraryFontUrl } from "~/lib/font-library";
import { getR2KeyFromPublicUrl } from "~/lib/r2.server";

/**
 * Bir kelimeyi harf harf SVG yollarına çevirir — "LOVE" yazısında her harf
 * ayrı bir fotoğraf alanı olsun diye.
 *
 * Harfler fontun kendi yerleşimiyle (harf aralığı ve kerning dahil) dizilir;
 * her yol kendi sınır kutusuyla döner. Stüdyo bu kutuları tuvale ölçekleyip
 * her harf için bir alan açıyor, yolu da alanın maskesi yapıyor. O'nun iç
 * boşluğu gibi harf delikleri yolun içinde olduğu için korunuyor.
 *
 * Font yalnızca kütüphaneden ya da mağazanın kendi yüklediği fontlardan
 * olabilir; sunucu serbest bir adresi indirmez.
 */

const UNITS = 1000;
const MAX_CHARS = 24;

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body: { text?: string; fontUrl?: string; _lang?: string };
  try { body = await request.json(); }
  catch { return json({ error: langFromRequest(request) === "en" ? "Invalid request" : "Geçersiz istek" }, { status: 400 }); }
  const lang = body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request);
  const en = lang === "en";

  const text = String(body.text ?? "").trim();
  if (!text) return json({ error: en ? "Enter the text to turn into letters" : "Harflere çevrilecek yazıyı girin" }, { status: 400 });
  if ([...text].length > MAX_CHARS) {
    return json({ error: en ? `Up to ${MAX_CHARS} characters; each letter becomes its own photo slot` : `En fazla ${MAX_CHARS} karakter; her harf ayrı fotoğraf alanı olur` }, { status: 400 });
  }

  const fontUrl = String(body.fontUrl ?? "");
  const allowed = isLibraryFontUrl(fontUrl) || Boolean(getR2KeyFromPublicUrl(fontUrl, ["personalizer-font/"]));
  if (!allowed) return json({ error: en ? "The font must come from the library or your uploaded fonts" : "Font kütüphaneden ya da yüklediğiniz fontlardan olmalı" }, { status: 400 });

  const font = await loadFont(fontUrl);
  if (!font) return json({ error: en ? "Couldn't read the font" : "Font okunamadı" }, { status: 400 });

  try {
    const paths = font.getPaths(text, 0, 0, UNITS);
    // Harfler font glifleriyle birebir eşleşmeyebilir (bağlı harfler); etiket
    // için boşluk dışındaki karakterler sırayla kullanılıyor.
    const chars = [...text].filter((c) => c.trim());
    const glyphs: Array<{ label: string; d: string; x: number; y: number; w: number; h: number }> = [];
    for (const p of paths) {
      const d = p.toPathData(2);
      const box = p.getBoundingBox();
      const w = box.x2 - box.x1;
      const h = box.y2 - box.y1;
      // Boşluk ve çizimi olmayan glifler alan üretmez
      if (!d || !(w > 1) || !(h > 1) || /NaN|Infinity/.test(d)) continue;
      glyphs.push({
        label: chars[glyphs.length] ?? String(glyphs.length + 1),
        d,
        x: round(box.x1),
        y: round(box.y1),
        w: round(w),
        h: round(h),
      });
    }
    if (glyphs.length === 0) return json({ error: en ? "This font couldn't draw the text" : "Bu font yazıyı çizemedi" }, { status: 400 });
    return json({ glyphs, units: UNITS });
  } catch (err) {
    console.error("[letter-shapes] çizilemedi:", err);
    return json({ error: en ? "This font couldn't draw the text; try another font" : "Bu font yazıyı çizemedi; başka bir font deneyin" }, { status: 400 });
  }
};

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
