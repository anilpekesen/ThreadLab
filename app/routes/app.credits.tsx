import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Banner,
  Button,
  Box,
  InlineGrid,
  InlineStack,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";
import { query } from "~/lib/db.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";

export const headers = () => ({ "Cache-Control": "no-store" });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;

  const settings = await getShopSettings(shop);
  const aiQuotaBonus: number = settings.aiQuotaBonus ?? 0;

  const month = new Date().toISOString().slice(0, 7);
  const usageRes = await query<{ count: number }>(
    "SELECT count FROM ai_generation_usage WHERE shop = $1 AND month = $2",
    [shop, month],
  );
  const usedThisMonth: number = usageRes.rows[0]?.count ?? 0;

  const purchasesRes = await query<{
    pack_key: string;
    credits_added: number;
    price_usd: string;
    created_at: Date;
  }>(
    "SELECT pack_key, credits_added, price_usd, created_at FROM ai_credit_purchases WHERE shop = $1 ORDER BY created_at DESC LIMIT 3",
    [shop],
  );

  return json({
    shop,
    aiQuotaBonus,
    usedThisMonth,
    recentPurchases: purchasesRes.rows,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const packKey = form.get("packKey") as PackKey;
  const pack = CREDIT_PACKS[packKey];
  if (!pack) return json({ error: "Geçersiz paket" }, { status: 400 });

  const { session } = await authenticate(request);
  const accessToken = await getValidAccessToken(session.shop);
  const test = process.env.SHOPIFY_BILLING_TEST === "true";
  const appUrl = process.env.SHOPIFY_APP_URL ?? "https://printlabapp.com";
  const returnUrl = `${appUrl}/app/credits/callback?pack=${packKey}`;

  const resp = await shopifyGraphQL(
    session.shop,
    accessToken!,
    `mutation CreateOneTimeCharge($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean!) {
      appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
        appPurchaseOneTime { id }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      name: pack.label,
      price: { amount: pack.price.toFixed(2), currencyCode: "USD" },
      returnUrl,
      test,
    },
  );

  const data = (await resp.json()) as {
    data?: {
      appPurchaseOneTimeCreate?: {
        appPurchaseOneTime?: { id: string } | null;
        confirmationUrl?: string | null;
        userErrors?: { field: string; message: string }[];
      };
    };
  };

  const result = data.data?.appPurchaseOneTimeCreate;
  if (result?.userErrors?.length) throw new Error(result.userErrors[0].message);
  if (!result?.confirmationUrl) throw new Error("Confirmation URL alınamadı");

  return json({ redirectUrl: result.confirmationUrl });
};

export default function CreditsPage() {
  const { aiQuotaBonus, usedThisMonth, recentPurchases } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<{ redirectUrl?: string; error?: string }>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.redirectUrl) {
      window.open(actionData.redirectUrl, "_top");
    }
  }, [actionData]);

  const packList = Object.values(CREDIT_PACKS);

  const purchaseRows = recentPurchases.map((p) => [
    p.pack_key,
    String(p.credits_added),
    `$${Number(p.price_usd).toFixed(2)}`,
    new Date(p.created_at).toLocaleDateString("tr-TR"),
  ]);

  return (
    <Page title="AI Kredi Paketleri">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {aiQuotaBonus > 0 && (
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  Mevcut bonus krediniz: <strong>{aiQuotaBonus}</strong> — Bu ay kullanılan:{" "}
                  <strong>{usedThisMonth}</strong>
                </Text>
              </Banner>
            )}
            {aiQuotaBonus === 0 && (
              <Banner tone="warning">
                <Text as="p" variant="bodyMd">
                  Bu ay kullanılan AI jenerasyon: <strong>{usedThisMonth}</strong>. Ek kredi satın alarak limitinizi artırabilirsiniz.
                </Text>
              </Banner>
            )}

            <InlineGrid columns={3} gap="400">
              {packList.map((pack) => (
                <Card key={pack.key}>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      {pack.label}
                    </Text>
                    <Text as="p" variant="bodyLg">
                      <strong>${pack.price.toFixed(2)}</strong> USD
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {pack.credits} AI görsel jenerasyonu
                    </Text>
                    <Box paddingBlockStart="200">
                      <Form method="post">
                        <input type="hidden" name="packKey" value={pack.key} />
                        <Button
                          variant="primary"
                          submit
                          loading={isLoading}
                          disabled={isLoading}
                          fullWidth
                        >
                          Satın Al
                        </Button>
                      </Form>
                    </Box>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>

            {actionData?.error && (
              <Banner tone="critical">
                <Text as="p" variant="bodyMd">
                  Hata: {actionData.error}
                </Text>
              </Banner>
            )}

            {recentPurchases.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Son Satın Alımlar
                  </Text>
                  <DataTable
                    columnContentTypes={["text", "numeric", "text", "text"]}
                    headings={["Paket", "Kredi", "Fiyat", "Tarih"]}
                    rows={purchaseRows}
                  />
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
