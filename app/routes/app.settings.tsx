import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  InlineStack,
  Page,
  Text,
  TextField,
  Banner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { getGlobalSettings, saveGlobalSettings } from "~/models/global-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const settings = await getGlobalSettings();
  const url = new URL(request.url);
  const saved = url.searchParams.get("saved") === "1";
  const created = url.searchParams.get("created") === "1";
  const ctOk = url.searchParams.get("ct_ok");
  const ctError = url.searchParams.get("ct_error");

  // Auto-register order tracking ScriptTag on order status page
  try {
    const appUrl = process.env.SHOPIFY_APP_URL ?? "https://threadlab-production.up.railway.app";
    const scriptSrc = `${appUrl}/api/order-tracking-script`;
    const stRes = await admin.graphql(`#graphql
      { scriptTags(first: 10) { nodes { id src displayScope } } }
    `);
    const stData = await stRes.json() as {
      data?: { scriptTags?: { nodes?: Array<{ id: string; src: string; displayScope: string }> } };
    };
    const existing = stData.data?.scriptTags?.nodes ?? [];
    const alreadyRegistered = existing.some((t) => t.src === scriptSrc);
    if (!alreadyRegistered) {
      await admin.graphql(`#graphql
        mutation {
          scriptTagCreate(input: {
            src: "${scriptSrc}"
            displayScope: ORDER_STATUS
          }) {
            scriptTag { id }
            userErrors { field message }
          }
        }
      `);
    }
  } catch (_e) {
    // silent — will retry on next load
  }

  // Auto-register Cart Transform function if not already registered
  try {
    const res = await admin.graphql(`#graphql
      {
        cartTransforms(first: 5) { nodes { id functionId } }
        shopifyFunctions(first: 25) { nodes { id title apiType } }
      }
    `);
    const data = await res.json() as {
      data?: {
        cartTransforms?: { nodes?: Array<{ id: string; functionId: string }> };
        shopifyFunctions?: { nodes?: Array<{ id: string; title: string; apiType: string }> };
      };
    };
    const transforms = data.data?.cartTransforms?.nodes ?? [];
    const functions = data.data?.shopifyFunctions?.nodes ?? [];

    if (transforms.length === 0) {
      const cartFn = functions.find((f) =>
        f.apiType === "cart_transform" || f.apiType === "purchase.cart-transform.run"
      );
      if (cartFn) {
        await admin.graphql(`#graphql
          mutation { cartTransformCreate(functionId: "${cartFn.id}") {
            cartTransform { id }
            userErrors { field message }
          }}
        `);
      }
    }
  } catch (_e) {
    // silent — registration will be retried on next page load
  }

  return json({ settings, saved, created, ctOk, ctError });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "createSurchargeProduct") {
    const response = await admin.graphql(`
      #graphql
      mutation {
        productCreate(input: {
          title: "Baskı Ücreti"
          productType: "Service"
          status: ACTIVE
          requiresSellingPlan: false
          variants: [{
            price: "1.00"
            inventoryPolicy: CONTINUE
            inventoryManagement: null
          }]
        }) {
          product {
            id
            variants(first: 1) { nodes { id } }
          }
          userErrors { field message }
        }
      }
    `);
    const data = await response.json() as {
      data?: {
        productCreate?: {
          product?: { id: string; variants?: { nodes?: Array<{ id: string }> } };
          userErrors?: Array<{ field: string; message: string }>;
        };
      };
    };
    const errors = data.data?.productCreate?.userErrors ?? [];
    if (errors.length) {
      return json({ error: errors.map((e) => e.message).join(", ") });
    }
    const productGid = data.data?.productCreate?.product?.id ?? "";
    const gid = data.data?.productCreate?.product?.variants?.nodes?.[0]?.id ?? "";
    const variantId = gid.split("/").pop() ?? "";
    if (!variantId) return json({ error: "Variant ID alınamadı" });

    // Publish to all available sales channels so Cart Transform can add it
    if (productGid) {
      const pubRes = await admin.graphql(`#graphql
        { publications(first: 20) { nodes { id name } } }
      `);
      const pubData = await pubRes.json() as {
        data?: { publications?: { nodes?: Array<{ id: string; name: string }> } };
      };
      const publications = pubData.data?.publications?.nodes ?? [];
      if (publications.length > 0) {
        const publicationInputs = publications.map((p) => `{publicationId: "${p.id}"}`).join(", ");
        await admin.graphql(`#graphql
          mutation {
            publishablePublish(id: "${productGid}", input: [${publicationInputs}]) {
              userErrors { field message }
            }
          }
        `);
      }
    }

    const settings = await getGlobalSettings();
    await saveGlobalSettings({ ...settings, surchargeVariantId: variantId });
    return redirect("/app/settings?created=1");
  }

  if (intent === "registerCartTransform") {
    try {
      // Check existing
      const existingRes = await admin.graphql(`#graphql
        { cartTransforms(first: 5) { nodes { id functionId } } }
      `);
      const existingData = await existingRes.json() as {
        data?: { cartTransforms?: { nodes?: Array<{ id: string; functionId: string }> } };
        errors?: Array<{ message: string }>;
      };
      if (existingData.errors?.length) {
        return redirect(`/app/settings?ct_error=${encodeURIComponent("GraphQL: " + existingData.errors.map(e => e.message).join(", "))}`);
      }
      const existing = existingData.data?.cartTransforms?.nodes ?? [];
      if (existing.length > 0) {
        return redirect(`/app/settings?ct_ok=zaten`);
      }

      // Find function
      const fnRes = await admin.graphql(`#graphql
        { shopifyFunctions(first: 25) { nodes { id title apiType } } }
      `);
      const fnData = await fnRes.json() as {
        data?: { shopifyFunctions?: { nodes?: Array<{ id: string; title: string; apiType: string }> } };
        errors?: Array<{ message: string }>;
      };
      if (fnData.errors?.length) {
        return redirect(`/app/settings?ct_error=${encodeURIComponent("Fn sorgu: " + fnData.errors.map(e => e.message).join(", "))}`);
      }
      const functions = fnData.data?.shopifyFunctions?.nodes ?? [];
      const cartFn = functions.find((f) => f.apiType === "purchase.cart-transform.run");
      if (!cartFn) {
        const list = functions.map(f => `${f.title}(${f.apiType})`).join(", ") || "hiç yok";
        return redirect(`/app/settings?ct_error=${encodeURIComponent("Fonksiyon bulunamadı. Mevcut: " + list)}`);
      }

      // Register
      const regRes = await admin.graphql(`#graphql
        mutation { cartTransformCreate(functionId: "${cartFn.id}") {
          cartTransform { id }
          userErrors { field message }
        }}
      `);
      const regData = await regRes.json() as {
        data?: { cartTransformCreate?: { cartTransform?: { id: string }; userErrors?: Array<{ message: string }> } };
        errors?: Array<{ message: string }>;
      };
      if (regData.errors?.length) {
        return redirect(`/app/settings?ct_error=${encodeURIComponent(regData.errors.map(e => e.message).join(", "))}`);
      }
      const regErrors = regData.data?.cartTransformCreate?.userErrors ?? [];
      if (regErrors.length) {
        return redirect(`/app/settings?ct_error=${encodeURIComponent(regErrors.map(e => e.message).join(", "))}`);
      }
      return redirect(`/app/settings?ct_ok=yeni`);
    } catch (err) {
      return redirect(`/app/settings?ct_error=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
    }
  }

  if (intent === "fixSurchargeVariant") {
    const settings = await getGlobalSettings();
    const variantId = settings.surchargeVariantId;
    if (!variantId) return json({ error: "Önce variant ID kaydedin" });
    const gid = `gid://shopify/ProductVariant/${variantId}`;
    const fixRes = await admin.graphql(
      `#graphql
      mutation variantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant { id inventoryPolicy price }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          input: {
            id: gid,
            price: "1.00",
            compareAtPrice: null,
            inventoryPolicy: "CONTINUE",
            requiresShipping: false,
          },
        },
      },
    );
    const fixData = await fixRes.json() as {
      data?: { productVariantUpdate?: { userErrors?: Array<{ message: string }> } };
    };
    const fixErrors = fixData.data?.productVariantUpdate?.userErrors ?? [];
    if (fixErrors.length) return json({ error: fixErrors.map((e) => e.message).join(", ") });
    return redirect("/app/settings?saved=1");
  }

  await saveGlobalSettings({
    photoroomApiKey: String(form.get("photoroomApiKey") || "").trim(),
    surchargeVariantId: String(form.get("surchargeVariantId") || "").trim(),
  });
  return redirect("/app/settings?saved=1");
};

export default function SettingsRoute() {
  const { settings, saved, created, ctOk, ctError } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetcher = useFetcher<{ error?: string; success?: string }>();
  const isSaving = navigation.state === "submitting";
  const isCreating = fetcher.state === "submitting";

  const [photoroomApiKey, setPhotoroomApiKey] = useState(settings.photoroomApiKey || "");
  const [surchargeVariantId, setSurchargeVariantId] = useState(settings.surchargeVariantId || "");
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Page title="Ayarlar">
      <BlockStack gap="500">
        {saved && <Banner tone="success" title="Ayarlar kaydedildi." />}
        {created && <Banner tone="success" title="Baskı Ücreti ürünü oluşturuldu ve kaydedildi." />}
        {fetcher.data?.error && <Banner tone="critical" title={`Hata: ${fetcher.data.error}`} />}
        {fetcher.data?.success && <Banner tone="success" title={fetcher.data.success} />}
        {ctOk === "yeni" && <Banner tone="success" title="Cart Transform başarıyla kaydedildi! Şimdi checkout'u test edin." />}
        {ctOk === "zaten" && <Banner tone="info" title="Cart Transform zaten kayıtlıydı. Sorun başka bir yerde — checkout'u test edin." />}
        {ctError && <Banner tone="critical" title={`Cart Transform hatası: ${ctError}`} />}
        <Form method="post">
          <BlockStack gap="400">

            {/* Surcharge / Ek ücret */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Baskı Ek Ücreti</Text>
                  <Text as="p" tone="subdued">
                    Shopify, sepet fiyatlarını yalnızca gerçek ürün variant'larıyla kabul eder.
                    Baskı boyutuna göre ek ücret eklemek için ₺1 fiyatlı bir "Baskı Ücreti" ürünü gerekir.
                    Tasarımın tutarı kadar adet eklenerek ücret yansıtılır (₺40 baskı = 40 adet × ₺1).
                  </Text>

                  {settings.surchargeVariantId ? (
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">Aktif</Badge>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Variant ID: {settings.surchargeVariantId}
                      </Text>
                    </InlineStack>
                  ) : (
                    <Banner tone="warning" title="Ek ücret variant'ı ayarlanmamış">
                      <p>Sepete eklenen tasarım baskı ücretleri Shopify'a yansıtılamıyor.
                         Aşağıdaki butona tıklayarak otomatik oluşturun ya da mevcut variant ID'nizi girin.</p>
                    </Banner>
                  )}

                  <InlineStack gap="200" wrap>
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="createSurchargeProduct" />
                      <Button
                        variant={settings.surchargeVariantId ? "plain" : "primary"}
                        submit
                        loading={isCreating}
                      >
                        {settings.surchargeVariantId ? "Yeniden oluştur" : "Otomatik oluştur"}
                      </Button>
                    </fetcher.Form>
                    {settings.surchargeVariantId && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="fixSurchargeVariant" />
                        <Button variant="secondary" submit loading={isCreating}>
                          Stok sınırını kaldır (satışa devam et)
                        </Button>
                      </fetcher.Form>
                    )}
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="registerCartTransform" />
                      <Button variant="secondary" submit loading={isCreating}>
                        Cart Transform'u kaydet
                      </Button>
                    </fetcher.Form>
                  </InlineStack>

                  <Divider />

                  <TextField
                    label="Variant ID (manuel giriş)"
                    name="surchargeVariantId"
                    value={surchargeVariantId}
                    onChange={setSurchargeVariantId}
                    autoComplete="off"
                    helpText="Shopify'da mevcut ₺1 fiyatlı bir variant varsa buraya ID'sini girebilirsiniz."
                    placeholder="12345678901234"
                  />
                </BlockStack>
              </Box>
            </Card>

            {/* Photoroom */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Photoroom Arka Plan Temizleme</Text>
                    <Button variant="plain" size="slim" onClick={() => setShowHelp((v) => !v)}>
                      {showHelp ? "Kapat" : "API key nasıl alınır?"}
                    </Button>
                  </InlineStack>

                  <Collapsible open={showHelp} id="photoroom-help">
                    <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderColor="border" borderWidth="025">
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingSm">Photoroom API key nasıl alınır?</Text>
                        <BlockStack gap="200">
                          {[
                            "photoroom.com/api adresine gidin ve ücretsiz bir hesap oluşturun.",
                            "Giriş yaptıktan sonra sol menüden API & SDK bölümüne tıklayın.",
                            "\"API Keys\" sekmesinde \"Create new key\" butonuna tıklayın.",
                            "Oluşturulan anahtarı kopyalayın — sadece bir kez gösterilir, kaydedin.",
                            "Kopyaladığınız anahtarı aşağıdaki alana yapıştırın ve kaydedin.",
                          ].map((text, i) => (
                            <InlineStack key={i} gap="200" blockAlign="start">
                              <div style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: "#0f766e", color: "white",
                                fontSize: 11, fontWeight: 700,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0, marginTop: 1,
                              }}>{i + 1}</div>
                              <Text as="p" variant="bodySm">{text}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Sandbox key ile aylık 30 görsel ücretsiz işleyebilirsiniz.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Collapsible>

                  <Text as="p" tone="subdued">
                    Müşteri görsel yükleyince "Arka planı temizleyelim mi?" sorusu çıkar.
                    API key yalnızca sunucu tarafında kullanılır.
                  </Text>

                  <TextField
                    label="Photoroom API key"
                    name="photoroomApiKey"
                    value={photoroomApiKey}
                    onChange={setPhotoroomApiKey}
                    autoComplete="off"
                    type="password"
                    placeholder="sk_pr_..."
                    helpText={
                      photoroomApiKey
                        ? "API key girilmiş."
                        : "Yukarıdaki 'API key nasıl alınır?' adımlarını takip edin."
                    }
                  />
                </BlockStack>
              </Box>
            </Card>

            <InlineStack align="end">
              <Button variant="primary" submit loading={isSaving}>
                Kaydet
              </Button>
            </InlineStack>
          </BlockStack>
        </Form>
      </BlockStack>
    </Page>
  );
}
