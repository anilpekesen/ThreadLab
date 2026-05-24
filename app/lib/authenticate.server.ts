import { redirect } from "@remix-run/node";
import { getShopFromSession } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";
import { query } from "./db.server";

async function getAccessToken(shop: string): Promise<string | null> {
  const result = await query(`SELECT "accessToken" FROM shopify_sessions WHERE id = $1`, [
    `offline_${shop}`,
  ]);
  return (result.rows[0]?.accessToken as string | undefined) ?? null;
}

export async function authenticate(request: Request) {
  const shop = await getShopFromSession(request);
  if (!shop) throw redirect("/auth/login");

  const accessToken = await getAccessToken(shop);
  if (!accessToken) throw redirect("/auth/login");

  return {
    shop,
    session: { shop },
    admin: {
      graphql: async (gqlQuery: string, opts?: { variables?: Record<string, unknown> }) => {
        const resp = await shopifyGraphQL(shop, accessToken, gqlQuery, opts?.variables);
        if (resp.status === 401) throw redirect("/auth/login");
        return resp;
      },
    },
  };
}
