/**
 * Hazır fotoğraf alanı şekilleri — kalp, yıldız, kemer...
 *
 * Eskiden şekilli alan için tasarımcıdan delikli bir PNG istemek gerekiyordu
 * (`mask_url`). Buradaki şekiller alanın PİKSEL ölçüsüne göre SVG olarak
 * üretiliyor: baskı motoru aynı yolu tam çözünürlükte keser, müşteri sayfası
 * ve stüdyo CSS maskesi olarak gösterir. Üçü tek fonksiyonu kullandığı için
 * ekranda görülen şekil baskıdakiyle birebir aynı.
 *
 * Dosya hem sunucuda hem tarayıcıda çalışır; bağımlılığı yok.
 */

export type SlotShapeId = "oval" | "heart" | "star" | "hexagon" | "diamond" | "arch";

export const SLOT_SHAPES: Array<{ id: SlotShapeId; label: string }> = [
  { id: "oval", label: "Oval" },
  { id: "heart", label: "Kalp" },
  { id: "star", label: "Yıldız" },
  { id: "hexagon", label: "Altıgen" },
  { id: "diamond", label: "Elmas" },
  { id: "arch", label: "Kemer" },
];

export function isSlotShapeId(value: unknown): value is SlotShapeId {
  return SLOT_SHAPES.some((s) => s.id === value);
}

const f = (n: number) => Number(n.toFixed(2));

/** 5 köşeli yıldız; kutuyu dolduracak şekilde ölçeklenmiş (0–1) */
const STAR_POINTS = (() => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  return pts.map(([x, y]) => [(x - minX) / spanX, (y - minY) / spanY] as [number, number]);
})();

/**
 * Şeklin `w × h` piksellik kutudaki SVG yolu.
 *
 * Kalp, yıldız, altıgen ve elmas kutuya esner; mağaza sahibi oranı alanı
 * boyutlandırarak belirler. Kemerin üst yayı ise esnemez: yay yarıçapı
 * genişliğin yarısıdır, yoksa dikey bir kemerin tepesi yumurta gibi olur.
 */
export function shapePath(shape: SlotShapeId, w: number, h: number): string {
  switch (shape) {
    case "oval":
      return `M0 ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h / 2)} A${f(w / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)} Z`;
    case "heart": {
      const X = (v: number) => f((v / 100) * w);
      const Y = (v: number) => f((v / 100) * h);
      return `M${X(50)} ${Y(100)} C${X(50)} ${Y(100)} ${X(0)} ${Y(66)} ${X(0)} ${Y(31)} `
        + `C${X(0)} ${Y(13)} ${X(13)} ${Y(0)} ${X(29)} ${Y(0)} C${X(39)} ${Y(0)} ${X(46)} ${Y(5)} ${X(50)} ${Y(14)} `
        + `C${X(54)} ${Y(5)} ${X(61)} ${Y(0)} ${X(71)} ${Y(0)} C${X(87)} ${Y(0)} ${X(100)} ${Y(13)} ${X(100)} ${Y(31)} `
        + `C${X(100)} ${Y(66)} ${X(50)} ${Y(100)} ${X(50)} ${Y(100)} Z`;
    }
    case "star":
      return `M${STAR_POINTS.map(([x, y]) => `${f(x * w)} ${f(y * h)}`).join(" L")} Z`;
    case "hexagon":
      return `M${f(w * 0.25)} 0 L${f(w * 0.75)} 0 L${f(w)} ${f(h / 2)} L${f(w * 0.75)} ${f(h)} L${f(w * 0.25)} ${f(h)} L0 ${f(h / 2)} Z`;
    case "diamond":
      return `M${f(w / 2)} 0 L${f(w)} ${f(h / 2)} L${f(w / 2)} ${f(h)} L0 ${f(h / 2)} Z`;
    case "arch": {
      const r = Math.min(w / 2, h);
      return `M0 ${f(h)} L0 ${f(r)} A${f(w / 2)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} L${f(w)} ${f(h)} Z`;
    }
  }
}

/** Beyaz dolgulu, kutu boyunda SVG — sunucuda `dest-in` maskesi olarak kullanılır */
export function shapeSvg(shape: SlotShapeId, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="0 0 ${f(w)} ${f(h)}">`
    + `<path d="${shapePath(shape, w, h)}" fill="#fff"/></svg>`;
}

/**
 * CSS `mask-image` için adres. Yol alanın gerçek oranıyla (baskı pikseli)
 * üretiliyor; maske `100% 100%` ölçeklendiğinde ekranda da aynı şekil çıkar.
 */
export function shapeMaskUrl(shape: SlotShapeId, w: number, h: number): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(shapeSvg(shape, w, h))}")`;
}
