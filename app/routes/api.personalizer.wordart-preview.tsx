import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
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

  let body: { config?: unknown; words?: string; choices?: WordArtChoices };
  try { body = await request.json(); }
  catch { return json({ error: "Geçersiz istek" }, { status: 400 }); }

  const config = normalizeWordArtConfig(body.config, FONT_LIBRARY.map((f) => f.id));
  const resolved = resolveWordArtRequest(config, String(body.words ?? ""), body.choices ?? {});
  if ("error" in resolved) return json({ error: resolved.error }, { status: 400 });

  try {
    const result = await composeWordArt(resolved);
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
    return json({ error: "Önizleme üretilemedi" }, { status: 500 });
  }
};
