import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";

const ALLOWED_SHOPS = (process.env.OWNER_SHOPS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STOREFRONT_TOKEN =
  process.env.STOREFRONT_API_KEY ||
  process.env.Storefront_API_KEY ||
  "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405, headers: CORS_HEADERS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return json({ error: "Geçersiz body" }, { status: 400, headers: CORS_HEADERS });
  }

  const shop        = typeof body.shop === "string"        ? body.shop.trim()        : "";
  const variantId   = typeof body.variantId === "string"   ? body.variantId.trim()   : "";
  const quantity    = typeof body.quantity === "number"     ? body.quantity           : 1;
  const designToken = typeof body.designToken === "string" ? body.designToken.trim() : "";
  const properties  = body.properties && typeof body.properties === "object"
    ? body.properties as Record<string, string>
    : {};

  if (!ALLOWED_SHOPS.includes(shop)) {
    return json({ error: "Bu mağaza için yetki yok." }, { status: 403, headers: CORS_HEADERS });
  }

  if (!variantId) {
    return json({ error: "variantId gerekli" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!STOREFRONT_TOKEN) {
    return json({ error: "Storefront API token tanımlı değil." }, { status: 500, headers: CORS_HEADERS });
  }

  // GID formatına çevir: numeric veya zaten GID olabilir
  const merchandiseId = variantId.startsWith("gid://")
    ? variantId
    : `gid://shopify/ProductVariant/${variantId}`;

  // Tasarım bilgilerini line item attributes olarak ekle
  const attributes: { key: string; value: string }[] = [
    ...(designToken ? [{ key: "_design_token", value: designToken }] : []),
    ...Object.entries(properties).map(([k, v]) => ({ key: k, value: String(v) })),
  ];

  const cartCreateMutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const sfRes = await fetch(
    `https://${shop}/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
      },
      body: JSON.stringify({
        query: cartCreateMutation,
        variables: {
          input: {
            lines: [
              {
                merchandiseId,
                quantity,
                attributes,
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!sfRes.ok) {
    const err = await sfRes.text();
    console.error("[embed/cart] Storefront API error:", err);
    return json(
      { error: `Storefront API hatası: ${sfRes.status}` },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const data = await sfRes.json() as {
    data?: {
      cartCreate?: {
        cart?: { id: string; checkoutUrl: string };
        userErrors?: { field: string; message: string }[];
      };
    };
    errors?: { message: string }[];
  };

  const userErrors = data.data?.cartCreate?.userErrors;
  if (userErrors && userErrors.length > 0) {
    console.error("[embed/cart] userErrors:", userErrors);
    return json(
      { error: userErrors.map((e) => e.message).join(", ") },
      { status: 422, headers: CORS_HEADERS },
    );
  }

  const checkoutUrl = data.data?.cartCreate?.cart?.checkoutUrl;
  if (!checkoutUrl) {
    console.error("[embed/cart] checkoutUrl yok:", JSON.stringify(data));
    return json({ error: "Checkout URL alınamadı." }, { status: 500, headers: CORS_HEADERS });
  }

  console.log(`[embed/cart] cart → ${checkoutUrl}`);
  return json({ checkoutUrl }, { headers: CORS_HEADERS });
};
