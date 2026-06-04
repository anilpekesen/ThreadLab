import { S3Client, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.R2_BUCKET ?? "printlabapp-designs";
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
const TEMP_KEY_PREFIXES = ["uploads/", "ai-gen/"];

export async function uploadToR2(
  buffer: Buffer,
  ext: string,
  folder = "uploads"
): Promise<string> {
  const key = `${folder}/${randomBytes(16).toString("hex")}.${ext}`;
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType:
        ext === "png" ? "image/png"
        : ext === "jpg" ? "image/jpeg"
        : ext === "svg" ? "image/svg+xml"
        : "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

export function getR2KeyFromPublicUrl(url: string, allowedPrefixes = TEMP_KEY_PREFIXES): string | null {
  if (!PUBLIC_URL || !url) return null;

  let publicUrl: URL;
  let objectUrl: URL;
  try {
    publicUrl = new URL(PUBLIC_URL);
    objectUrl = new URL(url);
  } catch {
    return null;
  }

  if (objectUrl.origin !== publicUrl.origin) return null;

  const basePath = publicUrl.pathname.replace(/\/+$/, "");
  const objectPath = decodeURIComponent(objectUrl.pathname);
  if (basePath && objectPath !== basePath && !objectPath.startsWith(`${basePath}/`)) return null;

  const key = objectPath.slice(basePath.length).replace(/^\/+/, "");
  if (!key || !allowedPrefixes.some((prefix) => key.startsWith(prefix))) return null;

  return key;
}

export async function deleteR2ObjectByUrl(url: string): Promise<string | null> {
  const key = getR2KeyFromPublicUrl(url);
  if (!key) return null;

  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );

  return key;
}
