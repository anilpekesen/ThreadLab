import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  ActionList, Badge, Banner, BlockStack, Box, Button, Card, EmptyState,
  InlineStack, Page, Popover, Select, Text, TextField, Thumbnail,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  deletePersonalizerTemplate, duplicatePersonalizerTemplate,
  listPersonalizerProductLinks, listPersonalizerTemplates,
  updatePersonalizerTemplate, type PersonalizerCategory,
  type PersonalizerTemplate,
} from "~/models/personalizer.server";
import {
  clearProductTemplateMetafield, setProductTemplateMetafield,
} from "~/lib/personalizer-metafield.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  return json({ templates: await listPersonalizerTemplates(session.shop) });
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
    await updatePersonalizerTemplate(id, session.shop, { active: form.get("active") === "true" });
    return json({ ok: true });
  }
  if (intent === "duplicate") {
    const copy = await duplicatePersonalizerTemplate(id, session.shop);
    if (!copy) return json({ error: "Şablon kopyalanamadı" }, { status: 404 });
    return json({ ok: true, duplicatedId: copy.id });
  }
  if (intent === "sync_metafields") {
    const templates = await listPersonalizerTemplates(session.shop);
    let temizlenen = 0;
    let yazilan = 0;
    const hatalar: string[] = [];
    for (const template of templates) {
      const hasPhotoSlots = template.slots.length > 0 || template.pieces.length > 0;
      const links = await listPersonalizerProductLinks(template.id);
      const productIds = [...new Set(links.map((link) => link.product_id).filter(Boolean))];
      for (const productId of productIds) {
        const result = hasPhotoSlots
          ? await setProductTemplateMetafield(session.shop, productId, template.id)
          : await clearProductTemplateMetafield(session.shop, productId);
        if (!result.ok) hatalar.push(`${template.name}: ${result.error ?? "bilinmeyen hata"}`);
        else if (hasPhotoSlots) yazilan++;
        else temizlenen++;
      }
    }
    return json({ ok: true, synced: true, yazilan, temizlenen, hatalar });
  }
  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

const CATEGORY_META: Array<{
  id: PersonalizerCategory; label: string; description: string;
}> = [
  { id: "apparel", label: "Tişört ve giyim", description: "Baskı alanına yerleşen tek görsel tasarımları" },
  { id: "boxer", label: "Boxer ve tekrarlı desen", description: "Fotoğraf ve süslemeden oluşan tekrar desenleri" },
  { id: "frame", label: "Fotoğraflı çerçeve", description: "Tekli, çok fotoğraflı ve set çerçeveler" },
  { id: "ai", label: "AI portre", description: "Fotoğraftan üretilen sanatsal portreler" },
];

function categoryIcon(category: PersonalizerCategory) {
  const line = {
    fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (category === "apparel") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="m8 4-5 3 2.3 4L8 9.5V20h8V9.5l2.7 1.5L21 7l-5-3c-.7 1.4-2 2-4 2S8.7 5.4 8 4Z" /></svg>;
  if (category === "boxer") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M5 4h14l-1 16h-5l-1-9-1 9H6L5 4Zm0 4h14M9 4v4m6-4v4" /></svg>;
  if (category === "ai") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2" /><circle {...line} cx="12" cy="12" r="4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...line} x="4" y="3" width="16" height="18" rx="1" /><path {...line} d="m7 17 4-5 3 3 2-2 2 4M9 8h.01" /></svg>;
}

function methodLabel(template: PersonalizerTemplate) {
  if (template.category === "ai") return "AI görsel üretimi";
  if (template.category === "boxer") return "Tekrarlı desen";
  if (template.category === "apparel") return "Tek görsel yerleşimi";
  const count = template.pieces.reduce((total, piece) => total + piece.slots.length, 0)
    || template.slots.length || template.expected_slots;
  return count > 0 ? `${count} fotoğraf alanı` : "Fotoğraf yerleşimi";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul",
  }).format(date);
}

export default function PersonalizerIndex() {
  const { templates } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    error?: string; ok?: boolean; synced?: boolean; yazilan?: number;
    temizlenen?: number; hatalar?: string[];
  }>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    return templates.filter((template) => {
      const matchesTerm = !term
        || template.name.toLocaleLowerCase("tr-TR").includes(term)
        || template.description.toLocaleLowerCase("tr-TR").includes(term);
      const matchesCategory = category === "all" || template.category === category;
      const matchesStatus = status === "all"
        || (status === "active" ? template.active : !template.active);
      return matchesTerm && matchesCategory && matchesStatus;
    });
  }, [templates, search, category, status]);

  function submit(intent: string, template: PersonalizerTemplate, extra: Record<string, string> = {}) {
    setOpenMenu(null);
    fetcher.submit({ intent, id: template.id, ...extra }, { method: "POST" });
  }

  function remove(template: PersonalizerTemplate) {
    if (!confirm(`“${template.name}” şablonunu silmek istediğinizden emin misiniz?`)) return;
    submit("delete", template);
  }

  return (
    <Page
      title="Kişiselleştirme şablonları"
      subtitle="Farklı ürün gruplarındaki müşteri tasarım akışlarını tek yerden yönetin."
      primaryAction={{ content: "Yeni şablon", url: "/app/personalizer/new" }}
      secondaryActions={[
        { content: "Kurulum rehberi", url: "/app/personalizer/setup" },
        {
          content: "Bağlantıları denetle",
          loading: fetcher.state !== "idle",
          onAction: () => fetcher.submit(
            { intent: "sync_metafields" },
            { method: "POST", action: "/app/personalizer" },
          ),
        },
      ]}
    >
      <BlockStack gap="400">
        {fetcher.data?.error ? <Banner tone="critical">{fetcher.data.error}</Banner> : null}
        {fetcher.data?.synced ? (
          <Banner tone={fetcher.data.hatalar?.length ? "warning" : "success"}>
            <p>{`${fetcher.data.yazilan ?? 0} üründe kişiselleştirme alanı açık, ${fetcher.data.temizlenen ?? 0} üründe kapalı olarak eşitlendi.`}</p>
            {fetcher.data.hatalar?.length ? <p>{fetcher.data.hatalar.join(" · ")}</p> : null}
          </Banner>
        ) : null}

        {templates.length === 0 ? (
          <Card>
            <EmptyState
              heading="İlk şablonunuzu oluşturun"
              action={{ content: "Yeni şablon", url: "/app/personalizer/new" }}
              image="/empty-templates.svg"
            >
              <Text as="p">Giyim, boxer, çerçeve veya AI portre için yönlendirmeli kurulumla başlayın.</Text>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <div className="pl-resource-toolbar">
              <div className="pl-resource-search">
                <TextField
                  label="Şablon ara" labelHidden placeholder="Şablon ara"
                  value={search} onChange={setSearch} autoComplete="off"
                  clearButton onClearButtonClick={() => setSearch("")}
                />
              </div>
              <div className="pl-resource-filter">
                <Select
                  label="Sektör" labelHidden value={category} onChange={setCategory}
                  options={[
                    { label: "Sektör: Tümü", value: "all" },
                    ...CATEGORY_META.map((item) => ({ label: item.label, value: item.id })),
                  ]}
                />
              </div>
              <div className="pl-resource-filter">
                <Select
                  label="Durum" labelHidden value={status} onChange={setStatus}
                  options={[
                    { label: "Durum: Tümü", value: "all" },
                    { label: "Aktif", value: "active" },
                    { label: "Pasif", value: "inactive" },
                  ]}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <Box padding="800">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h3" variant="headingSm">Eşleşen şablon bulunamadı</Text>
                  <Text as="p" tone="subdued">Arama sözcüğünü veya filtreleri değiştirin.</Text>
                  <Button onClick={() => { setSearch(""); setCategory("all"); setStatus("all"); }}>
                    Filtreleri temizle
                  </Button>
                </BlockStack>
              </Box>
            ) : (
              <div className="pl-resource-table-wrap">
                <table className="pl-resource-table">
                  <thead>
                    <tr>
                      <th>Şablon</th>
                      <th className="pl-col-method">Yöntem</th>
                      <th>Durum</th>
                      <th className="pl-col-products">Bağlı ürün</th>
                      <th className="pl-col-date">Son güncelleme</th>
                      <th><span className="pl-visually-hidden">İşlemler</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORY_META.flatMap((group) => {
                      const rows = filtered.filter((template) => template.category === group.id);
                      if (rows.length === 0) return [];
                      return [
                        <tr className="pl-resource-group" key={`${group.id}-heading`}>
                          <th colSpan={6}>
                            <span className="pl-category-icon">{categoryIcon(group.id)}</span>
                            <span>{group.label}</span>
                            <span className="pl-group-count">{rows.length}</span>
                            <span className="pl-group-description">{group.description}</span>
                          </th>
                        </tr>,
                        ...rows.map((template) => (
                          <tr key={template.id}>
                            <td>
                              <InlineStack gap="300" blockAlign="center" wrap={false}>
                                {template.template_url ? (
                                  <Thumbnail source={template.template_url} size="small" alt="" />
                                ) : (
                                  <span className="pl-template-placeholder">{categoryIcon(template.category)}</span>
                                )}
                                <BlockStack gap="050">
                                  <Button variant="plain" textAlign="left" url={`/app/personalizer/${template.id}`}>
                                    {template.name}
                                  </Button>
                                  {template.description ? <span className="pl-template-description">{template.description}</span> : null}
                                </BlockStack>
                              </InlineStack>
                            </td>
                            <td className="pl-col-method">{methodLabel(template)}</td>
                            <td><Badge tone={template.active ? "success" : undefined}>{template.active ? "Aktif" : "Pasif"}</Badge></td>
                            <td className="pl-col-products">{template.product_count}</td>
                            <td className="pl-col-date">{formatDate(template.updated_at)}</td>
                            <td className="pl-resource-actions">
                              <Popover
                                active={openMenu === template.id}
                                onClose={() => setOpenMenu(null)}
                                preferredAlignment="right"
                                activator={(
                                  <Button
                                    variant="tertiary"
                                    accessibilityLabel={`${template.name} işlemleri`}
                                    onClick={() => setOpenMenu(openMenu === template.id ? null : template.id)}
                                  >⋯</Button>
                                )}
                              >
                                <ActionList items={[
                                  { content: "Düzenle", url: `/app/personalizer/${template.id}` },
                                  { content: template.active ? "Pasife al" : "Aktifleştir", onAction: () => submit("toggle", template, { active: String(!template.active) }) },
                                  { content: "Kopyala", onAction: () => submit("duplicate", template) },
                                  { content: "Sil", destructive: true, onAction: () => remove(template) },
                                ]} />
                              </Popover>
                            </td>
                          </tr>
                        )),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
