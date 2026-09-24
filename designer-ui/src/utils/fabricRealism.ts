/**
 * Önizlemede tasarımı kumaşa "basılmış" gibi gösterir.
 *
 * Düz yapıştırılan tasarım tişört fotoğrafının üstünde çıkartma gibi
 * duruyordu: kıvrımlar, gölgeler ve kumaş dokusu tasarımın altında kalıyor,
 * tasarım kusursuz düz ve parlak görünüyordu. Burada tasarımın altına düşen
 * fotoğraf bölgesinden iki şey çıkarılır:
 *
 *   1. Gölge haritası: bölgenin parlaklığı, bölgenin ortancasına bölünür.
 *      Düz kumaş ≈ 1 (değişmez), kıvrımın gölgesi < 1 (tasarım koyulaşır),
 *      ışık alan yer > 1 (tasarım açılır). Kumaş dokusu da böylece tasarımın
 *      üstünden görünür.
 *   2. Bükme: gölge haritasının eğimi kadar tasarım pikselleri kaydırılır;
 *      baskı kıvrımın üstünden geçerken hafifçe kıvrılır.
 *
 * Yalnızca önizleme görsellerinde kullanılır; baskı dosyası (exportPrintFile)
 * her zaman düz ve bozulmamış tasarımla üretilir.
 */

export interface RealismOptions {
  /** Gölge etkisinin gücü: 0 = kapalı, 1 = fotoğraftaki kadar */
  shade?: number;
  /** Kıvrım bükmesinin en fazla kaç piksel kaydıracağı (çıktı pikseli) */
  displace?: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * `ctx` üstüne, zaten çizilmiş tişört fotoğrafının `rect` bölgesine,
 * tasarımı kumaş etkisiyle çizer. Bir şey ters giderse (ör. fotoğraf
 * cross-origin olduğu için piksel okunamazsa) tasarımı düz çizer.
 */
export function drawArtworkOnFabric(
  ctx: CanvasRenderingContext2D,
  artwork: CanvasImageSource,
  rect: { x: number; y: number; w: number; h: number },
  opts: RealismOptions = {},
): void {
  const shadeK = opts.shade ?? 0.7;
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  if (w < 4 || h < 4) {
    ctx.drawImage(artwork, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  const maxShift = opts.displace ?? Math.max(1.5, Math.min(w, h) * 0.012);

  try {
    // ── Kumaş bölgesi: hafif bulanık (doku gürültüsü değil kıvrımlar kalsın)
    //    ve keskin (doku) iki kopya
    const fabricCanvas = document.createElement('canvas');
    fabricCanvas.width = w;
    fabricCanvas.height = h;
    const fctx = fabricCanvas.getContext('2d', { willReadFrequently: true });
    if (!fctx) throw new Error('2d');
    fctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
    const sharp = fctx.getImageData(0, 0, w, h).data;
    fctx.clearRect(0, 0, w, h);
    fctx.filter = `blur(${Math.max(1, Math.round(Math.min(w, h) / 160))}px)`;
    fctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
    fctx.filter = 'none';
    const soft = fctx.getImageData(0, 0, w, h).data;

    const n = w * h;
    const lumSoft = new Float32Array(n);
    const lumSharp = new Float32Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      lumSoft[i] = (0.2126 * soft[j] + 0.7152 * soft[j + 1] + 0.0722 * soft[j + 2]) / 255;
      lumSharp[i] = (0.2126 * sharp[j] + 0.7152 * sharp[j + 1] + 0.0722 * sharp[j + 2]) / 255;
      hist[Math.round(lumSoft[i] * 255)]++;
    }
    // Ortanca: bölgenin "düz kumaş" tonu. Ortalama, büyük bir gölgeyle kayardı.
    let acc = 0;
    let median = 0.5;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= n / 2) { median = v / 255; break; }
    }
    // Oranlara taban payı: siyah kumaşta parlaklık ~0.05 ve küçük farklar
    // oranı abartıp tasarıma gren gibi bir doku basıyordu
    const EPS = 0.1;
    const ref = median + EPS;
    /** Kumaş dokusunun gücü: 1 = fotoğraftaki kadar, daha fazlası eskimiş görünür */
    const TEX = 0.5;

    // ── Tasarım pikselleri
    const artCanvas = document.createElement('canvas');
    artCanvas.width = w;
    artCanvas.height = h;
    const actx = artCanvas.getContext('2d', { willReadFrequently: true });
    if (!actx) throw new Error('2d');
    actx.imageSmoothingQuality = 'high';
    actx.drawImage(artwork, 0, 0, w, h);
    const src = actx.getImageData(0, 0, w, h);
    const out = actx.createImageData(w, h);
    const s = src.data;
    const o = out.data;

    // Eğimden kaydırma: kıvrımın aydınlık tarafına doğru; bölgenin ölçeğine göre
    const gradScale = maxShift / ref;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = py * w + px;
        const gx = (lumSoft[py * w + Math.min(w - 1, px + 1)] - lumSoft[py * w + Math.max(0, px - 1)]) * 0.5;
        const gy = (lumSoft[Math.min(h - 1, py + 1) * w + px] - lumSoft[Math.max(0, py - 1) * w + px]) * 0.5;
        const sx = clamp(Math.round(px - clamp(gx * gradScale * 4, -maxShift, maxShift)), 0, w - 1);
        const sy = clamp(Math.round(py - clamp(gy * gradScale * 4, -maxShift, maxShift)), 0, h - 1);
        const si = (sy * w + sx) * 4;
        const a = s[si + 3];
        const oi = i * 4;
        if (a === 0) { o[oi + 3] = 0; continue; }

        // Kıvrım gölgesi (bulanık) + doku (keskin), düz kumaşa göre oran
        const fold = (lumSoft[i] + EPS) / ref;
        const texture = 1 + ((lumSharp[i] + EPS) / (lumSoft[i] + EPS) - 1) * TEX;
        const shade = clamp(1 + (fold * texture - 1) * shadeK, 0.7, 1.2);
        for (let c = 0; c < 3; c++) {
          const v = s[si + c] / 255;
          // Gölge çarparak koyulaştırır; ışık beyaza doğru açar (screen benzeri)
          const r = shade <= 1 ? v * shade : v + (1 - v) * (shade - 1) * 0.35;
          o[oi + c] = Math.round(clamp(r, 0, 1) * 255);
        }
        o[oi + 3] = a;
      }
    }
    actx.putImageData(out, 0, 0);
    ctx.drawImage(artCanvas, x, y);
  } catch {
    ctx.drawImage(artwork, rect.x, rect.y, rect.w, rect.h);
  }
}
