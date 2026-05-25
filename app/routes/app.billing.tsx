import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Layout, Card, Text, BlockStack, Badge, Button, Box,
  InlineStack, InlineGrid, List, Divider, Banner, ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopSubscription, upsertShopSubscription, getAnalytics } from "~/models/billing.server";

const PLAN_ORDER: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];
const IS_TEST = process.env.SHOPIFY_BILLING_TEST !== "false";

const PLAN_BADGE: Record<PlanKey, "attention" | "info" | "success"> = {
  Starter: "attention", Growth: "info", Pro: "info", Business: "success",
};

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

async function getAccessToken(shop: string): Promise<string | null> {
  const result = await query(`SELECT "accessToken" FROM shopify_sessions WHERE id = $1`, [
    `offline_${shop}`,
  ]);
  return (result.rows[0]?.accessToken as string | undefined) ?? null;
}

async function checkShopifySubscription(
  shop: string,
  accessToken: string,
): Promise<{ hasActivePayment: boolean; subscriptionId: string | null; planName: string | null }> {
  try {
    const resp = await shopifyGraphQL(shop, accessToken, `{
      currentAppInstallation {
        activeSubscriptions { id name status test }
      }
    }`);
    const data = (await resp.json()) as {
      data?: { currentAppInstallation?: { activeSubscriptions?: { id: string; name: string; status: string; test: boolean }[] } };
    };
    const subs = data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs.find((s) => s.status === "ACTIVE");
    if (active) {
      return { hasActivePayment: true, subscriptionId: active.id, planName: active.name };
    }
  } catch (err) {
    console.error("[billing] checkShopifySubscription error:", err);
  }
  return { hasActivePayment: false, subscriptionId: null, planName: null };
}

async function createShopifySubscription(
  shop: string,
  accessToken: string,
  planKey: PlanKey,
  returnUrl: string,
): Promise<string> {
  const plan = PLANS[planKey];
  const resp = await shopifyGraphQL(
    shop,
    accessToken,
    `mutation AppSubscriptionCreate(
      $name: String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $test: Boolean
      $trialDays: Int
    ) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
        trialDays: $trialDays
      ) {
        appSubscription { id }
        confirmationUrl
        userErrors { field message }
      }
    }`,
    {
      name: planKey,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: plan.price, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
      returnUrl,
      test: IS_TEST,
      trialDays: 14,
    },
  );

  const data = (await resp.json()) as {
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string;
        userErrors?: { field: string; message: string }[];
      };
    };
  };

  const result = data.data?.appSubscriptionCreate;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }
  if (!result?.confirmationUrl) {
    throw new Error("No confirmation URL returned from Shopify");
  }
  return result.confirmationUrl;
}

async function cancelShopifySubscription(
  shop: string,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  await shopifyGraphQL(
    shop,
    accessToken,
    `mutation AppSubscriptionCancel($id: ID!, $prorate: Boolean) {
      appSubscriptionCancel(id: $id, prorate: $prorate) {
        appSubscription { id status }
        userErrors { field message }
      }
    }`,
    { id: subscriptionId, prorate: true },
  );
}

async function getDowngradeRestrictions(shop: string, analytics: Awaited<ReturnType<typeof getAnalytics>>) {
  const [ptResult, tplResult] = await Promise.all([
    query<{ count: string }>("SELECT COUNT(*) AS count FROM product_categories WHERE shop = $1 AND deleted_at IS NULL", [shop]),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM shop_templates WHERE shop = $1", [shop]),
  ]);
  const productTypeCount = Number(ptResult.rows[0]?.count ?? 0);
  const templateCount = Number(tplResult.rows[0]?.count ?? 0);

  const currentIdx = PLAN_ORDER.indexOf(analytics.planKey);
  const blockedReasons: Partial<Record<PlanKey, string[]>> = {};

  for (const pk of PLAN_ORDER) {
    const pkIdx = PLAN_ORDER.indexOf(pk);
    if (pkIdx >= currentIdx) continue; // upgrade or same — always allowed
    const target = PLANS[pk];
    const reasons: string[] = [];

    if (target.removeBgMonthlyQuota !== -1 && analytics.bgThisMonth > target.removeBgMonthlyQuota) {
      reasons.push(`Bu ay ${analytics.bgThisMonth} arka plan kaldırma kullandınız (${pk}: ${target.removeBgMonthlyQuota} limit)`);
    }
    if (target.maxProductTypes !== -1 && productTypeCount > target.maxProductTypes) {
      reasons.push(`${productTypeCount} ürün kategoriniz var (${pk}: max ${target.maxProductTypes})`);
    }
    if (target.maxShopTemplates !== -1 && templateCount > target.maxShopTemplates) {
      reasons.push(`${templateCount} şablonunuz var (${pk}: max ${target.maxShopTemplates === 0 ? "yok" : target.maxShopTemplates})`);
    }
    if (reasons.length) blockedReasons[pk] = reasons;
  }

  return { blockedReasons, productTypeCount, templateCount };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;

  const accessToken = await getAccessToken(shop);
  if (accessToken) {
    const { hasActivePayment, subscriptionId, planName } = await checkShopifySubscription(
      shop,
      accessToken,
    );
    if (hasActivePayment && planName && PLAN_ORDER.includes(planName as PlanKey)) {
      await upsertShopSubscription(shop, {
        planKey: planName as PlanKey,
        shopifySubscriptionId: subscriptionId,
        subscriptionStatus: "active",
      });
    } else {
      const sub = await getShopSubscription(shop);
      if (sub?.subscription_status === "active") {
        await upsertShopSubscription(shop, {
          planKey: sub.plan_key,
          subscriptionStatus: "cancelled",
        });
      }
    }
  }

  const analytics = await getAnalytics(shop);
  const { blockedReasons } = await getDowngradeRestrictions(shop, analytics);
  return json({ analytics, isTest: IS_TEST, blockedReasons });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  const accessToken = await getAccessToken(shop);
  if (!accessToken) return redirect("/auth/login");

  if (intent === "subscribe") {
    const planKey = form.get("plan") as PlanKey;
    if (!PLAN_ORDER.includes(planKey)) return json({ error: "Geçersiz plan" }, { status: 400 });

    // Downgrade protection
    const currentSub = await getShopSubscription(shop);
    const currentPlanKey = currentSub?.plan_key ?? "Starter";
    const targetIdx = PLAN_ORDER.indexOf(planKey);
    const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);

    if (targetIdx < currentIdx && (currentSub?.subscription_status === "active" || currentSub?.subscription_status === "trial")) {
      const analytics = await getAnalytics(shop);
      const { blockedReasons } = await getDowngradeRestrictions(shop, analytics);
      const reasons = blockedReasons[planKey];
      if (reasons?.length) {
        return json({ error: `${planKey} planına geçiş engellenmiştir:\n• ${reasons.join("\n• ")}` }, { status: 400 });
      }
    }

    try {
      const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing`;
      const confirmationUrl = await createShopifySubscription(shop, accessToken, planKey, returnUrl);
      // Only update DB after Shopify confirms the subscription was created
      await upsertShopSubscription(shop, { planKey, subscriptionStatus: "none" });
      return redirect(confirmationUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[billing] subscription create error:", message);
      return json({ error: `Shopify aboneliği oluşturulamadı: ${message}` }, { status: 500 });
    }
  }

  if (intent === "cancel") {
    const subscriptionId = form.get("subscriptionId") as string;
    if (subscriptionId) {
      await cancelShopifySubscription(shop, accessToken, subscriptionId);
    }
    const sub = await getShopSubscription(shop);
    await upsertShopSubscription(shop, {
      planKey: sub?.plan_key ?? "Starter",
      shopifySubscriptionId: null,
      subscriptionStatus: "cancelled",
    });
    return redirect("/app/billing");
  }

  return redirect("/app/billing");
};

export default function BillingPage() {
  const { analytics, isTest, blockedReasons } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const nav = useNavigation();
  const { t, lang } = useTranslation();
  const isLoading = nav.state === "submitting";
  const isActive = analytics.subscriptionStatus === "active";
  const isTrial = analytics.subscriptionStatus === "trial";

  return (
    <Page title={t("billing.title")}>
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.billing.1.title", bodyKey: "helper.billing.1.body" },
          { titleKey: "helper.billing.2.title", bodyKey: "helper.billing.2.body" },
        ]} />

        {actionData?.error && (
          <Banner title="Hata" tone="critical">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {isTest && (
          <Banner title={t("billing.testMode")} tone="warning">
            <Text as="p">{t("billing.testModeDesc")}</Text>
          </Banner>
        )}

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">{t("billing.currentSubscription")}</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={PLAN_BADGE[analytics.planKey] ?? "attention"}>{analytics.planKey}</Badge>
                    {isActive && <Badge tone="success">{t("billing.active")}</Badge>}
                    {isTrial && <Badge tone="info">{t("billing.trial")}</Badge>}
                    {!isActive && !isTrial && <Badge tone="attention">{t("billing.inactive")}</Badge>}
                  </InlineStack>
                </BlockStack>
                <Text as="p" variant="headingLg">${PLANS[analytics.planKey].price}<Text as="span" variant="bodySm" tone="subdued">{t("billing.perMonth")}</Text></Text>
              </InlineStack>

              {analytics.bgQuota !== 0 && (
                <>
                  <Divider />
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">{t("billing.bgThisMonth")}</Text>
                      <Text as="p" variant="bodySm">
                        {analytics.bgThisMonth} / {analytics.bgQuota}
                      </Text>
                    </InlineStack>
                    {analytics.bgQuota > 0 && (
                      <ProgressBar
                        progress={Math.min(analytics.bgPercent, 100)}
                        tone={analytics.bgPercent >= 90 ? "critical" : "primary"}
                        size="small"
                      />
                    )}
                  </BlockStack>
                </>
              )}

              {(isActive || isTrial) && (
                <>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {lang === "tr" ? "Aboneliği iptal etmek istiyorsanız:" : "To cancel your subscription:"}
                    </Text>
                    <Form method="post">
                      <input type="hidden" name="intent" value="cancel" />
                      <input type="hidden" name="subscriptionId" value={analytics.shopifySubscriptionId ?? ""} />
                      <Button tone="critical" variant="plain" submit loading={isLoading}>
                        {t("billing.cancelSubscription")}
                      </Button>
                    </Form>
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Box>
        </Card>

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {PLAN_ORDER.map((planKey) => {
                const plan = PLANS[planKey];
                const isCurrent = analytics.planKey === planKey && (isActive || isTrial);
                const isRecommended = planKey === "Growth";
                const blockReasons = (isActive || isTrial) ? (blockedReasons[planKey] ?? null) : null;
                const isBlocked = !!blockReasons;

                return (
                  <Card key={planKey}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">{planKey}</Text>
                            {isRecommended && !isCurrent && !isBlocked && <Badge tone="info">{t("billing.recommended")}</Badge>}
                            {isCurrent && <Badge tone="success">{t("billing.active")}</Badge>}
                            {isBlocked && <Badge tone="critical">Kısıtlı</Badge>}
                          </InlineStack>
                          <InlineStack blockAlign="end" gap="100">
                            <Text as="p" variant="headingXl">${plan.price}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{t("billing.perMonth")}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">{t("billing.trialLabel")}</Text>
                        </BlockStack>

                        <Divider />

                        <List type="bullet">
                          {plan.features[lang].map((f) => (
                            <List.Item key={f}>{f}</List.Item>
                          ))}
                        </List>

                        {isBlocked && (
                          <Banner tone="critical">
                            <BlockStack gap="100">
                              <Text as="p" variant="bodySm" fontWeight="semibold">Bu plana geçemezsiniz:</Text>
                              {blockReasons.map((r, i) => (
                                <Text key={i} as="p" variant="bodySm">• {r}</Text>
                              ))}
                            </BlockStack>
                          </Banner>
                        )}

                        {isCurrent ? (
                          <Button fullWidth disabled>{t("billing.currentPlanBtn")}</Button>
                        ) : isBlocked ? (
                          <Button fullWidth disabled tone="critical">Geçiş Engellendi</Button>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="subscribe" />
                            <input type="hidden" name="plan" value={planKey} />
                            <Button fullWidth variant="primary" submit loading={isLoading}>
                              {isActive || isTrial ? t("billing.changePlan") : t("billing.choosePlan")} → {planKey}
                            </Button>
                          </Form>
                        )}
                      </BlockStack>
                    </Box>
                  </Card>
                );
              })}
            </InlineGrid>
          </Layout.Section>
        </Layout>

        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{t("billing.comparison")}</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e4e5e7" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>{t("billing.feature")}</th>
                      {PLAN_ORDER.map((k) => (
                        <th key={k} style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>
                          {k}{analytics.planKey === k && isActive ? " ✓" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: t("billing.monthlyPrice"), values: PLAN_ORDER.map((k) => `$${PLANS[k].price}`) },
                      { label: t("billing.productTypes"), values: PLAN_ORDER.map((k) => PLANS[k].maxProductTypes === -1 ? t("billing.unlimited") : String(PLANS[k].maxProductTypes)) },
                      { label: t("billing.ordersPerMonth"), values: PLAN_ORDER.map((k) => PLANS[k].maxMonthlyOrders === -1 ? t("billing.unlimited") : String(PLANS[k].maxMonthlyOrders)) },
                      { label: t("billing.backSurface"), values: PLAN_ORDER.map((k) => PLANS[k].allowBackSurface ? "✓" : "—") },
                      { label: t("billing.bgRemoval"), values: PLAN_ORDER.map((k) => String(PLANS[k].removeBgMonthlyQuota)) },
                      { label: t("billing.templates"), values: PLAN_ORDER.map((k) => PLANS[k].maxShopTemplates === -1 ? t("billing.unlimited") : PLANS[k].maxShopTemplates === 0 ? "—" : String(PLANS[k].maxShopTemplates)) },
                      { label: t("billing.freeTrial"), values: PLAN_ORDER.map(() => t("billing.trialDays")) },
                    ].map(({ label, values }) => (
                      <tr key={label} style={{ borderBottom: "1px solid #f4f4f4" }}>
                        <td style={{ padding: "8px 12px", color: "#6d7175" }}>{label}</td>
                        {values.map((v, i) => (
                          <td key={i} style={{ textAlign: "center", padding: "8px 12px", color: v === "—" ? "#aaa" : undefined }}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Box>
        </Card>

      </BlockStack>
    </Page>
  );
}
