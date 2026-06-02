import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { authenticate } from "~/lib/authenticate.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";
import { query } from "~/lib/db.server";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";

export const headers = () => ({ "Cache-Control": "no-store" });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const url = new URL(request.url);
  const packKey = url.searchParams.get("pack") as PackKey;
  const chargeId = url.searchParams.get("charge_id");

  const pack = CREDIT_PACKS[packKey];
  if (!pack || !chargeId) return redirect("/app/credits?error=invalid");

  // Idempotency: already processed?
  const existing = await query(
    "SELECT id FROM ai_credit_purchases WHERE charge_id = $1",
    [chargeId],
  );
  if (existing.rows.length > 0) return redirect("/app/credits?success=already");

  // Verify charge status with Shopify
  const accessToken = await getValidAccessToken(session.shop);
  if (!accessToken) return redirect("/app/credits?error=auth");

  const resp = await shopifyGraphQL(
    session.shop,
    accessToken,
    `query GetCharge($id: ID!) {
      node(id: $id) {
        ... on AppPurchaseOneTime {
          id
          status
          name
        }
      }
    }`,
    { id: chargeId },
  );

  const data = (await resp.json()) as {
    data?: {
      node?: {
        id?: string;
        status?: string;
        name?: string;
      } | null;
    };
  };

  const charge = data.data?.node;

  if (!charge || charge.status !== "ACTIVE") {
    return redirect("/app/credits?error=not_approved");
  }

  // Record purchase with 30-day expiry (ON CONFLICT DO NOTHING for safety)
  const id = `acp_${randomBytes(8).toString("hex")}`;
  await query(
    `INSERT INTO ai_credit_purchases (id, shop, charge_id, pack_key, credits_added, price_usd, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '30 days')
     ON CONFLICT (charge_id) DO NOTHING`,
    [id, session.shop, chargeId, packKey, pack.credits, pack.price],
  );

  console.log(
    `[credits] ${session.shop} bought ${pack.credits} AI credits (${packKey})`,
  );
  return redirect("/app/credits?success=1");
};

export default function CreditsCallback() {
  return null; // loader always redirects
}
