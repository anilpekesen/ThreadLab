import { DISTINCT_TYPE_COUNT_SQL } from "~/models/product-types.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import * as Sentry from "@sentry/remix";
import { useEffect, useState } from "react";
import { useDict, useTranslation, pickDict } from "~/i18n";
import { langFromRequest } from "~/i18n/server";
import billingDict, { type DowngradeReason } from "~/i18n/admin/billing";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Layout, Card, Text, BlockStack, Badge, Button, Box,
  InlineStack, InlineGrid, List, Divider, Banner, ProgressBar, TextField,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";
import { makeBillingReturnShopCookie } from "~/lib/billing-return-cookie.server";
import { appendSignedShopParams } from "~/lib/signed-shop-link.server";
import { query } from "~/lib/db.server";
import { PLANS, type PlanKey } from "~/lib/plans";
import { getShopSubscription, upsertShopSubscription, getAnalytics } from "~/models/billing.server";
import { listConfiguredProductIds } from "~/models/product-config.server";
import { checkPromo, reservePromo, activatePendingPromo } from "~/models/promo.server";

const PLAN_ORDER: PlanKey[] = ["Starter", "Growth", "Pro", "Business"];
/** Kartlar ve karşılaştırma tablosu: ücretsiz plan başta */
const DISPLAY_ORDER: PlanKey[] = ["Free", ...PLAN_ORDER];
const MANAGED_PRICING_APP_HANDLE = process.env.SHOPIFY_APP_HANDLE ?? "printlab";

function isBillingTestCharge(shop: string): boolean {
  if (process.env.SHOPIFY_BILLING_TEST === "true") return true;

  const testStores = (process.env.SHOPIFY_BILLING_TEST_STORES ?? "")
    .split(",")
    .map((store) => store.trim().toLowerCase())
    .filter(Boolean);

  return testStores.includes(shop.toLowerCase());
}

function isOwnerShop(shop: string): boolean {
  const ownerShops = (process.env.OWNER_SHOPS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ownerShops.includes(shop.toLowerCase());
}

const PLAN_BADGE: Record<PlanKey, "attention" | "info" | "success"> = {
  Free: "attention", Starter: "attention", Growth: "info", Pro: "info", Business: "success",
};

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});


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
    Sentry.captureException(err, { tags: { fn: "checkShopifySubscription" } });
  }
  return { hasActivePayment: false, subscriptionId: null, planName: null };
}

async function createShopifySubscription(
  shop: string,
  accessToken: string,
  planKey: PlanKey,
  returnUrl: string,
  test: boolean,
  /** Kampanya kodu: ilk N ay %100 indirim (deneme süresi yerine) */
  freeMonths = 0,
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
      $replacementBehavior: AppSubscriptionReplacementBehavior
    ) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        test: $test
        trialDays: $trialDays
        replacementBehavior: $replacementBehavior
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
              ...(freeMonths > 0
                ? { discount: { value: { percentage: 1 }, durationLimitInIntervals: freeMonths } }
                : {}),
            },
          },
        },
      ],
      returnUrl,
      test,
      trialDays: freeMonths > 0 ? 0 : plan.trialDays,
      replacementBehavior: "APPLY_IMMEDIATELY",
    },
  );

  const data = (await resp.json()) as {
    errors?: { message?: string; extensions?: { code?: string } }[];
    data?: {
      appSubscriptionCreate?: {
        confirmationUrl?: string;
        userErrors?: { field: string; message: string }[];
      };
    };
  };

  const result = data.data?.appSubscriptionCreate;
  if (data.errors?.length) {
    throw new Error(
      data.errors
        .map((error) => [error.message, error.extensions?.code].filter(Boolean).join(" ["))
        .map((msg) => (msg.endsWith("[") ? msg.slice(0, -1) : msg))
        .join(", "),
    );
  }
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }
  if (!result?.confirmationUrl) {
    throw new Error("No confirmation URL returned from Shopify");
  }
  return result.confirmationUrl;
}

function buildManagedPricingUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${MANAGED_PRICING_APP_HANDLE}/pricing_plans`;
}

function shouldUseManagedPricingFallback(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("managed pricing") ||
    lower.includes("shopify app pricing") ||
    lower.includes("billing api") ||
    lower.includes("no confirmation url returned from shopify")
  );
}

async function cancelShopifySubscription(
  shop: string,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  const resp = await shopifyGraphQL(
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

  const data = (await resp.json()) as {
    data?: {
      appSubscriptionCancel?: {
        userErrors?: { field: string; message: string }[];
      };
    };
  };
  const errors = data.data?.appSubscriptionCancel?.userErrors ?? [];
  if (errors.length) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }
}

async function getDowngradeRestrictions(shop: string, analytics: Awaited<ReturnType<typeof getAnalytics>>) {
  const [ptResult, tplResult] = await Promise.all([
    query<{ count: string }>(DISTINCT_TYPE_COUNT_SQL, [shop]),
    query<{ count: string }>("SELECT COUNT(*) AS count FROM shop_templates WHERE shop = $1", [shop]),
  ]);
  const productTypeCount = Number(ptResult.rows[0]?.count ?? 0);
  const templateCount = Number(tplResult.rows[0]?.count ?? 0);

  const currentIdx = PLAN_ORDER.indexOf(analytics.planKey);
  const blockedReasons: Partial<Record<PlanKey, DowngradeReason[]>> = {};

  for (const pk of PLAN_ORDER) {
    const pkIdx = PLAN_ORDER.indexOf(pk);
    if (pkIdx >= currentIdx) continue; // upgrade or same — always allowed
    const target = PLANS[pk];
    const reasons: DowngradeReason[] = [];

    if (target.removeBgMonthlyQuota !== -1 && analytics.bgThisMonth > target.removeBgMonthlyQuota) {
      reasons.push({ kind: "bg", used: analytics.bgThisMonth, plan: pk, limit: target.removeBgMonthlyQuota });
    }
    if (target.maxProductTypes !== -1 && productTypeCount > target.maxProductTypes) {
      reasons.push({ kind: "productTypes", used: productTypeCount, plan: pk, limit: target.maxProductTypes });
    }
    if (target.maxShopTemplates !== -1 && templateCount > target.maxShopTemplates) {
      reasons.push({ kind: "templates", used: templateCount, plan: pk, limit: target.maxShopTemplates });
    }
    if (reasons.length) blockedReasons[pk] = reasons;
  }

  return { blockedReasons, productTypeCount, templateCount };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;

  if (isOwnerShop(shop)) {
    await upsertShopSubscription(shop, {
      planKey: "Business",
      shopifySubscriptionId: null,
      subscriptionStatus: "active",
    });
  } else {
    const accessToken = await getValidAccessToken(shop);
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
        await activatePendingPromo(shop, planName as PlanKey).catch((err) =>
          console.error("[billing] promo activation failed:", err),
        );
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
  }

  const analytics = await getAnalytics(shop);
  const [{ blockedReasons }, productIds] = await Promise.all([
    getDowngradeRestrictions(shop, analytics),
    listConfiguredProductIds(shop),
  ]);
  return json({ analytics, isTest: isBillingTestCharge(shop), blockedReasons, productCount: productIds.size });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const authContext = await authenticate(request);
  const { session } = authContext;
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const B = pickDict(billingDict, langFromRequest(request, form));

  const accessToken = await getValidAccessToken(shop);
  if (!accessToken) return redirect(`/auth/login?shop=${encodeURIComponent(shop)}`);

  if (intent === "subscribe") {
    const planKey = form.get("plan") as PlanKey;
    if (!PLAN_ORDER.includes(planKey)) return json({ error: B.invalidPlan }, { status: 400 });

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
        return json({ error: B.downgradeBlocked(planKey, reasons.map(B.reason)) }, { status: 400 });
      }
    }

    // Kampanya kodu (ör. kurucu mağaza programı)
    const promoRaw = String(form.get("promo") ?? "").trim();
    const promo = promoRaw ? await checkPromo(shop, promoRaw, planKey) : null;
    if (promo && !promo.ok) {
      return json(
        { error: B.promoError(promo.error, promo.campaign?.plan ?? "", promo.campaign?.freeMonths ?? 0) },
        { status: 400 },
      );
    }

    try {
      const appUrl = (process.env.SHOPIFY_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
      // Ödeme onayından dönüş Shopify çerçevesinin dışında oluyor; oturum
      // imzalı dönüş adresinden kuruluyor. Onay ekranında beklenebileceği
      // için süre bir gün.
      const returnUrl = appendSignedShopParams(new URL("/app/billing", appUrl), shop, 24 * 60 * 60);
      const confirmationUrl = await createShopifySubscription(
        shop,
        accessToken,
        planKey,
        returnUrl.toString(),
        isBillingTestCharge(shop),
        promo?.ok ? promo.campaign.freeMonths : 0,
      );
      if (promo?.ok) await reservePromo(shop, promo.campaign, promo.code);
      return json(
        { redirectUrl: confirmationUrl },
        { headers: { "Set-Cookie": makeBillingReturnShopCookie(shop) } },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : B.unknownError;
      console.error("[billing] subscription create error:", message);
      Sentry.captureException(err, { tags: { fn: "subscriptionCreate", plan: planKey } });
      if (shouldUseManagedPricingFallback(message)) {
        const managedPricingUrl = buildManagedPricingUrl(shop);
        return json(
          { redirectUrl: managedPricingUrl },
          { headers: { "Set-Cookie": makeBillingReturnShopCookie(shop) } },
        );
      }
      return json({ error: B.createFailed(message) }, { status: 500 });
    }
  }

  if (intent === "cancel") {
    const subscriptionId = form.get("subscriptionId") as string;
    try {
      if (subscriptionId) {
        await cancelShopifySubscription(shop, accessToken, subscriptionId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : B.unknownError;
      console.error("[billing] subscription cancel error:", message);
      Sentry.captureException(err, { tags: { fn: "subscriptionCancel" } });
      return json({ error: B.cancelFailed(message) }, { status: 500 });
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
  const { analytics, isTest, blockedReasons, productCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string; redirectUrl?: string }>();
  const nav = useNavigation();
  const { t, lang } = useTranslation();
  const L = useDict(billingDict);
  const isLoading = nav.state === "submitting" || Boolean(actionData?.redirectUrl);
  const isActive = analytics.subscriptionStatus === "active";
  const isTrial = analytics.subscriptionStatus === "trial";
  const hasSubscription = isActive || isTrial;
  const currentPlanLabel = analytics.planKey;
  const freeLimit = PLANS.Free.maxProducts;
  const [promo, setPromo] = useState("");

  useEffect(() => {
    if (!actionData?.redirectUrl) return;
    if (window.top && window.top !== window.self) {
      window.top.location.href = actionData.redirectUrl;
      return;
    }
    window.location.href = actionData.redirectUrl;
  }, [actionData?.redirectUrl]);

  return (
    <Page title={t("billing.title")}>
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.billing.1.title", bodyKey: "helper.billing.1.body" },
          { titleKey: "helper.billing.2.title", bodyKey: "helper.billing.2.body" },
          { titleKey: "helper.billing.3.title", bodyKey: "helper.billing.3.body" },
          { titleKey: "helper.billing.4.title", bodyKey: "helper.billing.4.body" },
        ]} />

        {actionData?.error && (
          <Banner title={t("common.error")} tone="critical">
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
                    <Badge tone={hasSubscription ? (PLAN_BADGE[analytics.planKey] ?? "attention") : "attention"}>{currentPlanLabel}</Badge>
                    {isActive && <Badge tone="success">{t("billing.active")}</Badge>}
                    {isTrial && <Badge tone="info">{t("billing.trial")}</Badge>}
                    {!hasSubscription && <Text as="span" variant="bodySm" tone="subdued">{L.freeCurrentNote(productCount, freeLimit)}</Text>}
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

              <>
                <Divider />
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm">{L.aiThisMonth}</Text>
                    <Text as="p" variant="bodySm">
                      {analytics.aiThisMonth ?? 0} / {analytics.aiQuota ?? 0}
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={analytics.aiQuota > 0 ? Math.min(analytics.aiPercent ?? 0, 100) : 0}
                    tone={(analytics.aiPercent ?? 0) >= 90 ? "critical" : "primary"}
                    size="small"
                  />
                </BlockStack>
              </>

              {(isActive || isTrial) && (
                <>
                  <Divider />
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {lang === "tr" ? "Aboneliği iptal etmek istiyorsanız:" : "To cancel your subscription:"}
                    </Text>
                    <Form method="post">
                      <input type="hidden" name="intent" value="cancel" />
                      <input type="hidden" name="_lang" value={lang} />
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

        <Card>
          <Box padding="400">
            <InlineStack gap="400" blockAlign="end" wrap>
              <Box minWidth="240px">
                <TextField
                  label={L.promoTitle}
                  value={promo}
                  onChange={(v) => setPromo(v.toUpperCase())}
                  autoComplete="off"
                  helpText={promo.trim() ? L.promoApplied(promo.trim()) : L.promoHelp}
                />
              </Box>
            </InlineStack>
          </Box>
        </Card>

        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, xl: 5 }} gap="400">
              {DISPLAY_ORDER.map((planKey) => {
                const plan = PLANS[planKey];
                const isCurrent = analytics.planKey === planKey;
                const isFree = planKey === "Free";
                const isRecommended = planKey === "Growth";
                const blockReasons = (isActive || isTrial) ? (blockedReasons[planKey] ?? null) : null;
                const isBlocked = !!blockReasons;

                return (
                  <div key={planKey} style={isCurrent ? { outline: "2px solid #008060", borderRadius: "12px", boxShadow: "0 0 0 4px rgba(0,128,96,0.12)" } : { borderRadius: "12px" }}>
                  <Card>
                    <Box padding="400">
                      <BlockStack gap="400">
                        <BlockStack gap="100">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">{planKey}</Text>
                            {isRecommended && !isCurrent && !isBlocked && <Badge tone="info">{t("billing.recommended")}</Badge>}
                            {isCurrent && <Badge tone="success">{t("billing.active")}</Badge>}
                            {isBlocked && <Badge tone="critical">{L.restricted}</Badge>}
                          </InlineStack>
                          <InlineStack blockAlign="end" gap="100">
                            <Text as="p" variant="headingXl">${plan.price}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{t("billing.perMonth")}</Text>
                          </InlineStack>
                          {plan.trialDays > 0 && <Text as="p" variant="bodySm" tone="subdued">{t("billing.trialLabel")}</Text>}
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
                              <Text as="p" variant="bodySm" fontWeight="semibold">{L.cannotSwitch}</Text>
                              {blockReasons.map((r, i) => (
                                <Text key={i} as="p" variant="bodySm">• {L.reason(r)}</Text>
                              ))}
                            </BlockStack>
                          </Banner>
                        )}

                        {isFree && !isCurrent && productCount > freeLimit && (
                          <Banner tone="warning">
                            <Text as="p" variant="bodySm">{L.freeOverLimit(productCount, freeLimit)}</Text>
                          </Banner>
                        )}

                        {isCurrent ? (
                          <Button fullWidth disabled>{t("billing.currentPlanBtn")}</Button>
                        ) : isFree ? (
                          // Ücretsiz plana geçmek, ücretli aboneliği iptal etmektir
                          <Form method="post">
                            <input type="hidden" name="intent" value="cancel" />
                            <input type="hidden" name="_lang" value={lang} />
                            <input type="hidden" name="subscriptionId" value={analytics.shopifySubscriptionId ?? ""} />
                            <Button fullWidth submit loading={isLoading}>{L.switchToFree}</Button>
                          </Form>
                        ) : isBlocked ? (
                          <Button fullWidth disabled tone="critical">{L.switchBlocked}</Button>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="subscribe" />
                            <input type="hidden" name="plan" value={planKey} />
                            <input type="hidden" name="promo" value={promo.trim()} />
                            <input type="hidden" name="_lang" value={lang} />
                            <Button fullWidth variant="primary" submit loading={isLoading}>
                              {isActive || isTrial ? t("billing.changePlan") : t("billing.choosePlan")} → {planKey}
                            </Button>
                          </Form>
                        )}
                      </BlockStack>
                    </Box>
                  </Card>
                  </div>
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
                      {DISPLAY_ORDER.map((k) => (
                        <th key={k} style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>
                          {k}{analytics.planKey === k ? " ✓" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: t("billing.monthlyPrice"), values: DISPLAY_ORDER.map((k) => `$${PLANS[k].price}`) },
                      { label: L.products, values: DISPLAY_ORDER.map((k) => PLANS[k].maxProducts === -1 ? t("billing.unlimited") : String(PLANS[k].maxProducts)) },
                      { label: t("billing.productTypes"), values: DISPLAY_ORDER.map((k) => PLANS[k].maxProductTypes === -1 ? t("billing.unlimited") : String(PLANS[k].maxProductTypes)) },
                      { label: t("billing.ordersPerMonth"), values: DISPLAY_ORDER.map((k) => PLANS[k].maxMonthlyOrders === -1 ? t("billing.unlimited") : String(PLANS[k].maxMonthlyOrders)) },
                      { label: t("billing.backSurface"), values: DISPLAY_ORDER.map((k) => PLANS[k].allowBackSurface ? "✓" : "—") },
                      { label: t("billing.bgRemoval"), values: DISPLAY_ORDER.map((k) => String(PLANS[k].removeBgMonthlyQuota)) },
                      { label: L.aiPerMonth, values: DISPLAY_ORDER.map((k) => String(PLANS[k].aiImageMonthlyQuota ?? 0)) },
                      { label: t("billing.templates"), values: DISPLAY_ORDER.map((k) => PLANS[k].maxShopTemplates === -1 ? t("billing.unlimited") : PLANS[k].maxShopTemplates === 0 ? "—" : String(PLANS[k].maxShopTemplates)) },
                      { label: t("billing.freeTrial"), values: DISPLAY_ORDER.map((k) => (PLANS[k].trialDays > 0 ? t("billing.trialDays") : "—")) },
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
