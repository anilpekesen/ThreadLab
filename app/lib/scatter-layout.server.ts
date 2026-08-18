/**
 * Dağınık yerleşim (scatter) hesabı.
 *
 * "Hepsi Benim" tarzı ürünlerde tasarım bir dosya değil, bir tariftir:
 * müşterinin yüz kesiti N kez, süsleme M kez baskı alanına dağıtılır, ortada
 * düzenlenebilir yazı durur.
 *
 * Yerleşim TOHUMLU üretilir. Rastgele olsaydı müşterinin gördüğü önizleme ile
 * basılan dosya farklı çıkardı; aynı tohum her zaman aynı yerleşimi verir.
 */

export interface ScatterConfig {
  /** Müşteri fotoğrafından kaç kopya */
  faceCount: number;
  /** Süsleme (kalp vb.) kopya sayısı; süsleme yoksa 0 */
  decorationCount: number;
  /** Parça genişliğinin baskı alanı genişliğine oranı */
  faceScale: number;        // ör. 0.16
  decorationScale: number;  // ör. 0.11
  /** Boyut çeşitliliği (0 = hepsi aynı, 0.3 = ±%30) */
  sizeJitter: number;
  /** Hafif eğim (derece); 0 = düz */
  angleJitter: number;
  /** Yazı için ortada boş bırakılacak alanın oranı (genişlik, yükseklik) */
  reserveCenter: { width: number; height: number } | null;
  /** Aynı tohum aynı yerleşimi üretir */
  seed: number;
}

export interface ScatterItem {
  kind: "face" | "decoration";
  /** Parçanın merkez konumu (baskı alanı koordinatı) */
  x: number;
  y: number;
  /** Parçanın genişliği; yükseklik en-boy oranından türetilir */
  width: number;
  angle: number;
}

export const DEFAULT_SCATTER: ScatterConfig = {
  faceCount: 13,
  decorationCount: 8,
  faceScale: 0.16,
  decorationScale: 0.1,
  sizeJitter: 0.18,
  angleJitter: 0,
  reserveCenter: { width: 0.42, height: 0.26 },
  seed: 1,
};

/** Küçük, hızlı ve tekrarlanabilir sözde-rastgele üreteç */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parçaları baskı alanına dağıtır.
 *
 * Dart atma yöntemi: her parça için rastgele nokta denenir, mevcut parçalara
 * ve rezerve alana çok yakınsa reddedilir. Deneme sınırına ulaşılırsa asgari
 * mesafe kademeli gevşetilir — böylece yoğun isteklerde bile sonuç üretilir,
 * sonsuz döngüye girilmez.
 */
export function computeScatterLayout(
  areaWidth: number,
  areaHeight: number,
  config: ScatterConfig,
): ScatterItem[] {
  const rnd = mulberry32(config.seed);
  const items: ScatterItem[] = [];

  // Yüz ve süslemeler dönüşümlü sıralanır ki tek bir köşede kümelenmesinler
  const queue: Array<"face" | "decoration"> = [];
  const total = Math.max(0, config.faceCount) + Math.max(0, config.decorationCount);
  let f = config.faceCount;
  let d = config.decorationCount;
  while (queue.length < total) {
    if (f > 0) { queue.push("face"); f--; }
    if (d > 0 && queue.length < total) { queue.push("decoration"); d--; }
  }

  const reserve = config.reserveCenter
    ? {
        x0: areaWidth * (0.5 - config.reserveCenter.width / 2),
        x1: areaWidth * (0.5 + config.reserveCenter.width / 2),
        y0: areaHeight * (0.5 - config.reserveCenter.height / 2),
        y1: areaHeight * (0.5 + config.reserveCenter.height / 2),
      }
    : null;

  for (const kind of queue) {
    const baseScale = kind === "face" ? config.faceScale : config.decorationScale;
    const jitter = 1 + (rnd() * 2 - 1) * config.sizeJitter;
    const width = Math.max(8, areaWidth * baseScale * jitter);
    const radius = width / 2;

    let placed: ScatterItem | null = null;
    for (let attempt = 0; attempt < 220 && !placed; attempt++) {
      // Deneme ilerledikçe asgari mesafeyi gevşet
      const relax = 1 - Math.min(0.55, attempt / 220);
      const x = radius + rnd() * (areaWidth - radius * 2);
      const y = radius + rnd() * (areaHeight - radius * 2);

      if (reserve && x > reserve.x0 - radius && x < reserve.x1 + radius
                  && y > reserve.y0 - radius && y < reserve.y1 + radius) {
        continue;   // yazı alanına girme
      }

      let clash = false;
      for (const other of items) {
        const minDist = (radius + other.width / 2) * 0.92 * relax;
        if (Math.hypot(x - other.x, y - other.y) < minDist) { clash = true; break; }
      }
      if (clash) continue;

      placed = {
        kind,
        x,
        y,
        width,
        angle: config.angleJitter ? (rnd() * 2 - 1) * config.angleJitter : 0,
      };
    }

    // Yer bulunamadıysa parçayı atla — üst üste bindirmektense eksik bırak
    if (placed) items.push(placed);
  }

  return items;
}
