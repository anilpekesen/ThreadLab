import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, EmptyState, Thumbnail, Banner, Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import {
  listPersonalizerTemplates,
  listPersonalizerProductLinks,
  deletePersonalizerTemplate,
  updatePersonalizerTemplate,
  duplicatePersonalizerTemplate,
  type PersonalizerTemplate,
} from "~/models/personalizer.server";
import {
  setProductTemplateMetafield,
  clearProductTemplateMetafield,
} from "~/lib/personalizer-metafield.server";

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

  // Aynı yerleşimi farklı dekor ve yazılarla satmak yaygın ("Sevgiliye 8'li" →
  // "Babaya 8'li"). Kopya taslak olarak açılır, kaynağı bozmaz.
  if (intent === "duplicate") {
    const copy = await duplicatePersonalizerTemplate(id, session.shop);
    if (!copy) return json({ error: "Şablon kopyalanamadı" }, { status: 404 });
    return json({ ok: true, duplicatedId: copy.id });
  }

  // Mağazadaki `personalizer.template_id` alanlarını kuralla hizalar.
  //
  // Kural: bu alan yalnızca ÇOKLU FOTOĞRAF ALANI olan şablonlarda yazılı olmalı,
  // çünkü ürün sayfasındaki ayrı kişiselleştirme kutusunu o açıyor. Maske/AI
  // şablonları tasarımcının içinde çalışıyor ve kutuya ihtiyaç duymuyor.
  //
  // Elle senkron gerekiyor çünkü alan geçmişte ayrım gözetmeden yazılmıştı ve
  // tema bloğu eklendiğinde eski kayıtlar yüzünden tişört gibi ürünlerde
  // istenmeyen kutu çıktı. Şablonu yeniden bağlamak da düzeltiyor ama bütün
  // ürünleri tek tek gezmek gerekiyordu.
  if (intent === "sync_metafields") {
    const templates = await listPersonalizerTemplates(session.shop);
    let temizlenen = 0;
    let yazilan = 0;
    const hatalar: string[] = [];

    for (const t of templates) {
      const slotluMu =
        (Array.isArray(t.slots) && t.slots.length > 0)
        || (Array.isArray(t.pieces) && t.pieces.length > 0);
      const links = await listPersonalizerProductLinks(t.id);
      const urunler = [...new Set(links.map((l) => l.product_id).filter(Boolean))];

      for (const productId of urunler) {
        const sonuc = slotluMu
          ? await setProductTemplateMetafield(session.shop, productId, t.id)
          : await clearProductTemplateMetafield(session.shop, productId);
        if (!sonuc.ok) hatalar.push(`${t.name}: ${sonuc.error ?? "bilinmeyen hata"}`);
        else if (slotluMu) yazilan++;
        else temizlenen++;
      }
    }

    return json({ ok: true, synced: true, yazilan, temizlenen, hatalar });
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
  const fetcher = useFetcher<{
    error?: string; ok?: boolean; duplicatedId?: string;
    synced?: boolean; yazilan?: number; temizlenen?: number; hatalar?: string[];
  }>();

  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : "https://app.printlabapp.com";

  function handleDuplicate(t: PersonalizerTemplate) {
    fetcher.submit({ intent: "duplicate", id: t.id }, { method: "POST" });
  }

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
      primaryAction={{ content: "+ Şablon Ekle", url: "/app/personalizer/new" }}
      secondaryActions={[
        { content: "Mağaza Kurulum Rehberi →", url: "/app/personalizer/setup" },
        {
          content: "Bağlantıları denetle",
          loading: fetcher.state !== "idle",
          onAction: () => fetcher.submit({ intent: "sync_metafields" }, { method: "POST" }),
          helpText: "Ürün sayfasındaki kişiselleştirme kutusunu kuralla hizalar",
        },
      ]}
    >
      <Layout>
          {fetcher.data?.synced && (
            <Layout.Section>
              <Banner tone={fetcher.data.hatalar?.length ? "warning" : "success"}>
                <p>
                  {`Denetlendi: ${fetcher.data.yazilan ?? 0} üründe kutu açık bırakıldı, `
                    + `${fetcher.data.temizlenen ?? 0} üründe kapatıldı.`}
                </p>
                {fetcher.data.hatalar?.length ? (
                  <p style={{ marginTop: 8 }}>
                    {`Shopify'a yazılamayanlar: ${fetcher.data.hatalar.join(" · ")}`}
                  </p>
                ) : null}
              </Banner>
            </Layout.Section>
          )}
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
                  action={{ content: "Şablon Oluştur", url: "/app/personalizer/new" }}
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
                        {/* onClick yerine gerçek bağlantı: Polaris'in url'i
                            AppProvider'daki linkComponent üzerinden Remix'e
                            gidiyor, yani istemci tarafında geziniyor ama <a>
                            olarak da davranıyor — orta tıkla yeni sekmede
                            açılabiliyor ve tıklama kaybolmuyor. */}
                        <Button url={`/app/personalizer/${t.id}`} size="slim">
                          Düzenle
                        </Button>
                        <Button onClick={() => handleDuplicate(t)} size="slim">
                          Kopyala
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
