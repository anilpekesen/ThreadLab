import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { parseSpotifyLink } from "~/lib/generators/song/spotify-code.server";
import { fetchSpotifyInfo } from "~/lib/generators/song/spotify-info.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Şarkı tasarımı penceresi: müşteri Spotify bağlantısını yapıştırınca şarkı
 * adı, sanatçı, süre ve kapak buradan gelir. Bilgi bulunamazsa 404 döner;
 * pencere alanları müşteriye bırakır.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const link = new URL(request.url).searchParams.get("link") ?? "";
  const ref = parseSpotifyLink(link.slice(0, 300));
  if (!ref) return json({ error: "Spotify bağlantısı tanınmadı" }, { status: 400, headers: CORS });
  const info = await fetchSpotifyInfo(ref);
  if (!info) return json({ error: "Şarkı bilgisi alınamadı" }, { status: 404, headers: CORS });
  return json(info, { headers: { ...CORS, "Cache-Control": "public, max-age=86400" } });
};
