import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineGrid,
  InlineStack,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { fetchShopifyProducts, getProductConfig } from "~/models/product-config.server";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  apparel: "T-shirt / giyim",
  sweatshirt: "Sweatshirt / hoodie",
  bag: "Canta",
  mug: "Bardak / kupa",
  boxer: "Baksir / boxer",
  other: "Diger",
};

function encodeProductToken(productId: string) {
  return Buffer.from(productId, "utf8").toString("base64url");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const products = await fetchShopifyProducts(admin, q);

  const rows = await Promise.all(products.map(async (product) => {
    const config = await getProductConfig(session.shop, product);
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: config.isActive,
      productType: config.productType,
      surfaceMode: config.surfaceMode,
      editUrl: `/app/products/${encodeProductToken(product.id)}`,
    };
  }));

  return json({ rows, q });
};

export default function ProductsIndexRoute() {
  const { rows, q } = useLoaderData<typeof loader>();
  const [query, setQuery] = useState(q);
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Page title={t("products.title")}>
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.products.1.title", bodyKey: "helper.products.1.body" },
          { titleKey: "helper.products.2.title", bodyKey: "helper.products.2.body" },
          { titleKey: "helper.products.3.title", bodyKey: "helper.products.3.body" },
          { titleKey: "helper.products.4.title", bodyKey: "helper.products.4.body" },
        ]} />
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="p" tone="subdued">{t("products.desc")}</Text>
              <Form method="get">
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ minWidth: 280 }}>
                    <TextField
                      label={t("products.searchPlaceholder")}
                      labelHidden
                      name="q"
                      value={query}
                      onChange={setQuery}
                      autoComplete="off"
                      placeholder={t("productTypes.categoryPlaceholder")}
                    />
                  </div>
                  <Button submit variant="primary">
                    Ara
                  </Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          {rows.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">
                Eslesen urun bulunamadi.
              </Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {rows.map((row, index) => (
                <div key={row.id}>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start" gap="300">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingMd">
                            {row.title}
                          </Text>
                          <Text as="p" tone="subdued">
                            {row.handle}
                          </Text>
                        </BlockStack>
                        <Badge tone={row.status ? "success" : "attention"}>
                          {row.status ? "Aktif" : "Pasif"}
                        </Badge>
                      </InlineStack>

                      <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Urun tipi
                          </Text>
                          <Text as="p">{PRODUCT_TYPE_LABELS[row.productType] ?? row.productType}</Text>
                        </BlockStack>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Baski yuzleri
                          </Text>
                          <Text as="p">{row.surfaceMode === "front_only" ? "Sadece on" : "On + arka"}</Text>
                        </BlockStack>
                      </InlineGrid>

                      <InlineStack gap="200">
                        <Button onClick={() => navigate(row.editUrl)} variant="primary">
                          Ayarları aç
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                  {index < rows.length - 1 ? <Divider /> : null}
                </div>
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
