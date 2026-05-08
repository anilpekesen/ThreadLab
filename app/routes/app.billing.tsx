import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  Button,
  Box,
  InlineStack,
  InlineGrid,
  Banner,
  List,
  Divider,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { PLANS, PLAN_NAMES, type PlanKey } from "~/lib/plans";
import { getShopBillingState, planKeyFromName } from "~/lib/billing.server";

const IS_TEST =
  process.env.SHOPIFY_BILLING_TEST === "true" ||
  process.env.NODE_ENV !== "production";

const PLAN_ORDER: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: PLAN_NAMES,
    isTest: IS_TEST,
  });

  const activeSub = appSubscriptions[0] ?? null;
  const currentPlanKey = planKeyFromName(activeSub?.name);
  const billingState = getShopBillingState(session.shop);
  const currentPlan = currentPlanKey ? PLANS[currentPlanKey] : null;

  return json({
    hasActivePayment,
    currentPlanKey,
    currentPlan,
    subscriptionId: activeSub?.id ?? null,
    currentPeriodEnd: activeSub?.currentPeriodEnd ?? null,
    monthlyOrderCount: billingState.monthlyOrderCount,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "subscribe") {
    const plan = String(formData.get("plan") ?? "");
    if (!PLAN_NAMES.includes(plan as PlanKey)) {
      return json({ error: "Geçersiz plan" }, { status: 400 });
    }
    const appUrl = process.env.SHOPIFY_APP_URL ?? "";
    await billing.request({
      plan: plan as "Starter" | "Growth" | "Pro" | "Business",
      isTest: IS_TEST,
      returnUrl: `${appUrl}/app/billing`,
    });
  }

  if (intent === "cancel") {
    const subscriptionId = String(formData.get("subscriptionId") ?? "");
    if (subscriptionId) {
      await billing.cancel({
        subscriptionId,
        isTest: IS_TEST,
        prorate: false,
      });
    }
    return redirect("/app/billing");
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

function orderUsagePercent(count: number, limit: number) {
  if (limit === -1) return 0;
  return Math.min(100, Math.round((count / limit) * 100));
}

export default function BillingPage() {
  const {
    hasActivePayment,
    currentPlanKey,
    currentPlan,
    subscriptionId,
    currentPeriodEnd,
    monthlyOrderCount,
  } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const orderLimit = currentPlan?.maxMonthlyOrders ?? 0;
  const usagePct = currentPlan ? orderUsagePercent(monthlyOrderCount, orderLimit) : 0;

  return (
    <Page title="Abonelik ve Planlar">
      <BlockStack gap="500">
        {/* Mevcut plan / uyarı banner */}
        {hasActivePayment && currentPlanKey && currentPlan ? (
          <Banner title={`Aktif plan: ${currentPlanKey}`} tone="success">
            <BlockStack gap="300">
              <Text as="p">
                Bu ayki sipariş kullanımı:{" "}
                <strong>{monthlyOrderCount}</strong> /{" "}
                {orderLimit === -1 ? "Sınırsız" : orderLimit}
              </Text>
              {orderLimit !== -1 ? (
                <ProgressBar progress={usagePct} size="small" tone={usagePct >= 90 ? "critical" : "primary"} />
              ) : null}
              {currentPeriodEnd ? (
                <Text as="p" tone="subdued">
                  Dönem sonu: {new Date(currentPeriodEnd).toLocaleDateString("tr-TR")}
                </Text>
              ) : null}
            </BlockStack>
          </Banner>
        ) : (
          <Banner title="Aktif abonelik yok" tone="warning">
            <Text as="p">
              Tasarım aracını mağazanızda kullanmak için aşağıdan bir plan seçin.
              İlk 7 gün ücretsiz deneme hakkı tanınır.
            </Text>
          </Banner>
        )}

        {/* Plan kartları */}
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {PLAN_ORDER.map((planKey) => {
                const plan = PLANS[planKey];
                const isCurrent = currentPlanKey === planKey;
                const isRecommended = planKey === "Growth" && !hasActivePayment;
                const isUpgrade =
                  hasActivePayment &&
                  !isCurrent &&
                  PLAN_ORDER.indexOf(planKey) >
                    PLAN_ORDER.indexOf(currentPlanKey ?? "Starter");
                const isDowngrade =
                  hasActivePayment &&
                  !isCurrent &&
                  PLAN_ORDER.indexOf(planKey) <
                    PLAN_ORDER.indexOf(currentPlanKey ?? "Starter");

                return (
                  <Card key={planKey}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">
                              {planKey}
                            </Text>
                            {isCurrent ? (
                              <Badge tone="success">Aktif</Badge>
                            ) : isRecommended ? (
                              <Badge tone="info">Önerilen</Badge>
                            ) : null}
                          </InlineStack>
                          <InlineStack blockAlign="end" gap="100">
                            <Text as="p" variant="headingXl">
                              ${plan.price}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              /ay
                            </Text>
                          </InlineStack>
                        </BlockStack>

                        <Divider />

                        <List type="bullet">
                          {plan.features.map((f) => (
                            <List.Item key={f}>{f}</List.Item>
                          ))}
                        </List>

                        <Form method="post">
                          <input type="hidden" name="intent" value="subscribe" />
                          <input type="hidden" name="plan" value={planKey} />
                          <Button
                            submit
                            fullWidth
                            disabled={isCurrent || isSubmitting}
                            variant={
                              isCurrent
                                ? "secondary"
                                : isRecommended
                                  ? "primary"
                                  : "secondary"
                            }
                          >
                            {isCurrent
                              ? "Mevcut Plan"
                              : isUpgrade
                                ? "Yükselt"
                                : isDowngrade
                                  ? "Düşür"
                                  : hasActivePayment
                                    ? "Değiştir"
                                    : "Başla"}
                          </Button>
                        </Form>
                      </BlockStack>
                    </Box>
                  </Card>
                );
              })}
            </InlineGrid>
          </Layout.Section>
        </Layout>

        {/* İptal bölümü */}
        {hasActivePayment && subscriptionId ? (
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Aboneliği İptal Et
                </Text>
                <Text as="p" tone="subdued">
                  İptal ettiğinizde, mevcut dönem sonuna kadar erişiminiz
                  devam eder. Mağazanızdaki tasarım aracı o tarihten itibaren
                  devre dışı kalır.
                </Text>
                <InlineStack>
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <input
                      type="hidden"
                      name="subscriptionId"
                      value={subscriptionId}
                    />
                    <Button
                      submit
                      tone="critical"
                      disabled={isSubmitting}
                    >
                      Aboneliği İptal Et
                    </Button>
                  </Form>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        ) : null}

        {/* Plan karşılaştırma tablosu */}
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
                        <th
                          key={k}
                          style={{
                            textAlign: "center",
                            padding: "8px 12px",
                            fontWeight: 600,
                            background: k === currentPlanKey ? "#f0f7ff" : undefined,
                          }}
                        >
                          {k}
                          {k === currentPlanKey ? " ✓" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Aylık fiyat", values: PLAN_ORDER.map((k) => `$${PLANS[k].price}`) },
                      {
                        label: "Ürün tipi limiti",
                        values: PLAN_ORDER.map((k) =>
                          PLANS[k].maxProductTypes === -1 ? "Sınırsız" : String(PLANS[k].maxProductTypes)
                        ),
                      },
                      {
                        label: "Sipariş/ay",
                        values: PLAN_ORDER.map((k) =>
                          PLANS[k].maxMonthlyOrders === -1 ? "Sınırsız" : String(PLANS[k].maxMonthlyOrders)
                        ),
                      },
                      {
                        label: "Arka yüz baskı",
                        values: PLAN_ORDER.map((k) => (PLANS[k].allowBackSurface ? "✓" : "—")),
                      },
                      {
                        label: "Arka plan kaldırma",
                        values: PLAN_ORDER.map((k) => (PLANS[k].allowRemoveBg ? "✓" : "—")),
                      },
                      {
                        label: "Ücretsiz deneme",
                        values: PLAN_ORDER.map(() => "7 gün"),
                      },
                    ].map(({ label, values }) => (
                      <tr key={label} style={{ borderBottom: "1px solid #f4f4f4" }}>
                        <td style={{ padding: "8px 12px", color: "#6d7175" }}>{label}</td>
                        {values.map((v, i) => (
                          <td
                            key={i}
                            style={{
                              textAlign: "center",
                              padding: "8px 12px",
                              background: PLAN_ORDER[i] === currentPlanKey ? "#f0f7ff" : undefined,
                              color: v === "—" ? "#aaa" : undefined,
                            }}
                          >
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
