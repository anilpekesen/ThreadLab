/**
 * Dağınık yerleşim (scatter) hesabı.
 *
 * "Hepsi Benim" tarzı ürünlerde tasarım bir dosya değil, bir tariftir:
 * müşterinin yüz kesiti N kez, süsleme M kez baskı alanına dağıtılır, ortada
 * düzenlenebilir yazı durur.
 *
 * Yerleşim TOHUMLU üretilir. Rastgele olsaydı müşterinin gördüğü önizleme ile
 * basılan dosya farklı çıkardı; aynı tohum her zaman aynı yerleşimi verir.
 *
 * Dağıtım KATMANLI IZGARA ile yapılır. Önceki sürüm dart atma kullanıyordu:
 * her parça için rastgele nokta denenip çakışanlar reddediliyor, deneme
 * sınırına gelince asgari mesafe gevşetiliyordu. Sonuç, ilk parçaların alanı
 * gelişigüzel kapması ve geç kalanların artan boşluklara tıkışmasıydı — bir
 * kenar kümeleniyor, karşı kenar boş kalıyordu. Izgara her parçaya kendi
 * hücresini verdiği için kaplama baştan dengeli çıkıyor.
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

/** Yerleşimin dışında tutulacak mutlak dikdörtgen (yazı bloğu vb.) */
export interface ReserveRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
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
 * Alan, parça sayısı kadar hücreye bölünür ve her parça kendi hücresine
 * oturur; hücre içindeki kayma tohumlu rastgeleyle verilir. Böylece hem
 * dağınık görünür hem de kaplama her kenarda eşit olur. Yazı alanına düşen
 * hücreler baştan elenir, kalan hücre sayısı yetmezse ızgara sıklaştırılır.
 */
export function computeScatterLayout(
  areaWidth: number,
  areaHeight: number,
  config: ScatterConfig,
  reserveRect?: ReserveRect | null,
): ScatterItem[] {
  const rnd = mulberry32(config.seed);
  const items: ScatterItem[] = [];

  // Yüz ve süslemeler dönüşümlü sıralanır ki tek bir köşede kümelenmesinler
  const queue: Array<"face" | "decoration"> = [];
  const total = Math.max(0, config.faceCount) + Math.max(0, config.decorationCount);
  if (total === 0) return items;
  let f = config.faceCount;
  let d = config.decorationCount;
  while (queue.length < total) {
    if (f > 0) { queue.push("face"); f--; }
    if (d > 0 && queue.length < total) { queue.push("decoration"); d--; }
  }

  // Mutlak dikdörtgen verilmişse o kullanılır (yazının gerçek yeri); yoksa
  // yapılandırmadaki oransal orta alana düşülür.
  const reserve: ReserveRect | null = reserveRect ?? (config.reserveCenter
    ? {
        x0: areaWidth * (0.5 - config.reserveCenter.width / 2),
        x1: areaWidth * (0.5 + config.reserveCenter.width / 2),
        y0: areaHeight * (0.5 - config.reserveCenter.height / 2),
        y1: areaHeight * (0.5 + config.reserveCenter.height / 2),
      }
    : null);

  const faceWidth = areaWidth * config.faceScale;

  // Yazı alanına değmeyen yeterli hücre bulunana kadar ızgarayı sıklaştır
  let cells: Array<{ cx: number; cy: number; w: number; h: number }> = [];
  const aspect = areaWidth / Math.max(areaHeight, 1);
  for (let extra = 0; extra < 12; extra++) {
    const target = total + extra * 2;
    const cols = Math.max(1, Math.round(Math.sqrt(target * aspect)));
    const rows = Math.max(1, Math.ceil(target / cols));
    const cellW = areaWidth / cols;
    const cellH = areaHeight / rows;

    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cellW;
        const cy = (r + 0.5) * cellH;
        // Hücre MERKEZİ yazı bloğunun yarım parça genişliğindeki payına
        // düşüyorsa kullanılmaz. Hücrenin tamamını sınamak (kenarı değse bile
        // elemek) ortada gereğinden çok geniş bir boşluk bırakıyordu.
        if (reserve) {
          const pad = faceWidth * 0.5;
          const inside = cx > reserve.x0 - pad && cx < reserve.x1 + pad
            && cy > reserve.y0 - pad && cy < reserve.y1 + pad;
          if (inside) continue;
        }
        cells.push({ cx, cy, w: cellW, h: cellH });
      }
    }
    if (cells.length >= total) break;
  }

  if (!cells.length) return items;

  // Hücreleri tohumlu karıştır: yüz/süsleme sırası alana yayılsın
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  queue.forEach((kind, index) => {
    const cell = cells[index];
    if (!cell) return;   // hücre yetmediyse parçayı atla

    const baseScale = kind === "face" ? config.faceScale : config.decorationScale;
    const jitter = 1 + (rnd() * 2 - 1) * config.sizeJitter;
    const width = Math.max(8, areaWidth * baseScale * jitter);
    const radius = width / 2;

    // Hücre parçadan büyükse kalan payda serbestçe kaydır; küçükse hücrede
    // ortala — aksi halde komşu parçalar üst üste biner.
    const slackX = Math.max(0, cell.w - width) / 2;
    const slackY = Math.max(0, cell.h - width) / 2;
    // Parça tam sınıra oturduğunda kesit kendi kenarında bittiği için baskıda
    // kırpılmış görünüyor; küçük bir kenar payı bunu önlüyor.
    const margin = Math.min(areaWidth, areaHeight) * 0.015;
    const x = clamp(cell.cx + (rnd() * 2 - 1) * slackX, radius + margin, areaWidth - radius - margin);
    const y = clamp(cell.cy + (rnd() * 2 - 1) * slackY, radius + margin, areaHeight - radius - margin);

    items.push({
      kind,
      x,
      y,
      width,
      angle: config.angleJitter ? (rnd() * 2 - 1) * config.angleJitter : 0,
    });
  });

  return items;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
