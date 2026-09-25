import { query } from "~/lib/db.server";
import type { PlanKey } from "~/lib/plans";
import { sendWhatsAppMessage } from "~/lib/whatsapp.server";
import { shopHandle } from "~/lib/platform";

/**
 * Kampanya kodları. Kod, seçilen plana Shopify Billing API üzerinden süreli
 * %100 indirim olarak uygulanır; merchant onay ekranında ilk ayları 0 $
 * görür. Kampanya yoruma bağlı değildir (App Store kuralı 1.3.1): karşılığında
 * yalnız geri bildirim istenir.
 */
export interface PromoCampaign {
  id: string;
  codes: string[];
  plan: PlanKey;
  freeMonths: number;
  maxShops: number;
  /** Bu tarihten sonra kod kabul edilmez (ISO tarih, gün sonu dahil) */
  expiresAt: string;
}

export const PROMO_CAMPAIGNS: PromoCampaign[] = [
  {
    // Kurucu mağaza programı: ilk 20 mağazaya 3 ay ücretsiz Growth
    id: "founder",
    codes: ["KURUCU", "FOUNDER"],
    plan: "Growth",
    freeMonths: 3,
    maxShops: 20,
    expiresAt: "2026-12-31",
  },
];

/** Onay ekranında bırakılan kodlar bu süre sonra kotadan düşer */
const PENDING_HOLD_DAYS = 3;

export type PromoError = "invalid" | "expired" | "full" | "wrongPlan" | "used";

export type PromoCheck =
  | { ok: true; campaign: PromoCampaign; code: string }
  | { ok: false; error: PromoError; campaign?: PromoCampaign };

export function normalizePromoCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

export async function checkPromo(shop: string, rawCode: unknown, planKey: PlanKey): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  const campaign = PROMO_CAMPAIGNS.find((c) => c.codes.includes(code));
  if (!campaign) return { ok: false, error: "invalid" };
  if (Date.now() > new Date(`${campaign.expiresAt}T23:59:59Z`).getTime()) return { ok: false, error: "expired", campaign };
  if (planKey !== campaign.plan) return { ok: false, error: "wrongPlan", campaign };

  const mine = await query<{ status: string }>(
    "SELECT status FROM promo_redemptions WHERE campaign = $1 AND shop = $2",
    [campaign.id, shop],
  );
  if (mine.rows[0]?.status === "active") return { ok: false, error: "used", campaign };

  // Kota: aktif olanlar + yakın zamanda onaya gidip bekleyenler (bu mağaza hariç)
  const used = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM promo_redemptions
      WHERE campaign = $1 AND shop <> $2
        AND (status = 'active' OR (status = 'pending' AND updated_at > now() - ($3 || ' days')::interval))`,
    [campaign.id, shop, String(PENDING_HOLD_DAYS)],
  );
  if (Number(used.rows[0]?.count ?? 0) >= campaign.maxShops) return { ok: false, error: "full", campaign };

  return { ok: true, campaign, code };
}

/** Abonelik onayına giderken kodu mağaza adına ayırır */
export async function reservePromo(shop: string, campaign: PromoCampaign, code: string): Promise<void> {
  await query(
    `INSERT INTO promo_redemptions (campaign, shop, code, plan_key, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (campaign, shop) DO UPDATE SET code = $3, plan_key = $4, updated_at = now()
       WHERE promo_redemptions.status <> 'active'`,
    [campaign.id, shop, code, campaign.plan],
  );
}

/**
 * Abonelik aktif görüldüğünde bekleyen kod kullanımını aktife çevirir ve
 * sahibine haber verir. Plan kampanyanın planı değilse (merchant onayda başka
 * plan seçtiyse) dokunmaz.
 */
export async function activatePendingPromo(shop: string, activePlan: PlanKey): Promise<void> {
  const r = await query<{ campaign: string; code: string }>(
    `UPDATE promo_redemptions SET status = 'active', updated_at = now()
      WHERE shop = $1 AND status = 'pending' AND plan_key = $2
      RETURNING campaign, code`,
    [shop, activePlan],
  );
  if (!r.rows.length) return;

  const phone = (process.env.SUPPORT_NOTIFY_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  if (!phone) return;
  const counts = await query<{ campaign: string; count: string }>(
    "SELECT campaign, COUNT(*) AS count FROM promo_redemptions WHERE status = 'active' GROUP BY campaign",
  );
  for (const row of r.rows) {
    const campaign = PROMO_CAMPAIGNS.find((c) => c.id === row.campaign);
    const total = counts.rows.find((c) => c.campaign === row.campaign)?.count ?? "?";
    await sendWhatsAppMessage(phone, [
      `🎉 *Yeni kurucu mağaza*`,
      ``,
      `🏪 ${shopHandle(shop)}`,
      `🎟 Kod: ${row.code} · ${activePlan}, ${campaign?.freeMonths ?? "?"} ay ücretsiz`,
      `📊 ${total}/${campaign?.maxShops ?? "?"} kullanıldı`,
      ``,
      `Geri bildirim görüşmesi için iletişime geç.`,
    ].join("\n")).catch((err) => console.error("[promo] bildirim gönderilemedi:", err));
  }
}

export async function listPromoRedemptions() {
  const r = await query<{ campaign: string; shop: string; code: string; plan_key: string; status: string; created_at: Date; updated_at: Date }>(
    "SELECT campaign, shop, code, plan_key, status, created_at, updated_at FROM promo_redemptions ORDER BY created_at DESC",
  );
  return r.rows;
}
