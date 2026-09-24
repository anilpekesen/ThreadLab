import {
  json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { uploadToR2 } from "~/lib/r2.server";
import { inspectFont } from "~/lib/text-render.server";

/**
 * Şablon fontu yükleme.
 *
 * Baskı çıktısında metin, fontun kendi yazı yollarına çevrilerek basılıyor;
 * yani font dosyası olmadan tasarımın yazısı doğru çıkmıyor. Bu uç, mağaza
 * sahibinin lisanslı fontunu yükleyebilmesi için var.
 *
 * Dosya YÜKLEMEDEN ÖNCE ayrıştırılıyor. Sebebi: woff2 okunamıyor (çözücü
 * kütüphane gerekiyor) ve bozuk bir dosya ancak baskı anında hata verirdi —
 * o noktada müşteri siparişi çoktan vermiş olur.
 */

const MAX_FONT = 5 * 1024 * 1024;
const ALLOWED = new Set(["ttf", "otf", "woff"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let en = langFromRequest(request) === "en";
  try {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_FONT });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    en = langFromRequest(request, form) === "en";
    const file = form.get("font");

    if (!(file instanceof File) || file.size === 0) {
      return json({ error: en ? "No font file uploaded" : "Font dosyası yüklenmedi" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED.has(ext)) {
      return json(
        {
          error: ext === "woff2"
            ? en
              ? "woff2 isn't supported. Upload the .ttf, .otf or .woff version of the same font."
              : "woff2 desteklenmiyor. Aynı fontun .ttf, .otf veya .woff sürümünü yükleyin."
            : en
              ? "Only .ttf, .otf and .woff files are accepted."
              : "Yalnızca .ttf, .otf ve .woff dosyaları kabul edilir.",
        },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const info = inspectFont(buf);
    if (!info) {
      return json({ error: en ? "Couldn't read the font file. It may be corrupted." : "Font dosyası okunamadı. Dosya bozuk olabilir." }, { status: 400 });
    }

    const url = await uploadToR2(buf, ext, "personalizer-font");
    return json({ url, family: info.family, style: info.style, glyphCount: info.glyphCount });
  } catch (err) {
    console.error("[fonts.upload] hata:", err);
    return json({ error: en ? "Couldn't upload the font" : "Font yüklenemedi" }, { status: 500 });
  }
};
