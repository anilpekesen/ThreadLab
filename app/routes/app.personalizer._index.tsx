import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, EmptyState, Thumbnail, Banner, Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import {
  listPersonalizerTemplates,
  deletePersonalizerTemplate,
  updatePersonalizerTemplate,
  type PersonalizerTemplate,
} from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const templates = await listPersonalizerTemplates(session.shop);
  return json({ shop: session.shop, templates });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (intent === "delete") {
    await deletePersonalizerTemplate(id, session.shop);
    return json({ ok: true });
  }
  if (intent === "toggle") {
    const active = form.get("active") === "true";
    await updatePersonalizerTemplate(id, session.shop, { active });
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

const AI_STYLE_LABELS: Record<string, string> = {
  caricature: "Karikatür",
  watercolor: "Suluboya",
  sketch: "Karakalem",
  pop_art: "Pop Art",
  none: "AI Yok",
};

export default function PersonalizerIndex() {
  const { shop, templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://app.printlabapp.com";

  function handleDelete(t: PersonalizerTemplate) {
    if (!confirm(`"${t.name}" şablonunu silmek istediğinizden emin misiniz?`)) return;
    fetcher.submit({ intent: "delete", id: t.id }, { method: "POST" });
  }

  function handleToggle(t: PersonalizerTemplate) {
    fetcher.submit({ intent: "toggle", id: t.id, active: String(!t.active) }, { method: "POST" });
  }

  return (
    <Page
      title="Personalizer Şablonları"
      primaryAction={{ content: "Yeni Şablon", onAction: () => navigate("/app/personalizer/new") }}
    >
      <Layout>
          <Layout.Section>
            <Banner tone="info">
              <Text as="p">
                Müşterileriniz fotoğraf yükler, metin girer ve AI bir karikatür / sanatsal görsel oluşturur.
                Oluşturulan görsel şablona eklenerek sipariş verilir.
              </Text>
            </Banner>
          </Layout.Section>

          {templates.length === 0 ? (
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Henüz şablon yok"
                  action={{ content: "İlk Şablonu Oluştur", onAction: () => navigate("/app/personalizer/new") }}
                  image="/empty-templates.svg"
                >
                  <Text as="p">Müşterilerin fotoğraflarını kişiselleştirebileceği şablonlar oluşturun.</Text>
                </EmptyState>
              </Card>
            </Layout.Section>
          ) : (
            <Layout.Section>
              <BlockStack gap="400">
                {templates.map((t) => (
                  <Card key={t.id}>
                    <InlineStack gap="400" align="space-between" blockAlign="center" wrap={false}>
                      <InlineStack gap="400" blockAlign="center">
                        {t.template_url ? (
                          <Thumbnail source={t.template_url} size="medium" alt={t.name} />
                        ) : (
                          <Box
                            background="bg-surface-secondary"
                            padding="400"
                            borderRadius="200"
                          >
                            <Text as="p" tone="subdued">Görsel yok</Text>
                          </Box>
                        )}
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm" fontWeight="bold">{t.name}</Text>
                          {t.description && <Text as="p" tone="subdued">{t.description}</Text>}
                          <InlineStack gap="200">
                            <Badge tone={t.active ? "success" : "critical"}>
                              {t.active ? "Aktif" : "Pasif"}
                            </Badge>
                            <Badge>{AI_STYLE_LABELS[t.ai_style] ?? t.ai_style}</Badge>
                            {t.text_fields.length > 0 && (
                              <Badge>{`${t.text_fields.length} metin alanı`}</Badge>
                            )}
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            Embed URL:{" "}
                            <code style={{ fontSize: "11px", userSelect: "all" }}>
                              {appUrl}/embed/personalizer?templateId={t.id}
                            </code>
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      <InlineStack gap="200" wrap={false}>
                        <Button onClick={() => handleToggle(t)} size="slim">
                          {t.active ? "Pasif Yap" : "Aktif Yap"}
                        </Button>
                        <Button onClick={() => navigate(`/app/personalizer/${t.id}`)} size="slim">
                          Düzenle
                        </Button>
                        <Button onClick={() => handleDelete(t)} size="slim" tone="critical">
                          Sil
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                ))}
              </BlockStack>
            </Layout.Section>
          )}
        </Layout>
    </Page>
  );
}
