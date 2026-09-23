import type { SpotifyRef } from "./spotify-code.server";

/**
 * Spotify bağlantısından şarkı bilgisi: ad, sanatçı, süre ve kapak.
 *
 * Resmi API kimlik doğrulaması istiyor; şarkının herkese açık sayfası ise
 * aynı bilgileri meta etiketlerinde veriyor (og:title, music:musician_description,
 * music:duration, og:image). Müşteri bağlantıyı yapıştırınca pencere alanları
 * bununla dolduruyor; "Albüm kapağını kullan" seçilirse kapak fotoğraf olur.
 *
 * Sayfa yapısı değişirse bilgi boş döner ve müşteri alanları elle doldurur;
 * tasarım üretimi buna bağlı değil.
 */

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  /** Saniye; bilinmiyorsa 0 */
  durationSec: number;
  /** Yalnızca i.scdn.co adresi; başka bir alan adı kabul edilmez */
  coverUrl: string;
}

const TIMEOUT_MS = 6000;
const MAX_CACHE = 300;
const cache = new Map<string, SpotifyTrackInfo | null>();
const inflight = new Map<string, Promise<SpotifyTrackInfo | null>>();

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

function meta(html: string, key: string): string {
  // property="og:title" ya da name="music:duration"; öznitelik sırası değişebilir
  const re = new RegExp(`<meta[^>]+(?:property|name)="${key.replace(/[:.]/g, "\\$&")}"[^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content="([^"]*)"/i)?.[1];
  return content ? decode(content).trim() : "";
}

export function isSpotifyCoverUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "i.scdn.co";
  } catch {
    return false;
  }
}

async function load(ref: SpotifyRef): Promise<SpotifyTrackInfo | null> {
  try {
    const res = await fetch(`https://open.spotify.com/${ref.type}/${ref.id}`, {
      headers: {
        // Meta etiketleri tarayıcı gibi görünen isteklerde geliyor
        "User-Agent": "Mozilla/5.0 (compatible; PrintLabApp/1.0; +https://app.printlabapp.com)",
        "Accept-Language": "tr,en;q=0.8",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    const title = meta(html, "og:title");
    // Sanatçı: şarkıda ayrı etiket var; albümde açıklamanın ilk parçası
    const artist = meta(html, "music:musician_description")
      || meta(html, "og:description").split(" · ")[0] || "";
    const durationSec = Number(meta(html, "music:duration")) || 0;
    const image = meta(html, "og:image");
    if (!title) return null;
    return {
      title,
      artist,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 && durationSec < 6 * 3600 ? Math.round(durationSec) : 0,
      coverUrl: isSpotifyCoverUrl(image) ? image : "",
    };
  } catch (err) {
    console.warn(`[spotify-info] ${ref.type}/${ref.id} alınamadı:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchSpotifyInfo(ref: SpotifyRef): Promise<SpotifyTrackInfo | null> {
  const key = `${ref.type}:${ref.id}`;
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const running = inflight.get(key);
  if (running) return running;
  const p = load(ref).then((info) => {
    // Başarısız sonuç önbelleğe alınmaz: geçici bir hata kalıcı olmasın
    if (info) {
      cache.set(key, info);
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
    }
    return info;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
