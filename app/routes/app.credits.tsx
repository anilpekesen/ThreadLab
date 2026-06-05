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
  Badge,
  InlineGrid,
  InlineStack,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { useTranslation } from "~/i18n";
import { getValidAccessToken } from "~/lib/session.server";
import { query } from "~/lib/db.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { CREDIT_PACKS, type PackKey } from "~/lib/credit-packs";

export const headers = () => ({ "Cache-Control": "no-store" });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;

  const settings = await getShopSettings(shop);
  const permanentBonus: number = settings.aiQuotaBonus ?? 0;

  const month = new Date().toISOString().slice(0, 7);
  const [usageRes, purchasesRes, activeBonusRes] = await Promise.all([
    query<{ count: number }>(
      "SELECT count FROM ai_generation_usage WHERE shop = $1 AND month = $2",
      [shop, month],
    ),
    query<{
      pack_key: string;
      credits_added: number;
      price_usd: string;
      created_at: string;
      expires_at: string;
    }>(
      "SELECT pack_key, credits_added, price_usd, created_at, expires_at FROM ai_credit_purchases WHERE shop = $1 ORDER BY created_at DESC LIMIT 5",
      [shop],
    ),
    query<{ total: string }>(
      "SELECT COALESCE(SUM(credits_added), 0)::text AS total FROM ai_credit_purchases WHERE shop = $1 AND expires_at > now()",
      [shop],
    ),
  ]);

  const usedThisMonth: number = usageRes.rows[0]?.count ?? 0;
  const activePurchasedBonus = parseInt(activeBonusRes.rows[0]?.total ?? "0", 10);

  return json({
    shop,
    permanentBonus,
    activePurchasedBonus,
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
  const { permanentBonus, activePurchasedBonus, usedThisMonth, recentPurchases } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<{ redirectUrl?: string; error?: string }>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.redirectUrl) {
      window.open(actionData.redirectUrl, "_top");
    }
  }, [actionData]);

  const { t } = useTranslation();
  const packList = Object.values(CREDIT_PACKS);
  const totalBonus = activePurchasedBonus + permanentBonus;

  const purchaseRows = recentPurchases.map((p) => {
    const isExpired = new Date(p.expires_at) < new Date();
    return [
      <span key="pack" style={isExpired ? { opacity: 0.5 } : undefined}>
        {p.pack_key}
      </span>,
      <span key="credits" style={isExpired ? { opacity: 0.5 } : undefined}>
        {String(p.credits_added)}
      </span>,
      <span key="price" style={isExpired ? { opacity: 0.5 } : undefined}>
        ${Number(p.price_usd).toFixed(2)}
      </span>,
      <span key="date" style={isExpired ? { opacity: 0.5 } : undefined}>
        {new Date(p.created_at).toLocaleDateString("tr-TR")}
      </span>,
      <span key="expires" style={isExpired ? { opacity: 0.5 } : undefined}>
        {isExpired ? (
          <Badge tone="critical">{t("credits.expired")}</Badge>
        ) : (
          new Date(p.expires_at).toLocaleDateString()
        )}
      </span>,
    ];
  });

  return (
    <Page title={t("credits.title")}>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {totalBonus > 0 && (
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  {t("credits.currentBonus")}: <strong>{activePurchasedBonus}</strong> {t("credits.purchased")} +{" "}
                  <strong>{permanentBonus}</strong> {t("credits.permanent")} ={" "}
                  <strong>{totalBonus}</strong> {t("credits.total")}
                </Text>
              </Banner>
            )}
            {totalBonus === 0 && (
              <Banner tone="warning">
                <Text as="p" variant="bodyMd">
                  {t("credits.noBonus")}
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
                      {pack.credits} {t("credits.credits")}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("credits.validDays")}
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
                          {t("credits.buy")}
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
                  {actionData.error}
                </Text>
              </Banner>
            )}

            {recentPurchases.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {t("credits.recentPurchases")}
                  </Text>
                  <DataTable
                    columnContentTypes={["text", "numeric", "text", "text", "text"]}
                    headings={[t("credits.pack"), t("credits.amount"), t("credits.price"), t("credits.pack"), t("credits.expiry")]}
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
