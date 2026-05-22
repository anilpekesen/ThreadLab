import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Layout, Card, Text, BlockStack, Badge, Button, Box,
  InlineStack, InlineGrid, List, Divider, Banner, ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopSubscription, upsertShopSubscription, getAnalytics } from "~/models/billing.server";

const PLAN_ORDER: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];
const IS_TEST = process.env.SHOPIFY_BILLING_TEST !== "false";

const PLAN_BADGE: Record<PlanKey, "attention" | "info" | "success"> = {
  Starter: "attention", Growth: "info", Pro: "info", Business: "success",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  // Sync Shopify billing state to our DB
  const billingCheck = await billing.check({ plans: PLAN_ORDER, isTest: IS_TEST }).catch(() => null);
  if (billingCheck?.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
    const activeSub = billingCheck.appSubscriptions[0];
    const planKey = PLAN_ORDER.find((p) => activeSub.name === p);
    if (planKey) {
      await upsertShopSubscription(shop, {
        planKey,
        shopifySubscriptionId: activeSub.id,
        subscriptionStatus: "active",
      });
    }
  } else if (billingCheck && !billingCheck.hasActivePayment) {
    const sub = await getShopSubscription(shop);
    if (sub?.subscription_status === "active") {
      await upsertShopSubscription(shop, {
        planKey: sub.plan_key,
        subscriptionStatus: "cancelled",
      });
    }
  }

  const analytics = await getAnalytics(shop);
  return json({ analytics, isTest: IS_TEST });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "subscribe") {
    const planKey = form.get("plan") as PlanKey;
    if (!PLAN_ORDER.includes(planKey)) return json({ error: "Geçersiz plan" }, { status: 400 });

    await upsertShopSubscription(shop, { planKey, subscriptionStatus: "none" });

    // billing.request throws a redirect response — do NOT return after this
    await billing.request({
      plan: planKey,
      isTest: IS_TEST,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
    });
  }

  if (intent === "cancel") {
    const subscriptionId = form.get("subscriptionId") as string;
    if (subscriptionId) {
      await billing.cancel({ subscriptionId, prorate: true, isTest: IS_TEST });
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
  const { analytics, isTest } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const { t } = useTranslation();
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

        {isTest && (
          <Banner title="Test Modu Aktif" tone="warning">
            <Text as="p">Faturalar gerçek kart ücretlendirilmeden test ediliyor. Üretim ortamı için SHOPIFY_BILLING_TEST=false yapın.</Text>
          </Banner>
        )}

        {/* Mevcut plan özeti */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="start">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Mevcut Abonelik</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={PLAN_BADGE[analytics.planKey] ?? "attention"}>{analytics.planKey}</Badge>
                    {isActive && <Badge tone="success">Aktif</Badge>}
                    {isTrial && <Badge tone="info">Deneme</Badge>}
                    {!isActive && !isTrial && <Badge tone="attention">Aktif Değil</Badge>}
                  </InlineStack>
                </BlockStack>
                <Text as="p" variant="headingLg">${PLANS[analytics.planKey].price}<Text as="span" variant="bodySm" tone="subdued">/ay</Text></Text>
              </InlineStack>

              {analytics.bgQuota !== 0 && (
                <>
                  <Divider />
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">Arka plan kaldırma (bu ay)</Text>
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

              {(isActive || isTrial) && analytics.shopifySubscriptionId && (
                <>
                  <Divider />
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <input type="hidden" name="subscriptionId" value={analytics.shopifySubscriptionId} />
                    <Button tone="critical" variant="plain" submit loading={isLoading}>
                      Aboneliği İptal Et
                    </Button>
                  </Form>
                </>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Plan kartları */}
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {PLAN_ORDER.map((planKey) => {
                const plan = PLANS[planKey];
                const isCurrent = analytics.planKey === planKey && isActive;
                const isRecommended = planKey === "Growth";

                return (
                  <Card key={planKey}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">{planKey}</Text>
                            {isRecommended && !isCurrent && <Badge tone="info">Önerilen</Badge>}
                            {isCurrent && <Badge tone="success">Aktif</Badge>}
                          </InlineStack>
                          <InlineStack blockAlign="end" gap="100">
                            <Text as="p" variant="headingXl">${plan.price}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">/ay</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">7 gün ücretsiz deneme</Text>
                        </BlockStack>

                        <Divider />

                        <List type="bullet">
                          {plan.features.map((f) => (
                            <List.Item key={f}>{f}</List.Item>
                          ))}
                        </List>

                        {isCurrent ? (
                          <Button fullWidth disabled>Mevcut Plan</Button>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="subscribe" />
                            <input type="hidden" name="plan" value={planKey} />
                            <Button fullWidth variant="primary" submit loading={isLoading}>
                              {isActive ? t("billing.changePlan") : t("billing.choosePlan")} → {planKey}
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

        {/* Karşılaştırma tablosu */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Plan Karşılaştırması</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e4e5e7" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Özellik</th>
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
                      { label: t("billing.freeTrial"), values: PLAN_ORDER.map(() => "7 gün") },
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
