import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { sessionStorage } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.SHOPIFY_API_SECRET) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const shop = url.searchParams.get("shop") || "whanotify-dev.myshopify.com";
  const sessionId = `offline_${shop}`;

  let session: Awaited<ReturnType<typeof sessionStorage.loadSession>> = null;
  try {
    session = await sessionStorage.loadSession(sessionId);
  } catch (e) {
    return json({ error: "session load failed", detail: String(e) });
  }

  if (!session) {
    return json({ error: "no session found", sessionId });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-07";
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  let gqlResult: unknown;
  let status: number;
  let responseHeaders: Record<string, string> = {};

  try {
    const gqlResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken ?? "",
      },
      body: JSON.stringify({
        query: `{ shop { name } }`,
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
    shop: session.shop,
    scope: session.scope,
    tokenPrefix: session.accessToken ? session.accessToken.substring(0, 8) + "..." : "NONE",
    apiVersion,
    endpoint,
    httpStatus: status,
    responseHeaders,
    gqlResult,
  });
};
