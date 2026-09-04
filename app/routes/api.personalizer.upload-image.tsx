import {
  json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { uploadToR2 } from "~/lib/r2.server";

/**
 * Yönetici arayüzünden tek görsel yükleme.
 *
 * Şablon kaydetme formu tasarım dosyasını zaten alıyor, ama parça ve mockup
 * editörleri form gönderilmeden önce adrese ihtiyaç duyuyor: mağaza sahibi
 * yüklediği görseli hemen tahtada görmeli, kaydedip sayfanın dönmesini
 * beklememeli.
 */

const MAX = 20 * 1024 * 1024;
const KLASORLER = new Set(["personalizer-mockup", "personalizer-overlay", "personalizer-template"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) {
      return json({ error: "Görsel yüklenmedi" }, { status: 400 });
    }

    // Klasör istemciden geliyor; tanınmayan bir değer depoda rastgele yollar
    // açmasın diye beyaz listeyle sınırlı.
    const raw = String(form.get("folder") ?? "personalizer-mockup");
    const folder = KLASORLER.has(raw) ? raw : "personalizer-mockup";

    const buf = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) {
      return json({ error: "Görsel okunamadı" }, { status: 400 });
    }

    const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    const url = await uploadToR2(buf, ext, folder);
    return json({
      url,
      width: meta.width,
      height: meta.height,
      // Ortası şeffaf çerçevelerde açıklık taranarak bulunuyor; alfa yoksa
      // mağaza sahibine bunu söylemek gerekiyor
      hasAlpha: meta.hasAlpha === true,
    });
  } catch (err) {
    console.error("[upload-image] hata:", err);
    return json({ error: "Görsel yüklenemedi" }, { status: 500 });
  }
};
