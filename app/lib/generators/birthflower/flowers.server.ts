/**
 * On iki ayın çiçekleri, kodla çizilmiş "tek çizgi botanik" illüstrasyonlar.
 *
 * Her çiçek, baş kısmının ortası (0,0) olacak ve sap aşağı (+y) inecek
 * şekilde, yaklaşık 100 birim yarıçaplı bir başla çizilir. Çıktı arkadan öne
 * sıralı parça listesidir; çizim katmanı (index.server) bu sırayla boyar:
 * her kapalı parça arkasındaki çizgileri örter, böylece üst üste binen taç
 * yapraklar çizgi yumağına dönmez.
 *
 * Parça rolleri:
 * - `fill`  kapalı biçim (taç yaprak, yaprak): konturu çizilir, renkli stilde dolar
 * - `stem`  açık, kalın çizgi (sap, yaprak sapı)
 * - `vein`  açık, ince iç çizgi (damar, kıvrım); siluette oyuk olur
 * - `dot`   küçük dolu nokta (başçık, polen)
 */
import {
  type Mat, Path, type Pt,
  angleOf, apply, bez, blade, chain, circle, ellipse, midrib, poly, rng, rot, sc, smooth, tr,
} from "./geometry.server";

export type PartRole = "fill" | "stem" | "vein" | "dot";

export interface Part {
  path: Path;
  role: PartRole;
  /** Renkli stilde dolgu rengi */
  color?: string;
}

export interface FlowerOptions {
  /** Baş ortasından sapın dibine uzaklık */
  stemLen: number;
  /** Sap dibinin yana kayması (birim); sapa hafif kavis verir */
  bend: number;
  /** Yaprakların sap boyunca bulunabileceği aralık (0 = baş, 1 = dip) */
  leafFrom: number;
  leafTo: number;
  /** Yaprakların hangi yandan başlayacağı: çiçekler yan yana tekdüze durmasın */
  flip: boolean;
  seed: number;
  /**
   * Dipten çıkan yaprakların (nergis, müge, kardelen) sap boyunca yeri.
   * Buket düzeninde saplar kurdelenin altında kaldığı için yukarı alınır.
   */
  basal?: number;
}

// ── Renkler ────────────────────────────────────────────────────────────
// Yumuşak, baskıda çamurlaşmayan tonlar; renkli stilde hafif şeffaf basılır.
const LEAF = "#86a676";
const LEAF_DARK = "#6d8f60";
const LEAF_BLUE = "#8fae9c";

// ── Yardımcılar ────────────────────────────────────────────────────────

const fill = (path: Path, color?: string): Part => ({ path, role: "fill", color });
const vein = (path: Path): Part => ({ path, role: "vein" });
const stemPart = (path: Path): Part => ({ path, role: "stem" });
const dot = (x: number, y: number, r: number, color?: string): Part => ({ path: circle(x, y, r), role: "dot", color });
const mapParts = (parts: Part[], m: Mat): Part[] => parts.map((p) => ({ ...p, path: p.path.map(m) }));

interface Stem {
  part: Part;
  /** Sap üzerinde t (0 = üst, 1 = dip) noktası ve yukarı bakan yön açısı */
  at: (t: number) => { p: Pt; up: number };
}

/** Baştan (top) dibe inen, hafif kavisli sap */
function makeStem(top: Pt, o: FlowerOptions, wiggle = 0.35): Stem {
  const bottom: Pt = [o.bend, o.stemLen];
  const len = bottom[1] - top[1];
  const s = o.flip ? -1 : 1;
  const c1: Pt = [top[0] + s * wiggle * 0.12 * len, top[1] + len * 0.35];
  const c2: Pt = [bottom[0] - s * wiggle * 0.1 * len + o.bend * 0.3, top[1] + len * 0.7];
  const path = new Path();
  path.moveTo(top).curveTo(c1, c2, bottom);
  return {
    part: stemPart(path),
    at: (t) => {
      const b = bez(top, c1, c2, bottom, t);
      return { p: b.p, up: angleOf([-b.tan[0], -b.tan[1]]) };
    },
  };
}

/**
 * Yaprak parçalarını (yukarı bakan, dibi 0,0) sapın t noktasına, sapın
 * yukarı yönünden `angle` derece açılarak yerleştirir.
 */
function attach(stem: Stem, t: number, angle: number, parts: Part[]): Part[] {
  const { p, up } = stem.at(t);
  return mapParts(parts, chain(tr(p[0], p[1]), rot(up + 90 + angle)));
}

/** Klasik mızrak yaprak + orta damar */
function lanceLeaf(len: number, width: number, bend: number, color = LEAF, opts: Partial<Parameters<typeof blade>[0]> = {}): Part[] {
  return [
    fill(blade({ len, width, bend, ...opts }), color),
    vein(midrib(len, bend, 0.08, 0.78)),
  ];
}

/** Tırtıklı kenar (gül, kasımpatı yaprakları) */
const serrate = (teeth: number, depth: number) => (t: number) => {
  if (t < 0.12 || t > 0.94) return 0;
  const f = (t * teeth) % 1;
  return -depth * f;
};

/** Yaprak çiftleri / tekler için sap boyunca konumlar */
function leafSlots(o: FlowerOptions, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(o.leafFrom + ((o.leafTo - o.leafFrom) * (i + 0.5)) / count);
  }
  return out;
}

/** Açıyla verilen yöne (0 = yukarı, saat yönü) bakan taç yaprak dönüşümü */
const petalAt = (x: number, y: number, deg: number): Mat => chain(tr(x, y), rot(deg));

// ── 1 Ocak — Karanfil ─────────────────────────────────────────────────

/** Saçaklı yelpaze: karanfil taç katmanı (pivot noktasından açılır) */
function fringeFan(pivot: Pt, a0: number, a1: number, r: (a: number) => number, teeth: number, amp: number, seed: number): Path {
  const rand = rng(seed);
  const pts: Pt[] = [pivot];
  const steps = teeth * 2;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rad = (a * Math.PI) / 180;
    const rr = r(a) - (i % 2 === 1 ? amp * (0.6 + rand() * 0.7) : rand() * amp * 0.3);
    pts.push([pivot[0] + Math.sin(rad) * rr, pivot[1] - Math.cos(rad) * rr]);
  }
  return poly(pts, true);
}

function carnation(o: FlowerOptions): Part[] {
  const pink = "#ec9bb0", deep = "#d9738f";
  const stem = makeStem([0, 98], o, 0.25);
  const out: Part[] = [stem.part];
  // Dar, çimen gibi karşılıklı yaprak çiftleri
  for (const t of leafSlots(o, 2)) {
    for (const s of [-1, 1]) out.push(...attach(stem, t, s * 34, lanceLeaf(115, 9, s * 0.28, LEAF_BLUE)));
    const { p } = stem.at(t);
    out.push(fill(ellipse(p[0], p[1], 7, 5), LEAF_BLUE));
  }
  const s = o.seed;
  const wave = (base: number, k: number) => (a: number) => base + k * Math.cos((a * Math.PI) / 50);
  out.push(fill(fringeFan([-4, 22], -116, -52, wave(66, 4), 9, 9, s + 1), deep));
  out.push(fill(fringeFan([4, 22], 52, 116, wave(66, 4), 9, 9, s + 2), deep));
  out.push(fill(fringeFan([0, 18], -66, 66, wave(82, 7), 21, 10, s + 3), pink));
  out.push(vein(smooth([[-6, 10], [-18, -20], [-26, -52]])));
  out.push(vein(smooth([[6, 10], [20, -22], [30, -50]])));
  out.push(fill(fringeFan([0, 24], -44, 44, wave(58, 3), 14, 9, s + 4), pink));
  out.push(vein(smooth([[0, 14], [-2, -14], [-4, -28]])));
  out.push(fill(fringeFan([3, 28], -30, 34, wave(36, 2), 8, 7, s + 5), deep));
  // Tüp biçimli çanak ve sivri çanak yaprak uçları
  const calyx: Pt[] = [
    [-9, 100], [-13, 72], [-16, 44], [-17, 24], [-13, 4], [-7, 20], [0, -1], [7, 20], [13, 4], [17, 24], [16, 44], [13, 72], [9, 100],
  ];
  out.push(fill(poly(calyx, true), LEAF_BLUE));
  out.push(vein(smooth([[-5, 30], [-5, 62], [-4, 92]])));
  out.push(vein(smooth([[5, 30], [5, 62], [4, 92]])));
  for (const sd of [-1, 1]) {
    out.push(...mapParts([fill(blade({ len: 26, width: 6, bend: sd * 0.4 }), LEAF_BLUE)], petalAt(sd * 5, 104, sd * 40)));
  }
  return out;
}

// ── 2 Şubat — Menekşe ─────────────────────────────────────────────────

const roundPetal = (t: number) => Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, t)))) * (0.55 + 0.45 * t);

function heartLeaf(len: number, w: number): Path {
  const pts: Pt[] = [
    [0, -4], [w * 0.45, 6], [w * 0.95, -len * 0.12], [w, -len * 0.4], [w * 0.7, -len * 0.72], [w * 0.2, -len * 0.95], [0, -len],
    [-w * 0.2, -len * 0.95], [-w * 0.7, -len * 0.72], [-w, -len * 0.4], [-w * 0.95, -len * 0.12], [-w * 0.45, 6],
  ];
  return smooth(pts, true);
}

function violet(o: FlowerOptions): Part[] {
  const purple = "#9b7fd4", deep = "#7b5cb8", light = "#b9a3e6";
  const stem = makeStem([0, 10], o, 0.3);
  const out: Part[] = [stem.part];
  const slots = leafSlots(o, 2);
  slots.forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    const petiole = new Path();
    petiole.moveTo([0, 0]).curveTo([side * 10, -12], [side * 22, -24], [side * 30, -34]);
    const leafParts: Part[] = [
      stemPart(petiole),
      ...mapParts([fill(heartLeaf(64, 36), LEAF), vein(smooth([[0, -2], [0, -30], [0, -52]]))], petalAt(side * 30, -34, side * 35)),
    ];
    out.push(...attach(stem, t, 0, leafParts));
  });
  // Arka iki üst yaprak, iki yan yaprak, önde damarlı alt yaprak
  for (const sd of [-1, 1]) {
    out.push(...mapParts([fill(blade({ len: 64, width: 30, profile: roundPetal }), deep)], petalAt(sd * 6, -4, sd * 28)));
  }
  for (const sd of [-1, 1]) {
    out.push(...mapParts([
      fill(blade({ len: 56, width: 25, profile: roundPetal, bend: sd * 0.05 }), purple),
      vein(smooth([[0, -8], [0, -20]])),
      vein(smooth([[-5, -8], [-6, -17]])),
      vein(smooth([[5, -8], [6, -17]])),
    ], petalAt(sd * 4, 2, sd * 100)));
  }
  out.push(...mapParts([
    fill(blade({ len: 60, width: 32, profile: roundPetal, notch: 5 }), light),
    vein(smooth([[0, -8], [0, -30]])),
    vein(smooth([[-6, -8], [-10, -26]])),
    vein(smooth([[6, -8], [10, -26]])),
    vein(smooth([[-10, -6], [-18, -18]])),
    vein(smooth([[10, -6], [18, -18]])),
  ], petalAt(0, 4, 180)));
  out.push(fill(circle(0, 0, 9), "#f2c94c"));
  out.push(dot(0, 1, 3.5));
  return out;
}

// ── 3 Mart — Nergis ───────────────────────────────────────────────────

function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const ellipsePts = (cx: number, cy: number, rx: number, ry: number, n = 24): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Pt;
  });

function daffodil(o: FlowerOptions): Part[] {
  const yellow = "#f7dc6a", deep = "#f0b441", orange = "#e98f2e";
  const stem = makeStem([-6, 30], o, 0.2);
  const out: Part[] = [stem.part];
  // Dipten çıkan iki uzun kayış yaprak
  const leafLen = Math.max(120, ((o.basal ?? 1) * o.stemLen - 60) * 0.62);
  const base = Math.min(0.97, o.basal ?? 0.97);
  const sd = o.flip ? -1 : 1;
  out.push(...attach(stem, base, sd * 10, [fill(blade({ len: leafLen, width: 11, bend: sd * 0.14, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.52 + t * 0.48)), 0.6) }), LEAF)]));
  out.push(...attach(stem, base, -sd * 16, [fill(blade({ len: leafLen * 0.82, width: 10, bend: -sd * 0.2, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.52 + t * 0.48)), 0.6) }), LEAF)]));
  // Kuru zarlı kın: sapın başa bağlandığı yerde
  out.push(...mapParts([fill(blade({ len: 30, width: 7, bend: 0.3 }), "#d8c9a3")], petalAt(-8, 50, -30)));

  // Taç yapraklar düzlemi hafif eğik: üst taraf geriye yatık
  const plane = chain(rot(-12), sc(1, 0.8));
  const petalShape = (len: number, w: number) =>
    blade({ len, width: w, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.75) * (1 - 0.25 * t) });
  const petals = (angles: number[], len: number, w: number, color: string) => {
    for (const a of angles) {
      out.push(...mapParts([fill(petalShape(len, w), color), vein(midrib(len, 0, 0.3, 0.8))], chain(plane, rot(a))));
    }
  };
  petals([30, 150, 270], 80, 30, yellow);
  petals([90, 210, 330], 74, 28, yellow);

  // Trompet: bize doğru uzanan ve ağzı kıvrımlı bir huni
  const d: Pt = [10, 36];
  const baseE = ellipsePts(0, 0, 19, 14);
  const mouth = (k = 1, n = 40) =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = k * (1 + 0.07 * Math.sin(a * 9));
      return [d[0] + Math.cos(a) * 32 * r, d[1] + Math.sin(a) * 22 * r] as Pt;
    });
  out.push(fill(smooth(convexHull([...baseE, ...mouth(1, 24)]), true), deep));
  out.push(vein(smooth([[-10, 5], [-15, 20], [-21, 33]])));
  out.push(vein(smooth([[12, 6], [22, 20], [32, 32]])));
  out.push(fill(smooth(mouth(), true), deep));
  out.push(fill(ellipse(d[0], d[1] - 1, 18, 11.5), orange));
  out.push(dot(d[0] - 1, d[1] - 2, 3.5));
  return out;
}

// ── 4 Nisan — Papatya ─────────────────────────────────────────────────

const strapPetal = (t: number) => Math.pow(Math.min(1, t * 3.2), 0.6) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 5)));

function daisyHead(r: number, count: number, width: number, center: number, seed: number, centerColor = "#f2c230"): Part[] {
  const out: Part[] = [];
  const rand = rng(seed);
  const layer = (offset: number, len: number, color: string) => {
    for (let i = 0; i < count; i++) {
      const a = offset + (360 * i) / count + (rand() - 0.5) * 5;
      const l = len * (0.93 + rand() * 0.12);
      out.push(fill(blade({ len: l, width, profile: strapPetal, notch: width * 0.25, bend: (rand() - 0.5) * 0.08 }).map(petalAt(0, 0, a)), color));
    }
  };
  layer(180 / count, r * 0.97, "#fbfbf7");
  layer(0, r, "#ffffff");
  out.push(fill(circle(0, 0, center), centerColor));
  // Göbek: ayçiçeği dizilimiyle noktalar
  const n = Math.round(center * 0.9);
  for (let k = 1; k <= n; k++) {
    const rr = center * 0.78 * Math.sqrt(k / n);
    const a = k * 2.39996;
    out.push(dot(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(2.4, center * 0.1)));
  }
  return out;
}

function daisy(o: FlowerOptions): Part[] {
  const stem = makeStem([0, 20], o, 0.3);
  const out: Part[] = [stem.part];
  const slots = leafSlots(o, 2);
  slots.forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    // Kaşık biçimli, birkaç dişli papatya yaprağı
    out.push(...attach(stem, t, side * 42, lanceLeaf(70, 15, side * 0.2, LEAF, {
      profile: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7) * (0.35 + 0.75 * u),
      edge: (u) => (u > 0.45 && u < 0.95 ? 0.22 * Math.abs(Math.sin(u * Math.PI * 5)) - 0.1 : 0),
    })));
  });
  out.push(...daisyHead(78, 13, 12, 25, o.seed + 7));
  return out;
}

// ── 5 Mayıs — İnci çiçeği (müge) ──────────────────────────────────────

function bell(size: number): Path {
  const s = size;
  const pts: Pt[] = [
    [0, -1], [10, 1], [16.5, 8], [18.5, 17], [18, 24], [22.5, 30], [13, 28], [6.5, 32.5], [0, 29],
    [-6.5, 32.5], [-13, 28], [-22.5, 30], [-18, 24], [-18.5, 17], [-16.5, 8], [-10, 1],
  ];
  return smooth(pts.map(([x, y]) => [x * s, y * s] as Pt), true, 0.85);
}

function lilyOfTheValley(o: FlowerOptions): Part[] {
  const white = "#fbfbf5";
  const sd = o.flip ? -1 : 1;
  const out: Part[] = [];
  // Sap dipten dik yükselir, tepede yana doğru kavis yapar; çanlar kavisten sarkar
  const a0: Pt = [o.bend - sd * 20, o.stemLen];
  const mid: Pt = [-sd * 42, 30];
  const b1: Pt = [-sd * 48, -92], b2: Pt = [sd * 96, -128], b3: Pt = [sd * 160, -30];
  const stemPath = new Path();
  stemPath.moveTo(a0).curveTo([a0[0], a0[1] - (a0[1] - mid[1]) * 0.5], [mid[0], mid[1] + 40], mid);
  stemPath.curveTo(b1, b2, b3);
  out.push(stemPart(stemPath));
  // Çiftlenen iki geniş yaprak: sapın dibinden, sapı sarar
  const leafLen = Math.max(120, (o.basal ?? 1) * o.stemLen * 0.58);
  const c1: Pt = [a0[0], a0[1] - (a0[1] - mid[1]) * 0.5], c2: Pt = [mid[0], mid[1] + 40];
  const tb = Math.max(0, Math.min(0.6, 1 - (o.basal ?? 1)) * o.stemLen / (a0[1] - mid[1]));
  const leafT = bez(a0, c1, c2, mid, Math.min(0.7, tb + 0.01)).p;
  for (const s of [-1, 1]) {
    const len = s === sd ? leafLen : leafLen * 0.84;
    const bend = s * 0.16;
    const parts: Part[] = [
      fill(blade({ len, width: len * 0.15, bend, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.9) * (1 - 0.1 * t) }), LEAF_DARK),
      vein(midrib(len, bend, 0.12, 0.85)),
    ];
    out.push(...mapParts(parts, petalAt(leafT[0], leafT[1], s * 14)));
  }
  // Çanlar kavis boyunca dizilir: dipte açmış büyükler, uca doğru tomurcuk
  const sizes = [1.12, 1.02, 0.92, 0.95, 0.8];
  const ts = [0.3, 0.47, 0.63, 0.77, 0.9];
  ts.forEach((t, i) => {
    const { p } = bez(mid, b1, b2, b3, t);
    const s = sizes[i];
    const top: Pt = [p[0] + sd * 4 * s, p[1] + 28 * s];
    const ped = new Path();
    ped.moveTo(p).curveTo([p[0] + sd * 10 * s, p[1] + 4], [top[0] + sd * 1, top[1] - 14 * s], top);
    out.push(vein(ped));
    if (i >= 3) {
      // Tomurcuk: ucu aşağı bakan damla
      const bud: Pt[] = [[0, 0], [9, 5], [11, 14], [6, 22], [0, 25], [-6, 22], [-11, 14], [-9, 5]];
      out.push(fill(smooth(bud.map(([x, y]) => [top[0] + x * s, top[1] + y * s] as Pt), true), white));
    } else {
      out.push(fill(bell(s).map(chain(tr(top[0], top[1]), rot(-sd * 5))), white));
    }
  });
  return out;
}

// ── 6 Haziran — Gül ───────────────────────────────────────────────────

function roseLeafCluster(color: string): Part[] {
  const leaflet = (len: number, w: number) => lanceLeaf(len, w, 0, color, {
    profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.75) * (1 - 0.2 * t),
    edge: serrate(9, 0.14),
    samples: 26,
  });
  const rachis = new Path();
  rachis.moveTo([0, 0]).curveTo([0, -20], [2, -40], [4, -58]);
  return [
    stemPart(rachis),
    ...mapParts(leaflet(34, 13), petalAt(1, -30, -62)),
    ...mapParts(leaflet(34, 13), petalAt(2, -34, 58)),
    ...mapParts(leaflet(44, 16), petalAt(4, -56, 4)),
  ];
}

function rose(o: FlowerOptions): Part[] {
  const pink = "#e8798f", deep = "#cf5673", light = "#f2a3b3";
  const stem = makeStem([0, 55], o, 0.25);
  const out: Part[] = [stem.part];
  // Dikenler
  for (const [t, s] of [[0.3, 1], [0.55, -1], [0.78, 1]] as Array<[number, number]>) {
    const { p, up } = stem.at(t);
    out.push(fill(poly([[-5, 0], [s * 3, -12 + 0], [5, 0]].map((q) => apply(chain(tr(p[0], p[1]), rot(up + 90 + s * 90)), q as Pt)), true), LEAF_DARK));
  }
  leafSlots(o, 2).forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    out.push(...attach(stem, t, side * 48, roseLeafCluster(LEAF_DARK)));
  });
  // Çanak yapraklar: başın altında aşağı kıvrılan ince uçlar
  for (const [a, l] of [[150, 34], [210, 34], [180, 28]] as Array<[number, number]>) {
    out.push(fill(blade({ len: l, width: 6.5, bend: a > 180 ? 0.35 : a < 180 ? -0.35 : 0 }).map(petalAt(0, 46, a)), LEAF_DARK));
  }
  // Arka dış yapraklar
  out.push(fill(smooth([[-4, 44], [-50, 36], [-80, 6], [-80, -30], [-60, -56], [-30, -64], [-6, -52], [-2, -10]], true), deep));
  out.push(fill(smooth([[4, 44], [52, 34], [82, 2], [80, -34], [58, -60], [26, -66], [6, -54], [2, -10]], true), deep));
  // Tomurcuk gövdesi ve sarmal
  out.push(fill(smooth([[-40, -38], [-26, -58], [2, -64], [30, -56], [42, -38], [36, -12], [0, 6], [-36, -12]], true), pink));
  const spiral: Pt[] = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 3.4 + 0.6;
    const r = 2 + 2.7 * (a - 0.6);
    spiral.push([2 + Math.cos(a) * r, -40 + Math.sin(a) * r * 0.5]);
  }
  out.push(vein(smooth(spiral)));
  // İç sarmalayan yapraklar: tomurcuğu yandan kucaklar
  out.push(fill(smooth([[-52, -30], [-58, 4], [-38, 30], [-8, 38], [-4, 16], [-24, -4], [-40, -22]], true), pink));
  out.push(fill(smooth([[54, -32], [60, 2], [40, 30], [8, 38], [4, 14], [26, -6], [42, -24]], true), pink));
  // Ön büyük yaprak: kıvrık dudaklı çanak
  out.push(fill(smooth([[-66, -4], [-58, 30], [-28, 50], [4, 52], [34, 48], [62, 26], [66, -6], [40, 8], [10, 14], [-22, 12], [-46, 4]], true), light));
  out.push(vein(smooth([[-58, 6], [-30, 20], [4, 24], [36, 20], [60, 4]])));
  out.push(vein(smooth([[-6, 30], [-2, 42]])));
  return out;
}

// ── 7 Temmuz — Hezaren (hasekiküpesi) ─────────────────────────────────

function larkspurFloret(s: number, color: string, deep: string, sd: number): Part[] {
  const out: Part[] = [];
  // Mahmuz: arkaya ve yukarı kıvrılan boynuz
  const spur = new Path();
  spur.moveTo([0, 0]).curveTo([-sd * 14 * s, -6 * s], [-sd * 28 * s, -16 * s], [-sd * 32 * s, -34 * s]);
  out.push(stemPart(spur));
  for (let i = 0; i < 5; i++) {
    const a = i * 72 + 18;
    out.push(fill(blade({ len: 23 * s, width: 10 * s, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.7) * (0.7 + 0.3 * t) }).map(petalAt(0, 0, a)), i % 2 ? color : deep));
  }
  out.push(fill(circle(0, 0, 5.5 * s), "#f4f1ff"));
  out.push(dot(0, 0, 2.6));
  return out;
}

function larkspur(o: FlowerOptions): Part[] {
  const blue = "#7d8fe0", deep = "#6272c9";
  const sd = o.flip ? -1 : 1;
  const stem = makeStem([0, -150], { ...o }, 0.15);
  const out: Part[] = [stem.part];
  // Parmak parmak derin yarılmış yapraklar
  leafSlots({ ...o, leafFrom: Math.max(o.leafFrom, 0.52), leafTo: Math.max(o.leafTo, 0.6) }, 2).forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    const fingers: Part[] = [];
    for (const [a, l] of [[-34, 48], [-12, 60], [12, 58], [34, 44]] as Array<[number, number]>) {
      fingers.push(fill(blade({ len: l, width: 7.5, bend: a / 120 }).map(rot(a)), LEAF));
    }
    const petiole = new Path();
    petiole.moveTo([0, 0]).curveTo([0, -10], [0, -18], [0, -26]);
    out.push(...attach(stem, t, side * 48, [stemPart(petiole), ...mapParts(fingers, tr(0, -26))]));
  });
  // Başak: aşağıda açmış çiçekler, yukarıda tomurcuklar
  const stemLenAll = o.stemLen + 150;
  const tOf = (y: number) => (y + 150) / stemLenAll;
  // Tepe tomurcukları
  for (const [y, r, x] of [[-160, 5.5, 0], [-146, 7.5, -7], [-130, 8.5, 8]] as Array<[number, number, number]>) {
    const { p } = stem.at(tOf(y));
    out.push(fill(ellipse(p[0] + x, p[1], r * 0.85, r * 1.25), deep));
  }
  const ys = [-112, -92, -70, -46, -20, 8, 38, 70];
  ys.forEach((y, i) => {
    const s = 0.62 + (0.6 * i) / (ys.length - 1);
    const side = (i % 2 ? 1 : -1) * sd;
    const { p } = stem.at(tOf(y));
    const c: Pt = [p[0] + side * 17 * s, p[1] + 2];
    out.push(stemPart(poly([p, c])));
    out.push(...mapParts(larkspurFloret(s, blue, deep, side), chain(tr(c[0], c[1]), rot(side * 12))));
  });
  return out;
}

// ── 8 Ağustos — Gelincik ──────────────────────────────────────────────

function wavy(pts: Pt[], amp: number, freq: number, from = 0, to = 1): Pt[] {
  // Kenar noktalarına hafif dalga: gelincik yaprağının kâğıt gibi kırışıklığı
  return pts.map((p, i) => {
    const u = i / (pts.length - 1);
    if (u < from || u > to) return p;
    const k = Math.sin(u * Math.PI * freq) * amp;
    return [p[0], p[1] + k] as Pt;
  });
}

function poppy(o: FlowerOptions): Part[] {
  const red = "#e8574a", deep = "#cf3f35";
  const stem = makeStem([0, 40], o, 0.4);
  const out: Part[] = [stem.part];
  // Tüylü sap: kısa eğik çizgiler
  for (let i = 0; i < 12; i++) {
    const t = 0.06 + i * 0.07;
    if (t > 0.92) break;
    const { p, up } = stem.at(t);
    const side = i % 2 ? 1 : -1;
    const m = chain(tr(p[0], p[1]), rot(up + 90 + side * 60));
    out.push(vein(poly([apply(m, [0, -2]), apply(m, [0, -11])])));
  }
  leafSlots(o, 1).forEach((t) => {
    const side = o.flip ? -1 : 1;
    // Derin dişli, tüylü görünümlü yaprak
    out.push(...attach(stem, t + 0.08, side * 38, [
      fill(blade({
        len: 92, width: 22, bend: side * 0.2, jagged: true, samples: 22,
        edge: (u, s) => (u > 0.12 && u < 0.95 ? (((u * 5.5 + (s > 0 ? 0 : 0.5)) % 1) - 0.5) * 0.9 : 0),
      }), LEAF),
      vein(midrib(92, side * 0.2, 0.08, 0.85)),
    ]));
  });
  // Arka yapraklar: kâğıt gibi dalgalı üst kenar
  out.push(fill(smooth(wavy([[-6, 36], [-52, 28], [-86, -4], [-90, -40], [-68, -70], [-34, -80], [-6, -70], [4, -40]], 4, 5, 0.3, 0.9), true), deep));
  out.push(fill(smooth(wavy([[6, 36], [54, 28], [88, -6], [90, -42], [66, -72], [30, -80], [6, -68], [-4, -40]], 4, 5, 0.3, 0.9), true), deep));
  // Tohum kapsülü ve etrafındaki koyu erkek organlar
  out.push(fill(ellipse(0, -44, 30, 12), "#3b3036"));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push(dot(Math.cos(a) * 25, -44 + Math.sin(a) * 9, 3.2));
  }
  out.push(fill(ellipse(0, -48, 14, 8), "#9fae7c"));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    out.push(vein(poly([[0, -49], [Math.cos(a) * 12, -49 + Math.sin(a) * 6.5]])));
  }
  // Ön iki yaprak: çanağı oluşturur, kırışık damarlı
  out.push(fill(smooth(wavy([[14, 42], [-40, 38], [-72, 14], [-80, -18], [-66, -36], [-40, -32], [-18, -38], [10, -30], [22, 0]], 3, 4, 0.4, 0.8), true), red));
  out.push(fill(smooth(wavy([[6, 44], [42, 38], [72, 12], [80, -20], [64, -36], [38, -30], [20, -34], [6, -26], [12, 8]], 3, 4, 0.4, 0.8), true), red));
  out.push(vein(smooth([[-10, 30], [-30, 6], [-44, -20]])));
  out.push(vein(smooth([[12, 30], [32, 4], [46, -20]])));
  out.push(vein(smooth([[-2, 34], [-6, 10], [-12, -14]])));
  return out;
}

// ── 9 Eylül — Yıldız çiçeği (aster) ───────────────────────────────────

function asterHead(r: number, seed: number, count = 14): Part[] {
  const lav = "#b39be2", deep = "#9a80d2";
  const out: Part[] = [];
  const rand = rng(seed);
  const w = Math.max(7, r * 0.13);
  for (const [off, lenK, color] of [[180 / count, 0.95, deep], [0, 1, lav]] as Array<[number, number, string]>) {
    for (let i = 0; i < count; i++) {
      const a = off + (360 * i) / count + (rand() - 0.5) * 6;
      out.push(fill(blade({
        len: r * lenK * (0.9 + rand() * 0.15), width: w,
        profile: (t) => Math.pow(Math.min(1, t * 3), 0.6) * Math.pow(Math.max(0, 1 - t), 0.45),
        bend: (rand() - 0.5) * 0.12,
      }).map(petalAt(0, 0, a)), color));
    }
  }
  const c = r * 0.26;
  out.push(fill(circle(0, 0, c), "#f4c542"));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    out.push(dot(Math.cos(a) * c * 0.55, Math.sin(a) * c * 0.55, 2.4));
  }
  out.push(dot(0, 0, 2.4));
  return out;
}

function aster(o: FlowerOptions): Part[] {
  const sd = o.flip ? -1 : 1;
  const stem = makeStem([0, 12], o, 0.25);
  const out: Part[] = [stem.part];
  leafSlots(o, 2).forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    out.push(...attach(stem, t, side * 38, lanceLeaf(64, 11, side * 0.15, LEAF)));
  });
  // Yan dallarda iki küçük baş: aster kümeli açar
  const branch = (t: number, side: number, end: Pt, r: number, seed: number) => {
    const { p } = stem.at(t);
    const path = new Path();
    path.moveTo(p).curveTo([p[0] + side * 12, p[1] - 20], [end[0] - side * 4, end[1] + 30], end);
    out.push(stemPart(path));
    out.push(...mapParts(asterHead(r, seed, 11), chain(tr(end[0], end[1]), sc(1, 0.9))));
  };
  const tBranch = Math.min(0.28, 170 / o.stemLen);
  branch(tBranch, sd, [sd * 78, 58], 38, o.seed + 11);
  branch(tBranch * 0.72, -sd, [-sd * 70, 88], 32, o.seed + 13);
  out.push(...mapParts(asterHead(62, o.seed + 5), sc(1, 0.94)));
  return out;
}

// ── 10 Ekim — Kadife çiçeği ───────────────────────────────────────────

function frillPetal(len: number, w: number, lobes: number): Path {
  const pts: Pt[] = [[0, 0], [w * 0.55, -len * 0.25], [w * 0.95, -len * 0.55]];
  const cy = -len + w;
  for (let i = 0; i <= lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI; // sağdan sola, üstten
    const rr = w * (i % 2 === 0 ? 1.05 : 0.84);
    pts.push([Math.cos(a) * rr, cy - Math.sin(a) * rr]);
  }
  pts.push([-w * 0.95, -len * 0.55], [-w * 0.55, -len * 0.25]);
  return smooth(pts, true, 0.9);
}

/**
 * Kubbe biçimli çok katlı çiçek başı (kadife, kasımpatı): dıştan içe halkalar,
 * her halka hafif yukarı kayar; her halkada arkadaki yapraklar önce çizilir.
 */
function domeHead(rows: Array<{ n: number; ring: number; y: number; petal: (i: number) => Path; color: string }>, squash: number, seed: number): Part[] {
  const out: Part[] = [];
  const rand = rng(seed);
  rows.forEach((row, ri) => {
    const items: Array<{ z: number; part: Part }> = [];
    const off = rand() * 360;
    for (let i = 0; i < row.n; i++) {
      const a = off + (360 * i) / row.n + (rand() - 0.5) * 8;
      const rad = (a * Math.PI) / 180;
      const bx = Math.sin(rad) * row.ring, by = -Math.cos(rad) * row.ring;
      // Düzlemde radyal yaprak, sonra perspektif basıklığı
      const m = chain(tr(0, row.y), sc(1, squash), tr(bx, by), rot(a));
      items.push({ z: -Math.cos(rad) + ri * 3, part: fill(row.petal(i).map(m), row.color) });
    }
    items.sort((p, q) => p.z - q.z);
    out.push(...items.map((x) => x.part));
  });
  return out;
}

function pinnateLeaf(len: number, pairs: number, leaflet: number, color: string): Part[] {
  const rachis = new Path();
  rachis.moveTo([0, 0]).curveTo([0, -len * 0.3], [2, -len * 0.7], [3, -len]);
  const out: Part[] = [stemPart(rachis)];
  for (let i = 0; i < pairs; i++) {
    const y = -len * (0.3 + (0.62 * i) / pairs);
    const l = leaflet * (1 - i * 0.08);
    for (const s of [-1, 1]) {
      out.push(fill(blade({ len: l, width: 8.5, edge: serrate(5, 0.18), samples: 18 }).map(petalAt(1, y, s * 58)), color));
    }
  }
  out.push(fill(blade({ len: leaflet * 0.8, width: 8.5, edge: serrate(5, 0.18), samples: 18 }).map(petalAt(3, -len, 0)), color));
  return out;
}

function marigold(o: FlowerOptions): Part[] {
  const orange = "#f5a42a", deep = "#e97f1f", gold = "#f8c13e";
  const stem = makeStem([0, 30], o, 0.25);
  const out: Part[] = [stem.part];
  leafSlots(o, 2).forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    out.push(...attach(stem, t, side * 44, pinnateLeaf(84, 4, 28, LEAF_DARK)));
  });
  // Çanak: başın altında yeşil kupa
  out.push(fill(smooth([[-24, 20], [-18, 44], [0, 52], [18, 44], [24, 20]], true), LEAF_DARK));
  out.push(...domeHead([
    { n: 11, ring: 30, y: 6, petal: () => frillPetal(54, 25, 3), color: deep },
    { n: 9, ring: 20, y: 0, petal: () => frillPetal(44, 22, 3), color: orange },
    { n: 7, ring: 10, y: -5, petal: () => frillPetal(34, 18, 3), color: gold },
  ], 0.9, o.seed + 3));
  out.push(fill(circle(0, -6, 13), deep));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4;
    out.push(dot(Math.cos(a) * 6.5, -6 + Math.sin(a) * 6.5, 2.6));
  }
  return out;
}

// ── 11 Kasım — Kasımpatı ──────────────────────────────────────────────

function chrysanthemum(o: FlowerOptions): Part[] {
  const bronze = "#e69a4a", deep = "#cf7a34", light = "#f2b865";
  const stem = makeStem([0, 30], o, 0.25);
  const out: Part[] = [stem.part];
  leafSlots(o, 2).forEach((t, i) => {
    const side = (i % 2 === 0) !== o.flip ? 1 : -1;
    // Meşe yaprağına benzer loplu yaprak
    out.push(...attach(stem, t, side * 44, lanceLeaf(72, 26, side * 0.12, LEAF_DARK, {
      samples: 30,
      profile: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u)), 0.7),
      edge: (u) => (u > 0.1 && u < 0.95 ? 0.32 * Math.cos(u * Math.PI * 7) - 0.1 : 0),
    })));
  });
  const spoon = (len: number, w: number) => (i: number) =>
    blade({ len, width: w, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.55) * (0.6 + 0.5 * t) * (t > 0.85 ? 1 - (t - 0.85) * 2.5 : 1), bend: i % 2 ? 0.08 : -0.08 });
  out.push(...domeHead([
    { n: 18, ring: 30, y: 10, petal: spoon(58, 10), color: deep },
    { n: 16, ring: 24, y: 0, petal: spoon(50, 10), color: bronze },
    { n: 14, ring: 17, y: -10, petal: spoon(40, 9.5), color: bronze },
    { n: 11, ring: 11, y: -20, petal: spoon(30, 9), color: light },
    { n: 7, ring: 4, y: -28, petal: spoon(20, 8.5), color: light },
  ], 0.7, o.seed + 9));
  return out;
}

// ── 12 Aralık — Kardelen ──────────────────────────────────────────────

function snowdrop(o: FlowerOptions): Part[] {
  const white = "#ffffff", green = "#9cc27c";
  const sd = o.flip ? -1 : 1;
  const out: Part[] = [];
  // Sap dipten yükselir, tepede kanca gibi kıvrılıp çiçeği sarkıtır
  const bottom: Pt = [o.bend - sd * 30, o.stemLen];
  const hook: Pt = [-sd * 34, -84];
  const stemPath = new Path();
  stemPath.moveTo(bottom)
    .curveTo([bottom[0], bottom[1] - (bottom[1] + 84) * 0.45], [hook[0] - sd * 8, hook[1] + 90], [hook[0] - sd * 2, hook[1] + 14])
    .curveTo([hook[0] - sd * 2, hook[1] - 8], [hook[0] + sd * 18, hook[1] - 16], [sd * 2, -57]);
  out.push(stemPart(stemPath));
  // Dipten iki şerit yaprak (buket düzeninde kurdelenin üstünden çıkar)
  const s0: Pt = [bottom[0], bottom[1] - (bottom[1] + 84) * 0.45], s1: Pt = [hook[0] - sd * 8, hook[1] + 90], s2: Pt = [hook[0] - sd * 2, hook[1] + 14];
  const tb = Math.max(0, Math.min(0.6, 1 - (o.basal ?? 1)) * o.stemLen / (bottom[1] - s2[1]));
  const lb = bez(bottom, s0, s1, s2, Math.min(0.6, tb + 0.01)).p;
  const leafLen = Math.max(110, (o.basal ?? 1) * o.stemLen * 0.5);
  for (const s of [-1, 1]) {
    out.push(fill(blade({ len: s === sd ? leafLen : leafLen * 0.8, width: 10, bend: s * 0.1, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.5 + t * 0.5)), 0.4) }).map(petalAt(lb[0], lb[1], s * 9)), LEAF_BLUE));
  }
  // Kanca tepesindeki zar kın
  out.push(fill(blade({ len: 26, width: 6.5, bend: sd * 0.3 }).map(petalAt(hook[0] - sd * 2, hook[1] + 4, sd * 160)), LEAF_BLUE));
  // Baş biraz büyütülür: kardelen küçük çiçektir ama baskıda seçilmeli
  const head: Part[] = [];
  // Yumurtalık
  head.push(fill(ellipse(0, -42, 8, 11), green));
  const tepal = (len: number, w: number) => blade({
    len, width: w, profile: (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.6) * (0.35 + 0.8 * t) * (t > 0.8 ? 1 - (t - 0.8) * 1.6 : 1),
  });
  // Arkadaki dış yaprak, içteki yeşil lekeli kupa, öndeki iki dış yaprak
  head.push(fill(tepal(66, 19).map(petalAt(0, -32, 180)), white));
  head.push(fill(smooth([[-13, -30], [-15, 0], [-12, 16], [-6, 20], [0, 16], [6, 20], [12, 16], [15, 0], [13, -30]], true), white));
  head.push(fill(smooth([[-7, 10], [0, 4], [7, 10], [0, 16]], true), green));
  for (const s of [-1, 1]) {
    head.push(fill(tepal(70, 20).map(petalAt(s * 3, -33, 180 - s * 34)), white));
    head.push(vein(smooth([[0, -8], [0, -28], [0, -46]]).map(petalAt(s * 3, -33, 180 - s * 34))));
  }
  out.push(...mapParts(head, chain(tr(0, -42), sc(1.35), tr(0, 42))));
  return out;
}

export const FLOWERS: Record<number, (o: FlowerOptions) => Part[]> = {
  1: carnation,
  2: violet,
  3: daffodil,
  4: daisy,
  5: lilyOfTheValley,
  6: rose,
  7: larkspur,
  8: poppy,
  9: aster,
  10: marigold,
  11: chrysanthemum,
  12: snowdrop,
};

/**
 * Çiçek başının kabaca kapladığı alan (baş ortasına göre). Yerleşim bunu
 * komşu çiçeklerle arayı ve başlık/isim boşluklarını ayarlamak için kullanır.
 */
export const HEAD_EXTENT: Record<number, { top: number; half: number }> = {
  1: { top: 90, half: 90 },
  2: { top: 70, half: 80 },
  3: { top: 60, half: 70 },
  4: { top: 85, half: 85 },
  5: { top: 75, half: 85 },
  6: { top: 70, half: 85 },
  7: { top: 170, half: 55 },
  8: { top: 85, half: 92 },
  9: { top: 65, half: 110 },
  10: { top: 70, half: 70 },
  11: { top: 80, half: 75 },
  12: { top: 110, half: 55 },
};
