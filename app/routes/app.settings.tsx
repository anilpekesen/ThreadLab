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
  await authenticate.admin(request);
  const settings = await getGlobalSettings();
  const saved = new URL(request.url).searchParams.get("saved") === "1";
  const created = new URL(request.url).searchParams.get("created") === "1";
  return json({ settings, saved, created });
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
          variants: [{ price: "1.00" }]
        }) {
          product {
            variants(first: 1) { nodes { id } }
          }
          userErrors { field message }
        }
      }
    `);
    const data = await response.json() as {
      data?: {
        productCreate?: {
          product?: { variants?: { nodes?: Array<{ id: string }> } };
          userErrors?: Array<{ field: string; message: string }>;
        };
      };
    };
    const errors = data.data?.productCreate?.userErrors ?? [];
    if (errors.length) {
      return json({ error: errors.map((e) => e.message).join(", ") });
    }
    const gid = data.data?.productCreate?.product?.variants?.nodes?.[0]?.id ?? "";
    const variantId = gid.split("/").pop() ?? "";
    if (!variantId) return json({ error: "Variant ID alınamadı" });

    const settings = await getGlobalSettings();
    await saveGlobalSettings({ ...settings, surchargeVariantId: variantId });
    return redirect("/app/settings?created=1");
  }

  await saveGlobalSettings({
    photoroomApiKey: String(form.get("photoroomApiKey") || "").trim(),
    surchargeVariantId: String(form.get("surchargeVariantId") || "").trim(),
  });
  return redirect("/app/settings?saved=1");
};

export default function SettingsRoute() {
  const { settings, saved, created } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const fetcher = useFetcher<{ error?: string }>();
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
                         Aşağıdaki butona tıklayarak otomatik oluşturun.</p>
                    </Banner>
                  )}

                  <InlineStack gap="200">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="createSurchargeProduct" />
                      <Button
                        variant={settings.surchargeVariantId ? "plain" : "primary"}
                        submit
                        loading={isCreating}
                      >
                        {settings.surchargeVariantId
                          ? "Yeni Baskı Ücreti ürünü oluştur (sıfırla)"
                          : "Otomatik oluştur"}
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
