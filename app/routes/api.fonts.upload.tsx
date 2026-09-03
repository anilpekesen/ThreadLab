import {
  json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
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

  try {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_FONT });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = form.get("font");

    if (!(file instanceof File) || file.size === 0) {
      return json({ error: "Font dosyası yüklenmedi" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED.has(ext)) {
      return json(
        {
          error: ext === "woff2"
            ? "woff2 desteklenmiyor. Aynı fontun .ttf, .otf veya .woff sürümünü yükleyin."
            : "Yalnızca .ttf, .otf ve .woff dosyaları kabul edilir.",
        },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const info = inspectFont(buf);
    if (!info) {
      return json({ error: "Font dosyası okunamadı. Dosya bozuk olabilir." }, { status: 400 });
    }

    const url = await uploadToR2(buf, ext, "personalizer-font");
    return json({ url, family: info.family, style: info.style, glyphCount: info.glyphCount });
  } catch (err) {
    console.error("[fonts.upload] hata:", err);
    return json({ error: "Font yüklenemedi" }, { status: 500 });
  }
};
