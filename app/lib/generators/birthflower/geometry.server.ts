/**
 * Doğum çiçeklerinin çizim temeli: küçük bir 2B yol kurucu ve çiçek
 * parçalarının (taç yaprak, yaprak, sap...) ortak biçimleri.
 *
 * Dönüşümler SVG `transform` ile değil noktalara uygulanarak yapılır: çiçek
 * parçaları farklı ölçeklerle yerleşse de çizgi kalınlığı her yerde aynı
 * kalsın (ölçeklenmiş bir `<g>` konturu da kalınlaştırırdı).
 */

export type Pt = [number, number];

/** Afin matris [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Mat = [number, number, number, number, number, number];

export const I: Mat = [1, 0, 0, 1, 0, 0];

/** m1 ∘ m2: önce m2, sonra m1 uygulanır */
export function mul(m1: Mat, m2: Mat): Mat {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1,
  ];
}

/** Soldan sağa okunan zincir: chain(A, B, C) = önce C, sonra B, sonra A */
export function chain(...ms: Mat[]): Mat {
  return ms.reduce((acc, m) => mul(acc, m), I);
}

export const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const sc = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
/** Derece; SVG gibi saat yönü pozitif (y aşağı) */
export function rot(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function apply(m: Mat, p: Pt): Pt {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

type Seg = ["M", Pt] | ["L", Pt] | ["C", Pt, Pt, Pt] | ["Z"];

/** Nokta listesinden oluşan yol; `d()` SVG yol verisini verir */
export class Path {
  segs: Seg[] = [];
  moveTo(p: Pt) { this.segs.push(["M", p]); return this; }
  lineTo(p: Pt) { this.segs.push(["L", p]); return this; }
  curveTo(c1: Pt, c2: Pt, p: Pt) { this.segs.push(["C", c1, c2, p]); return this; }
  close() { this.segs.push(["Z"]); return this; }
  append(o: Path) { this.segs.push(...o.segs); return this; }

  map(m: Mat): Path {
    const out = new Path();
    out.segs = this.segs.map((s) => {
      if (s[0] === "Z") return s;
      if (s[0] === "C") return ["C", apply(m, s[1]), apply(m, s[2]), apply(m, s[3])];
      return [s[0], apply(m, s[1])] as Seg;
    });
    return out;
  }

  points(): Pt[] {
    const pts: Pt[] = [];
    for (const s of this.segs) for (let i = 1; i < s.length; i++) pts.push(s[i] as Pt);
    return pts;
  }

  d(): string {
    const n = (v: number) => Number(v.toFixed(1)).toString();
    const p = (q: Pt) => `${n(q[0])} ${n(q[1])}`;
    return this.segs
      .map((s) => (s[0] === "Z" ? "Z" : s[0] === "C" ? `C${p(s[1])} ${p(s[2])} ${p(s[3])}` : `${s[0]}${p(s[1])}`))
      .join("");
  }
}

/**
 * Catmull-Rom eğrisi: noktaların hepsinden geçen yumuşak yol. `closed`
 * ise son nokta ilke bağlanır. `tension` 1 = klasik, küçüldükçe köşeler
 * sertleşir.
 */
export function smooth(pts: Pt[], closed = false, tension = 1): Path {
  const path = new Path();
  const n = pts.length;
  if (n < 2) return path;
  path.moveTo(pts[0]);
  const at = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const last = closed ? n : n - 1;
  const k = tension / 6;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    path.curveTo(
      [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k],
      [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k],
      p2,
    );
  }
  if (closed) path.close();
  return path;
}

/** Kırık çizgi (saçaklı kenarlar için) */
export function poly(pts: Pt[], closed = false): Path {
  const path = new Path();
  pts.forEach((p, i) => (i === 0 ? path.moveTo(p) : path.lineTo(p)));
  if (closed) path.close();
  return path;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 24, wobble?: (a: number) => number): Path {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = wobble ? 1 + wobble(a) : 1;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smooth(pts, true);
}

export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r, 12);

/** Tekrarlanabilir sözde rastgele sayı (aynı girdi → aynı çizim) */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export interface BladeOptions {
  len: number;
  /** En geniş yerdeki yarı genişlik */
  width: number;
  /** 0..1 boyunca genişlik oranı (0 = dip, 1 = uç) */
  profile?: (t: number) => number;
  /** Kenar kıvrımı: yarı genişliğe eklenen oran (side: 1 sağ, -1 sol) */
  edge?: (t: number, side: 1 | -1) => number;
  /** Orta çizginin yana kıvrılması: uçta len·bend kadar */
  bend?: number;
  samples?: number;
  /** Tırtıklı/saçaklı kenarlarda yumuşatma yerine kırık çizgi */
  jagged?: boolean;
  /** Uçta küçük çentik (papatya) */
  notch?: number;
}

/** Yaprak/taç yaprak biçimi için varsayılan profil: dipte dar, ortada dolgun */
export const leafProfile = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.85) * (1 - 0.15 * t);

/**
 * Dipten (0,0) yukarı (-y) uzanan kapalı yaprak biçimi. Kenar önce sağdan
 * uca çıkar, soldan dibe iner.
 */
export function blade(o: BladeOptions): Path {
  const n = o.samples ?? 14;
  const prof = o.profile ?? leafProfile;
  const bend = o.bend ?? 0;
  const center = (t: number): Pt => [bend * o.len * t * t, -o.len * t];
  const side = (t: number, s: 1 | -1): Pt => {
    const c = center(t);
    const w = o.width * prof(t) * (1 + (o.edge ? o.edge(t, s) : 0));
    // Orta çizgiye dik yönde aç
    const dx = 2 * bend * o.len * t, dy = -o.len;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    return [c[0] + nx * w * s, c[1] + ny * w * s];
  };
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    right.push(side(t, 1));
    left.push(side(t, -1));
  }
  const tip = center(1);
  let tipPts: Pt[] = [tip];
  if (o.notch) {
    const c = center(0.985);
    tipPts = [side(0.99, 1), [c[0], c[1] + o.notch], side(0.99, -1)];
  }
  const pts: Pt[] = [[0, 0], ...right, ...tipPts, ...left.reverse()];
  return o.jagged ? poly(pts, true) : smooth(pts, true, 0.9);
}

/** Orta damar: dipten uca açık çizgi (blade ile aynı eğimde) */
export function midrib(len: number, bend = 0, from = 0.05, to = 0.8): Path {
  const pts: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = from + ((to - from) * i) / 6;
    pts.push([bend * len * t * t, -len * t]);
  }
  return smooth(pts);
}

/** Kübik Bezier üzerinde nokta ve teğet */
export function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): { p: Pt; tan: Pt } {
  const u = 1 - t;
  const p: Pt = [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
  const tan: Pt = [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
  return { p, tan };
}

/** Bir yönün açısı (derece, SVG yönünde; 0 = sağ, -90 = yukarı) */
export const angleOf = (v: Pt) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
