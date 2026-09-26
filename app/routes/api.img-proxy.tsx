import type { LoaderFunctionArgs } from "@remix-run/node";
import { query } from "~/lib/db.server";

const ALLOWED_HOSTS = ["assets.printlabapp.com", "app.printlabapp.com"];

/**
 * Bağlı WooCommerce sitelerinin ürün görselleri (wp-content/uploads) CORS
 * başlığı vermez; tasarımcı bunları buradan alır. Yalnız bağlı sitelerin
 * alan adları açılır (rastgele adres değil), liste 5 dakika önbelleklenir.
 */
let wooHosts: { set: Set<string>; at: number } | null = null;
async function connectedWooHosts(): Promise<Set<string>> {
  if (wooHosts && Date.now() - wooHosts.at < 300_000) return wooHosts.set;
  const set = new Set<string>();
  try {
    const r = await query<{ site_url: string }>("SELECT site_url FROM woo_connections");
    for (const row of r.rows) {
      try { set.add(new URL(row.site_url).hostname); } catch { /* bozuk adres */ }
    }
  } catch (err) {
    console.error("[img-proxy] woo hosts:", err);
  }
  wooHosts = { set, at: Date.now() };
  return set;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response("url required", { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return new Response("invalid url", { status: 400 });
  }
  const woo = !ALLOWED_HOSTS.includes(parsed.hostname);
  if (woo && (parsed.protocol !== "https:" || !(await connectedWooHosts()).has(parsed.hostname))) {
    return new Response("forbidden", { status: 403 });
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    // Mağaza sitesi yönlendirmeyle iç adrese götürmesin
    redirect: woo ? "error" : "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PrintlabImgProxy/1.0)",
      "Accept": "image/*,*/*;q=0.8",
    },
  }).catch((err) => {
    console.error(`[img-proxy] fetch threw for ${url}:`, err);
    return null;
  });
  if (!res?.ok) {
    console.error(`[img-proxy] upstream failed for ${url}: status=${res?.status} statusText=${res?.statusText}`);
    return new Response("fetch failed", { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/png";
  // Mağaza sitelerinden yalnız görsel, en çok 20 MB
  if (woo && (!contentType.startsWith("image/") || Number(res.headers.get("content-length") ?? 0) > 20 * 1024 * 1024)) {
    return new Response("not an image", { status: 415 });
  }
  const buffer = await res.arrayBuffer();
  if (woo && buffer.byteLength > 20 * 1024 * 1024) return new Response("too large", { status: 413 });

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
