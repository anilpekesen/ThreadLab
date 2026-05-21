import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, Box, Badge, Button,
  InlineStack, Divider, EmptyState, ProgressBar,
  Modal, TextField, Select, InlineGrid,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { runMigrations } from "~/lib/db.server";
import {
  getCategoriesForShop, canCreateCategory, createCategory, deleteCategory,
} from "~/models/product-categories.server";
import { PLANS } from "~/lib/plans";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  apparel: "T-shirt / Giyim",
  sweatshirt: "Sweatshirt / Hoodie",
  bag: "Bez çanta",
  mug: "Kupa bardak",
  boxer: "Baksır / Boxer",
  other: "Diğer",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await runMigrations();
  const [categories, quota] = await Promise.all([
    getCategoriesForShop(session.shop),
    canCreateCategory(session.shop),
  ]);
  return json({ categories, quota });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const quota = await canCreateCategory(shop);
    if (!quota.allowed) return json({ error: "Plan limitine ulaştınız" }, { status: 403 });
    const category = await createCategory(shop, {
      name: String(form.get("name") || "").trim() || "Yeni Kategori",
      product_type: String(form.get("product_type") || "apparel"),
      surface_mode: (form.get("surface_mode") as "front_only" | "front_back") ?? "front_back",
    });
    return redirect(`/app/categories/${category.id}`);
  }

  if (intent === "delete") {
    const id = form.get("id") as string;
    await deleteCategory(id, shop);
    return json({ ok: true });
  }

  return json({ ok: true });
};

export default function CategoriesIndex() {
  const { categories, quota } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const isSubmitting = nav.state === "submitting";

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("apparel");
  const [newSurface, setNewSurface] = useState("front_back");

  const limitLabel = quota.limit === -1 ? "Sınırsız" : String(quota.limit);
  const usagePercent = quota.limit === -1 ? 0 : Math.round((quota.used / quota.limit) * 100);
  const planInfo = PLANS[quota.planKey];

  return (
    <Page
      title="Ürün Kategorileri"
      primaryAction={{
        content: "Yeni Kategori",
        disabled: !quota.allowed,
        onAction: () => setShowCreate(true),
      }}
    >
      <BlockStack gap="500">

        {/* Plan kullanım */}
        <Card>
          <Box padding="400">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Kategori Kullanımı</Text>
                  <Badge>{quota.planKey}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm">
                  <strong>{quota.used}</strong> / {limitLabel}
                </Text>
              </InlineStack>
              {quota.limit !== -1 && (
                <ProgressBar
                  progress={Math.min(usagePercent, 100)}
                  tone={usagePercent >= 100 ? "critical" : usagePercent >= 80 ? "highlight" : "primary"}
                  size="small"
                />
              )}
              {!quota.allowed && (
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="caution">
                    {quota.planKey} planında maksimum {quota.limit} kategori oluşturabilirsiniz.
                  </Text>
                  <Button size="slim" onClick={() => navigate("/app/billing")} variant="plain">
                    Plan yükselt →
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Kategori listesi */}
        <Card>
          {categories.length === 0 ? (
            <EmptyState
              heading="Henüz kategori oluşturmadınız"
              action={{ content: "Yeni Kategori Oluştur", onAction: () => setShowCreate(true), disabled: !quota.allowed }}
              image=""
            >
              <p>Her kategori bir Shopify ürününe bağlanır. Paketinize göre {limitLabel} kategori oluşturabilirsiniz.</p>
            </EmptyState>
          ) : (
            <BlockStack>
              {categories.map((cat, index) => (
                <div key={cat.id}>
                  <Box padding="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{cat.name}</Text>
                          <Badge>{PRODUCT_TYPE_LABELS[cat.product_type] ?? cat.product_type}</Badge>
                          <Badge tone={cat.surface_mode === "front_back" ? "info" : "attention"}>
                            {cat.surface_mode === "front_back" ? "Ön + Arka" : "Sadece Ön"}
                          </Badge>
                        </InlineStack>
                        {cat.shopify_product_title ? (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Ürün: <strong>{cat.shopify_product_title}</strong>
                          </Text>
                        ) : (
                          <Text as="p" variant="bodySm" tone="caution">Henüz ürün atanmadı</Text>
                        )}
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button onClick={() => navigate(`/app/categories/${cat.id}`)} variant="primary" size="slim">
                          Düzenle
                        </Button>
                        {cat.shopify_product_id && (
                          <Button
                            onClick={() => {
                              const encoded = Buffer.from(cat.shopify_product_id!, "utf8").toString("base64url");
                              navigate(`/app/products/${encoded}`);
                            }}
                            size="slim"
                          >
                            Baskı Alanı
                          </Button>
                        )}
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={cat.id} />
                          <Button tone="critical" variant="plain" size="slim" submit loading={isSubmitting}>
                            Sil
                          </Button>
                        </Form>
                      </InlineStack>
                    </InlineStack>
                  </Box>
                  {index < categories.length - 1 && <Divider />}
                </div>
              ))}
            </BlockStack>
          )}
        </Card>

      </BlockStack>

      {/* Yeni Kategori Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Yeni Kategori Oluştur"
        primaryAction={{
          content: "Oluştur",
          loading: isSubmitting,
          onAction: () => {
            const form = document.getElementById("create-category-form") as HTMLFormElement;
            form?.requestSubmit();
          },
        }}
        secondaryActions={[{ content: "İptal", onAction: () => setShowCreate(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="create-category-form">
            <input type="hidden" name="intent" value="create" />
            <BlockStack gap="400">
              <TextField
                label="Kategori Adı"
                name="name"
                value={newName}
                onChange={setNewName}
                placeholder="örn. Erkek T-Shirt, Sweatshirt Serisi..."
                autoComplete="off"
              />
              <InlineGrid columns={2} gap="400">
                <Select
                  label="Ürün Tipi"
                  name="product_type"
                  value={newType}
                  onChange={setNewType}
                  options={[
                    { label: "T-shirt / Giyim", value: "apparel" },
                    { label: "Sweatshirt / Hoodie", value: "sweatshirt" },
                    { label: "Bez çanta", value: "bag" },
                    { label: "Kupa bardak", value: "mug" },
                    { label: "Baksır / Boxer", value: "boxer" },
                    { label: "Diğer", value: "other" },
                  ]}
                />
                <Select
                  label="Baskı Yüzü"
                  name="surface_mode"
                  value={newSurface}
                  onChange={setNewSurface}
                  options={[
                    { label: "Ön + Arka Yüz", value: "front_back" },
                    { label: "Sadece Ön Yüz", value: "front_only" },
                  ]}
                />
              </InlineGrid>
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
