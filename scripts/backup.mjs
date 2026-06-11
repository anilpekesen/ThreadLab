import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

async function loadDotEnv(filePath = ".env") {
  try {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = value.replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {
    // Production envs can be injected by process manager instead of .env.
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function buildPostgresEnv() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const url = new URL(databaseUrl);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.replace(/^\//, ""),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
}

async function writeDbDump(outputPath) {
  await run(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", "--file", outputPath],
    { env: buildPostgresEnv() },
  );
}

async function writeConfigArchive(outputPath) {
  const files = [
    ".env",
    "package.json",
    "package-lock.json",
    "shopify.app.toml",
    "shopify.web.toml",
    "deploy.sh",
    "nginx-printlabapp.conf",
  ];
  await run("tar", ["-czf", outputPath, ...files], { cwd: ROOT });
}

function encryptionKeyBuffer() {
  const ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error("BACKUP_ENCRYPTION_KEY is missing. Refusing to upload unencrypted backups.");
  }
  return createHash("sha256").update(ENCRYPTION_KEY).digest();
}

async function encryptFile(inputPath, outputPath) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKeyBuffer(), iv);
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  output.write(Buffer.from("PLBKP1"));
  output.write(iv);
  await pipeline(input, cipher, output, { end: false });
  output.write(cipher.getAuthTag());
  output.end();
  await new Promise((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
}

function s3Client() {
  return new S3Client({
    region: "auto",
    endpoint: requireEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function uploadFile(client, filePath, key, contentType = "application/octet-stream") {
  const bucket = requireEnv("R2_BUCKET");
  const info = await stat(filePath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: info.size,
      ContentType: contentType,
      Metadata: {
        encrypted: "aes-256-gcm",
        app: "printlabapp",
      },
    }),
  );
  return info.size;
}

async function cleanupOldBackups(client) {
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  const prefix = (process.env.BACKUP_R2_PREFIX || "backups/daily").replace(/^\/+|\/+$/g, "");
  const bucket = requireEnv("R2_BUCKET");
  if (!retentionDays || retentionDays < 1) return { deleted: 0 };
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let continuationToken;
  let deleted = 0;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `${prefix}/`,
        ContinuationToken: continuationToken,
      }),
    );
    continuationToken = listed.NextContinuationToken;
    for (const object of listed.Contents ?? []) {
      const lastModified = object.LastModified?.getTime();
      const key = object.Key;
      if (!key || !lastModified || lastModified >= cutoff) continue;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      deleted += 1;
    }
  } while (continuationToken);

  return { deleted };
}

async function main() {
  await loadDotEnv(join(ROOT, ".env"));
  const bucket = requireEnv("R2_BUCKET");
  const backupRoot = process.env.BACKUP_WORK_DIR || "/var/backups/printlabapp";
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  const prefix = (process.env.BACKUP_R2_PREFIX || "backups/daily").replace(/^\/+|\/+$/g, "");

  const stamp = timestamp();
  const workDir = join(backupRoot, stamp);
  await mkdir(workDir, { recursive: true });

  const dbDump = join(workDir, `printlabapp-db-${stamp}.dump`);
  const configTar = join(workDir, `printlabapp-config-${stamp}.tar.gz`);
  const dbEnc = `${dbDump}.enc`;
  const configEnc = `${configTar}.enc`;

  await writeDbDump(dbDump);
  await writeConfigArchive(configTar);
  await encryptFile(dbDump, dbEnc);
  await encryptFile(configTar, configEnc);

  const client = s3Client();
  const dbKey = `${prefix}/${basename(dbEnc)}`;
  const configKey = `${prefix}/${basename(configEnc)}`;
  const [dbSize, configSize] = await Promise.all([
    uploadFile(client, dbEnc, dbKey),
    uploadFile(client, configEnc, configKey),
  ]);
  const cleanup = await cleanupOldBackups(client);
  await rm(workDir, { recursive: true, force: true });

  console.log(JSON.stringify({
    ok: true,
    timestamp: stamp,
    bucket,
    uploaded: [
      { key: dbKey, bytes: dbSize },
      { key: configKey, bytes: configSize },
    ],
    retentionDays,
    deletedOldObjects: cleanup.deleted,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
