import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { PLANS, PLAN_NAMES, type PlanKey } from "~/lib/plans";

const PLAN_ORDER: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ plans: PLAN_NAMES });
};

export default function BillingPage() {
  const { plans } = useLoaderData<typeof loader>();
  void plans;

  return (
    <Page title="Abonelik ve Planlar">
      <BlockStack gap="500">
        <Banner title="Ödeme sistemi yakında aktif olacak" tone="info">
          <Text as="p">
            Abonelik yönetimi için uygulama dağıtımının &quot;Herkese Açık&quot; olarak
            güncellenmesi gerekiyor. Bu süreçte uygulamayı ücretsiz
            kullanmaya devam edebilirsiniz.
          </Text>
        </Banner>

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              {PLAN_ORDER.map((planKey) => {
                const plan = PLANS[planKey];
                const isRecommended = planKey === "Growth";

                return (
                  <Card key={planKey}>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">
                              {planKey}
                            </Text>
                            {isRecommended ? (
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

                        <Button fullWidth disabled>
                          Yakında
                        </Button>
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
              <Text as="h2" variant="headingMd">Plan Karşılaştırması</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e4e5e7" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Özellik</th>
                      {PLAN_ORDER.map((k) => (
                        <th key={k} style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>
                          {k}
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
                      { label: "Ücretsiz deneme", values: PLAN_ORDER.map(() => "7 gün") },
                    ].map(({ label, values }) => (
                      <tr key={label} style={{ borderBottom: "1px solid #f4f4f4" }}>
                        <td style={{ padding: "8px 12px", color: "#6d7175" }}>{label}</td>
                        {values.map((v, i) => (
                          <td
                            key={i}
                            style={{
                              textAlign: "center",
                              padding: "8px 12px",
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
