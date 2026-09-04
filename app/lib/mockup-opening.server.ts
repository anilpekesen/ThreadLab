import sharp from "sharp";
import { scanTemplateHoles } from "./template-hole.server";

/**
 * Çerçeve mockup'ının ortasını şeffaf yapar.
 *
 * Neden gerekiyor: müşteri sayfası fotoğrafı çerçevenin ŞEFFAF açıklığına
 * yerleştiriyor. Mağaza sahibi ortası beyaz düz bir ürün fotoğrafı
 * yüklediğinde açıklık taranamıyor ve çerçeve mağazada hiç görünmüyor —
 * üstelik hata da vermiyor, sadece kayboluyor. Canlıda tam olarak bu oldu:
 * dört renk yüklendi, ürün sayfasındaki çerçeveler gitti.
 *
 * Mağaza sahibinden görseli şeffaflıkla yeniden dışa aktarmasını istemek
 * yerine deliği burada açıyoruz; stüdyo çekimlerinde iç alan düz ve açık
 * olduğu için bu güvenilir şekilde bulunabiliyor.
 */

/**
 * Eşik sabit verilemiyor. Beyaz çerçevede düşük eşik doldurmanın çerçevenin
 * yüzünü aşıp duvara taşmasına yol açıyor; koyu çerçevede yüksek eşik iç
 * alanı hiç yakalamıyor. Artan eşiklerle deneyip doldurmanın görselin
 * KENARINA DEĞMEMESİ'ni ölçüt alıyoruz: değiyorsa dışarı kaçmış demektir.
 */
const ESIKLER = [185, 200, 215, 230, 240, 248];
const DOYGUNLUK_SINIRI = 30;
const EN_AZ_ALAN = 0.15;
const EN_COK_ALAN = 0.85;

export interface OpeningRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutResult {
  png: Buffer;
  /** "tarama" = ışık taramasıyla bulundu, "ipucu" = verilen dikdörtgen kesildi */
  yontem: "tarama" | "ipucu";
  opening: OpeningRect;
}

/** Görselde zaten kullanılabilir bir şeffaf açıklık var mı? */
export async function hasUsableOpening(buf: Buffer): Promise<OpeningRect | null> {
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.hasAlpha) return null;
    const scan = await scanTemplateHoles(buf);
    const hole = scan.holes[0];
    if (!hole) return null;
    return {
      x: hole.x / scan.width,
      y: hole.y / scan.height,
      w: hole.width / scan.width,
      h: hole.height / scan.height,
    };
  } catch {
    return null;
  }
}

/**
 * Ortadaki açık alanı şeffaf yapar. Bulamazsa null döner — uyduruk bir delik
 * açmaktansa mağaza sahibine söylemek yeğdir.
 *
 * `ipucu` verilirse tarama başarısız olduğunda o dikdörtgen kesilir. Mağazalar
 * aynı çekimin renk varyantlarını yüklüyor ve beyaz çerçevede iç alanla
 * çerçevenin yüzü arasında ışık farkı olmuyor; kardeş görselden ölçülen
 * açıklık bu durumu kurtarıyor.
 */
export async function cutOpening(buf: Buffer, ipucu?: OpeningRect): Promise<CutResult | null> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;

  const isikOf = (i: number) =>
    (data[i * C] * 299 + data[i * C + 1] * 587 + data[i * C + 2] * 114) / 1000;
  const doygunlukOf = (i: number) =>
    Math.max(data[i * C], data[i * C + 1], data[i * C + 2])
    - Math.min(data[i * C], data[i * C + 1], data[i * C + 2]);

  for (const esik of ESIKLER) {
    const acik = (i: number) => isikOf(i) >= esik && doygunlukOf(i) <= DOYGUNLUK_SINIRI;
    const merkez = Math.floor(H / 2) * W + Math.floor(W / 2);
    if (!acik(merkez)) continue;

    const delik = new Uint8Array(W * H);
    const yigin: number[] = [merkez];
    delik[merkez] = 1;
    let sayac = 1;
    let kenaraDegdi = false;
    let minX = W, minY = H, maxX = 0, maxY = 0;

    while (yigin.length) {
      const p = yigin.pop()!;
      const x = p % W;
      const y = (p - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) kenaraDegdi = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0)     { const q = p - 1; if (!delik[q] && acik(q)) { delik[q] = 1; sayac++; yigin.push(q); } }
      if (x < W - 1) { const q = p + 1; if (!delik[q] && acik(q)) { delik[q] = 1; sayac++; yigin.push(q); } }
      if (y > 0)     { const q = p - W; if (!delik[q] && acik(q)) { delik[q] = 1; sayac++; yigin.push(q); } }
      if (y < H - 1) { const q = p + W; if (!delik[q] && acik(q)) { delik[q] = 1; sayac++; yigin.push(q); } }
    }

    const oran = sayac / (W * H);
    if (kenaraDegdi || oran < EN_AZ_ALAN || oran > EN_COK_ALAN) continue;

    // Doldurulan alanın sınır kutusu, dikdörtgen açıklığın kendisinden çok
    // büyükse eşik çerçevenin yüzüne taşmış demektir: dolu oranı kutunun
    // alanına yakın olmalı.
    const kutu = (maxX - minX + 1) * (maxY - minY + 1);
    if (sayac / kutu < 0.9) continue;

    const kopya = Buffer.from(data);
    for (let i = 0; i < W * H; i++) if (delik[i]) kopya[i * C + 3] = 0;
    return {
      png: await sharp(kopya, { raw: { width: W, height: H, channels: C as 4 } }).png().toBuffer(),
      yontem: "tarama",
      opening: { x: minX / W, y: minY / H, w: (maxX - minX + 1) / W, h: (maxY - minY + 1) / H },
    };
  }

  if (!ipucu) return null;

  const x0 = Math.max(0, Math.round(ipucu.x * W));
  const y0 = Math.max(0, Math.round(ipucu.y * H));
  const x1 = Math.min(W, Math.round((ipucu.x + ipucu.w) * W));
  const y1 = Math.min(H, Math.round((ipucu.y + ipucu.h) * H));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;

  const kopya = Buffer.from(data);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) kopya[(y * W + x) * C + 3] = 0;
  }
  return {
    png: await sharp(kopya, { raw: { width: W, height: H, channels: C as 4 } }).png().toBuffer(),
    yontem: "ipucu",
    opening: { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H },
  };
}
