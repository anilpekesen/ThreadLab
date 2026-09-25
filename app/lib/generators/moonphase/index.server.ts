import sharp from "sharp";
import type * as opentypeNs from "opentype.js";
import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanColor, cleanText, loadLibraryFont, pickAllowed, textInk, textSvg, svgRaster, } from "../svg-text.server";
import {
  MOON_PHASE_NAMES,
  MOONPHASE_LABEL_MAX,
  MOONPHASE_LAYOUTS,
  MOONPHASE_LINE_MAX,
  MOONPHASE_STYLES,
  MOONPHASE_TITLE_MAX,
  moonphaseConfig,
  moonphaseInkName,
  type MoonphaseConfig,
  type MoonphaseLayout,
  type MoonphaseStyle,
} from "./config";

/**
 * Ay evresi çizimi.
 *
 * Evre, Meeus'un düşük hassasiyetli Ay ve Güneş boylamlarından (Astronomical
 * Algorithms, 25. ve 47. bölüm) Ay–Güneş uzanımı olarak hesaplanır; hata
 * birkaç on dakikanın altında. Tarih o gecenin yerel 21:00'i sayılır.
 *
 * Yerleşim soyut birimlerde yapılır, sonra içerik kutusu uzun kenarı 2400
 * birim olacak şekilde ölçeklenir ve baskı ölçeğinde rasterleşir. "Karanlık
 * yüz dolu" ay SVG'dir; "aydınlık yüz dolu" ve "gerçekçi" aylar pikselle
 * hesaplanır (doku sabit tohumlu gürültüyle, önizleme ile baskı aynı) ve
 * SVG'nin üstüne yerleştirilir.
 */

const RAD = Math.PI / 180;
const SYNODIC = 29.530588853;
const FIT = 2400;

const f1 = (n: number) => Number(n.toFixed(1));
const norm360 = (d: number) => ((d % 360) + 360) % 360;

// ── Astronomi ──────────────────────────────────────────────────────────

/** Meeus 47.A'nın en büyük terimleri: [D, M, M', F, katsayı] (sin, derece) */
const MOON_LON_TERMS: number[][] = [
  [0, 0, 1, 0, 6.288774], [2, 0, -1, 0, 1.274027], [2, 0, 0, 0, 0.658314], [0, 0, 2, 0, 0.213618],
  [0, 1, 0, 0, -0.185116], [0, 0, 0, 2, -0.114332], [2, 0, -2, 0, 0.058793], [2, -1, -1, 0, 0.057066],
  [2, 0, 1, 0, 0.053322], [2, -1, 0, 0, 0.045758], [0, 1, -1, 0, -0.040923], [1, 0, 0, 0, -0.03472],
  [0, 1, 1, 0, -0.030383], [2, 0, 0, -2, 0.015327], [0, 0, 1, 2, -0.012528], [0, 0, 1, -2, 0.01098],
  [4, 0, -1, 0, 0.010675], [0, 0, 3, 0, 0.010034], [4, 0, -2, 0, 0.008548], [2, 1, -1, 0, -0.007888],
  [2, 1, 0, 0, -0.006766], [1, 0, -1, 0, -0.005163], [1, 1, 0, 0, 0.004987], [2, -1, 1, 0, 0.004036],
  [2, 0, 2, 0, 0.003994], [4, 0, 0, 0, 0.003861], [2, 0, -3, 0, 0.003665], [0, 1, -2, 0, -0.002689],
];

export interface MoonState {
  /** Ay–Güneş boylam farkı, 0 yeni ay, 90 ilk dördün, 180 dolunay, 270 son dördün */
  elongation: number;
  /** Aydınlık kesir 0–1 */
  illumination: number;
  /** Yeni aydan bu yana gün */
  age: number;
}

export function moonAt(utcMs: number): MoonState {
  const jd = utcMs / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t;
  const D = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t;
  const M = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t;
  const Mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t;
  const F = 93.272095 + 483202.0175233 * t - 0.0036539 * t * t;
  const E = 1 - 0.002516 * t;
  let dl = 0;
  for (const [d, m, mp, ff, c] of MOON_LON_TERMS) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    dl += c * e * Math.sin((d * D + m * M + mp * Mp + ff * F) * RAD);
  }
  const moonLon = Lp + dl;
  const beta = 5.128122 * Math.sin(F * RAD);
  const sunLon = 280.46646 + 36000.76983 * t
    + (1.914602 - 0.004817 * t) * Math.sin(M * RAD) + (0.019993 - 0.000101 * t) * Math.sin(2 * M * RAD)
    + 0.000289 * Math.sin(3 * M * RAD) - 0.00569;
  const elongation = norm360(moonLon - sunLon);
  // Aydınlık kesir enlem de hesaba katılarak (Meeus 48.2; Ay–Dünya uzaklığının etkisi ihmal)
  const cosPsi = Math.cos(beta * RAD) * Math.cos(elongation * RAD);
  return { elongation, illumination: (1 - cosPsi) / 2, age: (elongation / 360) * SYNODIC };
}

/** Takvim gününün yerel 21:00'i (utcOffset saat) */
export function nightOf(y: number, m: number, d: number, utcOffset: number): number {
  return Date.UTC(y, m - 1, d, 21) - utcOffset * 3600000;
}

/**
 * Evre adı. Dört ana evre o ana ±9° (~0,75 gün) içinde sayılır: 21:00'de
 * bakıldığında olayın gerçekleştiği gece her zaman o adı alır.
 */
export function phaseIndex(elongation: number): number {
  const e = norm360(elongation);
  const near = (c: number) => Math.abs(((e - c + 540) % 360) - 180) < 9;
  if (near(0)) return 0;
  if (near(90)) return 2;
  if (near(180)) return 4;
  if (near(270)) return 6;
  return e < 90 ? 1 : e < 180 ? 3 : e < 270 ? 5 : 7;
}

// ── Tarih ──────────────────────────────────────────────────────────────

interface Ymd { y: number; m: number; d: number }

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseDate(v: unknown, config: MoonphaseConfig, which?: string): Ymd {
  const s = typeof v === "string" ? v.trim() : "";
  const bad = () => which
    ? new GeneratorInputError(`Lütfen "${which}" için geçerli bir tarih seçin.`, `Please choose a valid date for "${which}".`)
    : new GeneratorInputError("Lütfen geçerli bir tarih seçin.", "Please choose a valid date.");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw bad();
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < config.yearMin || y > config.yearMax) {
    throw new GeneratorInputError(`Tarih ${config.yearMin}–${config.yearMax} arasında olmalı.`, `The date must be between ${config.yearMin} and ${config.yearMax}.`);
  }
  // 31 Şubat gibi var olmayan günler Date'te taşar; geri okuyunca yakalanır
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) throw bad();
  return { y, m, d };
}

function roman(n: number): string {
  const map: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

function formatDate(config: MoonphaseConfig, dt: Ymd): string {
  const en = config.language === "en";
  if (config.dateFormat === "numeric") return en ? `${pad(dt.m)}.${pad(dt.d)}.${dt.y}` : `${pad(dt.d)}.${pad(dt.m)}.${dt.y}`;
  if (config.dateFormat === "roman") {
    const parts = en ? [dt.m, dt.d, dt.y] : [dt.d, dt.m, dt.y];
    return parts.map(roman).join(" · ");
  }
  return en ? `${MONTHS_EN[dt.m - 1]} ${dt.d}, ${dt.y}` : `${dt.d} ${MONTHS_TR[dt.m - 1]} ${dt.y}`;
}

function phaseText(config: MoonphaseConfig, st: MoonState): string {
  const en = config.language === "en";
  const p = MOON_PHASE_NAMES[phaseIndex(st.elongation)];
  let s = en ? p.labelEn : p.label;
  if (config.showIllumination) {
    const pct = Math.round(st.illumination * 100);
    s += en ? `  ·  ${pct}%` : `  ·  %${pct}`;
  }
  return s;
}

// ── Gerçekçi ay dokusu ─────────────────────────────────────────────────

/**
 * Ayın yüzü hep aynı olduğu için doku bir kez, sabit tohumla üretilir ve
 * saklanır: disk koordinatında (x sağa, y aşağı, −1..1) albedo ve yükseklik
 * eğimi. Denizler (maria) gerçek yerlerine yakın konur; kraterler kenara
 * yaklaştıkça radyal yönde basıklaşır (küre izdüşümü).
 */
const TEX = 1400;
let texCache: { albedo: Float32Array; gx: Float32Array; gy: Float32Array } | null = null;

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, y, seed + o * 17);
    tot += amp;
    x *= 2.03; y *= 2.03; amp *= 0.5;
  }
  return sum / tot;
}

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Denizler: [x, y, yarıçap x, yarıçap y, ağırlık] — Dünya'dan kuzey yukarı
 * bakış. Metatop gibi toplanır: yakın lekeler birleşip gerçek ayın bağlantılı
 * deniz ağını oluşturur (Procellarum–Imbrium, Serenitatis–Tranquillitatis...). İnce şeritler
 * (Frigoris) ve tek başına küçük lekeler baskıda leke gibi durduğu için yok.
 */
const MARIA: number[][] = [
  // Oceanus Procellarum (batı kenarı boyunca geniş)
  [-0.66, -0.3, 0.16, 0.2, 1], [-0.7, -0.02, 0.14, 0.2, 1], [-0.6, 0.2, 0.13, 0.16, 0.9], [-0.5, -0.12, 0.13, 0.15, 0.9],
  // Imbrium ve Sinus Iridum
  [-0.3, -0.48, 0.2, 0.17, 1.15], [-0.16, -0.38, 0.1, 0.1, 0.9], [-0.46, -0.64, 0.07, 0.05, 0.9],
  // Serenitatis ve Vaporum
  [0.2, -0.4, 0.13, 0.13, 1.15], [0.04, -0.27, 0.07, 0.06, 0.85],
  // Tranquillitatis, Fecunditatis, Nectaris, Crisium
  [0.36, -0.12, 0.15, 0.12, 1.1], [0.24, -0.02, 0.08, 0.08, 0.9], [0.56, 0.08, 0.09, 0.12, 1], [0.6, 0.26, 0.07, 0.09, 0.9],
  [0.38, 0.28, 0.07, 0.08, 1], [0.74, -0.3, 0.08, 0.1, 1.2],
  // Nubium, Cognitum, Humorum
  [-0.2, 0.36, 0.14, 0.11, 1], [-0.34, 0.16, 0.09, 0.08, 0.9], [-0.56, 0.38, 0.08, 0.08, 1.05],
];

/** Adlı kraterler: [x, y, yarıçap, parlaklık (ışın sistemi), taban koyuluğu] */
const NAMED_CRATERS: number[][] = [
  [-0.12, 0.72, 0.035, 1, 0], // Tycho
  [-0.33, -0.2, 0.04, 0.55, 0], // Copernicus
  [-0.6, -0.13, 0.022, 0.4, 0], // Kepler
  [-0.72, -0.38, 0.014, 0.7, 0], // Aristarchus
  [-0.1, -0.8, 0.035, 0, 0.5], // Plato
  [-0.12, 0.88, 0.06, 0, 0], // Clavius
  [0.72, -0.02, 0.03, 0, 0.1], // Langrenus çevresi
];

function buildTexture() {
  const n = TEX;
  const albedo = new Float32Array(n * n);
  const height = new Float32Array(n * n);
  const toU = (i: number) => ((i + 0.5) / n) * 2 - 1;

  // Denizler ve yüzey gürültüsü
  for (let j = 0; j < n; j++) {
    const v = toU(j);
    for (let i = 0; i < n; i++) {
      const u = toU(i);
      if (u * u + v * v > 1.02) continue;
      // Alan bükülerek örneklenir ki kıyılar elips gibi durmasın
      const wu = u + (fbm(u * 4 + 7, v * 4, 4, 11) - 0.5) * 0.16;
      const wv = v + (fbm(u * 4, v * 4 + 3, 4, 13) - 0.5) * 0.16;
      let field = 0;
      for (const [mx, my, rx, ry, k] of MARIA) {
        const dx = (wu - mx) / rx, dy = (wv - my) / ry;
        field += k * Math.exp(-(dx * dx + dy * dy) * 0.9);
      }
      const mare = smooth(0.24, 0.72, field + (fbm(u * 9, v * 9, 3, 17) - 0.5) * 0.2);
      // Denizlerin içi de düz değil: koyu ve açık damarlar
      const inner = fbm(u * 5 + 2, v * 5 + 9, 4, 19) - 0.5;
      const grain = fbm(u * 7, v * 7, 5, 3) - 0.5;
      const fine = fbm(u * 38, v * 38, 3, 7) - 0.5;
      albedo[j * n + i] = 0.86 - mare * (0.4 + 0.18 * inner) + 0.12 * grain * (1 - 0.5 * mare) + 0.05 * fine;
      height[j * n + i] = 0.004 * (fbm(u * 18, v * 18, 4, 5) - 0.5);
    }
  }

  // Kraterler: yükseklik (çukur + kenar) ve genç kraterlerde parlak ışınlar
  const rnd = mulberry32(20240125);
  const craters: number[][] = NAMED_CRATERS.map((c) => [...c]);
  for (let k = 0; k < 520; k++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.985;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    // Çoğu küçük, azı büyük (krater boyu dağılımı)
    const r = 0.004 * Math.pow(10, Math.pow(rnd(), 2.6) * 1.1);
    // Denizlerde krater azdır
    const ai = Math.min(n - 1, Math.max(0, Math.floor(((x + 1) / 2) * n)));
    const aj = Math.min(n - 1, Math.max(0, Math.floor(((y + 1) / 2) * n)));
    if (albedo[aj * n + ai] < 0.62 && rnd() < 0.75) continue;
    craters.push([x, y, r, rnd() < 0.05 ? 0.25 : 0, 0]);
  }
  for (const [cx, cy, cr, bright, floor] of craters) {
    const cd = Math.hypot(cx, cy);
    const zc = Math.sqrt(Math.max(0.04, 1 - cd * cd));
    const rh = cd > 1e-3 ? [cx / cd, cy / cd] : [1, 0];
    const reach = cr * (bright > 0.3 ? 9 : 1.6);
    const i0 = Math.max(0, Math.floor(((cx - reach + 1) / 2) * n)), i1 = Math.min(n - 1, Math.ceil(((cx + reach + 1) / 2) * n));
    const j0 = Math.max(0, Math.floor(((cy - reach + 1) / 2) * n)), j1 = Math.min(n - 1, Math.ceil(((cy + reach + 1) / 2) * n));
    const depth = cr * 0.4;
    for (let j = j0; j <= j1; j++) {
      const v = toU(j);
      for (let i = i0; i <= i1; i++) {
        const u = toU(i);
        const dx = u - cx, dy = v - cy;
        const radial = (dx * rh[0] + dy * rh[1]) / zc;
        const tang = -dx * rh[1] + dy * rh[0];
        const q = Math.sqrt(radial * radial + tang * tang) / cr;
        const idx = j * n + i;
        if (q < 1.6) {
          const bowl = q < 1 ? -depth * (1 - q * q) : 0;
          const rim = depth * 0.38 * Math.exp(-((q - 1) * (q - 1)) / 0.04);
          height[idx] += bowl + rim;
          if (floor && q < 0.9) albedo[idx] -= floor * 0.3;
          if (q < 1.15) albedo[idx] += 0.025;
        }
        if (bright > 0) {
          // Işınlar: açıya bağlı gürültü, uzaklıkla sönümlenir
          const ang = Math.atan2(tang, radial);
          const ray = Math.pow(fbm(Math.cos(ang) * 5 + 50, Math.sin(ang) * 5 + 50, 2, 23), 3);
          const dist = q * cr;
          albedo[idx] += bright * (0.3 * Math.exp(-q * q * 1.2) + 0.14 * ray * Math.exp(-dist / (cr * 6)));
        }
      }
    }
  }

  // Eğim (disk birimi başına)
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n);
  const step = 2 / n;
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const idx = j * n + i;
      gx[idx] = (height[idx + 1] - height[idx - 1]) / (2 * step);
      gy[idx] = (height[idx + n] - height[idx - n]) / (2 * step);
    }
  }
  return { albedo, gx, gy };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Ay pikselleri: çap `size` piksel, RGBA PNG.
 *
 * - "shaded": gri tonlu. Aydınlatma Lommel–Seeliger (dolunayda disk düz
 *   parlak, uç evrelerde sonlandırıcıya doğru kararır); karanlık kısım soluk
 *   "dünya ışığı" olarak yarı saydam kalır.
 * - "ink": tek renk. Aydınlık kısım mürekkep; denizler yarım ton noktalarla
 *   açılır (serigrafide de basılabilir). Küçük aylarda noktalar baskıda
 *   kaybolacağı için doku atlanır, düz dolgu kalır.
 */
async function moonPixelsPng(size: number, elongation: number, south: boolean, mode: "shaded" | "ink", inkHex: string): Promise<Buffer> {
  texCache ??= buildTexture();
  const { albedo, gx, gy } = texCache;
  const n = TEX;
  const buf = Buffer.alloc(size * size * 4);
  const e = elongation * RAD;
  let sx = Math.sin(e);
  const sz = -Math.cos(e);
  if (south) sx = -sx;
  const half = size / 2;
  const bump = 0.22;
  const inkRgb = [1, 3, 5].map((i) => parseInt(inkHex.slice(i, i + 2), 16));
  // Yarım ton: 45° dönük ızgara, adım ~çapın 1/170'i, baskıda en az ~0,6 mm
  const pitch = Math.max(7, size / 170);
  const textured = size >= 700;
  const w = (2 * Math.PI) / pitch;
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5 - half) / half;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - half) / half;
      const rr = x * x + y * y;
      const edge = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * half + 0.5));
      if (edge <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - rr));
      // Güney yarımkürede yüz 180° dönük görünür
      const tu = south ? -x : x, tv = south ? -y : y;
      const fx = Math.min(n - 1.001, Math.max(0, ((tu + 1) / 2) * n - 0.5));
      const fy = Math.min(n - 1.001, Math.max(0, ((tv + 1) / 2) * n - 0.5));
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const ax = fx - ix, ay = fy - iy;
      const i00 = iy * n + ix;
      const bil = (arr: Float32Array) =>
        (arr[i00] * (1 - ax) + arr[i00 + 1] * ax) * (1 - ay) + (arr[i00 + n] * (1 - ax) + arr[i00 + n + 1] * ax) * ay;
      const alb = bil(albedo);
      const o = (py * size + px) * 4;

      if (mode === "ink") {
        // Keskin sonlandırıcı; kenar yumuşatma piksel başına değişime göre
        const d0 = x * sx + z * sz;
        const grad = Math.abs(sx - (sz * x) / Math.max(z, 0.02)) / half + 1e-6;
        const lit = Math.min(1, Math.max(0, d0 / grad + 0.5));
        if (lit <= 0) continue;
        let cov = 1;
        if (textured) {
          const c = 0.48 + 0.52 * smooth(0.44, 0.8, alb);
          if (c < 0.999) {
            const u = (px + py) * Math.SQRT1_2, v = (px - py) * Math.SQRT1_2;
            const t = (Math.cos(u * w) + Math.cos(v * w)) / 2;
            cov = Math.min(1, Math.max(0, (t - (1 - 2 * c)) / 0.22 + 0.5));
          }
        }
        buf[o] = inkRgb[0]; buf[o + 1] = inkRgb[1]; buf[o + 2] = inkRgb[2];
        buf[o + 3] = Math.round(255 * edge * lit * cov);
        continue;
      }

      let gxx = bil(gx), gyy = bil(gy);
      if (south) { gxx = -gxx; gyy = -gyy; }
      // Eğimle bozulmuş yüzey normali
      let nx = x - bump * gxx * z, ny = y - bump * gyy * z, nz = z;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const d = nx * sx + nz * sz;
      const mu0 = Math.max(0, d + 0.02);
      const ls = Math.min(1.05, (2 * mu0) / (mu0 + Math.max(0.08, z)));
      const lit = smooth(-0.02, 0.05, x * sx + z * sz);
      const lum = Math.max(0, Math.min(1, alb * ls));
      // Karanlık yüz: soluk, az dokulu, %30 örtücülük
      const earth = 0.16 + 0.12 * alb;
      const g = lum * lit + earth * (1 - lit);
      const alpha = edge * (0.3 + 0.7 * lit);
      const tone = Math.pow(Math.min(1, g * 1.08), 0.8);
      buf[o] = Math.round(255 * Math.min(1, tone));
      buf[o + 1] = Math.round(255 * Math.min(1, tone * 0.99));
      buf[o + 2] = Math.round(255 * Math.min(1, tone * 0.965));
      buf[o + 3] = Math.round(255 * alpha);
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

// ── Tek renk ay ────────────────────────────────────────────────────────

/**
 * Tek renk ay (vektör): dış çizgi + dolu kısım. Dolu kısım aydınlık yüz ise
 * sağ yarım disk + sonlandırıcı elipsin yarısıdır (hilalde dışa, şişkinde
 * içe); küçülen ayda (ya da güney yarımkürede) aynalanır. Karanlık yüz,
 * 180° ötesindeki evrenin aydınlık yüzüyle aynı şekildir.
 */
function vectorMoonSvg(cx: number, cy: number, r: number, elongation: number, south: boolean, ink: string, stroke: number, fill: "lit" | "dark" | "none"): string {
  let out = `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r - stroke / 2)}" fill="none" stroke="${ink}" stroke-width="${f1(stroke)}"/>`;
  if (fill === "none") return out;
  const e = norm360(fill === "dark" ? elongation + 180 : elongation);
  const waning = e > 180;
  const ee = waning ? 360 - e : e;
  const k = (1 - Math.cos(ee * RAD)) / 2;
  if (k < 0.004) return out;
  if (k > 0.996) return out + `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="${ink}"/>`;
  const rx = r * Math.abs(Math.cos(ee * RAD));
  const sweep = ee < 90 ? 0 : 1;
  const d = `M0 ${f1(-r)}A${f1(r)} ${f1(r)} 0 0 1 0 ${f1(r)}A${f1(rx)} ${f1(r)} 0 0 ${sweep} 0 ${f1(-r)}Z`;
  const mirror = waning !== south;
  out += `<path d="${d}" fill="${ink}" transform="translate(${f1(cx)} ${f1(cy)})${mirror ? " scale(-1 1)" : ""}"/>`;
  return out;
}

// ── Yerleşim ───────────────────────────────────────────────────────────

interface Moon { cx: number; cy: number; r: number; st: MoonState }
interface TextItem { font: opentypeNs.Font; text: string; x: number; y: number; size: number; maxWidth: number; spacing?: number }
interface Scene { moons: Moon[]; texts: TextItem[]; extra: string[]; box: Box }
type Box = { x1: number; y1: number; x2: number; y2: number };

interface Fonts {
  title: opentypeNs.Font;
  /** Etiket/isim satırı */
  line: opentypeNs.Font;
  /** Tarih ve evre adı: geniş aralıklı küçük büyük harf */
  caps: opentypeNs.Font;
  script: boolean;
  sans: boolean;
  locale: string;
}

const SCRIPT_FONTS = new Set(["great-vibes", "dancing-script"]);
const SANS_FONTS = new Set(["montserrat", "poppins", "quicksand", "oswald", "montserrat-black", "archivo-black", "anton"]);

/** Dikey yığın: her satır bir önceki satırın altına, gerçek harf yüksekliğine göre */
class Stack {
  y: number;
  box: Box;
  texts: TextItem[] = [];
  extra: string[] = [];
  constructor(y: number, box: Box, private cx: number) { this.y = y; this.box = { ...box }; }

  /**
   * `row` verilirse satır yüksekliği metnin kendisinden değil bu örnekten
   * (nominal puntoda) ölçülür ve metin boş olsa da yer ayrılır: yan yana
   * sütunlarda satırlar aynı hizada kalsın.
   */
  add(font: opentypeNs.Font, text: string, size: number, gap: number, maxWidth: number, spacing?: number, row?: string) {
    if (!text && !row) return;
    const probe = text
      ? textSvg({ font, text, x: this.cx, y: 0, size, fill: "#000", anchor: "middle", maxWidth, letterSpacing: spacing })
      : { size, width: 0 };
    const refText = row ?? text;
    const refSize = row ? size : probe.size;
    const ink = textInk(font, refText, refSize);
    const cap = textInk(font, "H", refSize);
    // Üst: büyük harf yüksekliği ya da aksanlı harfin mürekkebi (hangisi büyükse)
    const asc = Math.max(cap ? -cap.y1 : refSize * 0.7, ink ? -ink.y1 * 0.92 : 0);
    const base = this.y + gap + asc;
    if (text) this.texts.push({ font, text, x: this.cx, y: base, size: probe.size, maxWidth, spacing });
    const desc = Math.max(refSize * 0.08, ink?.y2 ?? 0);
    this.box.x1 = Math.min(this.box.x1, this.cx - probe.width / 2);
    this.box.x2 = Math.max(this.box.x2, this.cx + probe.width / 2);
    this.box.y2 = Math.max(this.box.y2, base + desc);
    this.y = base + Math.min(desc, refSize * 0.12);
  }

  rule(w: number, h: number, gap: number, ink: string) {
    const y = this.y + gap;
    this.extra.push(`<rect x="${f1(this.cx - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${ink}"/>`);
    this.y = y + h;
    this.box.y2 = Math.max(this.box.y2, this.y);
  }
}

const upper = (s: string, fonts: Fonts) => s.toLocaleUpperCase(fonts.locale);

function titleSpec(fonts: Fonts) {
  return fonts.script
    ? { size: 250, spacing: undefined as number | undefined, upper: false }
    : fonts.sans ? { size: 150, spacing: 0.14, upper: true } : { size: 190, spacing: 0.02, upper: false };
}

interface Content {
  title: string;
  line: string;
  dates: Array<{ label: string; ymd: Ymd; st: MoonState }>;
}

function singleScene(c: Content, config: MoonphaseConfig, fonts: Fonts, ink: string): Scene {
  const R = 760;
  const moons: Moon[] = [{ cx: 0, cy: 0, r: R, st: c.dates[0].st }];
  const s = new Stack(R, { x1: -R, y1: -R, x2: R, y2: R }, 0);
  const t = titleSpec(fonts);
  const W = 2300;
  s.add(fonts.title, t.upper ? upper(c.title, fonts) : c.title, t.size, fonts.script ? 170 : 200, W, t.spacing);
  s.add(fonts.line, c.line, fonts.script ? 112 : 104, c.title ? (fonts.script ? 70 : 80) : 200, W * 0.9);
  s.rule(220, 5, c.title || c.line ? 95 : 150, ink);
  s.add(fonts.caps, upper(formatDate(config, c.dates[0].ymd), fonts), 72, 95, W * 0.8, 0.22);
  if (config.showPhaseName) s.add(fonts.caps, upper(phaseText(config, c.dates[0].st), fonts), 54, 48, W * 0.8, 0.24);
  return { moons, texts: s.texts, extra: s.extra, box: s.box };
}

function trioScene(c: Content, config: MoonphaseConfig, fonts: Fonts): Scene {
  const R = 330;
  const col = 820;
  const moons: Moon[] = [];
  let box: Box = { x1: -col - R, y1: -R, x2: col + R, y2: R };
  const texts: TextItem[] = [];
  const extra: string[] = [];
  const t = titleSpec(fonts);
  let bottom = R;
  const anyLabel = c.dates.some((d) => d.label);
  c.dates.forEach((dt, i) => {
    const cx = (i - 1) * col;
    moons.push({ cx, cy: 0, r: R, st: dt.st });
    const s = new Stack(R, box, cx);
    const labelSize = fonts.script ? 150 : fonts.sans ? 92 : 122;
    // Satırlar sütunlar arasında hizalı: etiketi boş olan sütunda da etiket satırı yer tutar
    if (anyLabel) s.add(fonts.title, fonts.sans ? upper(dt.label, fonts) : dt.label, labelSize, fonts.script ? 105 : 120, col * 0.92, fonts.sans ? 0.14 : undefined, "ÂHgy");
    s.add(fonts.caps, upper(formatDate(config, dt.ymd), fonts), 50, anyLabel ? 62 : 110, col * 0.9, 0.16, "0H");
    if (config.showPhaseName) s.add(fonts.caps, upper(phaseText(config, dt.st), fonts), 38, 34, col * 0.9, 0.18, "İH");
    texts.push(...s.texts);
    box = s.box;
    bottom = Math.max(bottom, s.y);
  });
  // Başlık ayların üstünde; alt satır (isimler) en altta
  if (c.title) {
    const text = t.upper ? upper(c.title, fonts) : c.title;
    const probe = textSvg({ font: fonts.title, text, x: 0, y: 0, size: t.size, fill: "#000", anchor: "middle", maxWidth: 2500, letterSpacing: t.spacing });
    const ink = textInk(fonts.title, text, probe.size);
    const base = -R - (fonts.script ? 150 : 170) - (ink?.y2 ?? 0);
    texts.push({ font: fonts.title, text, x: 0, y: base, size: probe.size, maxWidth: 2500, spacing: t.spacing });
    box.y1 = Math.min(box.y1, base + (ink?.y1 ?? -probe.size));
    box.x1 = Math.min(box.x1, -probe.width / 2);
    box.x2 = Math.max(box.x2, probe.width / 2);
  }
  if (c.line) {
    const s = new Stack(bottom, box, 0);
    s.add(fonts.line, c.line, fonts.script ? 120 : 108, 150, 2400);
    texts.push(...s.texts);
    box = s.box;
  }
  return { moons, texts, extra, box };
}

/**
 * Döngü: seçilen gecenin ayı ortada büyük; üstünde yay üzerinde döngünün
 * dokuz evresi (yeni aydan dolunaya, dolunaydan yeni aya). Seçilen geceye en
 * yakın evre halkayla işaretlenir.
 */
function cycleScene(c: Content, config: MoonphaseConfig, fonts: Fonts, ink: string): Scene {
  const R = 600;
  const rs = 118;
  const arcR = R + 150 + rs;
  const st = c.dates[0].st;
  const moons: Moon[] = [{ cx: 0, cy: 0, r: R, st }];
  const extra: string[] = [];
  const spread = 212;
  const e = st.elongation;
  // İşaretlenecek evre: 45°'lik adımlarda en yakını; yeni ay iki uçta var, büyüyen tarafa göre seçilir
  const mark = Math.round(e / 45) === 8 ? 8 : Math.round(e / 45);
  for (let k = 0; k <= 8; k++) {
    const a = (180 + (spread - 180) / 2 - (k * spread) / 8) * RAD;
    const cx = arcR * Math.cos(a), cy = -arcR * Math.sin(a);
    const elong = k * 45;
    const cos = Math.cos(elong * RAD);
    moons.push({ cx, cy, r: rs, st: { elongation: elong % 360, illumination: (1 - cos) / 2, age: (elong / 360) * SYNODIC } });
    if (k === mark) extra.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${rs + 26}" fill="none" stroke="${ink}" stroke-width="3.5"/>`);
  }
  const top = -arcR - rs - 40;
  const endY = -arcR * Math.sin((180 + (spread - 180) / 2) * RAD) + rs;
  const s = new Stack(Math.max(R, endY), { x1: -arcR - rs - 40, y1: top, x2: arcR + rs + 40, y2: Math.max(R, endY) }, 0);
  const t = titleSpec(fonts);
  const W = 2300;
  s.add(fonts.title, t.upper ? upper(c.title, fonts) : c.title, t.size, fonts.script ? 160 : 190, W, t.spacing);
  s.add(fonts.line, c.line, fonts.script ? 112 : 104, c.title ? (fonts.script ? 70 : 80) : 190, W * 0.9);
  s.rule(220, 5, c.title || c.line ? 95 : 140, ink);
  s.add(fonts.caps, upper(formatDate(config, c.dates[0].ymd), fonts), 72, 95, W * 0.8, 0.22);
  if (config.showPhaseName) s.add(fonts.caps, upper(phaseText(config, st), fonts), 54, 48, W * 0.8, 0.24);
  return { moons, texts: s.texts, extra: [...extra, ...s.extra], box: s.box };
}

// ── Modül ──────────────────────────────────────────────────────────────

export const moonphaseGenerator: GeneratorServerModule<MoonphaseConfig> = {
  config: moonphaseConfig,

  publicAssets(config) {
    return {
      layouts: config.layouts.map((id) => {
        const l = MOONPHASE_LAYOUTS.find((x) => x.id === id)!;
        return { id, label: l.label, labelEn: l.labelEn };
      }),
      styles: config.styles.map((id) => {
        const s = MOONPHASE_STYLES.find((x) => x.id === id)!;
        return { id, label: s.label, labelEn: s.labelEn };
      }),
      fonts: config.fonts.map((id) => ({ id, label: FONT_LIBRARY.find((x) => x.id === id)?.label ?? id })),
      inks: config.inks.map((hex) => ({ id: hex, hex, label: moonphaseInkName(hex), labelEn: moonphaseInkName(hex, true) })),
      titleEnabled: config.titleEnabled,
      titleMax: MOONPHASE_TITLE_MAX,
      titlePlaceholder: config.titlePlaceholder.trim(),
      lineEnabled: config.lineEnabled,
      lineMax: MOONPHASE_LINE_MAX,
      linePlaceholder: config.linePlaceholder.trim(),
      labelMax: MOONPHASE_LABEL_MAX,
      trioLabels: config.trioLabels.map((s) => s.trim()),
      yearMin: config.yearMin,
      yearMax: config.yearMax,
    };
  },

  async compose(config, input) {
    const fields = input.fields ?? {};
    const choices = input.choices ?? {};
    const layout: MoonphaseLayout = pickAllowed(choices.layout, config.layouts);
    const style: MoonphaseStyle = pickAllowed(choices.style, config.styles);
    const fontId = pickAllowed(choices.font, config.fonts);
    const ink = cleanColor(pickAllowed(String(choices.ink ?? "").toLowerCase(), config.inks), "#111111");
    const south = config.hemisphere === "south";

    const title = config.titleEnabled ? cleanText(fields.title, MOONPHASE_TITLE_MAX) : "";
    const line = config.lineEnabled ? cleanText(fields.line, MOONPHASE_LINE_MAX) : "";
    const dates: Content["dates"] = [];
    if (layout === "trio") {
      for (let i = 1; i <= 3; i++) {
        // Etiket hiç gönderilmediyse şablonun varsayılanı; boş gönderildiyse etiketsiz
        const raw = fields[`label_${i}`];
        const label = cleanText(raw === undefined ? config.trioLabels[i - 1] : raw, MOONPHASE_LABEL_MAX);
        const name = label || (config.language === "en" ? `Date ${i}` : `${i}. tarih`);
        if (!fields[`date_${i}`]) {
          throw new GeneratorInputError(`Lütfen üç tarihi de seçin ("${name}" eksik).`, `Please choose all three dates ("${name}" is missing).`);
        }
        const ymd = parseDate(fields[`date_${i}`], config, name);
        dates.push({ label, ymd, st: moonAt(nightOf(ymd.y, ymd.m, ymd.d, config.utcOffset)) });
      }
    } else {
      const ymd = parseDate(fields.date ?? fields.date_1, config);
      dates.push({ label: "", ymd, st: moonAt(nightOf(ymd.y, ymd.m, ymd.d, config.utcOffset)) });
    }

    const script = SCRIPT_FONTS.has(fontId);
    const sans = SANS_FONTS.has(fontId);
    const lineFontId = script ? "cormorant" : fontId;
    const [titleFont, lineFont, capsFont] = await Promise.all([
      loadLibraryFont(fontId), loadLibraryFont(lineFontId), loadLibraryFont("montserrat"),
    ]);
    const fonts: Fonts = {
      title: titleFont, line: lineFont, caps: capsFont, script, sans,
      locale: config.language === "en" ? "en-US" : "tr-TR",
    };
    const content: Content = { title, line, dates };
    const scene = layout === "trio" ? trioScene(content, config, fonts)
      : layout === "cycle" ? cycleScene(content, config, fonts, ink)
      : singleScene(content, config, fonts, ink);

    // Ölçek: içerik kutusu + pay, uzun kenar FIT birim
    const b = scene.box;
    const padU = Math.max(b.x2 - b.x1, b.y2 - b.y1) * 0.025;
    const vx = b.x1 - padU, vy = b.y1 - padU;
    const vw = b.x2 - b.x1 + 2 * padU, vh = b.y2 - b.y1 + 2 * padU;
    const k = FIT / Math.max(vw, vh);
    const W = Math.round(vw * k), H = Math.round(vh * k);

    let body = "";
    for (const m of scene.moons) {
      // Çizgi kalınlığı ayın boyuna göre, baskıda ~0,5–1 mm. Gerçekçi stilde
      // dış çizgi yok; aydınlık yüz dolu stilde çizgi karanlık kısmı belirtir.
      const stroke = Math.min(9, Math.max(4.5, m.r * 0.011)) / k;
      if (style === "shadow") body += vectorMoonSvg(m.cx, m.cy, m.r, m.st.elongation, south, ink, stroke, "dark");
      else if (style === "ink") body += vectorMoonSvg(m.cx, m.cy, m.r, m.st.elongation, south, ink, stroke, "none");
    }
    for (const t of scene.texts) {
      body += textSvg({ font: t.font, text: t.text, x: t.x, y: t.y, size: t.size, fill: ink, anchor: "middle", maxWidth: t.maxWidth, letterSpacing: t.spacing }).svg;
    }
    body += scene.extra.join("");

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${f1(vx)} ${f1(vy)} ${f1(vw)} ${f1(vh)}">${body}</svg>`;
    const base = await svgRaster(svg).png().toBuffer({ resolveWithObject: true });
    const outW = base.info.width, outH = base.info.height;
    if (style === "shadow") {
      const out = await sharp(base.data).png({ compressionLevel: 9 }).toBuffer();
      return { buffer: out, width: outW, height: outH };
    }

    // Aylar piksel olarak hesaplanıp yerlerine konur
    const px = outW / vw;
    const mode = style === "shaded" ? "shaded" : "ink";
    const layers = await Promise.all(scene.moons.map(async (m) => {
      const size = Math.max(8, Math.round(2 * m.r * px));
      const left = Math.round((m.cx - vx) * px - size / 2);
      const top = Math.round((m.cy - vy) * px - size / 2);
      return { input: await moonPixelsPng(size, m.st.elongation, south, mode, ink), left, top };
    }));
    const out = await sharp(base.data).composite(layers).png({ compressionLevel: 9 }).toBuffer();
    return { buffer: out, width: outW, height: outH };
  },
};
