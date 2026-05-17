import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
