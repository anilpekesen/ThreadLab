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

interface DesignObject {
  type: string;
  text?: string | null;
  fontFamily?: string | null;
  fontSize?: number | null;
  fill?: string | null;
  fontWeight?: string | number | null;
  fontStyle?: string | null;
  textAlign?: string | null;
  left?: number | null;
  top?: number | null;
  src?: string | null;
}

function downloadUrl(fileUrl: string, filename: string): string {
  return `${APP_URL}/api/download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
}

interface ApiResult {
  found: boolean;
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
  frontObjects: DesignObject[];
  backObjects: DesignObject[];
}

function getAttr(attrs: Attribute[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function extractDesignToken(attrs: Attribute[]): string {
  return getAttr(attrs, 'design_token') || getAttr(attrs, '_front_preview_url') ? getAttr(attrs, 'design_token') : '';
}

function TextObjects({ objects, label }: { objects: DesignObject[]; label: string }) {
  const texts = objects.filter((o) => o.text);
  if (!texts.length) return null;
  return (
    <BlockStack gap="tight">
      <Text size="small" tone="subdued">{label} Yüz — Yazılar</Text>
      {texts.map((o, i) => (
        <BlockStack key={i} gap="extraTight">
          <Text fontWeight="bold">"{o.text}"</Text>
          <InlineStack gap="base">
            {o.fontFamily && <Text size="small" tone="subdued">Font: {o.fontFamily}</Text>}
            {o.fontSize && <Text size="small" tone="subdued">Boyut: {o.fontSize}px</Text>}
          </InlineStack>
          <InlineStack gap="base">
            {o.fill && <Text size="small" tone="subdued">Renk: {o.fill}</Text>}
            {o.fontWeight && String(o.fontWeight) !== 'normal' && (
              <Text size="small" tone="subdued">Kalınlık: {o.fontWeight}</Text>
            )}
            {o.fontStyle === 'italic' && <Text size="small" tone="subdued">Stil: italic</Text>}
            {o.textAlign && o.textAlign !== 'left' && (
              <Text size="small" tone="subdued">Hizalama: {o.textAlign}</Text>
            )}
          </InlineStack>
          {(o.left != null || o.top != null) && (
            <Text size="small" tone="subdued">Konum: {o.left ?? 0}, {o.top ?? 0}</Text>
          )}
        </BlockStack>
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

    query<OrderResult>(
      `query GetOrder($id: ID!) {
        order(id: $id) {
          customAttributes { key value }
          lineItems(first: 10) { nodes { customAttributes { key value } } }
        }
      }`,
      { variables: { id: orderId } },
    ).then(({ data: result }) => {
      if (!result?.order) { setLoading(false); return; }

      // Find attrs at order or line-item level
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
        frontObjects: [],
        backObjects: [],
      };

      // Fetch design text objects from app API
      const numericId = orderId.includes('/') ? orderId.split('/').pop()! : orderId;
      fetch(`${APP_URL}/api/order-design?shopify_order_id=${encodeURIComponent(numericId)}`)
        .then((r) => r.json())
        .then((d: ApiResult) => {
          setDesign({
            ...baseInfo,
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

  return (
    <AdminBlock title="Baskı Tasarımı">
      <BlockStack gap="base">

        {/* Compact preview images side by side */}
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

        {/* Text design objects */}
        {(design.frontObjects.length > 0 || design.backObjects.length > 0) && (
          <>
            <Divider />
            <TextObjects objects={design.frontObjects} label="Ön" />
            <TextObjects objects={design.backObjects} label="Arka" />
          </>
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

        {/* User uploaded images in design */}
        {(() => {
          const allImages = [
            ...design.frontObjects.filter((o) => o.src),
            ...design.backObjects.filter((o) => o.src),
          ];
          if (!allImages.length) return null;
          return (
            <>
              <Divider />
              <BlockStack gap="extraTight">
                <Text size="small" tone="subdued">Eklenen Görseller</Text>
                <InlineStack gap="base">
                  {allImages.map((o, i) => (
                    <Link key={i} url={downloadUrl(o.src!, `tasarim-gorsel-${i + 1}.png`)} external>
                      ⬇ Görsel {i + 1} İndir
                    </Link>
                  ))}
                </InlineStack>
              </BlockStack>
            </>
          );
        })()}

        {design.designToken && (
          <Text size="small" tone="subdued">ID: {design.designToken}</Text>
        )}

      </BlockStack>
    </AdminBlock>
  );
}
