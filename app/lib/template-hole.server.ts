import sharp from "sharp";

/**
 * Şablon görselindeki "kapalı şeffaf delik"leri bulur ve müşteri fotoğrafını
 * tam o şeklin içine maskeler.
 *
 * Mağaza sahibi tek dosya yükler: tasarımın fotoğrafın gireceği yeri şeffaf
 * bırakılmıştır. Ayrı maske dosyası ya da şekil seçimi gerekmez.
 *
 * Yöntem: görselin kenarlarından şeffaf pikseller boyunca taşma (flood fill)
 * yapılır — buraya ulaşan her şeffaf piksel "dışarısı"dır. Geriye kalan şeffaf
 * pikseller tasarımla çevrelenmiş deliklerdir. Bu sayede kalp/daire/özgün her
 * şekil çalışır, ama harflerin içindeki küçük gözler (o, e, a) küçük oldukları
 * için elenebilir.
 */

/** Bu değerin altındaki alfa "şeffaf" sayılır */
const ALPHA_TRANSPARENT_MAX = 24;
/** Toplam alanın bu oranından küçük delikler yok sayılır (harf gözleri) */
const MIN_HOLE_AREA_RATIO = 0.004;

export interface TemplateHole {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Deliğe ait piksel sayısı — kutu değil, gerçek alan */
  pixels: number;
}

export interface HoleScan {
  width: number;
  height: number;
  holes: TemplateHole[];
  /** Piksel başına delik kimliği; -1 = delik değil */
  labels: Int32Array;
}

/** Şablondaki kapalı şeffaf alanları büyükten küçüğe sıralı döndürür. */
export async function scanTemplateHoles(templateBuffer: Buffer): Promise<HoleScan> {
  const { data, info } = await sharp(templateBuffer, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const n = w * h;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3];

  // 1) Kenarlardan taşarak "dışarısı"nı işaretle
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (!outside[i] && alpha[i] <= ALPHA_TRANSPARENT_MAX) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }

  // 2) Kalan şeffaf pikselleri bağlı bileşenlere ayır — bunlar delikler
  const labels = new Int32Array(n).fill(-1);
  const holes: TemplateHole[] = [];
  const minPixels = Math.max(64, Math.floor(n * MIN_HOLE_AREA_RATIO));

  // Bileşenin pikselleri ayrıca tutulur: küçük çıkarsa etiketleri geri almak
  // için tüm diziyi taramak gerekmesin (harf gözü çok olan şablonlarda bu
  // tarama görseli saniyelerce yavaşlatıyordu).
  const queue: number[] = [];
  const member: number[] = [];

  for (let s = 0; s < n; s++) {
    if (alpha[s] > ALPHA_TRANSPARENT_MAX || outside[s] || labels[s] !== -1) continue;
    const id = holes.length;
    queue.length = 0;
    member.length = 0;
    queue.push(s);
    labels[s] = id;
    let minX = w, maxX = 0, minY = h, maxY = 0;

    while (queue.length) {
      const i = queue.pop() as number;
      const x = i % w;
      const y = (i - x) / w;
      member.push(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const j = i - 1;
        if (alpha[j] <= ALPHA_TRANSPARENT_MAX && !outside[j] && labels[j] === -1) { labels[j] = id; queue.push(j); }
      }
      if (x < w - 1) {
        const j = i + 1;
        if (alpha[j] <= ALPHA_TRANSPARENT_MAX && !outside[j] && labels[j] === -1) { labels[j] = id; queue.push(j); }
      }
      if (y > 0) {
        const j = i - w;
        if (alpha[j] <= ALPHA_TRANSPARENT_MAX && !outside[j] && labels[j] === -1) { labels[j] = id; queue.push(j); }
      }
      if (y < h - 1) {
        const j = i + w;
        if (alpha[j] <= ALPHA_TRANSPARENT_MAX && !outside[j] && labels[j] === -1) { labels[j] = id; queue.push(j); }
      }
    }

    if (member.length < minPixels) {
      // Harf gözü gibi küçük boşluk — delik sayma
      for (let k = 0; k < member.length; k++) labels[member[k]] = -1;
      continue;
    }
    holes.push({ id, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels: member.length });
  }

  holes.sort((a, b) => b.pixels - a.pixels);
  return { width: w, height: h, holes, labels };
}

/**
 * Fotoğrafı verilen deliğin şekline kesip, şablon boyutunda saydam bir katman
 * olarak döndürür. Fotoğraf deliğe "cover" ile ortalanır.
 */
/**
 * Bir deliğin şeklini alfa maskesi olarak çıkarır.
 *
 * Sonuç, deliğin sınırlayıcı kutusu kadar bir PNG: deliğin İÇİ opak, dışı
 * şeffaf. Slotun `mask_url` alanına bu dosya yazılıyor ve baskı sırasında
 * müşteri fotoğrafı bu şeklin dışında kalan kısımlarından kesiliyor.
 *
 * Kutu değil gerçek şekil kullanılıyor: "LOVE" yazısının harfleri ya da bir
 * kalp, dikdörtgen bir kırpma ile doğru görünmez.
 */
export async function extractHoleMask(scan: HoleScan, hole: TemplateHole): Promise<Buffer> {
  const mask = Buffer.alloc(hole.width * hole.height * 4);

  for (let y = 0; y < hole.height; y++) {
    for (let x = 0; x < hole.width; x++) {
      const gi = (hole.y + y) * scan.width + (hole.x + x);
      if (scan.labels[gi] !== hole.id) continue;
      const di = (y * hole.width + x) * 4;
      mask[di] = 255;
      mask[di + 1] = 255;
      mask[di + 2] = 255;
      mask[di + 3] = 255;
    }
  }

  return sharp(mask, { raw: { width: hole.width, height: hole.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function buildMaskedPhotoLayer(
  photoBuffer: Buffer,
  scan: HoleScan,
  hole: TemplateHole,
): Promise<Buffer> {
  const photo = await sharp(photoBuffer, { limitInputPixels: false })
    .rotate()
    .resize(hole.width, hole.height, { fit: "cover", position: "center" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w } = scan;
  const layer = Buffer.alloc(scan.width * scan.height * 4);

  for (let y = 0; y < hole.height; y++) {
    for (let x = 0; x < hole.width; x++) {
      const gi = (hole.y + y) * w + (hole.x + x);
      if (scan.labels[gi] !== hole.id) continue;   // yalnızca deliğin içi
      const si = (y * hole.width + x) * 4;
      const di = gi * 4;
      layer[di] = photo.data[si];
      layer[di + 1] = photo.data[si + 1];
      layer[di + 2] = photo.data[si + 2];
      layer[di + 3] = photo.data[si + 3];
    }
  }

  return sharp(layer, { raw: { width: scan.width, height: scan.height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Şeffaf delik yoksa (tasarımcı düz beyaz zeminli PNG verdiyse) mağaza sahibi
 * şablon üzerinde boş alana tıklar; o noktadan başlayarak benzer renkli
 * komşulara yayılıp şekli buluruz. Tasarımın çizgileri renk değiştirdiği için
 * yayılma kendiliğinden orada durur.
 *
 * Şeffaf, beyaz, gri veya renkli — her tür boşlukta çalışır ve yapay zekâ
 * gerektirmez.
 */
export async function scanHoleFromPoint(
  templateBuffer: Buffer,
  seedX: number,
  seedY: number,
  tolerance = 40,
): Promise<HoleScan | null> {
  const { data, info } = await sharp(templateBuffer, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const n = w * h;
  const sx = Math.round(seedX);
  const sy = Math.round(seedY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;

  const seed = sy * w + sx;
  const sr = data[seed * 4];
  const sg = data[seed * 4 + 1];
  const sb = data[seed * 4 + 2];
  const sa = data[seed * 4 + 3];
  const tol2 = tolerance * tolerance;

  const similar = (i: number) => {
    const a = data[i * 4 + 3];
    // Şeffaflık farkı tek başına ayırt edici: yarı saydam kenarlar dışarıda kalsın
    if (Math.abs(a - sa) > 40) return false;
    if (a <= ALPHA_TRANSPARENT_MAX && sa <= ALPHA_TRANSPARENT_MAX) return true;
    const dr = data[i * 4] - sr;
    const dg = data[i * 4 + 1] - sg;
    const db = data[i * 4 + 2] - sb;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  const labels = new Int32Array(n).fill(-1);
  const queue: number[] = [seed];
  labels[seed] = 0;
  let pixels = 0;
  let minX = w, maxX = 0, minY = h, maxY = 0;

  while (queue.length) {
    const i = queue.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    pixels++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    if (x > 0 && labels[i - 1] === -1 && similar(i - 1)) { labels[i - 1] = 0; queue.push(i - 1); }
    if (x < w - 1 && labels[i + 1] === -1 && similar(i + 1)) { labels[i + 1] = 0; queue.push(i + 1); }
    if (y > 0 && labels[i - w] === -1 && similar(i - w)) { labels[i - w] = 0; queue.push(i - w); }
    if (y < h - 1 && labels[i + w] === -1 && similar(i + w)) { labels[i + w] = 0; queue.push(i + w); }
  }

  if (pixels < 64) return null;

  return {
    width: w,
    height: h,
    labels,
    holes: [{ id: 0, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels }],
  };
}

/**
 * Deliğe denk gelen pikselleri şablondan saydamlaştırır.
 *
 * Tıklamayla bulunan delikler çoğu zaman opak (ör. düz beyaz zeminli PNG)
 * olduğu için şablon fotoğrafın üstüne konduğunda onu tamamen kapatıyor.
 * Deliği keserek fotoğrafın görünmesini sağlıyoruz. Zaten saydam deliklerde
 * işlem etkisizdir, dolayısıyla her iki yolda da güvenle çağrılabilir.
 */
export async function punchHoleInTemplate(
  templateBuffer: Buffer,
  scan: HoleScan,
  hole: TemplateHole,
): Promise<Buffer> {
  const { data, info } = await sharp(templateBuffer, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  for (let y = hole.y; y < hole.y + hole.height; y++) {
    for (let x = hole.x; x < hole.x + hole.width; x++) {
      const gi = y * w + x;
      if (scan.labels[gi] === hole.id) data[gi * 4 + 3] = 0;
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}
