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

interface ApiResult {
  found: boolean;
  appOrderId?: string | null;
  frontPreviewUrl?: string | null;
  backPreviewUrl?: string | null;
  frontPrintUrl?: string | null;
  backPrintUrl?: string | null;
  frontObjects?: DesignObject[];
  backObjects?: DesignObject[];
}

interface DesignInfo {
  frontPreviewUrl: string;
  backPreviewUrl: string;
  frontPrintUrl: string;
  backPrintUrl: string;
  designToken: string;
  appOrderId: string;
  appOrderUrl: string;
  frontObjects: DesignObject[];
  backObjects: DesignObject[];
}

function downloadUrl(fileUrl: string, filename: string): string {
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

function getAttr(attrs: Attribute[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function extractDesignToken(attrs: Attribute[]): string {
  return getAttr(attrs, 'design_token') || getAttr(attrs, '_front_preview_url') ? getAttr(attrs, 'design_token') : '';
}

function DesignObjectItem({ obj, index }: { obj: DesignObject; index: number }) {
  const isText = obj.type === 'i-text' || obj.type === 'textbox';
  const isImage = obj.type === 'image';

  return (
    <BlockStack gap="extraTight">
      <Divider />
      <BlockStack gap="extraTight">
        {/* Image object */}
        {isImage && obj.src && (
          <InlineStack gap="base" blockAlign="start">
            <Box maxInlineSize={80}>
              <Image source={obj.src} alt={`Görsel ${index + 1}`} accessibilityDescription={`Tasarım görseli ${index + 1}`} />
            </Box>
            <BlockStack gap="extraTight">
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

        {/* Text object */}
        {isText && (
          <BlockStack gap="extraTight">
            {obj.text && (
              <Text fontWeight="bold">"{obj.text}"</Text>
            )}
            <InlineStack gap="base" wrap>
              {obj.fontFamily && (
                <Text size="small" tone="subdued">Font: {obj.fontFamily}</Text>
              )}
              {obj.fontSize && (
                <Text size="small" tone="subdued">Boyut: {obj.fontSize}px</Text>
              )}
              {obj.fill && (
                <Text size="small" tone="subdued">Renk: {obj.fill}</Text>
              )}
            </InlineStack>
            <InlineStack gap="base" wrap>
              {obj.fontWeight && String(obj.fontWeight) !== 'normal' && (
                <Text size="small" tone="subdued">Kalınlık: {obj.fontWeight}</Text>
              )}
              {obj.fontStyle === 'italic' && (
                <Text size="small" tone="subdued">Stil: italic</Text>
              )}
              {obj.underline && (
                <Text size="small" tone="subdued">Alt çizgi: var</Text>
              )}
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
    <BlockStack gap="extraTight">
      <Text size="small" tone="subdued">{label} Yüz Öğeleri ({objects.length})</Text>
      {objects.map((obj, i) => (
        <DesignObjectItem key={i} obj={obj} index={i} />
      ))}
    </BlockStack>
  );
}

const APP_CLIENT_ID = 'ffb70fd5e03a3532fb1e47b3a8e9a052';

function getShopFromExtension(api: ReturnType<typeof useApi>): string {
  try {
    const scriptUrl = (api as unknown as { extension?: { scriptUrl?: string } }).extension?.scriptUrl ?? '';
    if (scriptUrl) {
      const shop = new URL(scriptUrl).searchParams.get('shop') ?? '';
      return shop.replace('.myshopify.com', '');
    }
  } catch {}
  return '';
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
  const scriptShopDomain = getShopFromExtension(api);

  useEffect(() => {
    if (!orderId || !query) { setLoading(false); return; }

    query<OrderResult>(
      `query GetOrderAndShop($id: ID!) {
        order(id: $id) {
          customAttributes { key value }
          lineItems(first: 10) { nodes { customAttributes { key value } } }
        }
        shop { myshopifyDomain }
      }`,
      { variables: { id: orderId } },
    ).then(({ data: result }) => {
      if (!result?.order) { setLoading(false); return; }

      const shopDomain = result.shop?.myshopifyDomain?.replace('.myshopify.com', '') || scriptShopDomain;

      let attrs = result.order.customAttributes ?? [];
      if (!getAttr(attrs, '_front_preview_url') && !getAttr(attrs, 'design_token')) {
        for (const item of result.order.lineItems?.nodes ?? []) {
          if (getAttr(item.customAttributes, '_front_preview_url') || getAttr(item.customAttributes, 'design_token')) {
            attrs = item.customAttributes;
            break;
          }
        }
      }

      const frontPreviewUrl = getAttr(attrs, '_front_preview_url');
      const designToken = extractDesignToken(attrs);

      if (!frontPreviewUrl && !designToken) { setLoading(false); return; }

      const baseInfo: DesignInfo = {
        frontPreviewUrl,
        backPreviewUrl: getAttr(attrs, '_back_preview_url'),
        frontPrintUrl: getAttr(attrs, '_front_print_url'),
        backPrintUrl: getAttr(attrs, '_back_print_url'),
        designToken,
        appOrderId: '',
        appOrderUrl: '',
        frontObjects: [],
        backObjects: [],
      };

      const numericId = orderId.includes('/') ? orderId.split('/').pop()! : orderId;
      fetch(`${APP_URL}/api/order-design?shopify_order_id=${encodeURIComponent(numericId)}`)
        .then((r) => r.json())
        .then((d: ApiResult) => {
          const appOrderId = d.appOrderId ?? '';
          const appOrderUrl = appOrderId
            ? `https://admin.shopify.com/store/${shopDomain || 'whanotify-dev'}/apps/${APP_CLIENT_ID}/app/orders/${appOrderId}`
            : '';
          setDesign({
            ...baseInfo,
            appOrderId,
            appOrderUrl,
            frontObjects: d.frontObjects ?? [],
            backObjects: d.backObjects ?? [],
          });
          setLoading(false);
        })
        .catch(() => {
          setDesign(baseInfo);
          setLoading(false);
        });
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
  const hasBackObjects = design.backObjects.length > 0;

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {/* Preview images */}
        {(design.frontPreviewUrl || design.backPreviewUrl) && (
          <InlineStack gap="base">
            {design.frontPreviewUrl && (
              <BlockStack gap="extraTight">
                <Text size="small" tone="subdued">Ön Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image
                    source={design.frontPreviewUrl}
                    alt="Ön yüz önizlemesi"
                    accessibilityDescription="Ön yüz tasarımı"
                  />
                </Box>
              </BlockStack>
            )}
            {design.backPreviewUrl && (
              <BlockStack gap="extraTight">
                <Text size="small" tone="subdued">Arka Yüz</Text>
                <Box maxInlineSize={140}>
                  <Image
                    source={design.backPreviewUrl}
                    alt="Arka yüz önizlemesi"
                    accessibilityDescription="Arka yüz tasarımı"
                  />
                </Box>
              </BlockStack>
            )}
          </InlineStack>
        )}

        {/* Print file downloads */}
        {(design.frontPrintUrl || design.backPrintUrl) && (
          <>
            <Divider />
            <BlockStack gap="extraTight">
              <Text size="small" tone="subdued">Baskı Dosyaları</Text>
              <InlineStack gap="base">
                {design.frontPrintUrl && (
                  <Link url={downloadUrl(design.frontPrintUrl, 'on-baski.png')} external>
                    ⬇ Ön Baskı İndir
                  </Link>
                )}
                {design.backPrintUrl && (
                  <Link url={downloadUrl(design.backPrintUrl, 'arka-baski.png')} external>
                    ⬇ Arka Baskı İndir
                  </Link>
                )}
              </InlineStack>
            </BlockStack>
          </>
        )}

        {/* Design objects: text + uploaded images */}
        {(hasFrontObjects || hasBackObjects) && (
          <>
            <Divider />
            <SideObjects objects={design.frontObjects} label="Ön" />
            {hasFrontObjects && hasBackObjects && <Divider />}
            <SideObjects objects={design.backObjects} label="Arka" />
          </>
        )}

        {design.appOrderUrl && (
          <>
            <Divider />
            <Link url={design.appOrderUrl} external>
              Sipariş detay sayfasını aç →
            </Link>
          </>
        )}

      </BlockStack>
    </AdminBlock>
  );
}
