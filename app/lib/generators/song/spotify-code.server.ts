/**
 * Spotify kodu: bağlantıdan parça kimliğini çıkarır, kodun çubuklarını
 * Spotify'ın herkese açık "scannables" servisinden vektör olarak alır.
 *
 * Servisin PNG'si 640 px ile sınırlı ve zemini düz renk; baskıda bulanık ve
 * kutulu duruyordu. SVG varyantı 23 yuvarlak çubuk + kodun başındaki okuma
 * işaretinden (daire içinde üç yay) oluşuyor. Bunları ayrıştırıp kendi
 * rengimizle yeniden çiziyoruz: zemin dikdörtgeni atılır, kod her boyda
 * keskin basılır ve renk temaya uyar. Okuma işareti kodun parçası — okuyucu
 * yönü ve ölçeği ondan buluyor; atılırsa kod okunmuyor.
 */

export type SpotifyRefType = "track" | "album" | "playlist";

export interface SpotifyRef {
  type: SpotifyRefType;
  id: string;
}

/** Kodun 400x100 birimlik orijinal kutusundaki parçaları */
export interface SpotifyCodeShape {
  bars: Array<{ x: number; y: number; w: number; h: number; r: number }>;
  /** Okuma işareti: yol ve orijinal kutudaki konumu */
  mark: { d: string; x: number; y: number };
}

/** Kodun çizim kutusu (orijinal birimlerde): işaretin solu → son çubuğun sağı */
export const CODE_BOX = { x: 20, y: 20, w: 360, h: 60 } as const;

const ID_RE = /^[0-9A-Za-z]{22}$/;

/**
 * Desteklenen biçimler:
 *   https://open.spotify.com/track/<id>?si=...
 *   https://open.spotify.com/intl-tr/track/<id>
 *   spotify:track:<id>
 * Albüm ve çalma listesi bağlantılarının kodu da aynı servisle çalışır.
 * Tanınmazsa null.
 */
export function parseSpotifyLink(raw: string): SpotifyRef | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const uri = s.match(/^spotify:(track|album|playlist):([0-9A-Za-z]{22})$/);
  if (uri) return { type: uri[1] as SpotifyRefType, id: uri[2] };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.hostname !== "open.spotify.com") return null;
  // intl-xx öneki ve "embed" gibi ara parçalar atlanır
  const parts = url.pathname.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const t = parts[i];
    if ((t === "track" || t === "album" || t === "playlist") && ID_RE.test(parts[i + 1])) {
      return { type: t, id: parts[i + 1] };
    }
  }
  return null;
}

// ── Önbellek ───────────────────────────────────────────────────────────
// Aynı şarkı sık tekrarlanıyor (müşteri önizlemeyi birkaç kez çizdiriyor).
// Map ekleme sırasını koruduğu için basit bir LRU yeter; "bulunamadı"
// sonucu da saklanır ki yanlış bağlantı servisi tekrar tekrar yormasın.
const CACHE_MAX = 300;
const cache = new Map<string, SpotifyCodeShape | "missing">();

function cacheGet(key: string) {
  const v = cache.get(key);
  if (v !== undefined) {
    cache.delete(key);
    cache.set(key, v);
  }
  return v;
}

function cacheSet(key: string, v: SpotifyCodeShape | "missing") {
  cache.delete(key);
  cache.set(key, v);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

const num = (v: string) => Number.parseFloat(v);

/** Servisin SVG'sini ayrıştırır; beklenen yapı yoksa null (dışarıdan gelen metin SVG'mize olduğu gibi girmez) */
export function parseCodeSvg(svg: string): SpotifyCodeShape | null {
  const bars: SpotifyCodeShape["bars"] = [];
  const rectRe = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)"/g;
  for (const m of svg.matchAll(rectRe)) {
    bars.push({ x: num(m[1]), y: num(m[2]), w: num(m[3]), h: num(m[4]), r: num(m[5]) });
  }
  const mark = svg.match(/<g transform="translate\(([\d.]+),\s*([\d.]+)\)">\s*<path[^>]*\sd="([MmLlHhVvCcSsZz0-9.,\s-]+)"/);
  if (bars.length !== 23 || !mark) return null;
  if (bars.some((b) => [b.x, b.y, b.w, b.h, b.r].some((n) => !Number.isFinite(n)))) return null;
  return { bars, mark: { d: mark[3].trim(), x: num(mark[1]), y: num(mark[2]) } };
}

export type SpotifyCodeResult =
  | { ok: true; shape: SpotifyCodeShape }
  | { ok: false; reason: "missing" | "unavailable" };

/**
 * Kodu getirir. Servis var olmayan kimlik için 400 döner → "missing".
 * Ağ hatası/zaman aşımı → "unavailable" (önbelleğe alınmaz).
 */
export async function fetchSpotifyCode(ref: SpotifyRef): Promise<SpotifyCodeResult> {
  const key = `${ref.type}:${ref.id}`;
  const hit = cacheGet(key);
  if (hit === "missing") return { ok: false, reason: "missing" };
  if (hit) return { ok: true, shape: hit };

  try {
    // Renkler önemsiz: yalnızca geometri kullanılıyor
    const res = await fetch(`https://scannables.scdn.co/uri/plain/svg/000000/white/640/spotify:${key}`, {
      headers: { "User-Agent": "resimapp-song-generator/1.0 (+print-on-demand design)", Accept: "image/svg+xml" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 400 || res.status === 404) {
      cacheSet(key, "missing");
      return { ok: false, reason: "missing" };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const shape = parseCodeSvg(await res.text());
    if (!shape) throw new Error("beklenmeyen SVG yapısı");
    cacheSet(key, shape);
    return { ok: true, shape };
  } catch (err) {
    console.warn(`[song] Spotify kodu alınamadı (${key}):`, err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Kodu verilen genişlikte, (x, y) sol üst köşeye çizen SVG parçası.
 * Yükseklik = genişlik / 6.
 */
export function codeSvg(shape: SpotifyCodeShape, x: number, y: number, width: number, fill: string): string {
  const k = width / CODE_BOX.w;
  const f = (n: number) => Number(n.toFixed(2));
  const bars = shape.bars
    .map((b) => `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="${f(b.r)}"/>`)
    .join("");
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(k)}) translate(${-CODE_BOX.x} ${-CODE_BOX.y})" fill="${fill}">`
    + `<path transform="translate(${f(shape.mark.x)} ${f(shape.mark.y)})" d="${shape.mark.d}"/>${bars}</g>`;
}
