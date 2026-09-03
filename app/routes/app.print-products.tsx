import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, EmptyState, Banner, Divider, TextField, Select, FormLayout,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  listPrintProducts,
  createPrintProduct,
  updatePrintProduct,
  deletePrintProduct,
  seedPrintProducts,
} from "~/models/print-product.server";
import { printCanvas, aspectLabel, type PrintProduct } from "~/lib/print-spec";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const products = await listPrintProducts(session.shop);
  return json({ products });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "seed") {
    const created = await seedPrintProducts(shop);
    return json({ ok: true, seeded: created.length });
  }

  if (intent === "delete") {
    await deletePrintProduct(String(form.get("id") ?? ""), shop);
    return json({ ok: true });
  }

  if (intent === "toggle") {
    await updatePrintProduct(String(form.get("id") ?? ""), shop, {
      active: form.get("active") === "true",
    });
    return json({ ok: true });
  }

  if (intent === "save") {
    const num = (key: string, fallback: number) => {
      const v = Number(String(form.get(key) ?? "").replace(",", "."));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };
    const input = {
      name: String(form.get("name") ?? "").trim() || "Adsız ebat",
      width_mm: num("width_mm", 200),
      height_mm: num("height_mm", 200),
      dpi: Math.round(num("dpi", 300)),
      // Taşma sıfır olabilir; num() sıfırı reddettiği için ayrı okunuyor
      bleed_mm: Math.max(0, Number(String(form.get("bleed_mm") ?? "3").replace(",", ".")) || 0),
      safe_mm: Math.max(0, Number(String(form.get("safe_mm") ?? "5").replace(",", ".")) || 0),
      wrap: String(form.get("wrap") ?? "flat") === "cylindrical" ? ("cylindrical" as const) : ("flat" as const),
      mockup_url: String(form.get("mockup_url") ?? "").trim(),
    };
    const id = String(form.get("id") ?? "");
    if (id) await updatePrintProduct(id, shop, input);
    else await createPrintProduct(shop, input);
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

const EMPTY_DRAFT = {
  id: "",
  name: "",
  width_mm: "200",
  height_mm: "200",
  dpi: "300",
  bleed_mm: "3",
  safe_mm: "5",
  wrap: "flat",
  mockup_url: "",
};

type Draft = typeof EMPTY_DRAFT;

export default function PrintProductsPage() {
  const { products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [draft, setDraft] = useState<Draft | null>(null);

  const busy = fetcher.state !== "idle";

  function edit(p: PrintProduct) {
    setDraft({
      id: p.id,
      name: p.name,
      width_mm: String(p.width_mm),
      height_mm: String(p.height_mm),
      dpi: String(p.dpi),
      bleed_mm: String(p.bleed_mm),
      safe_mm: String(p.safe_mm),
      wrap: p.wrap,
      mockup_url: p.mockup_url,
    });
  }

  function save() {
    if (!draft) return;
    fetcher.submit({ intent: "save", ...draft }, { method: "POST" });
    setDraft(null);
  }

  function remove(p: PrintProduct) {
    if (!confirm(`"${p.name}" ebadını silmek istediğinize emin misiniz?`)) return;
    fetcher.submit({ intent: "delete", id: p.id }, { method: "POST" });
  }

  // Taslak ölçüleri anında tuvale çevrilir; mağaza sahibi kaydetmeden önce
  // üretilecek dosyanın gerçek boyutunu görür.
  const preview = draft
    ? printCanvas({
        width_mm: Number(draft.width_mm) || 0,
        height_mm: Number(draft.height_mm) || 0,
        dpi: Number(draft.dpi) || 300,
        bleed_mm: Number(draft.bleed_mm) || 0,
        safe_mm: Number(draft.safe_mm) || 0,
      })
    : null;

  return (
    <Page
      title="Baskı ebatları"
      subtitle="Bir tasarımın fiziksel karşılığı: ölçü, çözünürlük ve taşma payı. Şablonlar bu ebatlara bağlanır."
      primaryAction={{
        content: "Yeni ebat",
        onAction: () => setDraft({ ...EMPTY_DRAFT }),
        disabled: busy,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>
                Aynı şablon, <b>aynı en-boy oranındaki</b> her ebatta çalışır. 20×20 ile 30×30 aynı
                şablonu paylaşır; 30×40 ile 50×70 paylaşamaz çünkü oranları farklıdır.
              </p>
            </Banner>

            {draft && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    {draft.id ? "Ebadı düzenle" : "Yeni ebat"}
                  </Text>
                  <FormLayout>
                    <TextField
                      label="Ad"
                      value={draft.name}
                      onChange={(v) => setDraft({ ...draft, name: v })}
                      placeholder="Yapışan çerçeve 20x20"
                      autoComplete="off"
                    />
                    <FormLayout.Group>
                      <TextField
                        label="Genişlik (mm)"
                        type="number"
                        value={draft.width_mm}
                        onChange={(v) => setDraft({ ...draft, width_mm: v })}
                        autoComplete="off"
                      />
                      <TextField
                        label="Yükseklik (mm)"
                        type="number"
                        value={draft.height_mm}
                        onChange={(v) => setDraft({ ...draft, height_mm: v })}
                        autoComplete="off"
                      />
                      <TextField
                        label="Çözünürlük (dpi)"
                        type="number"
                        value={draft.dpi}
                        onChange={(v) => setDraft({ ...draft, dpi: v })}
                        autoComplete="off"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Taşma payı (mm)"
                        type="number"
                        value={draft.bleed_mm}
                        onChange={(v) => setDraft({ ...draft, bleed_mm: v })}
                        helpText="Kesimdeki kaymayı tolere eder"
                        autoComplete="off"
                      />
                      <TextField
                        label="Güvenli alan (mm)"
                        type="number"
                        value={draft.safe_mm}
                        onChange={(v) => setDraft({ ...draft, safe_mm: v })}
                        helpText="Yazı ve fotoğraf bu alanın içinde kalmalı"
                        autoComplete="off"
                      />
                      <Select
                        label="Baskı türü"
                        options={[
                          { label: "Düz (çerçeve, poster, kanvas)", value: "flat" },
                          { label: "Silindirik (kupa)", value: "cylindrical" },
                        ]}
                        value={draft.wrap}
                        onChange={(v) => setDraft({ ...draft, wrap: v })}
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Ürün görseli (mockup) URL"
                      value={draft.mockup_url}
                      onChange={(v) => setDraft({ ...draft, mockup_url: v })}
                      helpText="Boş bırakılabilir"
                      autoComplete="off"
                    />
                  </FormLayout>

                  {preview && preview.canvasWidth > 0 && (
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm">
                          <b>Üretilecek dosya:</b> {preview.canvasWidth} × {preview.canvasHeight} px
                          {"  ·  "}oran {aspectLabel(preview.aspect)}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Kesim {preview.trim.width} × {preview.trim.height} px, güvenli alan{" "}
                          {preview.safe.width} × {preview.safe.height} px
                        </Text>
                      </BlockStack>
                    </Box>
                  )}

                  <InlineStack gap="200">
                    <Button variant="primary" onClick={save} loading={busy}>Kaydet</Button>
                    <Button onClick={() => setDraft(null)}>Vazgeç</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            <Card padding="0">
              {products.length === 0 ? (
                <EmptyState
                  heading="Henüz baskı ebadı yok"
                  action={{
                    content: "Yaygın ebatları ekle",
                    onAction: () => fetcher.submit({ intent: "seed" }, { method: "POST" }),
                    loading: busy,
                  }}
                  secondaryAction={{ content: "Kendim ekleyeyim", onAction: () => setDraft({ ...EMPTY_DRAFT }) }}
                  image=""
                >
                  <p>
                    Çerçeve, poster, kanvas ve kupa için yaygın ebatları tek tıkla ekleyebilir,
                    sonra istediğinizi değiştirebilirsiniz.
                  </p>
                </EmptyState>
              ) : (
                <BlockStack gap="0">
                  {products.map((p, i) => {
                    const c = printCanvas(p);
                    return (
                      <Box key={p.id}>
                        {i > 0 && <Divider />}
                        <Box padding="400">
                          <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="headingSm">{p.name}</Text>
                                <Badge tone={p.active ? "success" : undefined}>
                                  {p.active ? "Yayında" : "Kapalı"}
                                </Badge>
                                <Badge>{aspectLabel(c.aspect)}</Badge>
                                {p.wrap === "cylindrical" && <Badge tone="attention">Silindirik</Badge>}
                              </InlineStack>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {p.width_mm} × {p.height_mm} mm @ {p.dpi} dpi
                                {"  ·  "}dosya {c.canvasWidth} × {c.canvasHeight} px
                                {"  ·  "}taşma {p.bleed_mm} mm
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" wrap={false}>
                              <Button
                                onClick={() =>
                                  fetcher.submit(
                                    { intent: "toggle", id: p.id, active: String(!p.active) },
                                    { method: "POST" },
                                  )
                                }
                                disabled={busy}
                              >
                                {p.active ? "Kapat" : "Yayınla"}
                              </Button>
                              <Button onClick={() => edit(p)} disabled={busy}>Düzenle</Button>
                              <Button tone="critical" variant="plain" onClick={() => remove(p)} disabled={busy}>
                                Sil
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </Box>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
