import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, Box, Badge, Button,
  InlineStack, TextField, Select, Divider, Thumbnail,
  ResourceList, ResourceItem, Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { getProductTypeById, updateProductType } from "~/models/product-types.server";
import { fetchShopifyProducts, saveProductConfig, buildDefaultConfig, normalizeProductConfig } from "~/models/product-config.server";
import type { SurfaceMode } from "~/models/product-config.server";
import { normalizeProductType } from "~/models/product-config.server";

const TYPE_SUGGESTIONS = ["Tişört", "Sweatshirt", "Hoodie", "Polo", "Bez Çanta", "Kupa", "Boxer", "Şort", "Diğer"];

function PrintTypeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
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
      />
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
    </BlockStack>
  );
}

function encodeProductToken(productId: string) {
  return Buffer.from(productId, "utf8").toString("base64url");
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const productTypeId = params.productTypeId!;

  const productType = await getProductTypeById(productTypeId, shop);
  if (!productType) throw new Response("Ürün tipi bulunamadı", { status: 404 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const products = await fetchShopifyProducts(admin, q);

  return json({ productType, products, q });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const productTypeId = params.productTypeId!;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "update") {
    const name = String(form.get("name") || "").trim() || undefined;
    await updateProductType(productTypeId, shop, {
      name,
      product_type: name,
      surface_mode: (form.get("surface_mode") as "front_only" | "front_back") || undefined,
    });
    return json({ saved: true });
  }

  if (intent === "assign_product") {
    const productId = form.get("productId") as string;
    const productTitle = form.get("productTitle") as string;
    const productHandle = form.get("productHandle") as string;
    const typeName = form.get("type_name") as string;
    const surfaceMode = (form.get("surface_mode") as SurfaceMode) || "front_back";

    await updateProductType(productTypeId, shop, {
      shopify_product_id: productId,
      shopify_product_title: productTitle,
      shopify_product_handle: productHandle,
    });

    // Activate product in designer — does NOT touch pricingBands or surchargeVariantId
    const productStub = { id: productId, title: productTitle, handle: productHandle, productType: "", status: "", images: [], variants: [] };
    const defaultCfg = buildDefaultConfig(productStub);
    const productType = normalizeProductType(typeName);
    const cfg = normalizeProductConfig({ isActive: true, productType, surfaceMode, productTitle, productHandle }, defaultCfg);
    await saveProductConfig(productId, cfg);

    return json({ saved: true });
  }

  if (intent === "remove_product") {
    await updateProductType(productTypeId, shop, {
      shopify_product_id: null,
      shopify_product_title: null,
      shopify_product_handle: null,
    });
    return json({ saved: true });
  }

  return json({ ok: true });
};

export default function ProductTypeDetail() {
  const { productType, products, q } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const isSaving = nav.state === "submitting";

  const [name, setName] = useState(productType.name);
  const [surfaceMode, setSurfaceMode] = useState<"front_only" | "front_back">(productType.surface_mode);
  const [search, setSearch] = useState(q);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <Page
      title={productType.name}
      backAction={{ content: "Ürün Tipleri", onAction: () => navigate("/app/product-types") }}
    >
      <BlockStack gap="500">

        {/* Temel Ayarlar */}
        <Card>
          <Box padding="400">
            <Form method="post">
              <input type="hidden" name="intent" value="update" />
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Ürün Tipi Ayarları</Text>
                <PrintTypeField value={name} onChange={setName} />
                <Select
                  label="Baskı Yüzü"
                  name="surface_mode"
                  value={surfaceMode}
                  onChange={(v) => setSurfaceMode(v as "front_only" | "front_back")}
                  options={[
                    { label: "Ön + Arka Yüz", value: "front_back" },
                    { label: "Sadece Ön Yüz", value: "front_only" },
                  ]}
                />
                <InlineStack align="end">
                  <Button submit variant="primary" loading={isSaving}>Kaydet</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </Box>
        </Card>

        {/* Ürün Atama */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Shopify Ürünü</Text>
                {productType.shopify_product_id && (
                  <Form method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="intent" value="remove_product" />
                    <Button tone="critical" variant="plain" size="slim" submit>Ürünü Kaldır</Button>
                  </Form>
                )}
              </InlineStack>

              {productType.shopify_product_id ? (
                <BlockStack gap="300">
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone="success">Atandı</Badge>
                    <Text as="p" fontWeight="semibold">{productType.shopify_product_title}</Text>
                  </InlineStack>
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Baskı alanı, fiyatlandırma bantları ve tasarım ücretini aşağıdaki sayfadan yapılandırın.
                    </Text>
                  </Banner>
                  <Button
                    onClick={() => navigate(`/app/products/${encodeProductToken(productType.shopify_product_id!)}`)}
                    variant="primary"
                  >
                    Baskı Alanı &amp; Tasarım Ücreti →
                  </Button>
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text as="p" tone="subdued">Bu ürün tipine bir Shopify ürünü atayın. Her ürün tipine 1 ürün atanabilir.</Text>
                  <Button onClick={() => setShowSearch(true)} variant="secondary">
                    Ürün Seç
                  </Button>
                </BlockStack>
              )}
            </BlockStack>
          </Box>

          {/* Ürün arama */}
          {showSearch && (
            <>
              <Divider />
              <Box padding="400">
                <BlockStack gap="300">
                  <Form method="get">
                    <InlineStack gap="200">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label=""
                          labelHidden
                          name="q"
                          value={search}
                          onChange={setSearch}
                          placeholder="Ürün adı veya handle ile ara..."
                          autoComplete="off"
                          connectedRight={<Button submit>Ara</Button>}
                        />
                      </div>
                    </InlineStack>
                  </Form>

                  <ResourceList
                    resourceName={{ singular: "ürün", plural: "ürün" }}
                    items={products}
                    renderItem={(product) => (
                      <ResourceItem
                        id={product.id}
                        media={
                          product.featuredImage ? (
                            <Thumbnail source={product.featuredImage} alt={product.title} size="small" />
                          ) : undefined
                        }
                        onClick={() => {}}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{product.handle}</Text>
                          </BlockStack>
                          <Form method="post">
                            <input type="hidden" name="intent" value="assign_product" />
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="productTitle" value={product.title} />
                            <input type="hidden" name="productHandle" value={product.handle} />
                            <input type="hidden" name="type_name" value={name} />
                            <input type="hidden" name="surface_mode" value={surfaceMode} />
                            <Button submit variant="primary" size="slim" loading={isSaving}>Seç</Button>
                          </Form>
                        </InlineStack>
                      </ResourceItem>
                    )}
                  />
                </BlockStack>
              </Box>
            </>
          )}
        </Card>

      </BlockStack>
    </Page>
  );
}
