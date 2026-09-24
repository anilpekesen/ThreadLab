import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { FONT_LIBRARY } from "~/lib/font-library";
import { normalizeWordArtConfig, type WordArtChoices } from "~/lib/wordart";
import { composeWordArt, resolveWordArtRequest } from "~/lib/wordart-compose.server";

/**
 * Yönetim ekranındaki kelime sanatı önizlemesi. Kaydedilmemiş ayarlarla
 * çalışır ve R2'ye bir şey yüklemez: sonuç küçültülüp data URL olarak döner.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body: { config?: unknown; words?: string; choices?: WordArtChoices; _lang?: string };
  try { body = await request.json(); }
  catch { return json({ error: langFromRequest(request) === "en" ? "Invalid request" : "Geçersiz istek" }, { status: 400 }); }
  const lang = body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request);
  const en = lang === "en";

  const config = normalizeWordArtConfig(body.config, FONT_LIBRARY.map((f) => f.id));
  const resolved = resolveWordArtRequest(config, String(body.words ?? ""), body.choices ?? {});
  if ("error" in resolved) return json({ error: resolved.error, errorEn: resolved.errorEn }, { status: 400 });

  try {
    // Fotoğraf şekli önizlemesinde örnek bir baş-omuz silueti kullanılır
    const samplePhoto = resolved.shape === "photo"
      ? await sharp(Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1250"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c9a8"/><stop offset="1" stop-color="#7c4a2d"/></linearGradient></defs><ellipse cx="500" cy="420" rx="260" ry="320" fill="url(#g)"/><path d="M80 1250 C100 900 300 800 500 800 C700 800 900 900 920 1250 Z" fill="#1f2a44"/></svg>`,
        )).png().toBuffer()
      : null;
    const result = await composeWordArt({ ...resolved, photo: samplePhoto });
    // Önizleme koyu ve açık zeminde görülsün diye şeffaf bırakılıyor
    const small = await sharp(result.buffer).resize(900, 900, { fit: "inside" }).png().toBuffer();
    return json({
      image: `data:image/png;base64,${small.toString("base64")}`,
      width: result.width,
      height: result.height,
      placed: result.placed,
      skipped: result.skipped,
    });
  } catch (err) {
    console.error("[wordart-preview] üretilemedi:", err);
    return json({ error: en ? "Couldn't create preview" : "Önizleme üretilemedi" }, { status: 500 });
  }
};
