import { useEffect, useState } from 'react';
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Text,
  Image,
  Link,
  Divider,
  Box,
} from '@shopify/ui-extensions-react/admin';

const TARGET = 'admin.order-details.block.render';
const APP_URL = 'https://app.printlabapp.com';

export default reactExtension(TARGET, () => <OrderDesignViewer />);

interface Attribute { key: string; value: string; }

interface OrderResult {
  order: {
    customAttributes: Attribute[];
    lineItems: { nodes: { customAttributes: Attribute[] }[] };
  };
}

interface ApiResult {
  found: boolean;
  appOrderUrl?: string;
  frontPreviewUrl?: string | null;
  backPreviewUrl?: string | null;
  frontPrintUrl?: string | null;
  backPrintUrl?: string | null;
}

interface DesignInfo {
  frontPreviewUrl: string;
  backPreviewUrl: string;
  frontPrintUrl: string;
  backPrintUrl: string;
  appOrderUrl: string;
}

function downloadUrl(fileUrl: string, filename: string): string {
  if (fileUrl.startsWith('data:')) return fileUrl;
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

function getAttr(attrs: Attribute[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function OrderDesignViewer() {
  const api = useApi(TARGET);
  const { data } = api;
  const query = (api as unknown as {
    query: <T>(q: string, opts?: { variables?: Record<string, unknown> }) => Promise<{ data?: T }>;
  }).query;

  const [design, setDesign] = useState<DesignInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const orderId = (data as { selected?: { id: string }[] }).selected?.[0]?.id ?? '';

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }

    const shopifyNumericId = orderId.includes('/') ? orderId.split('/').pop()! : orderId;

    const run = async () => {
      // Step 1: Get custom attrs via GraphQL (for image fallback)
      let attrs: Attribute[] = [];
      if (query) {
        try {
          const { data: result } = await query<OrderResult>(
            `query GetOrderAttrs($id: ID!) {
              order(id: $id) {
                customAttributes { key value }
                lineItems(first: 10) { nodes { customAttributes { key value } } }
              }
            }`,
            { variables: { id: orderId } },
          );
          if (result?.order) {
            attrs = result.order.customAttributes ?? [];
            if (!getAttr(attrs, '_front_preview_url')) {
              for (const item of result.order.lineItems?.nodes ?? []) {
                if (getAttr(item.customAttributes, '_front_preview_url')) {
                  attrs = item.customAttributes;
                  break;
                }
              }
            }
          }
        } catch { /* ignore, will use API */ }
      }

      // Step 2: Fetch from our API (returns appOrderUrl + high-quality URLs)
      let apiData: ApiResult | null = null;
      try {
        const apiRes = await fetch(
          `${APP_URL}/api/order-design?shopify_order_id=${shopifyNumericId}`,
        );
        if (apiRes.ok) apiData = await apiRes.json() as ApiResult;
      } catch { /* fall through to custom attrs */ }

      // Merge: API takes priority, custom attrs as fallback
      const frontPreviewUrl = apiData?.frontPreviewUrl || getAttr(attrs, '_front_preview_url') || '';
      const backPreviewUrl  = apiData?.backPreviewUrl  || getAttr(attrs, '_back_preview_url')  || '';
      const frontPrintUrl   = apiData?.frontPrintUrl   || getAttr(attrs, '_front_print_url')   || '';
      const backPrintUrl    = apiData?.backPrintUrl    || getAttr(attrs, '_back_print_url')    || '';
      const appOrderUrl     = apiData?.appOrderUrl     ?? '';

      if (!frontPreviewUrl && !appOrderUrl) { setLoading(false); return; }

      setDesign({ frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl, appOrderUrl });
      setLoading(false);
    };

    run().catch(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <AdminBlock title="Baskı Tasarımı">
        <Text>Yükleniyor...</Text>
      </AdminBlock>
    );
  }

  if (!design) return null;

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {(design.frontPreviewUrl || design.backPreviewUrl) && (
          <InlineStack gap="base">
            {design.frontPreviewUrl && (
              <BlockStack>
                <Text>Ön Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.frontPreviewUrl} alt="Ön yüz önizlemesi" />
                </Box>
              </BlockStack>
            )}
            {design.backPreviewUrl && (
              <BlockStack>
                <Text>Arka Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.backPreviewUrl} alt="Arka yüz önizlemesi" />
                </Box>
              </BlockStack>
            )}
          </InlineStack>
        )}

        {(design.frontPrintUrl || design.backPrintUrl) && (
          <>
            <Divider />
            <BlockStack>
              <Text>Baskı Dosyaları</Text>
              <InlineStack gap="base">
                {design.frontPrintUrl && (
                  <Link href={downloadUrl(design.frontPrintUrl, 'on-baski.png')} target="_blank">⬇ Ön Baskı İndir</Link>
                )}
                {design.backPrintUrl && (
                  <Link href={downloadUrl(design.backPrintUrl, 'arka-baski.png')} target="_blank">⬇ Arka Baskı İndir</Link>
                )}
              </InlineStack>
            </BlockStack>
          </>
        )}

        {design.appOrderUrl && (
          <>
            <Divider />
            <Link href={design.appOrderUrl} target="_blank">Sipariş detaylarını ve görselleri gör →</Link>
          </>
        )}

      </BlockStack>
    </AdminBlock>
  );
}
