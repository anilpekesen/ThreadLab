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

  // Auto-register order tracking ScriptTag on order status page
  try {
    const appUrl = process.env.SHOPIFY_APP_URL ?? "https://app.printlabapp.com";
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

  // Auto-register cart preview ScriptTag (runs on all pages, filters to /cart in JS)
  try {
    const appUrl = process.env.SHOPIFY_APP_URL ?? "https://app.printlabapp.com";
    const cartScriptSrc = `${appUrl}/api/cart-preview-script?v=5`;
    const stRes2 = await admin.graphql(`#graphql
      { scriptTags(first: 20) { nodes { id src displayScope } } }
    `);
    const stData2 = await stRes2.json() as {
      data?: { scriptTags?: { nodes?: Array<{ id: string; src: string; displayScope: string }> } };
    };
    const existing2 = stData2.data?.scriptTags?.nodes ?? [];
    // Delete stale cart-preview ScriptTags (old versions without ?v=2)
    for (const tag of existing2) {
      if (tag.src.includes('cart-preview-script') && tag.src !== cartScriptSrc) {
        await admin.graphql(`#graphql
          mutation { scriptTagDelete(id: "${tag.id}") { deletedScriptTagId userErrors { message } } }
        `);
      }
    }
    const cartAlreadyRegistered = existing2.some((t) => t.src === cartScriptSrc);
    if (!cartAlreadyRegistered) {
      await admin.graphql(`#graphql
        mutation {
          scriptTagCreate(input: {
            src: "${cartScriptSrc}"
            displayScope: ALL
          }) {
            scriptTag { id }
            userErrors { field message }
          }
        }
      `);
    }
  } catch (_e) {
    console.error("[settings] cart ScriptTag registration error:", _e);
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

  return json({ settings, saved, created, cartTransformStatus });
};

async function writeSurchargeMetafield(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
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

  const newVariantId = String(form.get("surchargeVariantId") || "").trim();
  const currentSettings = await getGlobalSettings();
  await saveGlobalSettings({
    wavespeedApiKey: currentSettings.wavespeedApiKey,
    surchargeVariantId: newVariantId,
  });
  if (newVariantId) await writeSurchargeMetafield(admin, newVariantId).catch(() => {});
  return redirect("/app/settings?saved=1");
};

export default function SettingsRoute() {
  const { settings, saved, created, cartTransformStatus } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetcher = useFetcher<{ error?: string; success?: string }>();
  const isSaving = navigation.state === "submitting";
  const isCreating = fetcher.state === "submitting";

  const [surchargeVariantId, setSurchargeVariantId] = useState(settings.surchargeVariantId || "");
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Page title="Ayarlar">
      <BlockStack gap="500">
        {saved && <Banner tone="success" title="Ayarlar kaydedildi." />}
        {created && <Banner tone="success" title="Baskı Ücreti ürünü oluşturuldu ve kaydedildi." />}
        {fetcher.data?.error && <Banner tone="critical" title={`Hata: ${fetcher.data.error}`} />}
        {fetcher.data?.success && <Banner tone="success" title={fetcher.data.success} />}

        {cartTransformStatus === "ok" && (
          <Banner tone="success" title="Cart Transform: Aktif ✓" />
        )}
        {cartTransformStatus === "re_registered_ok" && (
          <Banner tone="success" title="Cart Transform: Eski kayıt silindi, yeniden kaydedildi ✓" />
        )}
        {cartTransformStatus === "stale_re_registering" && (
          <Banner tone="warning" title="Cart Transform: Eski kayıt temizleniyor..." />
        )}
        {cartTransformStatus === "function_not_found" && (
          <Banner tone="critical" title="Cart Transform: Fonksiyon bulunamadı — npx shopify app deploy çalıştır" />
        )}
        {(cartTransformStatus === "error" || cartTransformStatus?.startsWith("error:")) && (
          <Banner tone="critical" title={`Cart Transform Hatası: ${cartTransformStatus}`} />
        )}

        {/* Baskı Ek Ücreti — fetcher forms are standalone, NOT inside the outer Form */}
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
                  <p>Sepete eklenen tasarım baskı ücretleri Shopify&apos;a yansıtılamıyor.
                     Aşağıdaki butona tıklayarak otomatik oluşturun ya da aşağıya variant ID&apos;nizi girin.</p>
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
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        {/* Outer Form — only text inputs + save button, no nested fetcher forms */}
        <Form method="post">
          <BlockStack gap="400">

            <Card>
              <Box padding="400">
                <TextField
                  label="Variant ID (manuel giriş)"
                  name="surchargeVariantId"
                  value={surchargeVariantId}
                  onChange={setSurchargeVariantId}
                  autoComplete="off"
                  helpText="Shopify'da mevcut ₺1 fiyatlı bir variant varsa buraya ID'sini girebilirsiniz."
                  placeholder="12345678901234"
                />
              </Box>
            </Card>

            {/* WaveSpeed */}
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">WaveSpeed Arka Plan Kaldırma</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    AI arka plan kaldırma servisi. Mağazalara plana göre kota tanımlanır;
                    Growth: 50/ay · Pro: 500/ay · Business: sınırsız.
                  </Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Aktif</Badge>
                    <Text as="p" variant="bodySm" tone="subdued">
                      API key sunucu ortam değişkeninde yapılandırılmış.
                    </Text>
                  </InlineStack>
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
