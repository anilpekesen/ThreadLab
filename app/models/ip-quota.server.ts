import { createHash } from "node:crypto";
import { query } from "~/lib/db.server";

type FeatureKey = "ai_generate" | "bg_remove";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")
    || "";
  return forwarded.split(",")[0]?.trim() || "";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkAndIncrementIpQuota(
  shop: string,
  feature: FeatureKey,
  request: Request,
  baseLimit: number,
): Promise<{ allowed: boolean; count: number; limit: number; remaining: number }> {
  const ip = getClientIp(request);
  if (!ip) {
    return {
      allowed: true,
      count: 0,
      limit: Math.max(baseLimit * 4, baseLimit),
      remaining: Math.max(baseLimit * 4, baseLimit),
    };
  }

  const ipHash = hashIp(ip);
  const day = currentDay();
  const effectiveLimit = Math.max(baseLimit * 4, baseLimit);

  const result = await query<{ count: number }>(
    `SELECT count
     FROM customer_ip_quota
     WHERE shop = $1 AND feature = $2 AND ip_hash = $3 AND day = $4`,
    [shop, feature, ipHash, day],
  );

  const count = result.rows[0]?.count ?? 0;
  if (count >= effectiveLimit) {
    return { allowed: false, count, limit: effectiveLimit, remaining: 0 };
  }

  await query(
    `INSERT INTO customer_ip_quota (shop, feature, ip_hash, day, count, updated_at)
     VALUES ($1, $2, $3, $4, 1, now())
     ON CONFLICT (shop, feature, ip_hash, day)
     DO UPDATE SET count = customer_ip_quota.count + 1, updated_at = now()`,
    [shop, feature, ipHash, day],
  );

  const newCount = count + 1;
  return {
    allowed: true,
    count: newCount,
    limit: effectiveLimit,
    remaining: effectiveLimit - newCount,
  };
}
