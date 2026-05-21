import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { getUploadsDir } from "~/lib/storage.server";
import { uploadToR2 } from "~/lib/r2.server";

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ error: `Method ${request.method} not allowed` }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null) as { url?: string } | null;
  const imageUrl = body?.url?.trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return json({ error: "Geçersiz URL" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PrintLab/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: "URL'den resim indirilemedi" }, { status: 422 });
  }
  if (!res.ok) return json({ error: `Sunucu yanıtı: ${res.status}` }, { status: 422 });

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  const ext = ALLOWED_IMAGE_MIME[contentType];
  if (!ext) return json({ error: "Desteklenmeyen resim formatı" }, { status: 422 });

  const buffer = Buffer.from(await res.arrayBuffer());
  const useR2 = Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_PUBLIC_URL);
  if (useR2) {
    const url = await uploadToR2(buffer, ext, "uploads/url-img");
    return json({ url });
  }
  const filename = `url-img-${randomBytes(12).toString("hex")}.${ext}`;
  await writeFile(nodePath.join(getUploadsDir(), filename), buffer);
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  return json({ url: `${appUrl}/uploads/${filename}` });
};
