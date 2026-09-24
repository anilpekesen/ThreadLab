import sharp from "sharp";
import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanText, loadLibraryFont, pickAllowed, textSvg, svgRaster } from "../svg-text.server";
import {
  CITYMAP_COUNTRIES,
  CITYMAP_CITIES,
  citymapCityLabel,
  findCitymapCity,
  type CitymapCity,
} from "./cities";
import {
  CITYMAP_SHAPES,
  CITYMAP_STYLES,
  CITYMAP_SUBTITLE_MAX,
  CITYMAP_TITLE_MAX,
  citymapCitiesFor,
  citymapConfig,
  type CitymapConfig,
  type CitymapShapeId,
  type CitymapStyleId,
} from "./config";
import { loadCitymapData, type CitymapGeoData, type RoadClass } from "./overpass.server";

/**
 * Şehir haritası çizimi: 2400x3200 poster; üstte kırpılmış (daire, kare,
 * kalp) sokak haritası, altında harf aralıklı başlık, alt satır, koordinat.
 *
 * İzdüşüm merkez enleminde eşdikdörtgen: birkaç km'lik alanda Mercator'dan
 * farkı gözle seçilmez, hesap basit. Yollar sınıf başına TEK `<path>` olarak
 * yazılır (İstanbul 5 km'de ~18 bin yol; ayrı ayrı `<path>` librsvg'yi
 * yavaşlatır), koordinatlar 1 ondalığa yuvarlanır.
 */

const W = 2400;
const H = 3200;
/** Harita kutusu: kare, yatayda ortalı */
const MAP = 2040;
const MAP_X = (W - MAP) / 2;
const MAP_Y = 190;

interface Palette {
  bg: string;
  road: string;
  /** Yaya yolları: posterde bir ton açık, mürekkepte aynı renk */
  path: string;
  /** Boşsa su doldurulmaz, yalnız kıyı çizilir (tek renk baskı) */
  water: string;
  park: string;
  accent: string;
  text: string;
  muted: string;
}

const PALETTES: Record<CitymapStyleId, Palette> = {
  "ink-dark": { bg: "", road: "#161616", path: "#161616", water: "", park: "", accent: "#161616", text: "#161616", muted: "#161616" },
  "ink-light": { bg: "", road: "#ffffff", path: "#ffffff", water: "", park: "", accent: "#ffffff", text: "#ffffff", muted: "#ffffff" },
  "poster-light": { bg: "#f3eee4", road: "#23262b", path: "#8f8a82", water: "#a9c6d9", park: "#cfdcbc", accent: "#c0392b", text: "#1f2226", muted: "#6b665e" },
  "poster-dark": { bg: "#15233a", road: "#ece4d3", path: "#7d879a", water: "#0b1627", park: "#1c3a4a", accent: "#e8826b", text: "#ece4d3", muted: "#a5aec0" },
};

/** Yarıçap 2 km'de sınıf başına çizgi kalınlığı (px, 2040 px harita) */
const ROAD_WIDTH: Record<RoadClass, number> = {
  motorway: 14, primary: 11, secondary: 9, tertiary: 7, street: 4.8, service: 4, path: 4,
};
const DRAW_ORDER: RoadClass[] = ["path", "service", "street", "tertiary", "secondary", "primary", "motorway"];

/** El yazısı fontlarda harf aralığı ve büyük harf bozuk durur */
const SCRIPT_FONTS = new Set(["dancing-script", "great-vibes"]);
/** Alt satırda da kullanılabilecek sakin fontlar; diğerlerinde Montserrat */
const BODY_FONTS = new Set(["montserrat", "poppins", "quicksand", "oswald", "playfair", "cormorant"]);

type P = [number, number];
interface Rect { l: number; t: number; r: number; b: number }

const f1 = (n: number) => Math.round(n * 10) / 10;

// ── Konum ────────────────────────────────────────────────────────────────

interface ResolvedPoint { lat: number; lon: number; city: CitymapCity | null }

function parseCoord(v: unknown, min: number, max: number): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : NaN;
}

/** Listede bu noktaya en yakın şehir (50 km içinde) — özel noktada varsayılan başlık için */
function nearestCity(lat: number, lon: number): CitymapCity | null {
  let best: CitymapCity | null = null;
  let bestD = Infinity;
  for (const c of CITYMAP_CITIES) {
    const dx = (c.lon - lon) * Math.cos((lat * Math.PI) / 180) * 111.32;
    const dy = (c.lat - lat) * 110.54;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= 50 ? best : null;
}

function resolvePoint(config: CitymapConfig, fields: Record<string, string>): ResolvedPoint {
  if (config.allowCustomPoint) {
    const lat = parseCoord(fields.lat, -80, 84);
    const lon = parseCoord(fields.lon, -180, 180);
    if (lat !== null || lon !== null) {
      if (lat === null || lon === null || Number.isNaN(lat) || Number.isNaN(lon)) {
        throw new GeneratorInputError("Enlem -80 ile 84, boylam -180 ile 180 arasında bir sayı olmalı (ör. 41.0082 ve 28.9784)", "Latitude must be between -80 and 84 and longitude between -180 and 180 (e.g. 41.0082 and 28.9784)");
      }
      // ~100 m'ye yuvarlanır: önbellek aynı mahalle için tekrar kullanılabilsin
      const rl = Math.round(lat * 1000) / 1000;
      const ro = Math.round(lon * 1000) / 1000;
      return { lat: rl, lon: ro, city: nearestCity(rl, ro) };
    }
  }
  const allowed = citymapCitiesFor(config);
  const city = allowed.find((c) => c.id === fields.city) ?? findCitymapCity(config.defaultCity) ?? allowed[0];
  return { lat: city.lat, lon: city.lon, city };
}

// ── Geometri ─────────────────────────────────────────────────────────────

function makeProjector(lat0: number, lon0: number, radiusKm: number) {
  const k = MAP / (2 * radiusKm * 1000);
  const cosLat = Math.cos((lat0 * Math.PI) / 180);
  const cx = MAP_X + MAP / 2;
  const cy = MAP_Y + MAP / 2;
  return (flat: number[]): P[] => {
    const out: P[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      out.push([cx + (flat[i] - lon0) * cosLat * 111_320 * k, cy - (flat[i + 1] - lat0) * 110_540 * k]);
    }
    return out;
  };
}

function bboxOutside(pts: P[], r: Rect): boolean {
  let l = Infinity, t = Infinity, rr = -Infinity, b = -Infinity;
  for (const [x, y] of pts) {
    if (x < l) l = x; if (x > rr) rr = x;
    if (y < t) t = y; if (y > b) b = y;
  }
  return rr < r.l || l > r.r || b < r.t || t > r.b;
}

/** 1 px'ten yakın ardışık noktaları atar (baskıda fark edilmez, SVG'yi küçültür) */
function decimate(pts: P[], minDist = 1.1): P[] {
  if (pts.length <= 2) return pts;
  const out: P[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [lx, ly] = out[out.length - 1];
    if (Math.abs(pts[i][0] - lx) + Math.abs(pts[i][1] - ly) >= minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function pathData(lines: P[][], close = false): string {
  let d = "";
  for (const raw of lines) {
    const pts = decimate(raw);
    if (pts.length < 2) continue;
    d += `M${f1(pts[0][0])} ${f1(pts[0][1])}L`;
    for (let i = 1; i < pts.length; i++) d += `${i > 1 ? " " : ""}${f1(pts[i][0])} ${f1(pts[i][1])}`;
    if (close) d += "Z";
  }
  return d;
}

/** Liang–Barsky: doğru parçasının dikdörtgen içindeki kısmı (t0, t1 ∈ [0,1]) */
function clipSegment(a: P, b: P, r: Rect): [P, P, number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  const edges: Array<[number, number]> = [[-dx, a[0] - r.l], [dx, r.r - a[0]], [-dy, a[1] - r.t], [dy, r.b - a[1]]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy], t0, t1];
}

/** Çizginin dikdörtgen içinde kalan parçaları (sırası ve yönü korunur) */
function clipPolyline(pts: P[], r: Rect): P[][] {
  const runs: P[][] = [];
  let cur: P[] | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = clipSegment(pts[i], pts[i + 1], r);
    if (!c) { if (cur) { runs.push(cur); cur = null; } continue; }
    const [a, b, t0, t1] = c;
    if (!cur || t0 > 0) { if (cur) runs.push(cur); cur = [a]; }
    cur.push(b);
    if (t1 < 1) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs;
}

const inside = (p: P, r: Rect) => p[0] > r.l && p[0] < r.r && p[1] > r.t && p[1] < r.b;

/**
 * Dikdörtgen çevresinde, ekranda saat yönünde (üst kenar soldan sağa)
 * konum. Nokta kenarda değilse null.
 */
function perimeterPos(p: P, r: Rect): number | null {
  const w = r.r - r.l, h = r.b - r.t, eps = 0.01;
  if (Math.abs(p[1] - r.t) < eps) return p[0] - r.l;
  if (Math.abs(p[0] - r.r) < eps) return w + (p[1] - r.t);
  if (Math.abs(p[1] - r.b) < eps) return w + h + (r.r - p[0]);
  if (Math.abs(p[0] - r.l) < eps) return 2 * w + h + (r.b - p[1]);
  return null;
}

/**
 * Kıyı çizgisinden deniz poligonu. OSM'de kıyı çizgisi karada solda, deniz
 * sağda kalacak yönde çizilir; ekranda y ekseni ters döndüğü için deniz
 * ekranda gidiş yönünün sağına değil "saat yönü içine" düşer. Her kırpılmış
 * parça çerçeveye bir yerden girip bir yerden çıkar; çıkış noktasından
 * çerçeve boyunca saat yönünde ilerleyip sıradaki girişe bağlanınca deniz
 * poligonları kapanır. Tamamen içeride kalan kapalı kıyılar adadır
 * (evenodd ile delik olur).
 *
 * Veri tutarsızsa (zincir çerçevenin içinde bitiyorsa) null döner; çağıran
 * kıyıyı yalnızca çizgi olarak çizer.
 */
function seaPolygons(chains: P[][], r: Rect): { d: string; islands: P[][] } | null {
  const w = r.r - r.l, h = r.b - r.t, per = 2 * (w + h);
  const corners: Array<[number, P]> = [[w, [r.r, r.t]], [w + h, [r.r, r.b]], [2 * w + h, [r.l, r.b]], [per, [r.l, r.t]]];
  const runs: Array<{ pts: P[]; tIn: number; tOut: number }> = [];
  const islands: P[][] = [];

  for (let chain of chains) {
    if (chain.length < 2) continue;
    const closed = chain[0][0] === chain[chain.length - 1][0] && chain[0][1] === chain[chain.length - 1][1];
    if (closed) {
      // Halkayı çerçeve dışındaki bir noktadan başlat: kırpma parçaları bölünmesin
      const outIdx = chain.findIndex((p) => !inside(p, r));
      if (outIdx < 0) { islands.push(chain); continue; }
      chain = chain.slice(outIdx, -1).concat(chain.slice(0, outIdx + 1));
    }
    for (const run of clipPolyline(chain, r)) {
      if (run.length < 2) continue;
      const tIn = perimeterPos(run[0], r);
      const tOut = perimeterPos(run[run.length - 1], r);
      if (tIn === null || tOut === null) return null;
      runs.push({ pts: run, tIn, tOut });
    }
  }

  if (!runs.length) {
    // Kıyı çerçeveyi kesmiyor: içeride ada varsa çevresi denizdir
    if (!islands.length) return { d: "", islands: [] };
    return { d: `M${r.l} ${r.t}H${r.r}V${r.b}H${r.l}Z`, islands };
  }

  const used = new Set<number>();
  const polys: P[][] = [];
  for (let s = 0; s < runs.length; s++) {
    if (used.has(s)) continue;
    const poly: P[] = [];
    let i = s;
    for (let guard = 0; guard <= runs.length; guard++) {
      used.add(i);
      poly.push(...runs[i].pts);
      const tOut = runs[i].tOut;
      // Çıkıştan saat yönünde en yakın giriş
      let next = -1, bestGap = Infinity;
      for (let j = 0; j < runs.length; j++) {
        if (used.has(j) && j !== s) continue;
        const gap = (runs[j].tIn - tOut + per) % per;
        if (gap < bestGap) { bestGap = gap; next = j; }
      }
      if (next < 0) return null;
      // Çıkış ile giriş arasında kalan çerçeve köşeleri
      const between = corners
        .map(([t, p]) => [((t - tOut + per) % per) || per, p] as [number, P])
        .filter(([g]) => g < bestGap)
        .sort((x, y) => x[0] - y[0]);
      for (const [, p] of between) poly.push(p);
      if (next === s) break;
      i = next;
    }
    polys.push(poly);
  }
  return { d: pathData(polys, true), islands };
}

// ── Şekiller ve işaret ───────────────────────────────────────────────────

/**
 * Kalbin mutlak koordinatlı yolu (CITYMAP_SHAPES'teki 100'lük kalple aynı
 * eğriler). `transform` yerine koordinatlar ölçeklenir: aynı yol kontur
 * olarak çizildiğinde çizgi kalınlığı büyümesin.
 */
function heartD(ox: number, oy: number, k: number): string {
  const pts = [
    [50, 92], [22, 70], [4, 54], [4, 32], [4, 16], [16, 6], [29, 6], [38, 6], [45, 11], [50, 18],
    [55, 11], [62, 6], [71, 6], [84, 6], [96, 16], [96, 32], [96, 54], [78, 70], [50, 92],
  ].map(([x, y]) => `${f1(ox + x * k)} ${f1(oy + y * k)}`);
  return `M${pts[0]}C${pts.slice(1, 4).join(" ")} ${pts.slice(4, 7).join(" ")} ${pts.slice(7, 10).join(" ")}`
    + ` ${pts.slice(10, 13).join(" ")} ${pts.slice(13, 16).join(" ")} ${pts.slice(16, 19).join(" ")}Z`;
}

function shapeSvg(shape: CitymapShapeId, attrs = ""): string {
  if (shape === "circle") return `<circle cx="${MAP_X + MAP / 2}" cy="${MAP_Y + MAP / 2}" r="${MAP / 2}"${attrs}/>`;
  if (shape === "square") return `<rect x="${MAP_X}" y="${MAP_Y}" width="${MAP}" height="${MAP}"${attrs}/>`;
  // 100'lük kutuda kalp 4..96 genişliğinde: kutuyu yatayda tam dolduracak ölçek
  const k = MAP / 92;
  return `<path d="${heartD(MAP_X - 4 * k, MAP_Y - 4 * k, k)}"${attrs}/>`;
}

/** Ucu tam merkeze basan damla biçimli iğne */
function pinD(cx: number, cy: number): string {
  return `M${cx} ${cy}c-12-26-44-52-44-82a44 44 0 0 1 88 0c0 30-32 56-44 82Z`;
}

// ── Metin ────────────────────────────────────────────────────────────────

function upper(s: string, lang: "tr" | "en") {
  return s.toLocaleUpperCase(lang === "tr" ? "tr-TR" : "en-US");
}

function coordLine(lat: number, lon: number, lang: "tr" | "en") {
  const ns = lat >= 0 ? (lang === "tr" ? "K" : "N") : lang === "tr" ? "G" : "S";
  const ew = lon >= 0 ? (lang === "tr" ? "D" : "E") : lang === "tr" ? "B" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns} / ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

function defaultSubtitle(city: CitymapCity | null, lang: "tr" | "en") {
  if (!city) return "";
  const country = CITYMAP_COUNTRIES[city.country]?.[lang] ?? "";
  return city.parent ? `${city.parent} · ${country}` : country;
}

// ── Modül ────────────────────────────────────────────────────────────────

export const citymapGenerator: GeneratorServerModule<CitymapConfig> = {
  config: citymapConfig,

  publicAssets(config) {
    const lang = config.labelLanguage;
    return {
      styles: config.styles.map((id) => {
        const s = CITYMAP_STYLES.find((x) => x.id === id)!;
        return { id, label: s.label, labelEn: s.labelEn, bg: s.bg, ink: s.ink };
      }),
      shapes: config.shapes.map((id) => {
        const s = CITYMAP_SHAPES.find((x) => x.id === id)!;
        return { id, label: s.label, labelEn: s.labelEn, path: s.path };
      }),
      radii: config.radii,
      defaultRadius: config.defaultRadius,
      fonts: config.fonts.map((id) => ({ id, label: FONT_LIBRARY.find((x) => x.id === id)?.label ?? id })),
      // Türkiye önce (liste zaten öyle sıralı); arama için ad + bağlı il/ülke
      cities: citymapCitiesFor(config).map((c) => ({
        id: c.id,
        name: c.name,
        nameEn: c.nameEn ?? c.name,
        label: citymapCityLabel(c, "tr"),
        labelEn: citymapCityLabel(c, "en"),
        tr: c.country === "TR",
      })),
      defaultCity: config.defaultCity,
      allowCustomPoint: config.allowCustomPoint,
      titleMax: CITYMAP_TITLE_MAX,
      subtitleMax: CITYMAP_SUBTITLE_MAX,
      labelLanguage: lang,
    };
  },

  async compose(config, input) {
    const fields = input.fields ?? {};
    const choices = input.choices ?? {};
    const lang = config.labelLanguage;

    const style = pickAllowed(choices.style, config.styles);
    const shape = pickAllowed(choices.shape, config.shapes);
    const radiusRaw = Number(choices.radius);
    const radius = config.radii.includes(radiusRaw) ? radiusRaw : config.defaultRadius;
    const fontId = pickAllowed(choices.font, config.fonts);
    const pal = PALETTES[style];
    const isInk = !pal.bg;
    const point = resolvePoint(config, fields);

    const script = SCRIPT_FONTS.has(fontId);
    const cityName = point.city ? (lang === "en" ? point.city.nameEn ?? point.city.name : point.city.name) : "";
    let title = cleanText(fields.title, CITYMAP_TITLE_MAX) || cityName;
    if (!script) title = upper(title, lang);
    const subtitle = upper(cleanText(fields.subtitle, CITYMAP_SUBTITLE_MAX) || defaultSubtitle(point.city, lang), lang);

    const [titleFont, bodyFont, smallFont, data] = await Promise.all([
      loadLibraryFont(fontId),
      loadLibraryFont(BODY_FONTS.has(fontId) ? fontId : "montserrat"),
      // Atıf en küçük yazı: her fontta okunur kalsın diye hep Montserrat
      loadLibraryFont("montserrat"),
      loadCitymapData(point.lat, point.lon, radius),
    ]);

    const mapSvg = drawMap(data, point, radius, style, shape, config);

    // ── Yazılar ──
    const mapBottom = MAP_Y + MAP;
    const attribution = lang === "tr" ? "© OpenStreetMap katkıda bulunanlar" : "© OpenStreetMap contributors";
    const attr = textSvg({
      font: smallFont, text: attribution, x: W / 2, y: mapBottom + 88, size: 40, fill: pal.muted,
      anchor: "middle", letterSpacing: 0.03,
    });
    // Yazılar tişörtte küçük kalıyordu: başlık ~1,2, alt satırlar ~1,5 katına
    const titleSize = script ? 300 : 236;
    const titleY = mapBottom + (script ? 430 : 400);
    const titleSvg = textSvg({
      font: titleFont, text: title, x: W / 2, y: titleY, size: titleSize, fill: pal.text,
      anchor: "middle", maxWidth: MAP - 40, letterSpacing: script ? 0 : 0.12,
    });
    const subY = titleY + 185;
    const subSvg = textSvg({
      font: bodyFont, text: subtitle, x: W / 2, y: subY, size: 94, fill: pal.text,
      anchor: "middle", maxWidth: MAP - 80, letterSpacing: 0.16,
    });
    const coordSvg = config.showCoordinates
      ? textSvg({
          font: bodyFont, text: coordLine(point.lat, point.lon, lang), x: W / 2, y: subY + (subtitle ? 135 : 0),
          size: 68, fill: pal.muted, anchor: "middle", letterSpacing: 0.08,
        })
      : { svg: "" };
    // Başlıkla alt satır arasında kısa ayraç (el yazısında kuyruklara çarpar, konmaz)
    const rule = title && !script && (subtitle || config.showCoordinates)
      ? `<rect x="${W / 2 - 120}" y="${titleY + 68}" width="240" height="6" fill="${pal.text}"/>`
      : "";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
      + (isInk ? "" : `<rect width="${W}" height="${H}" fill="${pal.bg}"/>`)
      + mapSvg + attr.svg + titleSvg.svg + rule + subSvg.svg + coordSvg.svg
      + `</svg>`;

    const out = await svgRaster(svg).png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  },
};

function drawMap(
  data: CitymapGeoData,
  point: ResolvedPoint,
  radius: number,
  style: CitymapStyleId,
  shape: CitymapShapeId,
  config: CitymapConfig,
): string {
  const pal = PALETTES[style];
  const isInk = !pal.bg;
  const project = makeProjector(point.lat, point.lon, radius);
  const view: Rect = { l: MAP_X - 6, t: MAP_Y - 6, r: MAP_X + MAP + 6, b: MAP_Y + MAP + 6 };
  const cull: Rect = { l: MAP_X - 60, t: MAP_Y - 60, r: MAP_X + MAP + 60, b: MAP_Y + MAP + 60 };
  const visible = (lines: number[][]) => lines.map(project).filter((p) => p.length >= 2 && !bboxOutside(p, cull));

  // Geniş alanda kalınlık biraz incelir, yakın planda kalınlaşır; baskıda en az 4 px
  const scale = Math.pow(2 / radius, 0.4);
  const width = (c: RoadClass) => f1(Math.max(4, ROAD_WIDTH[c] * scale));

  // Yaya yolu ve servis yolu yoğunluğu: tişört baskısında (tek renk) sade
  // kalsın; posterde yakın planda ayrıntı güzel durur.
  const include = (c: RoadClass) => {
    if (c === "path") return !isInk && radius <= 2;
    if (c === "service") return isInk ? radius <= 1 : radius <= 3.5;
    return true;
  };

  const byClass = new Map<RoadClass, P[][]>();
  for (const [cls, flat] of data.roads) {
    if (!include(cls)) continue;
    const pts = project(flat);
    if (pts.length < 2 || bboxOutside(pts, cull)) continue;
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls)!.push(pts);
  }

  const cx = MAP_X + MAP / 2;
  const cy = MAP_Y + MAP / 2;
  let body = "";

  // Su: posterde deniz + göller dolu; mürekkepte yalnız kıyı çizgisi
  const coast = data.coast.map(project).filter((p) => p.length >= 2);
  const sea = seaPolygons(coast, view);
  const lakes = visible(data.water);
  const rivers = visible(data.rivers);
  const waterLine = f1(Math.max(4, 5 * scale));
  if (!isInk) {
    if (config.showParks) {
      const parks = visible(data.parks);
      if (parks.length) body += `<path fill="${pal.park}" fill-rule="evenodd" d="${pathData(parks, true)}"/>`;
    }
    let waterD = sea ? sea.d + pathData(sea.islands, true) : "";
    waterD += pathData(lakes, true);
    if (waterD) body += `<path fill="${pal.water}" fill-rule="evenodd" d="${waterD}"/>`;
    if (rivers.length) {
      body += `<path fill="none" stroke="${pal.water}" stroke-width="${f1(Math.max(8, 14 * scale))}" stroke-linecap="round" stroke-linejoin="round" d="${pathData(rivers)}"/>`;
    }
    if (!sea && coast.length) {
      body += `<path fill="none" stroke="${pal.water}" stroke-width="${waterLine * 2}" stroke-linejoin="round" d="${pathData(coast)}"/>`;
    }
  } else {
    // Tek renk: denizi boş bırakmak yolların bittiği yerle kıyıyı zaten
    // gösterir; ince bir kıyı ve göl çizgisi şekli netleştirir.
    const lines = [...coast, ...lakes.map((r) => [...r, r[0]])];
    if (lines.length) {
      body += `<path fill="none" stroke="${pal.road}" stroke-width="${waterLine}" stroke-linecap="round" stroke-linejoin="round" d="${pathData(lines)}"/>`;
    }
    if (rivers.length) {
      body += `<path fill="none" stroke="${pal.road}" stroke-width="${waterLine}" stroke-linecap="round" stroke-linejoin="round" d="${pathData(rivers)}"/>`;
    }
  }

  for (const cls of DRAW_ORDER) {
    const lines = byClass.get(cls);
    if (!lines?.length) continue;
    const color = cls === "path" ? pal.path : pal.road;
    body += `<path fill="none" stroke="${color}" stroke-width="${width(cls)}" stroke-linecap="round" stroke-linejoin="round" d="${pathData(lines)}"/>`;
  }

  // İşaret: çevresindeki yollar maskeyle silinir; mürekkep stillerinde
  // işaret yol rengindeyken bile seçilsin. İğnenin deliği evenodd ile boş.
  let markerD = "";
  if (config.marker === "heart") {
    const k = 0.92;
    markerD = heartD(cx - 50 * k, cy - 50 * k, k);
  } else if (config.marker === "pin") {
    markerD = `${pinD(cx, cy)}M${cx + 16} ${cy - 84}a16 16 0 1 0 -32 0a16 16 0 1 0 32 0Z`;
  }
  const mask = markerD
    ? `<mask id="cm-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>`
      + `<path d="${markerD}" fill="#000" stroke="#000" stroke-width="${f1(Math.max(26, width("primary") * 2.4))}" stroke-linejoin="round"/></mask>`
    : "";
  const markerSvg = markerD ? `<path d="${markerD}" fill="${pal.accent}" fill-rule="evenodd"/>` : "";

  // Tek renk baskıda deniz boş kaldığında şeklin sınırı kaybolur (kalbin
  // yarısı denizse kalp okunmaz): ince bir kontur şekli tamamlar.
  const outline = isInk
    ? shapeSvg(shape, ` fill="none" stroke="${pal.road}" stroke-width="${f1(Math.max(5, 6 * scale))}"`)
    : "";

  return `<defs><clipPath id="cm-clip">${shapeSvg(shape)}</clipPath>${mask}</defs>`
    + `<g clip-path="url(#cm-clip)"><g${mask ? ` mask="url(#cm-mask)"` : ""}>${body}</g></g>`
    + outline + markerSvg;
}
