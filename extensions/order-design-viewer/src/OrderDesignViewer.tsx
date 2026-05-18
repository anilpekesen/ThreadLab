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
} from '@shopify/ui-extensions-react/admin';

const TARGET = 'admin.order-details.block.render';

export default reactExtension(TARGET, () => <OrderDesignViewer />);

interface Attribute { key: string; value: string; }
interface OrderResult {
  order: {
    customAttributes: Attribute[];
    lineItems: { nodes: { customAttributes: Attribute[] }[] };
  };
}

interface DesignInfo {
  frontPreviewUrl: string;
  backPreviewUrl: string;
  frontPrintUrl: string;
  backPrintUrl: string;
  designToken: string;
}

function getAttr(attrs: Attribute[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function extractDesign(attrs: Attribute[]): DesignInfo | null {
  const frontPreviewUrl = getAttr(attrs, '_front_preview_url');
  const designToken = getAttr(attrs, 'design_token');
  if (!frontPreviewUrl && !designToken) return null;
  return {
    frontPreviewUrl,
    backPreviewUrl: getAttr(attrs, '_back_preview_url'),
    frontPrintUrl: getAttr(attrs, '_front_print_url'),
    backPrintUrl: getAttr(attrs, '_back_print_url'),
    designToken,
  };
}

function OrderDesignViewer() {
  const api = useApi(TARGET);
  const { data } = api;
  const query = (api as unknown as { query: <T>(q: string, opts?: { variables?: Record<string, unknown> }) => Promise<{ data?: T; errors?: unknown[] }> }).query;

  const [design, setDesign] = useState<DesignInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const orderId = (data as { selected?: { id: string }[] }).selected?.[0]?.id ?? '';

  useEffect(() => {
    if (!orderId || !query) {
      setLoading(false);
      return;
    }

    query<OrderResult>(
      `query GetOrderAttrs($id: ID!) {
        order(id: $id) {
          customAttributes { key value }
          lineItems(first: 10) {
            nodes { customAttributes { key value } }
          }
        }
      }`,
      { variables: { id: orderId } },
    )
      .then(({ data: result }) => {
        if (!result?.order) { setLoading(false); return; }

        // Try order-level attributes first (cart attributes)
        let info = extractDesign(result.order.customAttributes ?? []);

        // Fall back to first line item that has design data
        if (!info) {
          for (const item of result.order.lineItems?.nodes ?? []) {
            info = extractDesign(item.customAttributes ?? []);
            if (info) break;
          }
        }

        setDesign(info);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <AdminBlock title="Baskı Tasarımı">
        <Text tone="subdued">Yükleniyor...</Text>
      </AdminBlock>
    );
  }

  if (!design) {
    return null;
  }

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {(design.frontPreviewUrl || design.backPreviewUrl) && (
          <InlineStack gap="base">
            {design.frontPreviewUrl && (
              <BlockStack gap="extraTight">
                <Text size="small" tone="subdued">Ön Yüz</Text>
                <Image
                  source={design.frontPreviewUrl}
                  alt="Ön yüz önizlemesi"
                  accessibilityDescription="Müşterinin ön yüz tasarımı"
                />
              </BlockStack>
            )}
            {design.backPreviewUrl && (
              <BlockStack gap="extraTight">
                <Text size="small" tone="subdued">Arka Yüz</Text>
                <Image
                  source={design.backPreviewUrl}
                  alt="Arka yüz önizlemesi"
                  accessibilityDescription="Müşterinin arka yüz tasarımı"
                />
              </BlockStack>
            )}
          </InlineStack>
        )}

        {(design.frontPrintUrl || design.backPrintUrl) && (
          <>
            <Divider />
            <InlineStack gap="base">
              {design.frontPrintUrl && (
                <Link url={design.frontPrintUrl} external>
                  ⬇ Ön Baskı Dosyası
                </Link>
              )}
              {design.backPrintUrl && (
                <Link url={design.backPrintUrl} external>
                  ⬇ Arka Baskı Dosyası
                </Link>
              )}
            </InlineStack>
          </>
        )}

        {design.designToken && (
          <Text size="small" tone="subdued">Tasarım ID: {design.designToken}</Text>
        )}

      </BlockStack>
    </AdminBlock>
  );
}
