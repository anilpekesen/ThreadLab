import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
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
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { getGlobalSettings, saveGlobalSettings } from "~/models/global-settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const settings = await getGlobalSettings();
  const saved = new URL(request.url).searchParams.get("saved") === "1";
  return json({ settings, saved });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const form = await request.formData();
  await saveGlobalSettings({
    photoroomApiKey: String(form.get("photoroomApiKey") || "").trim(),
  });
  return redirect("/app/settings?saved=1");
};

export default function SettingsRoute() {
  const { settings, saved } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [photoroomApiKey, setPhotoroomApiKey] = useState(settings.photoroomApiKey || "");
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Page title="Ayarlar">
      <BlockStack gap="500">
        {saved && (
          <Banner tone="success" title="Ayarlar kaydedildi." />
        )}

        <Form method="post">
          <BlockStack gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Photoroom Arka Plan Temizleme</Text>
                      <Text as="p" tone="subdued">
                        Müşteri görsel yükleyince "Arka planı temizleyelim mi?" sorusu çıkar.
                        API key yalnızca sunucu tarafında kullanılır, tarayıcıya gönderilmez.
                      </Text>
                    </BlockStack>
                    <Button variant="plain" size="slim" onClick={() => setShowHelp((v) => !v)}>
                      {showHelp ? "Kapat" : "API key nasıl alınır?"}
                    </Button>
                  </InlineStack>

                  <Collapsible open={showHelp} id="photoroom-help">
                    <Box
                      background="bg-surface-secondary"
                      padding="400"
                      borderRadius="200"
                      borderColor="border"
                      borderWidth="025"
                    >
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
                              }}>
                                {i + 1}
                              </div>
                              <Text as="p" variant="bodySm">{text}</Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Sandbox key ile aylık 30 görsel ücretsiz işleyebilirsiniz.
                          Daha fazlası için ücretli plana geçmeniz gerekir.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Collapsible>

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
                        ? "API key girilmiş. Ürün ayarlarından 'Arka plan temizleme' etkinleştirilirse müşterilere sor seçeneği çıkar."
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
