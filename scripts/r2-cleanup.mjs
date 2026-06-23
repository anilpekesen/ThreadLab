/**
 * Cloudflare R2 temizlik scripti
 * Şablonlar dışındaki klasörlerden 10 günden eski dosyaları siler.
 * DB'deki sipariş ve tasarımlarda referans edilen dosyalara dokunmaz.
 * Cron: 0 2 * * * node scripts/r2-cleanup.mjs
 */
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import pg from "pg";
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
const DELETE_BATCH = 500;
const PROTECTED_PREFIXES = ["templates/"];

function isProtected(key) {
  return PROTECTED_PREFIXES.some((p) => key.startsWith(p));
}

function isOlderThan(lastModified, days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return lastModified < cutoff;
}

// URL'den R2 key'ini çıkar
function urlToKey(url, publicUrl) {
  if (!url || !publicUrl) return null;
  try {
    const pub = new URL(publicUrl);
    const obj = new URL(url);
    if (obj.origin !== pub.origin) return null;
    const base = pub.pathname.replace(/\/+$/, "");
    const path = decodeURIComponent(obj.pathname);
    const key = path.slice(base.length).replace(/^\/+/, "");
    return key || null;
  } catch {
    return null;
  }
}

// JSON içindeki tüm https:// URL'leri topla
function collectUrls(value, set) {
  if (!value) return;
  if (typeof value === "string") {
    if (value.startsWith("https://")) set.add(value);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectUrls(v, set)); return; }
  if (typeof value === "object") { Object.values(value).forEach((v) => collectUrls(v, set)); }
}

async function loadActiveR2Keys(pool, publicUrl) {
  const keys = new Set();

  // Tasarımlar tablosu
  const designs = await pool.query(`
    SELECT front_preview_url, back_preview_url, front_print_url, back_print_url, design_json
    FROM designs
  `);
  for (const row of designs.rows) {
    const urls = new Set();
    collectUrls(row.front_preview_url, urls);
    collectUrls(row.back_preview_url, urls);
    collectUrls(row.front_print_url, urls);
    collectUrls(row.back_print_url, urls);
    collectUrls(row.design_json, urls);
    for (const url of urls) {
      const key = urlToKey(url, publicUrl);
      if (key) keys.add(key);
    }
  }

  // Siparişler tablosu (sadece kendi sütunları, join yok)
  const orders = await pool.query(`
    SELECT preview_url, production_file_url
    FROM orders
  `);
  for (const row of orders.rows) {
    for (const val of Object.values(row)) {
      if (!val) continue;
      const key = urlToKey(val, publicUrl);
      if (key) keys.add(key);
    }
  }

  return keys;
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
  const publicUrl = process.env.R2_PUBLIC_URL ?? "";

  console.log(`[r2-cleanup] ${new Date().toISOString()} başlıyor`);
  console.log(`[r2-cleanup] bucket=${bucket} keepDays=${KEEP_DAYS} dryRun=${dryRun}`);

  // DB'den aktif R2 key'lerini yükle
  const dbUrl = process.env.DATABASE_URL ?? "";
  const isLocal = dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1");
  const pool = new pg.Pool({
    connectionString: dbUrl,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });

  let activeKeys;
  try {
    console.log("[r2-cleanup] DB'den aktif dosyalar yükleniyor...");
    activeKeys = await loadActiveR2Keys(pool, publicUrl);
    console.log(`[r2-cleanup] ${activeKeys.size} aktif dosya korunacak`);
  } finally {
    await pool.end();
  }

  let listed = 0, skippedProtected = 0, skippedRecent = 0, skippedActive = 0;
  let toDelete = [], totalDeleted = 0, totalSize = 0;

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

      if (isProtected(key)) { skippedProtected++; continue; }
      if (!isOlderThan(lastModified, KEEP_DAYS)) { skippedRecent++; continue; }
      if (activeKeys.has(key)) { skippedActive++; continue; }

      toDelete.push({ Key: key });
      totalSize += size;

      if (toDelete.length >= DELETE_BATCH) {
        if (!dryRun) {
          await client.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: toDelete, Quiet: true },
          }));
        }
        totalDeleted += toDelete.length;
        console.log(`[r2-cleanup] ${dryRun ? "[DRY] " : ""}${toDelete.length} dosya silindi (toplam: ${totalDeleted})`);
        toDelete = [];
      }
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

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
  console.log(`  Taranan       : ${listed}`);
  console.log(`  Korunan şablon: ${skippedProtected}`);
  console.log(`  Korunan genç  : ${skippedRecent}`);
  console.log(`  Korunan aktif : ${skippedActive} (sipariş/tasarım DB'de referanslı)`);
  console.log(`  ${dryRun ? "Silinecekti" : "Silindi"}: ${totalDeleted} (~${sizeMB} MB)`);
}

main().catch((err) => {
  console.error("[r2-cleanup] HATA:", err.message);
  process.exit(1);
});
