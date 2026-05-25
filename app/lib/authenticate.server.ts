import { redirect } from "@remix-run/node";
import { getShopFromSession, getValidAccessToken } from "./session.server";
import { shopifyGraphQL } from "./shopify.server";

export async function authenticate(request: Request) {
  const shop = await getShopFromSession(request);
  if (!shop) throw redirect("/auth/login");

  const accessToken = await getValidAccessToken(shop);
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
