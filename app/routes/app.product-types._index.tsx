import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Card, Text, BlockStack, Box, Badge, Button,
  InlineStack, Divider, EmptyState, ProgressBar,
  Modal, TextField, Select, InlineGrid,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { runMigrations } from "~/lib/db.server";
import {
  getProductTypesForShop, canCreateProductType, createProductType, deleteProductType,
} from "~/models/product-types.server";
import { PLANS } from "~/lib/plans";

const TYPE_SUGGESTIONS = ["Tişört", "Sweatshirt", "Hoodie", "Polo", "Bez Çanta", "Kupa", "Boxer", "Şort", "Diğer"];

function PrintTypeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <BlockStack gap="200">
      <TextField
        label="Ürün Tipi Adı"
        name="name"
        value={value}
        onChange={onChange}
        autoComplete="off"
        placeholder="örn. Tişört, Sweatshirt, Kupa..."
        helpText="İstediğiniz ismi yazabilirsiniz."
        disabled={disabled}
      />
      {!disabled && (
        <InlineStack gap="150" wrap>
          {TYPE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              style={{
                padding: "2px 10px",
                borderRadius: 20,
                border: "1px solid #d1d5db",
                background: value === s ? "#e0e7ff" : "#f9fafb",
                color: value === s ? "#4f46e5" : "#374151",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: value === s ? 600 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </InlineStack>
      )}
    </BlockStack>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await runMigrations();
  const [productTypes, quota] = await Promise.all([
    getProductTypesForShop(session.shop),
    canCreateProductType(session.shop),
  ]);
  return json({ productTypes, quota });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const quota = await canCreateProductType(shop);
    if (!quota.allowed) return json({ error: "Plan limitine ulaştınız" }, { status: 403 });
    const pt = await createProductType(shop, {
      name: String(form.get("name") || "").trim() || "Yeni Ürün Tipi",
      product_type: String(form.get("name") || "apparel"),
      surface_mode: (form.get("surface_mode") as "front_only" | "front_back") ?? "front_back",
    });
    return redirect(`/app/product-types/${pt.id}`);
  }

  if (intent === "delete") {
    const id = form.get("id") as string;
    await deleteProductType(id, shop);
    return json({ ok: true });
  }

  return json({ ok: true });
};

export default function ProductTypesIndex() {
  const { productTypes, quota } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const { t } = useTranslation();
  const isSubmitting = nav.state === "submitting";

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSurface, setNewSurface] = useState("front_back");

  const limitLabel = quota.limit === -1 ? t("common.unlimited") : String(quota.limit);
  const usagePercent = quota.limit === -1 ? 0 : Math.round((quota.used / quota.limit) * 100);

  return (
    <Page
      title="Baskı Ayarı"
      primaryAction={{
        content: t("productTypes.newType"),
        disabled: !quota.allowed,
        onAction: () => setShowCreate(true),
      }}
    >
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.productTypes.1.title", bodyKey: "helper.productTypes.1.body" },
          { titleKey: "helper.productTypes.2.title", bodyKey: "helper.productTypes.2.body" },
        ]} />

        {/* Plan kullanım */}
        <Card>
          <Box padding="400">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Ürün Tipi Kullanımı</Text>
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
                    {quota.planKey} planında maksimum {quota.limit} ürün tipi oluşturabilirsiniz.
                  </Text>
                  <Button size="slim" onClick={() => navigate("/app/billing")} variant="plain">
                    Plan yükselt →
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Ürün tipi listesi */}
        <Card>
          {productTypes.length === 0 ? (
            <EmptyState
              heading={t("productTypes.noTypes")}
              action={{ content: t("productTypes.newType"), onAction: () => setShowCreate(true), disabled: !quota.allowed  }}
              image=""
            >
              <p>Her ürün tipi bir Shopify ürününe bağlanır. {limitLabel} ürün tipi oluşturabilirsiniz.</p>
            </EmptyState>
          ) : (
            <BlockStack>
              {productTypes.map((pt, index) => (
                <div key={pt.id}>
                  <Box padding="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">{pt.name}</Text>
                          <Badge tone={pt.surface_mode === "front_back" ? "info" : "attention"}>
                            {pt.surface_mode === "front_back" ? t("productTypes.frontAndBack") : t("productTypes.frontOnly")}
                          </Badge>
                        </InlineStack>
                        {pt.shopify_product_title ? (
                          <Text as="p" variant="bodySm" tone="subdued">
                            Ürün: <strong>{pt.shopify_product_title}</strong>
                          </Text>
                        ) : (
                          <Text as="p" variant="bodySm" tone="caution">Henüz ürün atanmadı</Text>
                        )}
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button onClick={() => navigate(`/app/product-types/${pt.id}`)} variant="primary" size="slim">
                          Düzenle
                        </Button>
                        {pt.shopify_product_id && (
                          <Button
                            onClick={() => {
                              const encoded = btoa(pt.shopify_product_id!).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                              navigate(`/app/products/${encoded}`);
                            }}
                            size="slim"
                          >
                            Baskı Alanı
                          </Button>
                        )}
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={pt.id} />
                          <Button tone="critical" variant="plain" size="slim" submit loading={isSubmitting}>
                            Sil
                          </Button>
                        </Form>
                      </InlineStack>
                    </InlineStack>
                  </Box>
                  {index < productTypes.length - 1 && <Divider />}
                </div>
              ))}
            </BlockStack>
          )}
        </Card>

      </BlockStack>

      {/* Yeni Ürün Tipi Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t("productTypes.newType")}
        primaryAction={{
          content: t("common.create"),
          loading: isSubmitting,
          onAction: () => {
            const form = document.getElementById("create-product-type-form") as HTMLFormElement;
            form?.requestSubmit();
          },
        }}
        secondaryActions={[{ content: t("common.cancel"), onAction: () => setShowCreate(false) }]}
      >
        <Modal.Section>
          <Form method="post" id="create-product-type-form">
            <input type="hidden" name="intent" value="create" />
            <BlockStack gap="400">
              <PrintTypeField value={newName} onChange={setNewName} />
              <Select
                label={t("productTypes.printSurface")}
                name="surface_mode"
                value={newSurface}
                onChange={setNewSurface}
                options={[
                  { label: t("productTypes.frontAndBack"), value: "front_back" },
                  { label: t("productTypes.frontOnly"), value: "front_only" },
                ]}
              />
            </BlockStack>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
