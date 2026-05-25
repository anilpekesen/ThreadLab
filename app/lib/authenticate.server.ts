import { redirect } from "@remix-run/node";
import { getShopFromSession, getValidAccessToken } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";
import { query } from "./db.server";

const NON_EXPIRING_TOKEN_MSG = "Non-expiring access tokens are no longer accepted";

async function invalidateSession(shop: string) {
  await query(`DELETE FROM shopify_sessions WHERE id = $1`, [`offline_${shop}`]);
}

export async function authenticate(request: Request) {
  const shop = await getShopFromSession(request);
  if (!shop) throw redirect("/auth/login");

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) throw redirect(`/auth?shop=${shop}`);

  return {
    shop,
    session: { shop },
    admin: {
      graphql: async (gqlQuery: string, opts?: { variables?: Record<string, unknown> }) => {
        const resp = await shopifyGraphQL(shop, accessToken, gqlQuery, opts?.variables);

        if (resp.status === 401 || resp.status === 403) {
          await invalidateSession(shop);
          throw redirect(`/auth?shop=${shop}`);
        }

        // Detect non-expiring token rejection (Shopify returns 200 with error in body)
        const text = await resp.text();
        if (text.includes(NON_EXPIRING_TOKEN_MSG)) {
          console.error(`[auth] Non-expiring token rejected for ${shop} — invalidating session`);
          await invalidateSession(shop);
          throw redirect(`/auth?shop=${shop}`);
        }

        return new Response(text, {
          status: resp.status,
          headers: resp.headers,
        });
      },
    },
  };
}
