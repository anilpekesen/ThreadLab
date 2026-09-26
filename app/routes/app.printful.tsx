import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, TextField, Select, Button, Banner, Checkbox, Badge, Box, Divider,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { query } from "~/lib/db.server";
import { langFromRequest } from "~/i18n/server";
import { pickDict, useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/admin/printful";
import { readSettingsMap } from "~/models/product-config.server";
import {
  autoMatch, connectPrintful, disconnectPrintful, getPrintfulConnection, listVariantMaps, loadCatalog, saveVariantMaps, setAutoDraft,
} from "~/models/printful.server";
import { isWooShop } from "~/lib/platform";
import { fetchShopifyProductById } from "~/models/product-config.server";

/**
 * Printful bağlantısı ve varyant eşleştirme (bkz. ~/models/printful.server).
 */

const numeric = (id: string) => String(id).split("/").pop() ?? "";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const shop = session.shop;
  const conn = await getPrintfulConnection(shop);
  const url = new URL(request.url);

  // Eşleştirilebilecek ürünler: tasarımcısı açık olanlar + şablon bağlı olanlar
  const products = new Map<string, string>();
  for (const [pid, cfg] of Object.entries(await readSettingsMap(shop))) {
    if (cfg?.isActive) products.set(numeric(pid), cfg.productTitle || numeric(pid));
  }
  for (const r of (await query<{ product_id: string; product_title: string }>(
    "SELECT DISTINCT product_id, product_title FROM personalizer_product_links WHERE shop = $1", [shop])).rows) {
    if (!products.has(r.product_id)) products.set(r.product_id, r.product_title || r.product_id);
  }
  const allMaps = conn ? await listVariantMaps(shop) : [];

  const selected = url.searchParams.get("p") ?? "";
  let variants: Array<{ id: string; title: string; options: string[] }> = [];
  let mapping: Record<string, number | null> = {};
  let catalog: null | { id: number; name: string; techniques: Array<{ key: string; display_name: string; is_default: boolean }>; variants: Array<{ id: number; label: string }> } = null;
  let catalogError = false;
  let matched = 0;

  if (conn && selected) {
    if (isWooShop(shop)) {
      // WooCommerce: varyasyonlar mağazanın REST'inden (ürün yardımcısı üzerinden)
      const product = await fetchShopifyProductById(admin, selected);
      variants = (product?.variants ?? []).map((v) => ({ id: numeric(v.id), title: v.title, options: v.selectedOptions.map((o) => o.value) }));
    } else {
      const res = await admin.graphql(`query($id: ID!) { product(id: $id) { variants(first: 100) { nodes { id title selectedOptions { value } } } } }`,
        { variables: { id: `gid://shopify/Product/${selected}` } });
      const body = await res.json();
      variants = (body?.data?.product?.variants?.nodes ?? []).map((v: { id: string; title: string; selectedOptions: { value: string }[] }) => ({
        id: numeric(v.id), title: v.title, options: v.selectedOptions.map((o) => o.value),
      }));
    }
    const existing = allMaps.filter((m) => variants.some((v) => v.id === m.shopify_variant_id));
    const catalogId = Number(url.searchParams.get("c") || existing[0]?.catalog_product_id || 0);
    if (catalogId) {
      try {
        const cat = await loadCatalog(conn.token, catalogId);
        catalog = {
          id: cat.product.id,
          name: cat.product.name,
          techniques: cat.product.techniques,
          variants: cat.variants.map((v) => ({ id: v.id, label: `${v.color} / ${v.size}` })),
        };
        const auto = autoMatch(variants, cat.variants);
        matched = Object.values(auto).filter(Boolean).length;
        const saved = new Map(existing.filter((m) => m.catalog_product_id === catalogId).map((m) => [m.shopify_variant_id, m.catalog_variant_id]));
        mapping = Object.fromEntries(variants.map((v) => [v.id, saved.get(v.id) ?? auto[v.id] ?? null]));
      } catch {
        catalogError = true;
      }
    }
  }

  return json({
    connected: Boolean(conn),
    // Korunan müşteri verisi onayı yalnız Shopify'da gerekiyor
    needsShopifyAccess: !isWooShop(shop),
    storeName: conn?.storeName ?? "",
    autoDraft: conn?.autoDraft ?? true,
    products: [...products.entries()].map(([id, title]) => ({ id, title })),
    selected,
    variants,
    mapping,
    catalog,
    catalogError,
    matched,
    technique: allMaps.find((m) => variants.some((v) => v.id === m.shopify_variant_id))?.technique ?? "",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const form = await request.formData();
  const L = pickDict(dict, langFromRequest(request, form));
  const intent = String(form.get("intent") ?? "");

  if (intent === "connect") {
    const token = String(form.get("token") ?? "").trim();
    if (!token) return json({ error: L.connectFailed });
    try {
      await connectPrintful(shop, token);
      return json({ ok: true });
    } catch (err) {
      console.error("[printful] bağlanılamadı:", err);
      return json({ error: L.connectFailed });
    }
  }
  if (intent === "disconnect") {
    await disconnectPrintful(shop);
    return json({ ok: true });
  }
  if (intent === "auto_draft") {
    await setAutoDraft(shop, form.get("on") === "1");
    return json({ ok: true });
  }
  if (intent === "save_maps") {
    let rows: Array<{ shopifyVariantId: string; catalogVariantId: number | null }> = [];
    try { rows = JSON.parse(String(form.get("rows") ?? "[]")); } catch { /* boş */ }
    const n = await saveVariantMaps(
      shop,
      String(form.get("product") ?? ""),
      Number(form.get("catalog") ?? 0),
      String(form.get("technique") ?? "dtg"),
      rows.map((r) => ({ shopifyVariantId: String(r.shopifyVariantId), catalogVariantId: r.catalogVariantId ? Number(r.catalogVariantId) : null })),
    );
    return json({ ok: true, saved: n });
  }
  return json({ ok: false });
};

export default function PrintfulPage() {
  const data = useLoaderData<typeof loader>();
  const L = useDict(dict);
  const { lang } = useTranslation();
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; saved?: number }>();
  const [token, setToken] = useState("");
  const [catalogInput, setCatalogInput] = useState(String(data.catalog?.id ?? params.get("c") ?? ""));
  const [mapping, setMapping] = useState<Record<string, number | null>>(data.mapping);
  const defaultTechnique = data.technique || data.catalog?.techniques.find((t) => t.is_default)?.key || data.catalog?.techniques[0]?.key || "dtg";
  const [technique, setTechnique] = useState(defaultTechnique);
  useEffect(() => { setMapping(data.mapping); setTechnique(defaultTechnique); }, [data.mapping, defaultTechnique]);
  const busy = fetcher.state !== "idle";
  const submit = (fields: Record<string, string>) => fetcher.submit({ ...fields, _lang: lang }, { method: "POST" });

  return (
    <Page title={L.title} subtitle={L.subtitle}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{L.connectTitle}</Text>
              {fetcher.data?.error && <Banner tone="critical"><p>{fetcher.data.error}</p></Banner>}
              {data.connected ? (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Badge tone="success">{L.connected(data.storeName)}</Badge>
                    <Button tone="critical" variant="plain" loading={busy} onClick={() => submit({ intent: "disconnect" })}>{L.disconnect}</Button>
                  </InlineStack>
                  <Checkbox
                    label={L.autoDraft}
                    helpText={L.autoDraftHelp}
                    checked={data.autoDraft}
                    onChange={(on) => submit({ intent: "auto_draft", on: on ? "1" : "0" })}
                  />
                  {data.needsShopifyAccess && <Banner tone="info"><p>{L.accessNote}</p></Banner>}
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text as="p" tone="subdued">{L.connectHelp}</Text>
                  <TextField label={L.tokenLabel} value={token} onChange={setToken} type="password" autoComplete="off" />
                  <InlineStack align="end">
                    <Button variant="primary" loading={busy} disabled={!token.trim()} onClick={() => submit({ intent: "connect", token })}>{L.connect}</Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {data.connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">{L.mapTitle}</Text>
                  <Text as="p" tone="subdued">{L.mapHelp}</Text>
                </BlockStack>
                <InlineStack gap="300" blockAlign="end" wrap>
                  <Box minWidth="260px">
                    <Select
                      label={L.product}
                      value={data.selected}
                      options={[{ label: L.pickProduct, value: "" }, ...data.products.map((p) => ({ label: p.title, value: p.id }))]}
                      onChange={(v) => setParams(v ? { p: v } : {})}
                    />
                  </Box>
                  {data.selected && (
                    <>
                      <Box minWidth="160px">
                        <TextField label={L.catalogId} value={catalogInput} onChange={setCatalogInput} autoComplete="off" inputMode="numeric" />
                      </Box>
                      <Button onClick={() => setParams({ p: data.selected, c: catalogInput.trim() })} disabled={!/^\d+$/.test(catalogInput.trim())}>{L.load}</Button>
                    </>
                  )}
                </InlineStack>
                {data.catalogError && <Banner tone="critical"><p>{L.loadFailed}</p></Banner>}
                {data.catalog && (
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p" fontWeight="semibold">{data.catalog.name}</Text>
                      <Text as="p" tone="subdued">{L.autoMatched(data.matched, data.variants.length)}</Text>
                    </InlineStack>
                    <Box maxWidth="260px">
                      <Select
                        label={L.technique}
                        value={technique}
                        options={data.catalog.techniques.map((t) => ({ label: t.display_name, value: t.key }))}
                        onChange={setTechnique}
                      />
                    </Box>
                    <Divider />
                    {data.variants.map((v) => (
                      <InlineStack key={v.id} gap="300" blockAlign="center" wrap={false}>
                        <Box minWidth="200px"><Text as="span">{v.title}</Text></Box>
                        <Box minWidth="260px">
                          <Select
                            label={L.pfVariant}
                            labelHidden
                            value={String(mapping[v.id] ?? "")}
                            options={[{ label: L.notMapped, value: "" }, ...data.catalog!.variants.map((p) => ({ label: p.label, value: String(p.id) }))]}
                            onChange={(val) => setMapping((m) => ({ ...m, [v.id]: val ? Number(val) : null }))}
                          />
                        </Box>
                      </InlineStack>
                    ))}
                    {fetcher.data?.saved !== undefined && <Banner tone="success"><p>{L.saved(fetcher.data.saved)}</p></Banner>}
                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        loading={busy}
                        onClick={() => submit({
                          intent: "save_maps",
                          product: data.selected,
                          catalog: String(data.catalog!.id),
                          technique,
                          rows: JSON.stringify(data.variants.map((v) => ({ shopifyVariantId: v.id, catalogVariantId: mapping[v.id] ?? null }))),
                        })}
                      >
                        {L.save}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
