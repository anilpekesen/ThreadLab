/**
 * Cloudflare R2 temizlik scripti
 * Şablonlar dışındaki tüm klasörlerden 10 günden eski dosyaları siler.
 * Cron: 0 3 * * * node scripts/r2-cleanup.mjs
 */
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv() {
  try {
    const raw = await readFile(join(ROOT, ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (!process.env[key]) process.env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch { /* production envs injected by process manager */ }
}

const KEEP_DAYS = 10;
const DELETE_BATCH = 500; // R2 max 1000, güvenli limit
// Bu prefix'lerle başlayan dosyalar hiç silinmez
const PROTECTED_PREFIXES = ["templates/"];

function isProtected(key) {
  return PROTECTED_PREFIXES.some((p) => key.startsWith(p));
}

function isOlderThan(lastModified, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return lastModified < cutoff;
}

async function main() {
  await loadEnv();

  const dryRun = process.argv.includes("--dry-run");

  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });

  const bucket = process.env.R2_BUCKET ?? "printlabapp-designs";

  console.log(`[r2-cleanup] ${new Date().toISOString()} başlıyor`);
  console.log(`[r2-cleanup] bucket=${bucket} keepDays=${KEEP_DAYS} dryRun=${dryRun}`);

  let listed = 0;
  let skippedProtected = 0;
  let skippedRecent = 0;
  let toDelete = [];
  let totalDeleted = 0;
  let totalSize = 0;

  let continuationToken;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));

    for (const obj of res.Contents ?? []) {
      listed++;
      const key = obj.Key ?? "";
      const lastModified = obj.LastModified ?? new Date();
      const size = obj.Size ?? 0;

      if (isProtected(key)) {
        skippedProtected++;
        continue;
      }

      if (!isOlderThan(lastModified, KEEP_DAYS)) {
        skippedRecent++;
        continue;
      }

      toDelete.push({ Key: key });
      totalSize += size;

      // Batch delete
      if (toDelete.length >= DELETE_BATCH) {
        if (!dryRun) {
          await client.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: toDelete, Quiet: true },
          }));
        }
        totalDeleted += toDelete.length;
        console.log(`[r2-cleanup] ${dryRun ? "[DRY]" : ""} ${toDelete.length} dosya silindi (toplam: ${totalDeleted})`);
        toDelete = [];
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  // Kalan batch
  if (toDelete.length > 0) {
    if (!dryRun) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: toDelete, Quiet: true },
      }));
    }
    totalDeleted += toDelete.length;
  }

  const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
  console.log(`[r2-cleanup] tamamlandı`);
  console.log(`  Taranan: ${listed} dosya`);
  console.log(`  Korunan (şablon): ${skippedProtected}`);
  console.log(`  Korunan (10 gün içinde): ${skippedRecent}`);
  console.log(`  ${dryRun ? "Silinecekti" : "Silindi"}: ${totalDeleted} dosya (~${sizeMB} MB)`);
}

main().catch((err) => {
  console.error("[r2-cleanup] HATA:", err.message);
  process.exit(1);
});
