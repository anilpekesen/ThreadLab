/**
 * Cloudflare R2 temizlik scripti.
 *
 * YALNIZCA geçici yükleme klasörlerinden (DELETABLE_PREFIXES), 10 günden eski
 * VE veritabanının hiçbir yerinde adı geçmeyen dosyaları siler.
 *
 * Eskiden tersiydi: bucket'ın tamamı taranıyor, yalnızca `templates/` ve
 * designs/orders tablolarının birkaç sütununda geçen dosyalar korunuyordu.
 * Sonuç (Eylül 2026'da fark edildi): personalizer şablon görselleri,
 * süslemeler, mockup'lar, müşteri clipart'ları, `designs.original_image_urls`
 * altındaki müşteri orijinal fotoğrafları ve 10 günden eski veritabanı
 * yedekleri her gece siliniyordu. Yeni bir özellik yeni bir klasöre ya da
 * yeni bir sütuna dosya yazdığında bu script onu sessizce silmeye başlıyordu.
 *
 * Şimdiki kurallar bu hatanın tekrarlanmaması için:
 *   1. İzin listesi: bilinmeyen bir klasöre asla dokunulmaz.
 *   2. Referans kontrolü tablo/sütun listesiyle değil, veritabanının tam
 *      dökümüyle yapılır: bir dosya adresi herhangi bir tablonun herhangi bir
 *      sütununda (JSON içinde bile) geçiyorsa korunur.
 *   3. Güvenlik sınırı: bir çalıştırmada MAX_DELETE'ten fazla dosya silinecekse
 *      hiçbir şey silinmez; `--force` ile bilerek geçilebilir.
 *
 * Cron: 0 2 * * * node scripts/r2-cleanup.mjs
 * Deneme: node scripts/r2-cleanup.mjs --dry-run
 */
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
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
/**
 * Silinebilecek klasörler: müşteri tasarımcıda çalışırken oluşan ve siparişe
 * dönmezse işe yaramayan dosyalar. Buraya yeni bir klasör eklemeden önce o
 * klasöre yazılan dosyanın uzun ömürlü bir kopyasının başka yerde olduğundan
 * emin olun.
 */
const DELETABLE_PREFIXES = ["uploads/", "ai-gen/"];
/** Normal bir gecede ~200-250 dosya siliniyor; bunun çok üstü bir hata işaretidir */
const MAX_DELETE = 2000;

function isOlderThan(lastModified, days) {
  return lastModified < new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Veritabanının tam dökümünü akış hâlinde okuyup içinde geçen tüm R2
 * anahtarlarını toplar. Döküm 600 MB'ı aştığı için belleğe alınmıyor; parça
 * sınırında bölünen adresler için son birkaç yüz karakter bir sonraki parçaya
 * taşınıyor.
 */
async function loadReferencedKeys(databaseUrl, publicUrl) {
  const host = new URL(publicUrl).host.replace(/\./g, "\\.");
  const re = new RegExp(`${host}/([A-Za-z0-9_./%-]+\\.[A-Za-z0-9]{2,5})`, "g");
  const keys = new Set();

  await new Promise((resolve, reject) => {
    const child = spawn("pg_dump", ["--data-only", databaseUrl], { stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const text = tail + chunk;
      for (const m of text.matchAll(re)) keys.add(decodeURIComponent(m[1]));
      tail = text.slice(-512);
    });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump ${code} ile bitti: ${stderr.trim()}`));
    });
  });

  return keys;
}

async function main() {
  await loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");

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
  const databaseUrl = process.env.DATABASE_URL ?? "";
  // Referans kontrolü yapılamıyorsa hiçbir şey silinmemeli
  if (!publicUrl || !databaseUrl) throw new Error("R2_PUBLIC_URL ve DATABASE_URL gerekli");

  console.log(`[r2-cleanup] ${new Date().toISOString()} başlıyor`);
  console.log(`[r2-cleanup] bucket=${bucket} keepDays=${KEEP_DAYS} prefixes=${DELETABLE_PREFIXES.join(",")} dryRun=${dryRun}`);

  console.log("[r2-cleanup] veritabanı dökümünden referanslar toplanıyor...");
  const referenced = await loadReferencedKeys(databaseUrl, publicUrl);
  // Döküm boş ya da bozuk geldiyse her şey sahipsiz görünür; silmeye başlama
  if (referenced.size < 1000) {
    throw new Error(`yalnızca ${referenced.size} referans bulundu; döküm eksik olabilir, iptal`);
  }
  console.log(`[r2-cleanup] ${referenced.size} referanslı dosya korunacak`);

  let listed = 0, skippedRecent = 0, skippedActive = 0;
  const toDelete = [];
  let totalSize = 0;

  for (const prefix of DELETABLE_PREFIXES) {
    let continuationToken;
    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      for (const obj of res.Contents ?? []) {
        listed++;
        const key = obj.Key ?? "";
        if (!isOlderThan(obj.LastModified ?? new Date(), KEEP_DAYS)) { skippedRecent++; continue; }
        if (referenced.has(key)) { skippedActive++; continue; }
        toDelete.push({ Key: key });
        totalSize += obj.Size ?? 0;
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
  console.log(`  Taranan       : ${listed}`);
  console.log(`  Korunan genç  : ${skippedRecent}`);
  console.log(`  Korunan aktif : ${skippedActive} (veritabanında referanslı)`);

  if (toDelete.length > MAX_DELETE && !force) {
    console.error(`[r2-cleanup] ${toDelete.length} dosya silinecekti (sınır ${MAX_DELETE}); hiçbir şey silinmedi. Bilerek yapılıyorsa --force.`);
    process.exit(2);
  }

  let totalDeleted = 0;
  for (let i = 0; i < toDelete.length; i += DELETE_BATCH) {
    const batch = toDelete.slice(i, i + DELETE_BATCH);
    if (!dryRun) {
      await client.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: batch, Quiet: true },
      }));
    }
    totalDeleted += batch.length;
  }

  console.log(`[r2-cleanup] tamamlandı`);
  console.log(`  ${dryRun ? "Silinecekti" : "Silindi"}: ${totalDeleted} (~${sizeMB} MB)`);
}

main().catch((err) => {
  console.error("[r2-cleanup] HATA:", err.message);
  process.exit(1);
});
