import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Banner, Box, Badge,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { listPersonalizerTemplates } from "~/models/personalizer.server";
import { useDict } from "~/i18n";
import dict from "~/i18n/personalizer/setup";

// Bu sayfa eskiden Shopify'da metafield tanımını elle oluşturmayı ve tema
// koduna liquid yapıştırmayı anlatıyordu. Uygulama metafield'ı ürün
// bağlanınca kendisi yazıyor, tema tarafında da hazır bloklar var; eski
// anlatım merchant'ları gereksiz ve riskli adımlara sokuyordu.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const templates = await listPersonalizerTemplates(session.shop);
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const blockUrl = (handle: string) => apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${handle}`)}&target=mainSection`
    : "";
  return json({
    templates: templates.map((t) => ({
      id: t.id, name: t.name, active: t.active, product_count: t.product_count,
    })),
    personalizerBlockUrl: blockUrl("personalizer"),
    designerBlockUrl: blockUrl("tshirt-designer"),
  });
};

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "16px 0", borderTop: "1px solid #ebebeb" }}>
      <div style={{ flex: "0 0 28px", height: 28, borderRadius: "50%", background: "#303030", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
        {number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">{title}</Text>
          {children}
        </BlockStack>
      </div>
    </div>
  );
}

/** Sözlükteki parçalı paragraf: tek sıradaki parçalar kalın */
function rich(parts: string[]) {
  return parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>));
}

export default function PersonalizerSetup() {
  const { templates, personalizerBlockUrl, designerBlockUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const L = useDict(dict);
  const incomplete = templates.filter((t) => !t.active || t.product_count === 0);

  return (
    <Page
      title={L.pageTitle}
      subtitle={L.pageSubtitle}
      backAction={{ content: L.back, onAction: () => navigate("/app/personalizer") }}
      primaryAction={{ content: L.newTemplate, url: "/app/personalizer/new" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">{L.stepsTitle}</Text>
              <Text as="p" tone="subdued">{L.stepsIntro}</Text>

              <div>
                <Step number={1} title={L.step1Title}>
                  <Text as="p">{rich(L.step1Body)}</Text>
                  <InlineStack><Button url="/app/personalizer/new" variant="primary">{L.newTemplate}</Button></InlineStack>
                </Step>

                <Step number={2} title={L.step2Title}>
                  <Text as="p">{rich(L.step2Body)}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{rich(L.step2Note)}</Text>
                </Step>

                <Step number={3} title={L.step3Title}>
                  <Text as="p">{rich(L.step3Body)}</Text>
                  <Text as="p" tone="subdued" variant="bodySm">{L.step3Note}</Text>
                </Step>

                <Step number={4} title={L.step4Title}>
                  <Text as="p">{rich(L.step4Body)}</Text>
                  <InlineStack gap="200" wrap>
                    <Button url={personalizerBlockUrl || undefined} external disabled={!personalizerBlockUrl}>
                      {L.personalizerBlock}
                    </Button>
                    <Button url={designerBlockUrl || undefined} external disabled={!designerBlockUrl}>
                      {L.designerBlock}
                    </Button>
                  </InlineStack>
                </Step>

                <Step number={5} title={L.step5Title}>
                  <Text as="p">{rich(L.step5Body)}</Text>
                </Step>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{L.whichTitle}</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#616161" }}>
                      <th style={{ padding: "8px 12px 8px 0", fontWeight: 600 }}>{L.colType}</th>
                      <th style={{ padding: "8px 12px", fontWeight: 600 }}>{L.colExample}</th>
                      <th style={{ padding: "8px 12px", fontWeight: 600 }}>{L.colSetup}</th>
                      <th style={{ padding: "8px 0 8px 12px", fontWeight: 600 }}>{L.colWhere}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {L.types.map((type) => (
                      <tr key={type.title} style={{ borderTop: "1px solid #ebebeb", verticalAlign: "top" }}>
                        <td style={{ padding: "10px 12px 10px 0", fontWeight: 600, whiteSpace: "nowrap" }}>{type.title}</td>
                        <td style={{ padding: "10px 12px" }}>{type.example}</td>
                        <td style={{ padding: "10px 12px" }}>{type.setup}</td>
                        <td style={{ padding: "10px 0 10px 12px" }}>{type.where}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {incomplete.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">{L.incompleteTitle}</Text>
                <Text as="p" tone="subdued">{L.incompleteBody}</Text>
                {incomplete.map((t) => (
                  <Box key={t.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                    <InlineStack align="space-between" blockAlign="center" gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" fontWeight="semibold">{t.name}</Text>
                        {!t.active && <Badge>{L.badgeInactive}</Badge>}
                        {t.product_count === 0 && <Badge tone="attention">{L.badgeNotLinked}</Badge>}
                      </InlineStack>
                      <Button size="slim" url={`/app/personalizer/${t.id}`}>{L.complete}</Button>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{L.troubleTitle}</Text>
              <BlockStack gap="200">
                <Text as="p">{rich(L.trouble1)}</Text>
                <Text as="p">{rich(L.trouble2)}</Text>
                <Text as="p">{rich(L.trouble3)}</Text>
                <Text as="p">{rich(L.trouble4)}</Text>
              </BlockStack>
              <Banner tone="info">{L.printFileInfo}</Banner>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
