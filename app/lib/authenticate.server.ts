import { redirect } from "@remix-run/node";
import { getShopFromSession, getValidAccessToken } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";

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
          console.error(`[auth] Shopify API ${resp.status} for ${shop} — token may need rotation`);
        }
        return resp;
      },
    },
  };
}
