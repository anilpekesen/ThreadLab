import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);

function loadEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

loadEnv();

const email = String(args.get("email") ?? "").trim().toLowerCase();
const password = String(args.get("password") ?? "");
const name = String(args.get("name") ?? email);
const commissionRate = Number(args.get("rate") ?? "20");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

if (!email || !password) {
  throw new Error("Usage: node scripts/upsert-partner.mjs --email=a@b.com --password=secret [--name=Name] [--rate=20]");
}

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      commission_rate NUMERIC NOT NULL DEFAULT 20,
      password_hash TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_shop_assignments (
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partner_id, shop)
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_shop_assignments_shop_unique
      ON partner_shop_assignments (shop)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_assignment_requests (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_assignment_requests_pending_unique
      ON partner_assignment_requests (partner_id, shop)
      WHERE status = 'pending'
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS partner_assignment_requests_status_idx
      ON partner_assignment_requests (status, created_at DESC)
  `);

  const id = `partner_${randomBytes(8).toString("hex")}`;
  await pool.query(
    `INSERT INTO partners (id, email, name, commission_rate, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       commission_rate = EXCLUDED.commission_rate,
       password_hash = EXCLUDED.password_hash,
       is_active = TRUE,
       updated_at = now()`,
    [id, email, name, Number.isFinite(commissionRate) ? commissionRate : 20, hashPassword(password)],
  );

  const result = await pool.query(
    `SELECT email, name, commission_rate::text, is_active FROM partners WHERE email = $1`,
    [email],
  );
  console.log(JSON.stringify(result.rows[0], null, 2));
} finally {
  await pool.end();
}
