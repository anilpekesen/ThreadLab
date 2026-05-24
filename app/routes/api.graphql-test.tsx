import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { query } from "~/lib/db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const shop = url.searchParams.get("shop") || "whanotify-dev.myshopify.com";
  const sessionId = `offline_${shop}`;

  let accessToken: string | null = null;
  try {
    const result = await query(`SELECT "accessToken" FROM shopify_sessions WHERE id = $1`, [sessionId]);
    accessToken = result.rows[0]?.accessToken ?? null;
  } catch (e) {
    return json({ error: "session load failed", detail: String(e) });
  }

  if (!accessToken) {
    return json({ error: "no session found", sessionId });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-07";
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  let gqlResult: unknown;
  let status = 0;
  const responseHeaders: Record<string, string> = {};

  try {
    const gqlResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `{
          cartTransforms(first: 5) { nodes { id functionId } }
          shopifyFunctions(first: 25) { nodes { id title apiType } }
        }`,
      }),
    });

    status = gqlResponse.status;
    gqlResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    gqlResult = await gqlResponse.json();
  } catch (e) {
    return json({ error: "fetch failed", detail: String(e) });
  }

  return json({
    sessionId,
    shop,
    tokenPrefix: accessToken.substring(0, 8) + "...",
    apiVersion,
    endpoint,
    httpStatus: status,
    responseHeaders,
    gqlResult,
  });
};
