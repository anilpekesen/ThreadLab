import type { LoaderFunctionArgs } from "@remix-run/node";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED_HOST = "assets.printlabapp.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const fileUrl = url.searchParams.get("url") ?? "";
  const filename = url.searchParams.get("filename") ?? "tasarim.png";

  if (!fileUrl) {
    return new Response("url required", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return new Response("invalid url", { status: 400 });
  }

  if (parsed.hostname !== ALLOWED_HOST) {
    return new Response("not allowed", { status: 403 });
  }

  const upstream = await fetch(fileUrl);
  if (!upstream.ok) {
    return new Response("upstream error", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
};
