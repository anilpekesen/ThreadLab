import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { query } from "~/lib/db.server";
import { getR2Object, putR2Object } from "~/lib/r2.server";
import { applyGlowPlate } from "~/lib/glow-plate.server";
import { setPngDensity } from "~/lib/png-density.server";

/**
 * Baskı dosyasının ağır işlemleri (glow plaka + PNG sıkıştırma) 28–38 MP'lik
 * görselde dosya başına 1,5–2,5 sn sürüyor ve müşteri sepete eklerken bunu
 * bekliyordu. Upload ham dosyayı kaydedip hemen dönüyor; işlenmiş sürüm arka
 * planda AYNI adresin üzerine yazılıyor.
 *
 * İş bellekte kuyruklandığı için süreç o sırada yeniden başlarsa (deploy, çökme)
 * dosya ham kalırdı: tasarım doğru ama plakasız ve 300 DPI bilgisi yok. Bunu
 * önlemek için her iş `pending_print_jobs` tablosuna yazılıyor ve ancak işlenmiş
 * dosya kaydedilince siliniyor. Açılışta ve periyodik olarak sahipsiz kalmış
 * satırlar devralınıp yeniden işleniyor.
 *
 * Çözülmüş 38 MP RGBA görsel ~150 MB bellek tutuyor; aynı anda en fazla
 * PRINT_JOB_CONCURRENCY iş çalışsın ki yoğun anda sunucu şişmesin.
 */
const PRINT_JOB_CONCURRENCY = 2;
/** Bu süreden eski ve hâlâ silinmemiş sahiplenme, sahibinin öldüğü anlamına gelir. */
const STALE_CLAIM_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const SWEEP_INTERVAL_MS = 5 * 60_000;
const STARTUP_SWEEP_DELAY_MS = 20_000;
const PRINT_DPI = 300;

type Storage = "r2" | "disk";

interface PendingPrintJob {
  id: string;
  storage: Storage;
  location: string;
  side: string;
  attempts: number;
}

let tableReady: Promise<void> | null = null;

function ensureTable() {
  tableReady ??= query(`
    CREATE TABLE IF NOT EXISTS pending_print_jobs (
      id          TEXT PRIMARY KEY,
      storage     TEXT NOT NULL,
      location    TEXT NOT NULL,
      side        TEXT NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at  TIMESTAMPTZ
    )
  `).then(() => undefined).catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

let activeJobs = 0;
const queue: PendingPrintJob[] = [];
const queuedIds = new Set<string>();

function enqueue(job: PendingPrintJob) {
  if (queuedIds.has(job.id)) return;
  queuedIds.add(job.id);
  queue.push(job);
  drain();
}

function drain() {
  while (activeJobs < PRINT_JOB_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    activeJobs++;
    runJob(job)
      .catch(async (err) => {
        console.error(`[print-job] ${job.side} ${job.location} başarısız (deneme ${job.attempts + 1}):`, err);
        // Satır kalır; sahiplenme bayatlayınca tarama yeniden dener
        await query(
          "UPDATE pending_print_jobs SET attempts = attempts + 1, last_error = $2 WHERE id = $1",
          [job.id, String((err as Error)?.message ?? err).slice(0, 500)],
        ).catch(() => {});
      })
      .finally(() => {
        activeJobs--;
        queuedIds.delete(job.id);
        drain();
      });
  }
}

async function readRaw(job: PendingPrintJob): Promise<Buffer> {
  return job.storage === "r2" ? getR2Object(job.location) : readFile(job.location);
}

async function persist(job: PendingPrintJob, buffer: Buffer) {
  if (job.storage === "r2") await putR2Object(job.location, buffer, "png");
  else await writeFile(job.location, buffer);
}

async function processPrintFile(buffer: Buffer, side: string) {
  let t = performance.now();
  // Işımalı tasarımlarda sanatın arkasına opak koyu plaka koy. Asıl karar
  // tasarımcıda müşteriye sorularak veriliyor; bu, o adımı atlayan siparişler
  // için güvenlik ağı (bkz. glow-plate.server.ts).
  try {
    const plated = await applyGlowPlate(buffer);
    if (plated.applied) {
      console.log(
        `[glow-plate] ${side} plaka uygulandı — ` +
        `yumuşak alfa %${(plated.measurement.softAlphaRatio * 100).toFixed(1)}, ` +
        `opak %${(plated.measurement.opaqueRatio * 100).toFixed(1)}, ` +
        `düşük alfa %${((plated.measurement.lowAlphaRatio ?? 0) * 100).toFixed(1)}, ` +
        `alan ${plated.rect?.width}x${plated.rect?.height} @ ${plated.rect?.left},${plated.rect?.top}`,
      );
      buffer = Buffer.from(plated.buffer);
    }
  } catch (err) {
    // Plaka uygulanamazsa dosya olduğu gibi geçsin; işlem durmasın.
    console.error("[glow-plate] uygulanamadı, dosya değiştirilmeden geçiyor:", err);
  }
  const glowMs = performance.now() - t;

  t = performance.now();
  // 300 DPI bilgisini görüntüyü yeniden sıkıştırmadan yaz. sharp ile yeniden
  // kodlamak tarayıcının iyi sıkıştırdığı PNG'yi %40'a kadar büyütüyordu
  // (16 MB → 23 MB). Bu bilgi aynı zamanda "işlendi" işareti: tarayıcının
  // ürettiği ham PNG'de yoğunluk yok.
  let method = "pHYs";
  let out = setPngDensity(buffer, PRINT_DPI);
  if (!out) {
    method = "yeniden-kodlama";
    out = Buffer.from(
      await sharp(buffer, { limitInputPixels: false })
        .png({ compressionLevel: 6 })
        .withMetadata({ density: PRINT_DPI })
        .toBuffer(),
    );
  }
  return { buffer: out, glowMs, densityMs: performance.now() - t, method };
}

async function runJob(job: PendingPrintJob) {
  const startedAt = performance.now();
  const raw = await readRaw(job);

  // Önceki bir süreç dosyayı yazdıktan sonra satırı silemeden öldüyse iki kez
  // işleme — plaka ikinci kez ölçülür ve gereksiz yere dosya yeniden yazılır.
  const meta = await sharp(raw, { limitInputPixels: false }).metadata();
  if (Math.round(meta.density ?? 0) === PRINT_DPI) {
    await query("DELETE FROM pending_print_jobs WHERE id = $1", [job.id]);
    console.log(`[print-job] ${job.side} zaten işlenmiş, kayıt kapatıldı: ${job.location}`);
    return;
  }

  const processed = await processPrintFile(raw, job.side);
  const t = performance.now();
  await persist(job, processed.buffer);
  await query("DELETE FROM pending_print_jobs WHERE id = $1", [job.id]);
  console.log(
    `[upload] ${job.side} arka plan bitti${job.attempts > 0 ? ` (kurtarma, deneme ${job.attempts + 1})` : ""} — ` +
    `glow=${processed.glowMs.toFixed(0)}ms dpi(${processed.method})=${processed.densityMs.toFixed(0)}ms ` +
    `yeniden-kayıt=${(performance.now() - t).toFixed(0)}ms toplam=${(performance.now() - startedAt).toFixed(0)}ms ` +
    `${(raw.length / 1e6).toFixed(1)}MB→${(processed.buffer.length / 1e6).toFixed(1)}MB`,
  );
}

/**
 * Ham baskı dosyası kaydedildikten hemen sonra çağrılır. Kayıt tabloya
 * yazılamazsa bile iş bellekte çalışır — müşterinin sepete eklemesi durmasın.
 */
export async function schedulePrintJob(input: { storage: Storage; location: string; side: string }) {
  const job: PendingPrintJob = { id: randomBytes(12).toString("hex"), attempts: 0, ...input };
  try {
    await ensureTable();
    await query(
      "INSERT INTO pending_print_jobs (id, storage, location, side, claimed_at) VALUES ($1, $2, $3, $4, now())",
      [job.id, job.storage, job.location, job.side],
    );
  } catch (err) {
    console.error("[print-job] kayıt yazılamadı, iş yalnızca bellekte çalışacak:", err);
  }
  enqueue(job);
}

/** Sahibi ölmüş (bayat sahiplenmeli) işleri atomik olarak devralır. */
async function sweep() {
  await ensureTable();
  // FOR UPDATE SKIP LOCKED: iki pm2 kopyası aynı anda tarasa da aynı satırı
  // yalnızca biri alır.
  const { rows } = await query<PendingPrintJob>(
    `UPDATE pending_print_jobs
        SET claimed_at = now()
      WHERE id IN (
        SELECT id FROM pending_print_jobs
         WHERE (claimed_at IS NULL OR claimed_at < now() - ($1 || ' minutes')::interval)
           AND attempts < $2
         ORDER BY created_at
         LIMIT 20
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, storage, location, side, attempts`,
    [String(STALE_CLAIM_MINUTES), MAX_ATTEMPTS],
  );
  if (rows.length > 0) {
    console.log(`[print-job] ${rows.length} yarım kalmış baskı dosyası yeniden işleniyor`);
    for (const row of rows) enqueue(row);
  }
}

let recoveryStarted = false;

/** Sunucu açılışında bir kez çağrılır (entry.server.tsx). */
export function startPrintJobRecovery() {
  if (recoveryStarted || !process.env.DATABASE_URL) return;
  recoveryStarted = true;
  const run = () => sweep().catch((err) => console.error("[print-job] tarama başarısız:", err));
  setTimeout(run, STARTUP_SWEEP_DELAY_MS).unref();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
