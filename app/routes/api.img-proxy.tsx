import type { LoaderFunctionArgs } from "@remix-run/node";

const ALLOWED_HOSTS = ["assets.printlabapp.com", "app.printlabapp.com"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response("url required", { status: 400 });

  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return new Response("invalid url", { status: 400 });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response("forbidden", { status: 403 });
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
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
  const buffer = await res.arrayBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
