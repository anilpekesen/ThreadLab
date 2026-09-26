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
import { generatorMeta } from "~/lib/generators/types";
import { PageHelper } from "~/components/PageHelper";
import { pickDict, useDict, useTranslation, type Lang } from "~/i18n";
import { langFromRequest } from "~/i18n/server";
import dict from "~/i18n/personalizer/list";
import {
  clearProductTemplateMetafield, setProductTemplateMetafield,
} from "~/lib/personalizer-metafield.server";
import { isWooShop } from "~/lib/platform";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  return json({ templates: await listPersonalizerTemplates(session.shop) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await request.formData();
  const L = pickDict(dict, langFromRequest(request, form));
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
    if (!copy) return json({ error: L.duplicateFailed }, { status: 404 });
    return json({ ok: true, duplicatedId: copy.id });
  }
  if (intent === "sync_metafields") {
    // WooCommerce: önce WordPress'te ürünlerde yapılmış seçimler çekilir
    if (isWooShop(session.shop)) {
      await (await import("~/models/woo.server")).pullWooTemplateLinks(session.shop)
        .catch((err) => console.error("[woo] şablon bağlantıları çekilemedi:", err));
    }
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
        if (!result.ok) hatalar.push(`${template.name}: ${result.error ?? L.unknownError}`);
        else if (hasPhotoSlots) yazilan++;
        else temizlenen++;
      }
    }
    return json({ ok: true, synced: true, yazilan, temizlenen, hatalar });
  }
  return json({ error: L.unknownIntent }, { status: 400 });
};

const CATEGORY_ORDER: PersonalizerCategory[] = ["apparel", "boxer", "frame", "ai", "wordart", "generator"];

function categoryMeta(L: typeof dict.tr): Array<{
  id: PersonalizerCategory; label: string; description: string;
}> {
  return CATEGORY_ORDER.map((id) => ({ id, ...L.categories[id as keyof typeof L.categories] }));
}

function categoryIcon(category: PersonalizerCategory) {
  const line = {
    fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (category === "apparel") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="m8 4-5 3 2.3 4L8 9.5V20h8V9.5l2.7 1.5L21 7l-5-3c-.7 1.4-2 2-4 2S8.7 5.4 8 4Z" /></svg>;
  if (category === "boxer") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M5 4h14l-1 16h-5l-1-9-1 9H6L5 4Zm0 4h14M9 4v4m6-4v4" /></svg>;
  if (category === "generator") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3l2.2 5.6L20 9.3l-4.4 3.8L17 19l-5-3.1L7 19l1.4-5.9L4 9.3l5.8-.7L12 3Z" /></svg>;
  if (category === "wordart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /><path {...line} d="M9 10h6M9.5 13h5" /></svg>;
  if (category === "ai") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2" /><circle {...line} cx="12" cy="12" r="4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...line} x="4" y="3" width="16" height="18" rx="1" /><path {...line} d="m7 17 4-5 3 3 2-2 2 4M9 8h.01" /></svg>;
}

function methodLabel(template: PersonalizerTemplate, L: typeof dict.tr, lang: Lang) {
  if (template.category === "ai") return L.methodAi;
  if (template.category === "boxer") return L.methodBoxer;
  if (template.category === "wordart") return L.methodWordart;
  if (template.category === "generator") {
    const meta = generatorMeta(template.generator_config?.kind);
    return (lang === "en" ? meta?.labelEn : meta?.label) ?? L.methodGenerator;
  }
  if (template.category === "apparel") return L.methodApparel;
  const count = template.pieces.reduce((total, piece) => total + piece.slots.length, 0)
    || template.slots.length || template.expected_slots;
  return count > 0 ? L.methodSlots(count) : L.methodPhoto;
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul",
  }).format(date);
}

export default function PersonalizerIndex() {
  const { templates } = useLoaderData<typeof loader>();
  const { lang } = useTranslation();
  const L = useDict(dict);
  const CATEGORY_META = categoryMeta(L);
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
    fetcher.submit({ intent, id: template.id, ...extra, _lang: lang }, { method: "POST" });
  }

  function remove(template: PersonalizerTemplate) {
    if (!confirm(L.confirmDelete(template.name))) return;
    submit("delete", template);
  }

  return (
    <Page
      title={L.pageTitle}
      subtitle={L.pageSubtitle}
      primaryAction={{ content: L.newTemplate, url: "/app/personalizer/new" }}
      secondaryActions={[
        { content: L.importDesign, url: "/app/personalizer/import" },
        { content: L.howToSetup, url: "/app/personalizer/setup" },
        {
          content: L.syncLinks,
          loading: fetcher.state !== "idle",
          onAction: () => fetcher.submit(
            { intent: "sync_metafields", _lang: lang },
            { method: "POST", action: "/app/personalizer" },
          ),
        },
      ]}
    >
      <BlockStack gap="400">
        <PageHelper sections={L.help} />
        {fetcher.data?.error ? <Banner tone="critical">{fetcher.data.error}</Banner> : null}
        {fetcher.data?.synced ? (
          <Banner tone={fetcher.data.hatalar?.length ? "warning" : "success"}>
            <p>{L.syncResult(fetcher.data.yazilan ?? 0, fetcher.data.temizlenen ?? 0)}</p>
            {fetcher.data.hatalar?.length ? <p>{fetcher.data.hatalar.join(" · ")}</p> : null}
          </Banner>
        ) : null}

        <Banner tone="info" title={L.stepsTitle}>
          <p>{L.stepsBody}</p>
          <div style={{ marginTop: 8 }}>
            <Button url="/app/personalizer/setup">{L.stepByStep}</Button>
          </div>
        </Banner>

        {templates.length === 0 ? (
          <Card>
            <EmptyState
              heading={L.emptyHeading}
              action={{ content: L.newTemplate, url: "/app/personalizer/new" }}
              image="/empty-templates.svg"
            >
              <Text as="p">{L.emptyBody}</Text>
            </EmptyState>
          </Card>
        ) : (
          <Card padding="0">
            <div className="pl-resource-toolbar">
              <div className="pl-resource-search">
                <TextField
                  label={L.searchLabel} labelHidden placeholder={L.searchLabel}
                  value={search} onChange={setSearch} autoComplete="off"
                  clearButton onClearButtonClick={() => setSearch("")}
                />
              </div>
              <div className="pl-resource-filter">
                <Select
                  label={L.sectorLabel} labelHidden value={category} onChange={setCategory}
                  options={[
                    { label: L.sectorAll, value: "all" },
                    ...CATEGORY_META.map((item) => ({ label: item.label, value: item.id })),
                  ]}
                />
              </div>
              <div className="pl-resource-filter">
                <Select
                  label={L.statusLabel} labelHidden value={status} onChange={setStatus}
                  options={[
                    { label: L.statusAll, value: "all" },
                    { label: L.active, value: "active" },
                    { label: L.inactive, value: "inactive" },
                  ]}
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <Box padding="800">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h3" variant="headingSm">{L.noMatchTitle}</Text>
                  <Text as="p" tone="subdued">{L.noMatchBody}</Text>
                  <Button onClick={() => { setSearch(""); setCategory("all"); setStatus("all"); }}>
                    {L.clearFilters}
                  </Button>
                </BlockStack>
              </Box>
            ) : (
              <div className="pl-resource-table-wrap">
                <table className="pl-resource-table">
                  <thead>
                    <tr>
                      <th>{L.colTemplate}</th>
                      <th className="pl-col-method">{L.colMethod}</th>
                      <th>{L.colStatus}</th>
                      <th className="pl-col-products">{L.colProducts}</th>
                      <th className="pl-col-date">{L.colUpdated}</th>
                      <th><span className="pl-visually-hidden">{L.colActions}</span></th>
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
                            <td className="pl-col-method">{methodLabel(template, L, lang)}</td>
                            <td>
                              {/* "Aktif" rozeti, ürüne bağlı olmayan şablonu da hazır
                                  gibi gösteriyordu; müşteriye görünmemesinin en sık
                                  sebebi bu. */}
                              {!template.active
                                ? <Badge>{L.badgeInactive}</Badge>
                                : template.product_count === 0
                                  ? <Badge tone="attention">{L.badgeNotLinked}</Badge>
                                  : <Badge tone="success">{L.badgeLive}</Badge>}
                            </td>
                            <td className="pl-col-products">{template.product_count}</td>
                            <td className="pl-col-date">{formatDate(template.updated_at, L.dateLocale)}</td>
                            <td className="pl-resource-actions">
                              <Popover
                                active={openMenu === template.id}
                                onClose={() => setOpenMenu(null)}
                                preferredAlignment="right"
                                activator={(
                                  <Button
                                    variant="tertiary"
                                    accessibilityLabel={L.actionsFor(template.name)}
                                    onClick={() => setOpenMenu(openMenu === template.id ? null : template.id)}
                                  >⋯</Button>
                                )}
                              >
                                <ActionList items={[
                                  { content: L.edit, url: `/app/personalizer/${template.id}` },
                                  { content: template.active ? L.deactivate : L.activate, onAction: () => submit("toggle", template, { active: String(!template.active) }) },
                                  { content: L.duplicate, onAction: () => submit("duplicate", template) },
                                  { content: L.remove, destructive: true, onAction: () => remove(template) },
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
