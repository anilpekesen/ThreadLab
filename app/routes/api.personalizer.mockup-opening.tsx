import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { getR2KeyFromPublicUrl, getR2Object, uploadToR2 } from "~/lib/r2.server";
import { cutRect } from "~/lib/mockup-opening.server";

/**
 * Ürün görselinde fotoğraf açıklığını elle çizilen yerden keser.
 *
 * Otomatik tarama beyaz ya da açık renkli çerçevelerde iç alanı ayırt
 * edemiyor. Mağaza sahibi alanı stüdyoda çiziyor; burada o dikdörtgen
 * orijinal görselden şeffaf yapılıp yeni dosya olarak yükleniyor.
 *
 * Kaynak yalnızca kendi depomuzdaki ürün görseli olabilir: istemciden gelen
 * serbest bir adresi sunucudan indirmek, sunucuyu başka adreslere istek atan
 * bir araca çevirirdi.
 */

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body: { sourceUrl?: string; rect?: { x?: number; y?: number; w?: number; h?: number }; _lang?: string };
  try { body = await request.json(); }
  catch { return json({ error: langFromRequest(request) === "en" ? "Invalid request" : "Geçersiz istek" }, { status: 400 }); }
  const lang = body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request);
  const en = lang === "en";

  const key = getR2KeyFromPublicUrl(String(body.sourceUrl ?? ""), ["personalizer-mockup/"]);
  if (!key) return json({ error: en ? "The image must be one of this store's product images" : "Görsel bu mağazanın ürün görsellerinden olmalı" }, { status: 400 });

  const r = body.rect ?? {};
  const rect = { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) };
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) {
    return json({ error: en ? "Invalid area" : "Alan geçersiz" }, { status: 400 });
  }

  try {
    const source = await getR2Object(key);
    const meta = await sharp(source).metadata();
    const cut = await cutRect(source, rect);
    if (!cut) return json({ error: en ? "The area is too small; draw it a bit larger." : "Alan çok küçük; biraz daha büyük çizin." }, { status: 400 });
    const url = await uploadToR2(cut.png, "png", "personalizer-mockup");
    return json({
      url,
      opening: { ...cut.opening, aspect: (meta.width ?? 1) / (meta.height ?? 1) },
    });
  } catch (err) {
    console.error("[mockup-opening] kesilemedi:", err);
    return json({ error: en ? "Couldn't cut the area" : "Alan kesilemedi" }, { status: 500 });
  }
};
