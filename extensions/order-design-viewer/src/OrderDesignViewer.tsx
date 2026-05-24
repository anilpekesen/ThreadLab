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

interface ApiResult {
  found: boolean;
  appOrderId?: string;
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

function OrderDesignViewer() {
  const api = useApi(TARGET);
  const { data } = api;

  const [design, setDesign] = useState<DesignInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const orderId = (data as { selected?: { id: string }[] }).selected?.[0]?.id ?? '';

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }

    const shopifyNumericId = orderId.includes('/') ? orderId.split('/').pop()! : orderId;

    fetch(`${APP_URL}/api/order-design?shopify_order_id=${shopifyNumericId}`)
      .then(async (res) => {
        if (!res.ok) { setLoading(false); return; }
        const apiData = await res.json() as ApiResult;
        if (!apiData.found) { setLoading(false); return; }

        const frontPreviewUrl = apiData.frontPreviewUrl ?? '';
        const backPreviewUrl  = apiData.backPreviewUrl  ?? '';
        const frontPrintUrl   = apiData.frontPrintUrl   ?? '';
        const backPrintUrl    = apiData.backPrintUrl    ?? '';
        const appOrderUrl     = apiData.appOrderUrl     ?? '';

        if (!frontPreviewUrl && !appOrderUrl) { setLoading(false); return; }

        setDesign({ frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl, appOrderUrl });
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

  if (!design) return null;

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {/* Preview images */}
        {(design.frontPreviewUrl || design.backPreviewUrl) && (
          <InlineStack gap="base">
            {design.frontPreviewUrl && (
              <BlockStack gap="tight">
                <Text tone="subdued">Ön Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.frontPreviewUrl} alt="Ön yüz önizlemesi" />
                </Box>
              </BlockStack>
            )}
            {design.backPreviewUrl && (
              <BlockStack gap="tight">
                <Text tone="subdued">Arka Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.backPreviewUrl} alt="Arka yüz önizlemesi" />
                </Box>
              </BlockStack>
            )}
          </InlineStack>
        )}

        {/* Print file downloads */}
        {(design.frontPrintUrl || design.backPrintUrl) && (
          <>
            <Divider />
            <BlockStack gap="tight">
              <Text tone="subdued">Baskı Dosyaları</Text>
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

        {/* Link to full order detail in app */}
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
