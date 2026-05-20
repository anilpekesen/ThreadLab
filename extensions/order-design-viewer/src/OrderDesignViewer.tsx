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
const APP_CLIENT_ID = 'ffb70fd5e03a3532fb1e47b3a8e9a052';

export default reactExtension(TARGET, () => <OrderDesignViewer />);

interface Attribute { key: string; value: string; }
interface Metafield { key: string; value: string; }

interface OrderResult {
  order: {
    customAttributes: Attribute[];
    lineItems: { nodes: { customAttributes: Attribute[] }[] };
  };
  shop: { myshopifyDomain: string };
}

interface DesignObject {
  type: string;
  text?: string | null;
  fontFamily?: string | null;
  fontSize?: number | null;
  fill?: string | null;
  fontWeight?: string | number | null;
  fontStyle?: string | null;
  underline?: boolean | null;
  textAlign?: string | null;
  left?: number | null;
  top?: number | null;
  src?: string | null;
  width?: number | null;
  height?: number | null;
  angle?: number | null;
}

interface DesignInfo {
  frontPreviewUrl: string;
  backPreviewUrl: string;
  frontPrintUrl: string;
  backPrintUrl: string;
  appOrderId: string;
  appOrderUrl: string;
  frontObjects: DesignObject[];
  backObjects: DesignObject[];
}

function downloadUrl(fileUrl: string, filename: string): string {
  if (fileUrl.startsWith("data:")) return fileUrl;
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

function getAttr(attrs: Attribute[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function getMf(metafields: Metafield[], key: string): string {
  return metafields.find((m) => m.key === key)?.value ?? '';
}

function DesignObjectItem({ obj, index }: { obj: DesignObject; index: number }) {
  const isText = obj.type === 'i-text' || obj.type === 'textbox';
  const isImage = obj.type === 'image';

  return (
    <BlockStack gap="tight">
      <Divider />
      <BlockStack gap="tight">
        {isImage && obj.src && (
          <InlineStack gap="base" blockAlign="start">
            <Box maxInlineSize={80}>
              <Image source={obj.src} alt={`Görsel ${index + 1}`} accessibilityDescription={`Tasarım görseli ${index + 1}`} />
            </Box>
            <BlockStack gap="tight">
              <Text fontWeight="bold" size="small">Görsel {index + 1}</Text>
              {(obj.width || obj.height) && (
                <Text size="small" tone="subdued">
                  {obj.width && obj.height ? `${obj.width} × ${obj.height}px` : ''}
                  {obj.angle ? ` · ${obj.angle}°` : ''}
                </Text>
              )}
              <Text size="small" tone="subdued">Konum: {obj.left ?? 0}, {obj.top ?? 0}</Text>
              <Link url={downloadUrl(obj.src, `tasarim-gorsel-${index + 1}.png`)} external>
                ⬇ Görseli İndir
              </Link>
            </BlockStack>
          </InlineStack>
        )}
        {isText && (
          <BlockStack gap="tight">
            {obj.text && <Text fontWeight="bold">"{obj.text}"</Text>}
            <InlineStack gap="base">
              {obj.fontFamily && <Text size="small" tone="subdued">Font: {obj.fontFamily}</Text>}
              {obj.fontSize && <Text size="small" tone="subdued">Boyut: {obj.fontSize}px</Text>}
              {obj.fill && <Text size="small" tone="subdued">Renk: {obj.fill}</Text>}
            </InlineStack>
            <InlineStack gap="base">
              {obj.fontWeight && String(obj.fontWeight) !== 'normal' && (
                <Text size="small" tone="subdued">Kalınlık: {obj.fontWeight}</Text>
              )}
              {obj.fontStyle === 'italic' && <Text size="small" tone="subdued">Stil: italic</Text>}
              {obj.underline && <Text size="small" tone="subdued">Alt çizgi: var</Text>}
              {obj.textAlign && obj.textAlign !== 'left' && (
                <Text size="small" tone="subdued">Hizalama: {obj.textAlign}</Text>
              )}
            </InlineStack>
            <Text size="small" tone="subdued">Konum: {obj.left ?? 0}, {obj.top ?? 0}</Text>
          </BlockStack>
        )}
      </BlockStack>
    </BlockStack>
  );
}

function SideObjects({ objects, label }: { objects: DesignObject[]; label: string }) {
  if (!objects.length) return null;
  return (
    <BlockStack gap="tight">
      <Text size="small" tone="subdued">{label} Yüz Öğeleri ({objects.length})</Text>
      {objects.map((obj, i) => (
        <DesignObjectItem key={i} obj={obj} index={i} />
      ))}
    </BlockStack>
  );
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
    if (!orderId || !query) { setLoading(false); return; }

    // Query 1: basic order attrs + shop (always available, no special scopes)
    query<OrderResult>(
      `query GetOrderBase($id: ID!) {
        order(id: $id) {
          customAttributes { key value }
          lineItems(first: 10) { nodes { customAttributes { key value } } }
        }
        shop { myshopifyDomain }
      }`,
      { variables: { id: orderId } },
    ).then(async ({ data: result }) => {
      if (!result?.order) { setLoading(false); return; }

      const shopDomain = result.shop?.myshopifyDomain?.replace('.myshopify.com', '') ?? '';

      let attrs = result.order.customAttributes ?? [];
      if (!getAttr(attrs, '_front_preview_url') && !getAttr(attrs, 'design_token')) {
        for (const item of result.order.lineItems?.nodes ?? []) {
          if (getAttr(item.customAttributes, '_front_preview_url') || getAttr(item.customAttributes, 'design_token')) {
            attrs = item.customAttributes;
            break;
          }
        }
      }

      // Query 2: metafields (requires read_order_metafields scope — optional, ignore if fails)
      let metafields: Metafield[] = [];
      try {
        const mfResult = await query<{ order: { metafields: { nodes: Metafield[] } } }>(
          `query GetOrderMetafields($id: ID!) {
            order(id: $id) {
              metafields(first: 10, namespace: "printlab") { nodes { key value } }
            }
          }`,
          { variables: { id: orderId } },
        );
        metafields = mfResult.data?.order?.metafields?.nodes ?? [];
      } catch { /* scope not granted yet — continue without metafields */ }

      const frontPreviewUrl = getMf(metafields, 'front_preview_url') || getAttr(attrs, '_front_preview_url');
      const backPreviewUrl  = getMf(metafields, 'back_preview_url')  || getAttr(attrs, '_back_preview_url');
      const frontPrintUrl   = getMf(metafields, 'front_print_url')   || getAttr(attrs, '_front_print_url');
      const backPrintUrl    = getMf(metafields, 'back_print_url')    || getAttr(attrs, '_back_print_url');
      const appOrderId      = getMf(metafields, 'app_order_id');

      if (!frontPreviewUrl && !appOrderId) { setLoading(false); return; }

      const appOrderUrl = appOrderId && shopDomain
        ? `https://admin.shopify.com/store/${shopDomain}/apps/${APP_CLIENT_ID}/app/orders/${appOrderId}`
        : '';

      let frontObjects: DesignObject[] = [];
      let backObjects: DesignObject[] = [];
      const designObjectsJson = getMf(metafields, 'design_objects');
      if (designObjectsJson) {
        try {
          const parsed = JSON.parse(designObjectsJson) as { frontObjects?: DesignObject[]; backObjects?: DesignObject[] };
          frontObjects = parsed.frontObjects ?? [];
          backObjects  = parsed.backObjects  ?? [];
        } catch { /* ignore */ }
      }

      setDesign({ frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl, appOrderId, appOrderUrl, frontObjects, backObjects });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <AdminBlock title="Baskı Tasarımı">
        <Text tone="subdued">Yükleniyor...</Text>
      </AdminBlock>
    );
  }

  if (!design) return null;

  const hasFrontObjects = design.frontObjects.length > 0;
  const hasBackObjects  = design.backObjects.length > 0;

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {/* Preview images */}
        {(design.frontPreviewUrl || design.backPreviewUrl) && (
          <InlineStack gap="base">
            {design.frontPreviewUrl && (
              <BlockStack gap="tight">
                <Text size="small" tone="subdued">Ön Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.frontPreviewUrl} alt="Ön yüz önizlemesi" accessibilityDescription="Ön yüz tasarımı" />
                </Box>
              </BlockStack>
            )}
            {design.backPreviewUrl && (
              <BlockStack gap="tight">
                <Text size="small" tone="subdued">Arka Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image source={design.backPreviewUrl} alt="Arka yüz önizlemesi" accessibilityDescription="Arka yüz tasarımı" />
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
              <Text size="small" tone="subdued">Baskı Dosyaları</Text>
              <InlineStack gap="base">
                {design.frontPrintUrl && (
                  <Link url={downloadUrl(design.frontPrintUrl, 'on-baski.png')} external>⬇ Ön Baskı İndir</Link>
                )}
                {design.backPrintUrl && (
                  <Link url={downloadUrl(design.backPrintUrl, 'arka-baski.png')} external>⬇ Arka Baskı İndir</Link>
                )}
              </InlineStack>
            </BlockStack>
          </>
        )}

        {/* Design objects */}
        {(hasFrontObjects || hasBackObjects) && (
          <>
            <Divider />
            <SideObjects objects={design.frontObjects} label="Ön" />
            {hasFrontObjects && hasBackObjects && <Divider />}
            <SideObjects objects={design.backObjects} label="Arka" />
          </>
        )}

        {/* Link to app order detail */}
        {design.appOrderUrl && (
          <>
            <Divider />
            <Link url={design.appOrderUrl} external>Sipariş detay sayfasını aç →</Link>
          </>
        )}

      </BlockStack>
    </AdminBlock>
  );
}
