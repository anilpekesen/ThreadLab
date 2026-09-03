import {
  json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import sharp from "sharp";
import { uploadToR2 } from "~/lib/r2.server";

/**
 * Çoklu fotoğraf yükleme.
 *
 * Kolaj ürünlerinde müşteri on beş fotoğrafı tek seferde seçiyor. Tek tek
 * yükleme uçları bunun için uygun değil: her dosya ayrı istek, ayrı bekleme ve
 * mobilde yarıda kalan bir akış demek.
 *
 * Dosyalar sırayla işlenir ve sıraları korunur — istemci gelen diziyi doğrudan
 * slotlara dağıtıyor. Bir dosya bozuksa o eleman `error` ile döner, kalanlar
 * kaybolmaz.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_FILE = 15 * 1024 * 1024;
/** Tek istekte kabul edilen dosya sayısı; kolajlarda üst sınır bu civarda */
const MAX_FILES = 30;

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(null, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  const isTr = !String(new URL(request.url).searchParams.get("locale") ?? "tr")
    .toLowerCase().startsWith("en");
  const msg = {
    none: isTr ? "Dosya yüklenmedi" : "No file uploaded",
    tooMany: isTr ? `En fazla ${MAX_FILES} dosya yükleyebilirsiniz` : `At most ${MAX_FILES} files`,
    broken: isTr ? "Dosya okunamadı" : "File could not be read",
    failed: isTr ? "Yükleme başarısız" : "Upload failed",
  };

  try {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_FILE });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);

    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return json({ error: msg.none }, { status: 400, headers: CORS });
    if (files.length > MAX_FILES) return json({ error: msg.tooMany }, { status: 400, headers: CORS });

    const results: Array<
      { url: string; width: number; height: number } | { error: string }
    > = [];

    for (const file of files) {
      try {
        const buf = Buffer.from(await file.arrayBuffer());
        const meta = await sharp(buf).metadata();
        if (!meta.width || !meta.height) throw new Error("boyut okunamadı");
        const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
        const url = await uploadToR2(buf, ext, "personalizer-upload");
        results.push({ url, width: meta.width, height: meta.height });
      } catch (err) {
        console.error("[slot-upload] dosya atlandı:", err);
        results.push({ error: msg.broken });
      }
    }

    return json({ photos: results }, { headers: CORS });
  } catch (err) {
    console.error("[slot-upload] hata:", err);
    return json({ error: msg.failed }, { status: 500, headers: CORS });
  }
};
