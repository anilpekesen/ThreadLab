import sharp from "sharp";

/**
 * Yüz/kafa tespiti — Google Cloud Vision (REST).
 *
 * Neden dış servis: silüetten boyun bulma gerçek müşteri fotoğraflarında
 * çalışmıyor (saç aşağı indiği için daralma yok) ve genel amaçlı görme
 * modelleri kutu koordinatlarında yeterince isabetli değil. WaveSpeed'de
 * segmentasyon/tespit modeli yok; head-swap ters işlem yapıyor.
 *
 * Anahtar tanımlı değilse null döner ve akış müşterinin kendi çerçevelemesine
 * düşer — servis olmadan da ürün çalışır.
 */

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export interface HeadBox {
  /** Kaynak görsel koordinatlarında, saç dahil kafa kutusu */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tespit güveni (0-1); Vision "likelihood" vermez, alan oranından türetilir */
  confidence: number;
}

interface VisionVertex { x?: number; y?: number }
interface VisionFace {
  boundingPoly?: { vertices?: VisionVertex[] };      // saç/çene dahil geniş kutu
  fdBoundingPoly?: { vertices?: VisionVertex[] };    // yalnızca yüz derisi
  detectionConfidence?: number;
}

function polyToBox(vertices: VisionVertex[] | undefined) {
  if (!vertices?.length) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Görseldeki en belirgin kafayı bulur. Birden fazla yüz varsa en büyüğü
 * seçilir — ürün "tek kişi" varsayıyor, kalabalık fotoğraflarda en öndeki
 * kişiyi almak en makul davranış.
 */
export async function detectHead(imageBuffer: Buffer): Promise<HeadBox | null> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!apiKey) return null;

  // Vision 20 MB sınırlı; büyük fotoğrafları küçültüp koordinatları geri ölçekle
  const meta = await sharp(imageBuffer).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) return null;

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const sent = scale < 1
    ? await sharp(imageBuffer).resize(Math.round(srcW * scale), Math.round(srcH * scale))
        .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer()
    : await sharp(imageBuffer).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();

  let faces: VisionFace[] = [];
  try {
    const res = await fetch(`${VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: sent.toString("base64") },
          features: [{ type: "FACE_DETECTION", maxResults: 5 }],
        }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[face-detect] Vision hatasi", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const body = await res.json() as { responses?: Array<{ faceAnnotations?: VisionFace[]; error?: { message?: string } }> };
    const first = body.responses?.[0];
    if (first?.error?.message) {
      console.error("[face-detect] Vision yanit hatasi:", first.error.message);
      return null;
    }
    faces = first?.faceAnnotations ?? [];
  } catch (err) {
    console.error("[face-detect] istek basarisiz:", err);
    return null;
  }

  if (!faces.length) return null;

  // En büyük kutuyu seç
  let best: { box: NonNullable<ReturnType<typeof polyToBox>>; conf: number } | null = null;
  for (const face of faces) {
    const box = polyToBox(face.boundingPoly?.vertices) ?? polyToBox(face.fdBoundingPoly?.vertices);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    const area = box.width * box.height;
    if (!best || area > best.box.width * best.box.height) {
      best = { box, conf: face.detectionConfidence ?? 0.9 };
    }
  }
  if (!best) return null;

  // Gönderilen görsel küçültülmüşse koordinatları kaynağa geri ölçekle
  const inv = scale < 1 ? 1 / scale : 1;
  return {
    x: Math.round(best.box.x * inv),
    y: Math.round(best.box.y * inv),
    width: Math.round(best.box.width * inv),
    height: Math.round(best.box.height * inv),
    confidence: best.conf,
  };
}

/**
 * Kafa kutusunu, saç ve çene payı bırakacak şekilde genişletip kare hale
 * getirir. Vision'ın kutusu çeneyi sıkı kesiyor; dağıtılan kesitte kulak ve
 * saç görünmezse sonuç kötü duruyor.
 */
export function expandToHeadCrop(
  box: HeadBox,
  imageWidth: number,
  imageHeight: number,
  padding = 0.35,
): { left: number; top: number; width: number; height: number } {
  const size = Math.max(box.width, box.height) * (1 + padding);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  let left = Math.round(cx - size / 2);
  let top = Math.round(cy - size / 2);
  let side = Math.round(size);

  // Görsel dışına taşmasın
  side = Math.min(side, imageWidth, imageHeight);
  left = Math.max(0, Math.min(left, imageWidth - side));
  top = Math.max(0, Math.min(top, imageHeight - side));

  return { left, top, width: side, height: side };
}

export interface HeadCutoutResult {
  /** Saydam zeminli, kare kafa kesiti */
  buffer: Buffer;
  /** Tespit servisi kullanıldı mı; false ise tahmine düşüldü */
  detected: boolean;
  box: { left: number; top: number; width: number; height: number };
}

/**
 * Arka planı kaldırılmış görselden kare kafa kesiti çıkarır.
 *
 * Tespit başarısızsa (anahtar yok, yüz bulunamadı, servis hatası) öznenin üst
 * bölgesinden makul bir tahminle kesilir ve detected=false döner; müşteri
 * pencerede düzeltir. Böylece servis olmadan da akış durmaz.
 */
export async function extractHeadCutout(transparentSubject: Buffer): Promise<HeadCutoutResult> {
  const meta = await sharp(transparentSubject).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error("Gorsel olculeri okunamadi");

  const head = await detectHead(transparentSubject).catch(() => null);
  if (head) {
    const box = expandToHeadCrop(head, W, H);
    const buffer = await sharp(transparentSubject).extract(box).png().toBuffer();
    return { buffer, detected: true, box };
  }

  // Yedek tahmin: öznenin en üst noktasından başlayan kare
  const { data, info } = await sharp(transparentSubject).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 128) continue;
      if (y < minY) minY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  const subjectWidth = Math.max(1, maxX - minX);
  const side = Math.min(Math.round(subjectWidth * 0.62), W, H);
  const left = Math.max(0, Math.min(Math.round((minX + maxX) / 2 - side / 2), W - side));
  const top = Math.max(0, Math.min(minY, H - side));
  const box = { left, top, width: side, height: side };

  return {
    buffer: await sharp(transparentSubject).extract(box).png().toBuffer(),
    detected: false,
    box,
  };
}
