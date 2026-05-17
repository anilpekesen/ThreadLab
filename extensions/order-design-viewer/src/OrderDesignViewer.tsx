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
  Badge,
} from '@shopify/ui-extensions-react/admin';

const TARGET = 'admin.order-details.block.render';

export default reactExtension(TARGET, () => <OrderDesignViewer />);

interface LineItemAttr {
  key: string;
  value: string;
}

interface LineItem {
  id: string;
  title: string;
  quantity: number;
  customAttributes: LineItemAttr[];
}

interface OrderData {
  order: {
    lineItems: {
      nodes: LineItem[];
    };
  };
}

function getAttr(attrs: LineItemAttr[], key: string): string {
  return attrs.find((a) => a.key === key)?.value ?? '';
}

function DesignBlock({ item }: { item: LineItem }) {
  const attrs = item.customAttributes ?? [];
  const frontPreview = getAttr(attrs, '_front_preview_url');
  const backPreview = getAttr(attrs, '_back_preview_url');
  const frontPrint = getAttr(attrs, '_front_print_url');
  const backPrint = getAttr(attrs, '_back_print_url');
  const hasFront = getAttr(attrs, 'Ön Tasarım') === 'Var';
  const hasBack = getAttr(attrs, 'Arka Tasarım') === 'Var';
  const designToken = getAttr(attrs, 'design_token');

  return (
    <BlockStack gap="base">
      <InlineStack blockAlignment="center" inlineAlignment="space-between">
        <Text fontWeight="bold">{item.title} × {item.quantity}</Text>
        <InlineStack gap="extraTight">
          {hasFront && <Badge tone="success">Ön Tasarım</Badge>}
          {hasBack && <Badge tone="info">Arka Tasarım</Badge>}
        </InlineStack>
      </InlineStack>

      {(frontPreview || backPreview) && (
        <InlineStack gap="base">
          {frontPreview && (
            <BlockStack gap="extraTight">
              <Text size="small" tone="subdued">Ön Yüz</Text>
              <Image
                source={frontPreview}
                alt="Ön tasarım önizlemesi"
                accessibilityDescription="Müşterinin ön yüz tasarımı"
              />
            </BlockStack>
          )}
          {backPreview && (
            <BlockStack gap="extraTight">
              <Text size="small" tone="subdued">Arka Yüz</Text>
              <Image
                source={backPreview}
                alt="Arka tasarım önizlemesi"
                accessibilityDescription="Müşterinin arka yüz tasarımı"
              />
            </BlockStack>
          )}
        </InlineStack>
      )}

      <InlineStack gap="base">
        {frontPrint && (
          <Link url={frontPrint} external>
            Ön Baskı Dosyası İndir
          </Link>
        )}
        {backPrint && (
          <Link url={backPrint} external>
            Arka Baskı Dosyası İndir
          </Link>
        )}
      </InlineStack>

      {designToken && (
        <Text size="small" tone="subdued">Tasarım ID: {designToken}</Text>
      )}
    </BlockStack>
  );
}

function OrderDesignViewer() {
  const { data, query } = useApi(TARGET);
  const [designItems, setDesignItems] = useState<LineItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const orderId = (data as { selected?: { id: string }[] }).selected?.[0]?.id;

  useEffect(() => {
    if (!orderId) {
      setLoaded(true);
      return;
    }

    query<OrderData>(
      `query GetOrder($id: ID!) {
        order(id: $id) {
          lineItems(first: 50) {
            nodes {
              id
              title
              quantity
              customAttributes {
                key
                value
              }
            }
          }
        }
      }`,
      { variables: { id: orderId } },
    )
      .then(({ data: result, errors }) => {
        if (errors?.length || !result?.order) {
          setLoaded(true);
          return;
        }
        const items = result.order.lineItems?.nodes ?? [];
        const filtered = items.filter((item) =>
          item.customAttributes?.some(
            (a) => a.key === 'design_token' || a.key === '_front_preview_url',
          ),
        );
        setDesignItems(filtered);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [orderId]);

  if (!loaded) return null;
  if (designItems.length === 0) return null;

  return (
    <AdminBlock title="Baskı Tasarımları">
      <BlockStack gap="base">
        {designItems.map((item, idx) => (
          <BlockStack key={item.id} gap="base">
            {idx > 0 && <Divider />}
            <DesignBlock item={item} />
          </BlockStack>
        ))}
      </BlockStack>
    </AdminBlock>
  );
}
