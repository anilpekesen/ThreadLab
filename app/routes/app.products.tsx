import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Badge,
  Box,
  Button,
  Card,
  DataTable,
  InlineStack,
  Page,
  Text,
  TextField,
  BlockStack,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import { fetchShopifyProducts, getProductConfig } from "~/models/product-config.server";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  apparel: "Tisort / giyim",
  sweatshirt: "Sweatshirt / hoodie",
  bag: "Canta",
  mug: "Bardak / kupa",
  boxer: "Baksir / boxer",
  other: "Diger",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appBlockHandle = "tshirt-designer";
  const products = await fetchShopifyProducts(admin, q);

  const rows = products.map((product) => {
    const config = getProductConfig(product);
    const themeUrl = apiKey
      ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=mainSection`
      : null;

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: config.isActive,
      productType: config.productType,
      surfaceMode: config.surfaceMode,
      editUrl: `/app/products/${encodeURIComponent(product.id)}`,
      themeUrl,
    };
  });

  return json({ rows, q });
};

export default function ProductsRoute() {
  const { rows, q } = useLoaderData<typeof loader>();
  const [query, setQuery] = useState(q);

  const tableRows = rows.map((row) => [
    row.title,
    row.handle,
    <Badge tone={row.status ? "success" : "attention"}>
      {row.status ? "Aktif" : "Pasif"}
    </Badge>,
    PRODUCT_TYPE_LABELS[row.productType] ?? row.productType,
    row.surfaceMode === "front_only" ? "Sadece on" : "On + arka",
    <InlineStack gap="200">
      <Button url={row.editUrl} size="slim">
        Ayarlar
      </Button>
      {row.themeUrl ? (
        <Button url={row.themeUrl} target="_blank" size="slim">
          Tema
        </Button>
      ) : null}
    </InlineStack>,
  ]);

  return (
    <Page title="Urunler">
      <BlockStack gap="500">
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                Sinirsiz urun mantigi burada yonetilir. Shopify'daki herhangi bir urunu tasarim urunu yapip
                urune ozel ayar tanimlayabilirsin.
              </Text>
              <Form method="get">
                <InlineStack gap="200" blockAlign="end">
                  <div style={{ minWidth: 280 }}>
                    <TextField
                      label="Urun ara"
                      labelHidden
                      name="q"
                      value={query}
                      onChange={setQuery}
                      autoComplete="off"
                      placeholder="Tisort, sweatshirt, kupa, canta..."
                    />
                  </div>
                  <Button submit variant="primary">Ara</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          {tableRows.length === 0 ? (
            <Box padding="400">
              <Text as="p" tone="subdued">Eslesen urun bulunamadi.</Text>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["Urun", "Handle", "Durum", "Tip", "Yuz", "Islem"]}
              rows={tableRows}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
