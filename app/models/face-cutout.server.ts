import sharp from "sharp";
import { json } from "@remix-run/node";
import { handleWaveSpeedRemoveBackground } from "~/models/background-removal.server";
import { checkAndIncrementIpQuota } from "~/models/ip-quota.server";
import { applySoftOvalMask, detectHead, extractHeadCutout, type HeadBox } from "~/lib/face-detect.server";

/**
 * Tasarımcıdaki "Yüzü kes" düğmesi.
 *
 * İki biçim:
 *   - head: arka plan silinir, saç dahil kafa şeffaf zeminde kalır; omuz ve
 *     yaka geniş bir ovalle kırpılır. Arka plan silme akışını olduğu gibi
 *     kullanır: müşteri, IP ve mağaza kotası oradan düşer.
 *   - oval: fotoğraf kafa etrafında dikey ovalle, yumuşak kenarla kırpılır.
 *     Arka plan silinmez, kota harcamaz; yalnız yüz tespiti yapılır (IP
 *     başına günlük sınırlı).
 *
 * Yüz bulunamazsa head biçimi öznenin üstünden tahminle keser ve
 * `X-Face-Detected: 0` döner (müşteri uyarılır); oval biçimi hata verir,
 * çünkü tahminle kırpılmış bir oval portre işe yaramaz.
 */

const OVAL_DAILY_LIMIT = 40;

function langOf(request: Request): "tr" | "en" {
  const q = new URL(request.url).searchParams.get("locale");
  if (q) return q.toLowerCase().startsWith("en") ? "en" : "tr";
  return (request.headers.get("Accept-Language") ?? "").toLowerCase().includes("tr") ? "tr" : "en";
}

export async function handleFaceCutout(request: Request, shop: string): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const lang = langOf(request);
  const mode = new URL(request.url).searchParams.get("mode") === "oval" ? "oval" : "head";
  return mode === "head" ? headCutout(request, shop) : ovalPortrait(request, shop, lang);
}

async function headCutout(request: Request, shop: string): Promise<Response> {
  const res = await handleWaveSpeedRemoveBackground(request, shop);
  if (!res.ok) return res;
  const subject = Buffer.from(await res.arrayBuffer());
  const box = await detectHead(subject).catch(() => null);
  let masked: Buffer;
  if (box) {
    masked = await headOnly(subject, box);
  } else {
    // Yüz bulunamadı: öznenin üstünden tahmin; müşteri uyarılır
    const cut = await extractHeadCutout(subject);
    masked = await applySoftOvalMask(cut.buffer, 0.05, { x: 0.5, y: 0.53 });
  }
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "image/png",
    "X-Face-Detected": box ? "1" : "0",
  };
  const remaining = res.headers.get("X-BG-Quota-Remaining");
  if (remaining) headers["X-BG-Quota-Remaining"] = remaining;
  return new Response(new Uint8Array(await trimTransparent(masked)), { headers });
}

async function ovalPortrait(request: Request, shop: string, lang: "tr" | "en"): Promise<Response> {
  const form = await request.formData();
  const file = form.get("image_file");
  if (!(file instanceof File)) return json({ error: "image_file is required" }, { status: 400 });

  const ip = await checkAndIncrementIpQuota(shop, "face_detect", request, OVAL_DAILY_LIMIT);
  if (!ip.allowed) {
    return json({
      error: lang === "tr" ? "Bugünlük yüz kesme sınırına ulaşıldı. Lütfen yarın tekrar deneyin." : "The daily face cutout limit has been reached. Please try again tomorrow.",
      code: "ip_quota_exceeded",
    }, { status: 429 });
  }

  // Telefon fotoğraflarında yön EXIF'te; tespit ve kırpma aynı yönde yapılmalı
  const src = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: false }).rotate().png().toBuffer();
  const meta = await sharp(src).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const head = W && H ? await detectHead(src).catch(() => null) : null;
  if (!head) {
    return json({
      error: lang === "tr" ? "Fotoğrafta yüz bulunamadı. Yüzün net göründüğü bir fotoğraf deneyin." : "No face was found in the photo. Try one where the face is clearly visible.",
      code: "no_face",
    }, { status: 422 });
  }

  // Dikey portre: kafanın çevresinde saç ve boyun payı, en/boy 4:5
  const w0 = Math.max(head.width, head.height) * 1.45;
  const h0 = w0 * 1.25;
  const cx = head.x + head.width / 2;
  const cy = head.y + head.height * 0.58;
  const k = Math.min(1, W / w0, H / h0);
  const width = Math.round(w0 * k);
  const height = Math.round(h0 * k);
  const left = Math.max(0, Math.min(Math.round(cx - width / 2), W - width));
  const top = Math.max(0, Math.min(Math.round(cy - height / 2), H - height));
  const crop = await sharp(src).extract({ left, top, width, height }).ensureAlpha().png().toBuffer();
  const oval = await applySoftOvalMask(crop, 0.08, { x: 0.49, y: 0.49 });

  return new Response(new Uint8Array(oval), {
    headers: { "Cache-Control": "no-store", "Content-Type": "image/png", "X-Face-Detected": "1" },
  });
}

/**
 * Arka planı silinmiş özneden yalnız kafayı bırakır.
 *
 * Vision'ın kutusu saçın üstünü sıkı kesiyor; zemin zaten şeffaf olduğu için
 * yukarıda geniş pay bırakmak bedava. Çenenin altı yumuşak bir geçişle,
 * yanlarda kulakların ötesi (omuz, yaka) dikey bir ovalle silinir.
 */
export async function headOnly(subject: Buffer, box: HeadBox): Promise<Buffer> {
  const meta = await sharp(subject).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const cx = box.x + box.width / 2;
  const chin = box.y + box.height;
  const left = Math.max(0, Math.round(cx - box.width * 0.8));
  const right = Math.min(W, Math.round(cx + box.width * 0.8));
  const top = Math.max(0, Math.round(box.y - box.height * 0.45));
  const bottom = Math.min(H, Math.round(chin + box.height * 0.12));
  const width = right - left;
  const height = bottom - top;
  const { data, info } = await sharp(subject).extract({ left, top, width, height }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });

  const ocx = cx - left;
  const ocy = box.y + box.height * 0.42 - top;
  const rx = box.width * 0.62;
  const ry = box.height * 0.95;
  const fadeStart = chin - box.height * 0.04 - top;
  const fadeLen = box.height * 0.12;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4 + 3;
      if (!data[i]) continue;
      let k = 1;
      // Yan: yumurta biçimi — kulak hizasında geniş, çeneye doğru daralır;
      // yaka ve omuz çene hizasında yanlarda kalıyordu
      const below = y > ocy ? Math.min(1, (y - ocy) / (chin - top - ocy)) : 0;
      const rxy = rx * (1 - 0.55 * Math.pow(below, 1.6));
      const d = Math.hypot((x - ocx) / rxy, (y - ocy) / ry);
      if (d > 1) k = Math.max(0, 1 - (d - 1) / 0.08);
      // Alt: çeneden sonra boyun kısa bir geçişle kaybolur
      if (y > fadeStart) k = Math.min(k, Math.max(0, 1 - (y - fadeStart) / fadeLen));
      if (k < 1) data[i] = Math.round(data[i] * k);
    }
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return png;
}

/** Kafa kesitinin çevresindeki boş şeffaf alanı atar; tasarımda kutu mürekkebe otursun */
async function trimTransparent(png: Buffer): Promise<Buffer> {
  try {
    return await sharp(png).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 }).png().toBuffer();
  } catch {
    return png;
  }
}
