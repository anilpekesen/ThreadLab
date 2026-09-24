import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_FETCHED_IMAGE_BYTES = 8 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ error: `Method ${request.method} not allowed` }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Mağaza dili adresten okunur (?locale=); yoksa Türkçe
  const lang: "tr" | "en" = (new URL(request.url).searchParams.get("locale") ?? "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
  const m = (tr: string, en: string) => (lang === "en" ? en : tr);
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null) as { url?: string } | null;
  const imageUrl = body?.url?.trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return json({ error: m("Geçersiz URL", "Invalid URL") }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PrintLab/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: m("URL'den resim indirilemedi", "Could not download the image from the URL") }, { status: 422 });
  }
  if (!res.ok) return json({ error: m(`Sunucu yanıtı: ${res.status}`, `Server responded with ${res.status}`) }, { status: 422 });

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  const ext = ALLOWED_IMAGE_MIME[contentType];
  if (!ext) return json({ error: m("Desteklenmeyen resim formatı", "Unsupported image format") }, { status: 422 });
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_FETCHED_IMAGE_BYTES) {
    return json({ error: m("Resim çok büyük", "Image is too large") }, { status: 422 });
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_FETCHED_IMAGE_BYTES) {
    return json({ error: m("Resim çok büyük", "Image is too large") }, { status: 422 });
  }
  return json({ url: `data:${contentType};base64,${buffer.toString("base64")}` });
};
