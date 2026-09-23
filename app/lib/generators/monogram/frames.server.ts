import type { MonogramFrame } from "./config";

/**
 * Monogram çerçeveleri — 2400x2400 tuvalde, merkez (1200,1200), tek renk.
 *
 * Her çerçeve iki şey döndürür: çizimi (`svg`, `fill`/`stroke` rengi çağıranın
 * `<g>`'sinden gelir) ve harflerin sığacağı iç alan (`fit`). Harf bloğu bu
 * alana orantılı büyütülüp ortalanır; alan biçimi (dikdörtgen, daire, baklava)
 * bloğun köşelerinin çizgiye değmemesi için ayrı hesaplanır.
 *
 * Çizgi kalınlıkları baskı sınırına göre: 2400 px ≈ 30 cm'de ince çizgi en az
 * ~4 px; burada en incesi 7 px.
 */

export const CANVAS = 2400;
export const CX = 1200;
export const CY = 1200;

export type FitArea =
  | { shape: "rect"; cx: number; cy: number; w: number; h: number }
  | { shape: "circle"; cx: number; cy: number; r: number }
  | { shape: "diamond"; cx: number; cy: number; d: number };

export interface FrameDrawing {
  svg: string;
  fit: FitArea;
}

const f = (n: number) => Number(n.toFixed(1));

/** Kalın dış + ince iç çizgi: klasik "çift çizgi" görünümü */
const OUTER = 16;
const INNER = 7;

function ring(r: number, w: number): string {
  return `<circle cx="${CX}" cy="${CY}" r="${f(r)}" fill="none" stroke-width="${w}"/>`;
}

/** Küçük baklava süs (ayraç, köşe) — dolu */
export function diamondDot(x: number, y: number, s: number, rot = 0): string {
  return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" stroke="none" d="M0 ${f(-s)} L${f(s * 0.62)} 0 L0 ${f(s)} L${f(-s * 0.62)} 0 Z"/>`;
}

// ── Defne dalı ─────────────────────────────────────────────────────────

/**
 * İki yandan yükselen defne dalı. Dal, merkezli bir çember yayı boyunca
 * alttan (iki dal altta çaprazlanır) yukarıya uzanır; tepe açık kalır.
 *
 * Yapraklar parametrik: yay boyunca eşit aralıklı, biri dışa biri içe bakan
 * ve yarım adım kaydırılmış yaprak çiftleri. Yaprak boyu dal ucuna doğru
 * küçülür, uçta dalın yönünde tek bir yaprakla biter. Sağ dal, solun ayna
 * görüntüsüdür — kusursuz simetri.
 */
function laurel(): string {
  const R = 1010;
  // Açılar tepeden saat yönünde derece; 180 = alt, 270 = sol
  const start = 166; // sağdan başlayıp alt ortayı geçerek çaprazlanır
  const end = 312; // sol üst — tepede ~96° açıklık
  const pt = (deg: number, r = R) => {
    const a = (deg * Math.PI) / 180;
    return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
  };
  // Büyüme yönü (açı artarken) birim teğet: d/da (sin a, -cos a) = (cos a, sin a)
  const tangentDeg = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return (Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI;
  };

  // Dal: uca doğru incelen bir şerit (sabit kalınlıkta çizgi cansız duruyor)
  const N = 60;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const deg = start + (end - start) * t;
    const w = 20 * (1 - t) + 7 * t;
    const a = pt(deg, R + w / 2);
    const b = pt(deg, R - w / 2);
    outer.push(`${f(a.x)} ${f(a.y)}`);
    inner.push(`${f(b.x)} ${f(b.y)}`);
  }
  const stem = `<path stroke="none" d="M${outer.join(" L")} L${inner.reverse().join(" L")} Z"/>`;

  // Yaprak: tabanı (0,0), ucu (L,0) olan badem; üst kenar hafif daha dolgun
  const leaf = (L: number) => {
    const w = L * 0.24;
    return `M0 0 C${f(L * 0.25)} ${f(-w * 1.25)} ${f(L * 0.7)} ${f(-w * 1.05)} ${f(L)} 0 `
      + `C${f(L * 0.7)} ${f(w * 0.85)} ${f(L * 0.25)} ${f(w * 0.95)} 0 0 Z`;
  };

  const leaves: string[] = [];
  const pairs = 12;
  const first = start + 20; // çaprazlanan alt kısım yapraksız kalsın
  const last = end - 10;
  const step = (last - first) / (pairs - 1);
  for (let k = 0; k < pairs; k++) {
    const t = k / (pairs - 1);
    const L = 225 * (1 - 0.45 * t);
    const tan = tangentDeg(first + step * k);
    // Dışa bakan yaprak; içe bakan yarım adım ileride (doğal, alternatif dizilim)
    const dOut = first + step * k;
    const dIn = dOut + step * 0.5;
    const pOut = pt(dOut, R + 4);
    const pIn = pt(dIn, R - 4);
    // Dal saat yönünde ilerliyor: sol tarafta "dış" teğetin solu (-), "iç" sağı (+)
    leaves.push(`<path stroke="none" transform="translate(${f(pOut.x)} ${f(pOut.y)}) rotate(${f(tan - 34)})" d="${leaf(L)}"/>`);
    if (k < pairs - 1) {
      leaves.push(`<path stroke="none" transform="translate(${f(pIn.x)} ${f(pIn.y)}) rotate(${f(tangentDeg(dIn) + 34)})" d="${leaf(L * 0.94)}"/>`);
    }
  }
  // Uç yaprağı: dalın yönünde
  const tip = pt(end, R);
  leaves.push(`<path stroke="none" transform="translate(${f(tip.x)} ${f(tip.y)}) rotate(${f(tangentDeg(end) - 6)})" d="${leaf(150)}"/>`);
  const branch = `${stem}${leaves.join("")}`;
  // Sağ dal: dikey eksene göre ayna
  return `<g>${branch}</g><g transform="translate(${CANVAS} 0) scale(-1 1)">${branch}</g>`;
}

// ── Arma ───────────────────────────────────────────────────────────────

/** Kalkan: tepesi ortada yükselen kıvrımlı, altı sivri */
function crestPath(inset: number): string {
  const l = 290 + inset;
  const r = CANVAS - 290 - inset;
  const top = 250 + inset;
  const peak = 130 + inset * 1.1;
  const shoulder = 1150;
  const bottom = 2290 - inset * 1.45;
  return `M${f(l)} ${f(top)} `
    + `C${f(l + 380)} ${f(top + 10)} ${f(CX - 260)} ${f(top - 20)} ${f(CX)} ${f(peak)} `
    + `C${f(CX + 260)} ${f(top - 20)} ${f(r - 380)} ${f(top + 10)} ${f(r)} ${f(top)} `
    + `L${f(r)} ${f(shoulder)} `
    + `C${f(r)} ${f(shoulder + 560)} ${f(CX + 420)} ${f(bottom - 170)} ${f(CX)} ${f(bottom)} `
    + `C${f(CX - 420)} ${f(bottom - 170)} ${f(l)} ${f(shoulder + 560)} ${f(l)} ${f(shoulder)} Z`;
}

// ── Kare ───────────────────────────────────────────────────────────────

/** Köşeleri içe oyuk (çeyrek daire) kare — art deco çerçeve */
function notchedSquare(m: number, notch: number): string {
  const a = m;
  const b = CANVAS - m;
  const n = notch;
  return `M${a + n} ${a} L${b - n} ${a} A${n} ${n} 0 0 0 ${b} ${a + n} `
    + `L${b} ${b - n} A${n} ${n} 0 0 0 ${b - n} ${b} `
    + `L${a + n} ${b} A${n} ${n} 0 0 0 ${a} ${b - n} `
    + `L${a} ${a + n} A${n} ${n} 0 0 0 ${a + n} ${a} Z`;
}

// ── Baklava ────────────────────────────────────────────────────────────

function diamondPath(d: number): string {
  return `M${CX} ${f(CY - d)} L${f(CX + d)} ${CY} L${CX} ${f(CY + d)} L${f(CX - d)} ${CY} Z`;
}

/**
 * Çerçeve çizimi ve iç alanı. `circle-text` yalnızca iki halkayı çizer; yay
 * yazıları metin gerektirdiği için index.server'da eklenir (bkz. RING_TEXT).
 */
export function drawFrame(frame: MonogramFrame): FrameDrawing {
  switch (frame) {
    case "circle":
      return {
        svg: ring(1180, OUTER) + ring(1128, INNER),
        fit: { shape: "circle", cx: CX, cy: CY, r: 960 },
      };
    case "circle-text":
      return {
        svg: ring(1180, OUTER) + ring(1150, INNER) + ring(RING_TEXT.inner, INNER) + ring(RING_TEXT.inner - 30, OUTER),
        fit: { shape: "circle", cx: CX, cy: CY, r: RING_TEXT.inner - 105 },
      };
    case "diamond": {
      const d = 1180;
      // Yan uçlarda küçük süs noktaları
      const dots = [
        diamondDot(CX - d + 130, CY, 26, 90),
        diamondDot(CX + d - 130, CY, 26, 90),
        diamondDot(CX, CY - d + 150, 26),
        diamondDot(CX, CY + d - 150, 26),
      ].join("");
      return {
        svg: `<path fill="none" stroke-width="${OUTER}" stroke-linejoin="miter" d="${diamondPath(d)}"/>`
          + `<path fill="none" stroke-width="${INNER}" stroke-linejoin="miter" d="${diamondPath(d - 62)}"/>` + dots,
        fit: { shape: "diamond", cx: CX, cy: CY, d: d - 300 },
      };
    }
    case "square": {
      const corners = [
        [60, 60], [CANVAS - 60, 60], [CANVAS - 60, CANVAS - 60], [60, CANVAS - 60],
      ].map(([x, y]) => `<circle stroke="none" cx="${x}" cy="${y}" r="34"/>`).join("");
      return {
        svg: `<path fill="none" stroke-width="${OUTER}" d="${notchedSquare(60, 150)}"/>`
          + `<path fill="none" stroke-width="${INNER}" d="${notchedSquare(118, 118)}"/>` + corners,
        fit: { shape: "rect", cx: CX, cy: CY, w: 1760, h: 1760 },
      };
    }
    case "laurel":
      return { svg: laurel(), fit: { shape: "circle", cx: CX, cy: CY + 10, r: 800 } };
    case "crest":
      return {
        svg: `<path fill="none" stroke-width="${OUTER}" stroke-linejoin="round" d="${crestPath(0)}"/>`
          + `<path fill="none" stroke-width="${INNER}" stroke-linejoin="round" d="${crestPath(55)}"/>`
          + diamondDot(CX, 330, 30),
        fit: { shape: "rect", cx: CX, cy: 1160, w: 1340, h: 1180 },
      };
    default:
      return { svg: "", fit: { shape: "rect", cx: CX, cy: CY, w: 2200, h: 2200 } };
  }
}

/** Yazılı dairenin yazı bandı: iç halka ile dış halka arası */
export const RING_TEXT = { inner: 880, outer: 1150, mid: 1015 };
