import {
  json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData,
  type ActionFunctionArgs,
} from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { uploadToR2 } from "~/lib/r2.server";
import { cutOpening, hasUsableOpening, type OpeningRect } from "~/lib/mockup-opening.server";

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

    let cikti: Buffer = buf;
    let ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
    let opening: OpeningRect | null = null;
    let acildi = false;
    let uyari = "";

    // Çerçeve görselinde fotoğrafın gireceği alan ŞEFFAF olmak zorunda; düz
    // bir ürün fotoğrafı yüklendiğinde açıklık taranamıyor ve çerçeve mağazada
    // sessizce kayboluyor. Mağaza sahibinden görseli yeniden dışa aktarmasını
    // istemek yerine deliği burada açıyoruz.
    if (folder === "personalizer-mockup") {
      opening = await hasUsableOpening(buf);
      if (!opening) {
        // Aynı çekimin başka bir renk varyantından ölçülen açıklık; beyaz
        // çerçevede iç alanla çerçevenin yüzü arasında ışık farkı olmadığı
        // için tarama yetmiyor.
        let ipucu: OpeningRect | undefined;
        const ham = String(form.get("openingHint") ?? "");
        if (ham) {
          try {
            const h = JSON.parse(ham);
            if ([h?.x, h?.y, h?.w, h?.h].every((v) => typeof v === "number")) ipucu = h;
          } catch { /* bozuk ipucu yok sayılır */ }
        }
        const kesim = await cutOpening(buf, ipucu);
        if (kesim) {
          cikti = kesim.png;
          ext = "png";
          opening = kesim.opening;
          acildi = true;
        } else {
          uyari = "Bu görselde fotoğrafın gireceği şeffaf alan yok ve otomatik açılamadı. "
            + "Ortası şeffaf bir PNG yükleyin — aksi halde müşteri fotoğrafını çerçevenin "
            + "içinde göremez.";
        }
      }
    }

    const url = await uploadToR2(cikti, ext, folder);
    return json({
      url,
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha === true,
      /** Fotoğrafın gireceği şeffaf alan (oran); yoksa null */
      opening,
      /** Şeffaf alanı biz açtıysak true — mağaza sahibine söylenmeli */
      openingCut: acildi,
      uyari,
    });
  } catch (err) {
    console.error("[upload-image] hata:", err);
    return json({ error: "Görsel yüklenemedi" }, { status: 500 });
  }
};
