import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { GeneratorInputError } from "../types";

/**
 * Şehir haritasının verisi: OpenStreetMap, Overpass API üzerinden.
 *
 * Tek istekte merkez çevresindeki yollar, su alanları, nehirler, kıyı çizgisi
 * ve parklar alınır; stil ne olursa olsun aynı veri kullanıldığı için önbellek
 * anahtarı yalnızca konum ve yarıçap. Yanıt ham hâliyle değil, çizimin
 * ihtiyacı kadar sadeleştirilip (sınıf + düz koordinat dizisi) gzip'li
 * saklanır: İstanbul'da 5 km'lik ham yanıt onlarca MB, sade hâli birkaç MB.
 *
 * Overpass ücretsiz ve paylaşımlı bir servis; aynı haritanın her önizlemede
 * yeniden istenmemesi hem hız hem kullanım kuralları için şart. Veri ODbL
 * lisanslı: baskıda "© OpenStreetMap katkıda bulunanlar" atfı zorunlu (çizim
 * tarafında kaldırma seçeneği yok).
 */

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const USER_AGENT = "PrintLabApp/1.0 (app.printlabapp.com)";
const QUERY_TIMEOUT_S = 25;
/** Sunucu sorguyu 25 sn'de keser; aktarım için birkaç saniye pay */
const FETCH_TIMEOUT_MS = 32_000;
/** İlk sunucu bu kadar sürede bile düştüyse yedeğe geçmek müşteriyi çok bekletir */
const FALLBACK_BUDGET_MS = 15_000;
const CACHE_DIR = path.join(os.tmpdir(), "printlab-citymap");
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;

export type RoadClass = "motorway" | "primary" | "secondary" | "tertiary" | "street" | "service" | "path";

/** Koordinatlar düz dizi: [lon, lat, lon, lat, ...] (5 ondalık ≈ 1 m) */
export interface CitymapGeoData {
  v: 1;
  roads: Array<[RoadClass, number[]]>;
  /** Göl, havuz, nehir yatağı halkaları (evenodd ile doldurulur) */
  water: number[][];
  /** Nehir/kanal çizgileri (alan olarak çizilmemiş su yolları) */
  rivers: number[][];
  /** Yönlü kıyı çizgisi zincirleri (kara solda, deniz sağda) */
  coast: number[][];
  parks: number[][];
}

const ROAD_CLASS: Record<string, RoadClass> = {
  motorway: "motorway", motorway_link: "primary", trunk: "motorway", trunk_link: "primary",
  primary: "primary", primary_link: "secondary", secondary: "secondary", secondary_link: "tertiary",
  tertiary: "tertiary", tertiary_link: "street", unclassified: "street", residential: "street",
  living_street: "street", road: "street", service: "service",
  pedestrian: "path", footway: "path", path: "path", cycleway: "path",
};

function buildQuery(s: number, w: number, n: number, e: number): string {
  const bb = `(${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})`;
  // Kaldırım ve yaya geçidi çizgileri yolların iki yanında ikinci bir çizgi
  // gibi durur; otopark içi ve bina girişi servis yolları haritayı kirletir.
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|road|pedestrian|path|cycleway)$"]${bb};
  way["highway"="footway"]["footway"!~"^(sidewalk|crossing|traffic_island)$"]${bb};
  way["highway"="service"]["service"!~"^(parking_aisle|driveway|drive-through)$"]${bb};
  way["natural"="water"]${bb};
  relation["natural"="water"]${bb};
  way["waterway"~"^(riverbank|dock|river|canal)$"]${bb};
  way["natural"="coastline"]${bb};
  way["leisure"~"^(park|garden|recreation_ground)$"]${bb};
  relation["leisure"="park"]${bb};
  way["landuse"~"^(forest|recreation_ground)$"]${bb};
  way["natural"="wood"]${bb};
);
out geom qt;`;
}

type LonLat = [number, number];
interface OsmGeomPoint { lat: number; lon: number }
interface OsmElement {
  type: "way" | "relation" | "node";
  tags?: Record<string, string>;
  geometry?: Array<OsmGeomPoint | null>;
  members?: Array<{ type: string; role: string; geometry?: Array<OsmGeomPoint | null> }>;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const toPts = (g: Array<OsmGeomPoint | null> | undefined): LonLat[] =>
  (g ?? []).filter((p): p is OsmGeomPoint => !!p).map((p) => [p.lon, p.lat]);
const flat = (pts: LonLat[]) => pts.flatMap(([x, y]) => [r5(x), r5(y)]);
const key = (p: LonLat) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/**
 * Parça çizgileri uç uca ekleyerek zincirler. `allowReverse` kapalıyken
 * yön korunur (kıyı çizgisinde denizin hangi tarafta olduğu yöne bağlı).
 */
export function joinChains(parts: LonLat[][], allowReverse: boolean): LonLat[][] {
  const pool = parts.filter((p) => p.length >= 2).map((p) => p.slice());
  const out: LonLat[][] = [];
  while (pool.length) {
    let chain = pool.pop()!;
    let grown = true;
    while (grown && key(chain[0]) !== key(chain[chain.length - 1])) {
      grown = false;
      const head = key(chain[0]);
      const tail = key(chain[chain.length - 1]);
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const ps = key(p[0]);
        const pe = key(p[p.length - 1]);
        if (ps === tail) chain = chain.concat(p.slice(1));
        else if (pe === head) chain = p.concat(chain.slice(1));
        else if (allowReverse && pe === tail) chain = chain.concat(p.slice().reverse().slice(1));
        else if (allowReverse && ps === head) chain = p.slice().reverse().concat(chain.slice(1));
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(chain);
  }
  return out;
}

/** Alan (way ya da multipolygon relation) → halkalar */
function areaRings(el: OsmElement): LonLat[][] {
  if (el.type === "way") {
    const pts = toPts(el.geometry);
    return pts.length >= 3 ? [pts] : [];
  }
  const parts = (el.members ?? []).filter((m) => m.type === "way").map((m) => toPts(m.geometry));
  return joinChains(parts, true).filter((r) => r.length >= 3);
}

export function parseOverpass(elements: OsmElement[]): CitymapGeoData {
  const data: CitymapGeoData = { v: 1, roads: [], water: [], rivers: [], coast: [], parks: [] };
  const coastParts: LonLat[][] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (el.type === "way" && t.highway) {
      const cls = ROAD_CLASS[t.highway];
      // Tüneller (ör. Avrasya Tüneli) haritada denizin üstünden geçen bir yol gibi görünür
      if (!cls || (t.tunnel && t.tunnel !== "no") || t.area === "yes") continue;
      const pts = toPts(el.geometry);
      if (pts.length >= 2) data.roads.push([cls, flat(pts)]);
    } else if (t.natural === "coastline") {
      coastParts.push(toPts(el.geometry));
    } else if (t.natural === "water" || t.waterway === "riverbank" || t.waterway === "dock") {
      for (const ring of areaRings(el)) data.water.push(flat(ring));
    } else if (t.waterway === "river" || t.waterway === "canal") {
      if (t.tunnel && t.tunnel !== "no") continue;
      const pts = toPts(el.geometry);
      if (pts.length >= 2) data.rivers.push(flat(pts));
    } else if (t.leisure || t.landuse || t.natural === "wood") {
      for (const ring of areaRings(el)) data.parks.push(flat(ring));
    }
  }
  data.coast = joinChains(coastParts, false).map(flat);
  return data;
}

// ── Önbellek ────────────────────────────────────────────────────────────

function cacheFile(lat: number, lon: number, radiusKm: number) {
  return path.join(CACHE_DIR, `${lat.toFixed(4)}_${lon.toFixed(4)}_${radiusKm}.json.gz`);
}

async function readCache(file: string): Promise<CitymapGeoData | null> {
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null;
    const parsed = JSON.parse(gunzipSync(await fs.readFile(file)).toString("utf8"));
    return parsed?.v === 1 ? (parsed as CitymapGeoData) : null;
  } catch {
    return null;
  }
}

async function writeCache(file: string, data: CitymapGeoData) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    // Önce geçici dosyaya: yarım yazılmış bir önbellek bozuk harita çizdirmesin
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, gzipSync(Buffer.from(JSON.stringify(data)), { level: 6 }));
    await fs.rename(tmp, file);
  } catch (err) {
    console.warn("[citymap] önbellek yazılamadı", err);
  }
}

// ── Overpass isteği ─────────────────────────────────────────────────────

async function queryEndpoint(url: string, query: string): Promise<OsmElement[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
  // Sorgu zaman aşımına uğrarsa Overpass 200 ile yarım veri + "remark" döner;
  // yarım harita önbelleğe girerse 30 gün eksik çizilir.
  if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass: ${json.remark}`);
  if (!Array.isArray(json.elements)) throw new Error("Overpass: boş yanıt");
  return json.elements;
}

const inflight = new Map<string, Promise<CitymapGeoData>>();

/**
 * Merkez çevresindeki harita verisi. Önce disk önbelleği; yoksa Overpass
 * (asıl sunucu, hızlı düşerse yedek). Aynı konum için eşzamanlı istekler
 * tek Overpass çağrısını paylaşır.
 */
export async function loadCitymapData(lat: number, lon: number, radiusKm: number): Promise<CitymapGeoData> {
  const file = cacheFile(lat, lon, radiusKm);
  const cached = await readCache(file);
  if (cached) return cached;

  const running = inflight.get(file);
  if (running) return running;

  const job = (async () => {
    // Kare haritanın köşelerinde veri eksik kalmasın diye biraz geniş alınır
    const half = radiusKm * 1000 * 1.1;
    const dLat = half / 110_540;
    const dLon = half / (111_320 * Math.cos((lat * Math.PI) / 180));
    const query = buildQuery(lat - dLat, lon - dLon, lat + dLat, lon + dLon);
    const started = Date.now();
    let lastErr: unknown;
    // Asıl sunucu yoğunken hemen 504/429 döner; kısa bir beklemeyle bir kez
    // daha denemek çoğu zaman yedeğe gitmekten hızlı.
    const attempts = [ENDPOINTS[0], ENDPOINTS[0], ENDPOINTS[1]];
    for (let i = 0; i < attempts.length; i++) {
      const url = attempts[i];
      if (i > 0 && Date.now() - started > FALLBACK_BUDGET_MS) break;
      if (i === 1) {
        if (!(lastErr instanceof Error && /Overpass (503|504)/.test(lastErr.message))) continue;
        await new Promise((r) => setTimeout(r, 2000));
      }
      try {
        const data = parseOverpass(await queryEndpoint(url, query));
        await writeCache(file, data);
        return data;
      } catch (err) {
        lastErr = err;
        console.warn("[citymap] Overpass hatası", url, err instanceof Error ? err.message : err);
      }
    }
    console.error("[citymap] harita verisi alınamadı", lastErr);
    throw new GeneratorInputError("Harita verisi şu an alınamadı, lütfen biraz sonra tekrar deneyin");
  })();
  inflight.set(file, job);
  try {
    return await job;
  } finally {
    inflight.delete(file);
  }
}
