import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
  TextField,
  Banner,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { getGlobalSettings, saveGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings, saveShopSettings } from "~/models/shop-settings.server";

export const headers = () => ({
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const [globalSettings, shopSettings] = await Promise.all([
    getGlobalSettings(),
    getShopSettings(session.shop),
  ]);
  const settings = { ...globalSettings, ...shopSettings };
  const url = new URL(request.url);
  const saved = url.searchParams.get("saved") === "1";
  const created = url.searchParams.get("created") === "1";

  // Clean up any previously registered ScriptTags (ScriptTags are deprecated)
  try {
    const stRes = await admin.graphql(`#graphql
      { scriptTags(first: 20) { nodes { id src } } }
    `);
    const stData = await stRes.json() as {
      data?: { scriptTags?: { nodes?: Array<{ id: string; src: string }> } };
    };
    for (const tag of stData.data?.scriptTags?.nodes ?? []) {
      await admin.graphql(`#graphql
        mutation { scriptTagDelete(id: "${tag.id}") { deletedScriptTagId userErrors { message } } }
      `).catch(() => {});
    }
  } catch (_e) {
    // silent
  }

  // Auto-register Cart Transform function; re-register if function ID changed after deploy
  let cartTransformStatus = "unknown";
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

    const cartFn = functions.find((f) =>
      f.apiType === "cart_transform" || f.apiType === "purchase.cart-transform.run"
    );

    if (!cartFn) {
      cartTransformStatus = "function_not_found";
    } else {
      const alreadyRegistered = transforms.some((t) => t.functionId === cartFn.id);
      if (alreadyRegistered) {
        cartTransformStatus = "ok";
      } else {
        cartTransformStatus = "stale_re_registering";
        for (const t of transforms) {
          await admin.graphql(`#graphql
            mutation { cartTransformDelete(id: "${t.id}") { userErrors { field message } } }
          `);
        }
        const regRes = await admin.graphql(`#graphql
          mutation { cartTransformCreate(functionId: "${cartFn.id}") {
            cartTransform { id }
            userErrors { field message }
          }}
        `);
        const regData = await regRes.json() as {
          data?: { cartTransformCreate?: { cartTransform?: { id: string }; userErrors?: Array<{ message: string }> } };
        };
        const regErrors = regData.data?.cartTransformCreate?.userErrors ?? [];
        cartTransformStatus = regErrors.length
          ? `error: ${regErrors.map((e) => e.message).join(", ")}`
          : "re_registered_ok";
      }
    }
  } catch (_e) {
    cartTransformStatus = "error";
  }

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appBlockHandle = "tshirt-designer";
  const newAppsSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=newAppsSection`
    : null;
  const mainSectionUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=mainSection`
    : null;

  return json({ settings, saved, created, cartTransformStatus, newAppsSectionUrl, mainSectionUrl });
};

async function writeSurchargeMetafield(
  admin: Awaited<ReturnType<typeof authenticate>>["admin"],
  variantId: string,
) {
  const shopRes = await admin.graphql(`#graphql { shop { id } }`);
  const shopData = await shopRes.json() as { data?: { shop?: { id: string } } };
  const shopId = shopData.data?.shop?.id;
  if (!shopId) return;
  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "printlabapp",
          key: "surcharge_variant_id",
          value: variantId,
          type: "single_line_text_field",
        }],
      },
    },
  );
}


export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate(request);
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

    await saveShopSettings(session.shop, { surchargeVariantId: variantId });
    await writeSurchargeMetafield(admin, variantId).catch(() => {});
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
        return json({ error: "GraphQL: " + existingData.errors.map((e) => e.message).join(", ") });
      }
      const existing = existingData.data?.cartTransforms?.nodes ?? [];

      // Find function
      const fnRes = await admin.graphql(`#graphql
        { shopifyFunctions(first: 25) { nodes { id title apiType } } }
      `);
      const fnData = await fnRes.json() as {
        data?: { shopifyFunctions?: { nodes?: Array<{ id: string; title: string; apiType: string }> } };
        errors?: Array<{ message: string }>;
      };
      if (fnData.errors?.length) {
        return json({ error: "Fn sorgu: " + fnData.errors.map((e) => e.message).join(", ") });
      }
      const functions = fnData.data?.shopifyFunctions?.nodes ?? [];
      const cartFn = functions.find((f) => f.apiType === "purchase.cart-transform.run");
      if (!cartFn) {
        const list = functions.map((f) => `${f.title}(${f.apiType})`).join(", ") || "hiç yok";
        return json({ error: "Fonksiyon bulunamadı. Mevcut: " + list });
      }

      // Already registered with the current function ID — nothing to do
      if (existing.some((t) => t.functionId === cartFn.id)) {
        return json({ success: "Cart Transform zaten kayıtlıydı (güncel). Sorun başka bir yerde — checkout'u test edin." });
      }

      // Delete stale registrations and re-register
      for (const t of existing) {
        await admin.graphql(`#graphql
          mutation { cartTransformDelete(id: "${t.id}") { userErrors { field message } } }
        `);
      }

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
        return json({ error: regData.errors.map((e) => e.message).join(", ") });
      }
      const regErrors = regData.data?.cartTransformCreate?.userErrors ?? [];
      if (regErrors.length) {
        return json({ error: regErrors.map((e) => e.message).join(", ") });
      }
      return json({ success: "Cart Transform başarıyla kaydedildi! Şimdi checkout'u test edin." });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (intent === "fixSurchargeVariant") {
    const settings = await getShopSettings(session.shop);
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

  const newVariantId = String(form.get("surchargeVariantId") || "").trim();
  const newBgLimit = parseInt(String(form.get("customerBgLimit") || ""), 10);
  await saveShopSettings(session.shop, {
    surchargeVariantId: newVariantId,
    ...(newBgLimit > 0 ? { customerBgLimit: newBgLimit } : {}),
  });
  if (newVariantId) await writeSurchargeMetafield(admin, newVariantId).catch(() => {});
  return redirect("/app/settings?saved=1");
};

export default function SettingsRoute() {
  const { settings, saved, created, cartTransformStatus, newAppsSectionUrl, mainSectionUrl } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetcher = useFetcher<{ error?: string; success?: string }>();
  const { t, lang } = useTranslation();
  const isSaving = navigation.state === "submitting";
  const isCreating = fetcher.state === "submitting";

  const [surchargeVariantId, setSurchargeVariantId] = useState(settings.surchargeVariantId || "");
  const [customerBgLimit, setCustomerBgLimit] = useState(String(settings.customerBgLimit ?? 5));

  return (
    <Page title={t("settings.title")}>
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.settings.1.title", bodyKey: "helper.settings.1.body" },
          { titleKey: "helper.settings.2.title", bodyKey: "helper.settings.2.body" },
          { titleKey: "helper.settings.3.title", bodyKey: "helper.settings.3.body" },
        ]} />
        {saved && <Banner tone="success" title={t("settings.saved")} />}
        {created && <Banner tone="success" title={t("settings.created")} />}
        {fetcher.data?.error && <Banner tone="critical" title={`Hata: ${fetcher.data.error}`} />}
        {fetcher.data?.success && <Banner tone="success" title={fetcher.data.success} />}

        {cartTransformStatus === "ok" && (
          <Banner tone="success" title={t("settings.cartTransformOk")} />
        )}
        {cartTransformStatus === "re_registered_ok" && (
          <Banner tone="success" title={t("settings.cartTransformReregistered")} />
        )}
        {cartTransformStatus === "stale_re_registering" && (
          <Banner tone="warning" title={t("settings.cartTransformStale")} />
        )}
        {cartTransformStatus === "function_not_found" && (
          <Banner tone="critical" title={t("settings.cartTransformNotFound")} />
        )}
        {(cartTransformStatus === "error" || cartTransformStatus?.startsWith("error:")) && (
          <Banner tone="critical" title={`Cart Transform Hatası: ${cartTransformStatus}`} />
        )}

        {/* Baskı Ek Ücreti — fetcher forms are standalone, NOT inside the outer Form */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{t("settings.surchargeTitle")}</Text>
              <Text as="p" tone="subdued">
                Shopify, sepet fiyatlarını yalnızca gerçek ürün variant&apos;larıyla kabul eder.
                Baskı boyutuna göre ek ücret eklemek için ₺1 fiyatlı bir &quot;Baskı Ücreti&quot; ürünü gerekir.
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
                <Banner tone="warning" title={t("settings.surchargeWarningTitle")}>
                  <p>{t("settings.surchargeWarningDesc")}</p>
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
                    {settings.surchargeVariantId ? t("settings.reCreate") : t("settings.autoCreate")}
                  </Button>
                </fetcher.Form>
                {settings.surchargeVariantId && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="fixSurchargeVariant" />
                    <Button variant="secondary" submit loading={isCreating}>
                      {t("settings.removeStockLimit")}
                    </Button>
                  </fetcher.Form>
                )}
              </InlineStack>

              {/* App Embed aktivasyon talimatı */}
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd" fontWeight="bold">
                  {t("settings.embedGuideTitle")}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {t("settings.embedGuideDesc")}
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>1.</strong> {t("settings.embedStep1")}
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>2.</strong> {t("settings.embedStep2")}
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>3.</strong> {t("settings.embedStep3")}
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>4.</strong> {t("settings.embedStep4")}
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>5.</strong> {t("settings.embedStep5")}
                  </Text>
                </BlockStack>
                <div style={{ maxWidth: 320, borderRadius: 8, overflow: "hidden", border: "1px solid #e1e3e5", marginTop: 4 }}>
                  <img
                    src="/baski-ucreti-koruma-embed.png"
                    alt="Baskı Ücreti Koruma App Embed aktivasyonu"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>


        {/* Outer Form — only text inputs + save button, no nested fetcher forms */}
        <Form method="post">
          <BlockStack gap="400">

            <Card>
              <Box padding="400">
                <TextField
                  label={t("settings.variantIdLabel")}
                  name="surchargeVariantId"
                  value={surchargeVariantId}
                  onChange={setSurchargeVariantId}
                  autoComplete="off"
                  helpText="Shopify'da mevcut ₺1 fiyatlı bir variant varsa buraya ID'sini girebilirsiniz."
                  placeholder="12345678901234"
                />
              </Box>
            </Card>

            {/* Müşteri başına bg limit */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Müşteri Başına Arka Plan Kaldırma Limiti</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Bir müşteri sipariş vermeden kaç kez arka plan kaldırabilir? Sipariş verdikten sonra limiti sıfırlanır.
                    Kötüye kullanımı önlemek için bu değeri düşük tutmanızı öneririz (varsayılan: 5).
                  </Text>
                  <div style={{ maxWidth: 200 }}>
                    <TextField
                      label="Sipariş vermeden maksimum kullanım"
                      name="customerBgLimit"
                      type="number"
                      value={customerBgLimit}
                      onChange={setCustomerBgLimit}
                      autoComplete="off"
                      min="1"
                      max="100"
                      suffix="adet"
                    />
                  </div>
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

        {/* Tema Kurulumu */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  {lang === "tr" ? "Tema Kurulumu" : "Theme Setup"}
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {lang === "tr"
                    ? "Tasarım aracını ürün sayfasına eklemek için tema editörünü açın ve DesignKit bloğunu ekleyin."
                    : "Open the theme editor and add the DesignKit block to display the design tool on your product page."}
                </Text>
              </BlockStack>
              {(newAppsSectionUrl || mainSectionUrl) && (
                <InlineStack gap="200">
                  {newAppsSectionUrl && (
                    <Button url={newAppsSectionUrl} target="_blank" variant="primary">
                      {lang === "tr" ? "Yeni Apps Section Ekle" : "Add Apps Section"}
                    </Button>
                  )}
                  {mainSectionUrl && (
                    <Button url={mainSectionUrl} target="_blank">
                      {lang === "tr" ? "Ana Bölüme Ekle" : "Add to Main Section"}
                    </Button>
                  )}
                </InlineStack>
              )}
              <img
                src="/tema-kurulumu.png"
                alt="Tema kurulumu - DesignKit block settings"
                style={{ width: "100%", borderRadius: 8, border: "1px solid #e1e3e5" }}
              />
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {lang === "tr" ? "Blok ayarları açıklaması:" : "Block settings explained:"}
                </Text>
                {[
                  {
                    label: lang === "tr" ? "Ön tişört görseli / Arka tişört görseli" : "Front / Back t-shirt image",
                    desc: lang === "tr" ? "Tasarım önizlemesinde kullanılacak mockup görseli. Her ürün için farklı renk/model yükleyin." : "Mockup image shown in the design preview. Upload per product for different colors/styles.",
                  },
                  {
                    label: lang === "tr" ? "Varsayılan tişört rengi" : "Default shirt color",
                    desc: lang === "tr" ? "Müşteri seçim yapmadığında gösterilecek renk (hex kodu). Ürünün ana rengiyle eşleştirin." : "Color shown when no selection is made (hex code). Match your product's main color.",
                  },
                  {
                    label: lang === "tr" ? "Tek taraf / Ön+Arka variant ID & fiyat" : "Single / Double-side variant ID & price",
                    desc: lang === "tr" ? "Artık kullanılmıyor. Fiyat ve variant ayarları Ayarlar sayfasından ve Ürünler'den yönetilir." : "No longer used. Pricing and variant settings are managed from the Settings and Products pages.",
                    deprecated: true,
                  },
                  {
                    label: lang === "tr" ? "3D model JSON URL / React designer URL" : "3D model JSON URL / React designer URL",
                    desc: lang === "tr" ? "İleri düzey ayarlar. Boş bırakırsanız varsayılan değerler kullanılır." : "Advanced settings. Leave blank to use defaults.",
                  },
                ].map((item) => (
                  <Box key={item.label} padding="300" background={item.deprecated ? "bg-fill-caution" : "bg-fill-secondary"} borderRadius="200">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="bodySm" fontWeight="semibold">{item.label}</Text>
                        {item.deprecated && <Text as="span" variant="bodySm" tone="caution">{lang === "tr" ? "Artık kullanılmıyor" : "Deprecated"}</Text>}
                      </InlineStack>
                      <Text as="p" variant="bodySm" tone="subdued">{item.desc}</Text>
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
