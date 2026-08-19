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

  const total = Math.max(0, config.faceCount) + Math.max(0, config.decorationCount);
  if (total === 0) return items;

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
  let cells: Array<{ cx: number; cy: number; w: number; h: number; parity: 0 | 1 }> = [];
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
          const pad = faceWidth * 0.2;
          const inside = cx > reserve.x0 - pad && cx < reserve.x1 + pad
            && cy > reserve.y0 - pad && cy < reserve.y1 + pad;
          if (inside) continue;
        }
        cells.push({ cx, cy, w: cellW, h: cellH, parity: ((r + c) % 2) as 0 | 1 });
      }
    }
    // Her iki parite sınıfı da kendi payını karşılamalı; toplam yeterli olsa
    // bile tek sınıf açık kalırsa süslemeler yüz hücrelerine taşar ve satranç
    // deseni bozulur.
    const evenCount = cells.filter((cell) => cell.parity === 0).length;
    const oddCount = cells.length - evenCount;
    if (evenCount >= config.faceCount && oddCount >= config.decorationCount) break;
  }

  if (!cells.length) return items;

  const shuffle = <T,>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // Yüzler ve süslemeler ızgaranın iki farklı parite sınıfına dağıtılır —
  // satranç tahtası gibi. Önceki sürümde her iki tür de aynı havuzdan hücre
  // çekiyordu; tür dağılımı tamamen şansa kaldığı için kalpler bir kenarda,
  // kafalar karşı kenarda toplanabiliyordu. Parite ayrımı her süslemenin
  // yüzlerin arasına düşmesini garanti eder.
  const even = shuffle(cells.filter((cell) => cell.parity === 0));
  const odd = shuffle(cells.filter((cell) => cell.parity === 1));

  // Bir sınıf yetmezse diğerinin artanından tamamlanır
  const faceCells = even.splice(0, config.faceCount);
  const decorCells = odd.splice(0, config.decorationCount);
  while (faceCells.length < config.faceCount && odd.length) faceCells.push(odd.shift()!);
  while (decorCells.length < config.decorationCount && even.length) decorCells.push(even.shift()!);

  // Ayarlanan ölçek alana sığmıyorsa TÜM parçalar aynı katsayıyla küçültülür.
  // Parça sayısı, parça boyu ve yazı boşluğu birlikte alandan büyük olabiliyor;
  // ölçeği olduğu gibi uygulamak parçaları üst üste bindiriyordu. Katsayının
  // ortak olması kafa/süsleme boy farkını korur — yalnızca kafayı kısmak
  // ikisini eşit boya getirip referanstaki görünümü bozuyordu. Hücreden %15
  // taşmaya izin var; referans tasarımda da parçalar birbirine değiyor.
  const cellLimit = Math.min(cells[0].w, cells[0].h) * 1.15;
  const fitFactor = Math.min(1, cellLimit / Math.max(faceWidth, 1));

  const assigned: Array<{ kind: "face" | "decoration"; cell: typeof cells[number] }> = [
    ...faceCells.map((cell) => ({ kind: "face" as const, cell })),
    ...decorCells.map((cell) => ({ kind: "decoration" as const, cell })),
  ];

  assigned.forEach(({ kind, cell }) => {
    if (!cell) return;

    const baseScale = kind === "face" ? config.faceScale : config.decorationScale;
    const jitter = 1 + (rnd() * 2 - 1) * config.sizeJitter;
    const width = Math.max(8, areaWidth * baseScale * fitFactor * jitter);
    const radius = width / 2;

    // Hücre parçadan büyükse kalan payda serbestçe kaydır; küçükse hücrede
    // ortala — aksi halde komşu parçalar üst üste biner.
    const slackX = Math.max(0, cell.w - width) / 2;
    const slackY = Math.max(0, cell.h - width) / 2;
    // Parça tam sınıra oturduğunda kesit kendi kenarında bittiği için baskıda
    // kırpılmış görünüyor; küçük bir kenar payı bunu önlüyor.
    const margin = Math.min(areaWidth, areaHeight) * 0.015;
    let x = clamp(cell.cx + (rnd() * 2 - 1) * slackX, radius + margin, areaWidth - radius - margin);
    let y = clamp(cell.cy + (rnd() * 2 - 1) * slackY, radius + margin, areaHeight - radius - margin);

    // Hücre yazıdan uzak olsa bile parça hücre içinde yazıya doğru kayabiliyor.
    // Hücre merkezini elemek bu yüzden yetmiyordu; kalan değme burada, parçayı
    // en kısa yönde dışarı iterek kapatılıyor.
    if (reserve) {
      // Yalnızca gerçekten yazıya giren parça itilir. Yazının çevresine ek
      // nefes payı bırakmak denendi ve geri tepti: itilen parçalar komşuların
      // üstüne düşüyordu. Sınır tahmini zaten ölçülenden geniş (kalın Georgia
      // 0.598 em/karakter, formül 0.63 kullanıyor), bu pay yeterli.
      const pushed = pushOutOfReserve(
        x, y, radius, reserve, areaWidth, areaHeight, margin,
      );
      x = pushed.x;
      y = pushed.y;
    }

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

/**
 * Yazı dikdörtgenine değen parçayı en yakın kenardan dışarı iter.
 * Alan sınırlarını aşacak yönler elenir; hiçbiri sığmazsa parça yerinde kalır.
 */
function pushOutOfReserve(
  x: number,
  y: number,
  radius: number,
  reserve: ReserveRect,
  areaWidth: number,
  areaHeight: number,
  margin: number,
): { x: number; y: number } {
  const clear = x + radius <= reserve.x0 || x - radius >= reserve.x1
    || y + radius <= reserve.y0 || y - radius >= reserve.y1;
  if (clear) return { x, y };

  const lo = radius + margin;
  const options = [
    { x: reserve.x0 - radius, y },
    { x: reserve.x1 + radius, y },
    { x, y: reserve.y0 - radius },
    { x, y: reserve.y1 + radius },
  ]
    .filter((p) => p.x >= lo && p.x <= areaWidth - lo && p.y >= lo && p.y <= areaHeight - lo)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));

  return options[0] ?? { x, y };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
