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
const APP_URL = 'https://app.printlabapp.com';

export default reactExtension(TARGET, () => <OrderDesignViewer />);

interface DesignData {
  found: boolean;
  orderNumber?: string;
  productName?: string;
  designToken?: string;
  productionStatus?: string;
  frontPreviewUrl?: string | null;
  backPreviewUrl?: string | null;
  frontPrintUrl?: string | null;
  backPrintUrl?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  preparing: 'Hazırlanıyor',
  printed: 'Basıldı',
  ready: 'Hazır',
  shipped: 'Gönderildi',
};

function OrderDesignViewer() {
  const { data } = useApi(TARGET);
  const [design, setDesign] = useState<DesignData | null>(null);
  const [loading, setLoading] = useState(true);

  const orderId = (data as { selected?: { id: string }[] }).selected?.[0]?.id ?? '';

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    fetch(`${APP_URL}/api/order-design?shopify_order_id=${encodeURIComponent(orderId)}`)
      .then((r) => r.json())
      .then((d: DesignData) => {
        setDesign(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orderId]);

  // Always render AdminBlock so Shopify doesn't collapse the slot
  if (loading) {
    return (
      <AdminBlock title="Baskı Tasarımı">
        <Text tone="subdued">Yükleniyor...</Text>
      </AdminBlock>
    );
  }

  if (!design || !design.found) {
    return (
      <AdminBlock title="Baskı Tasarımı">
        <Text tone="subdued">Bu siparişe ait tasarım bulunamadı.</Text>
      </AdminBlock>
    );
  }

  const statusLabel = design.productionStatus
    ? (STATUS_LABELS[design.productionStatus] ?? design.productionStatus)
    : null;

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {statusLabel && (
          <Text size="small" tone="subdued">Durum: {statusLabel}</Text>
        )}

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
