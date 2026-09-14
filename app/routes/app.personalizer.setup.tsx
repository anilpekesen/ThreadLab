import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Banner, Box, Badge,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { listPersonalizerTemplates } from "~/models/personalizer.server";

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

const TYPES = [
  {
    title: "Tişört ve giyim",
    example: "Kalpli tasarımın içine müşterinin fotoğrafı",
    setup: "Tasarım PNG'sini yükleyin, fotoğrafın gireceği boşluğa tıklayın.",
    where: "DesignKit tasarımcısının içinde \"Fotoğrafını ekle\"",
  },
  {
    title: "Fotoğraflı çerçeve",
    example: "6 fotoğraflı 30×40 çerçeve, 3'lü set",
    setup: "Stüdyoda ölçüyü seçin, hazır düzenle başlayıp alanları sürükleyerek ayarlayın.",
    where: "Ürün sayfasında ayrı \"PrintLab Kişiselleştirici\" kutusu",
  },
  {
    title: "Boxer ve tekrarlı desen",
    example: "Yüzlerin ve kalplerin dağıldığı boxer",
    setup: "Yüz ve süsleme sayısını ayarlayın, süsleme görselini yükleyin.",
    where: "DesignKit tasarımcısının içinde",
  },
  {
    title: "AI portre",
    example: "Fotoğraftan karikatür + isim",
    setup: "Stili seçin; müşteriye açılacak stilleri işaretleyin.",
    where: "DesignKit tasarımcısının içinde",
  },
];

export default function PersonalizerSetup() {
  const { templates, personalizerBlockUrl, designerBlockUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const incomplete = templates.filter((t) => !t.active || t.product_count === 0);

  return (
    <Page
      title="Kişiselleştirici nasıl kurulur?"
      subtitle="Kod bilgisi gerekmez. Bir şablon birkaç dakikada müşteriye açılır."
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
      primaryAction={{ content: "Yeni şablon", url: "/app/personalizer/new" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Kurulum adımları</Text>
              <Text as="p" tone="subdued">
                Şablon, müşterinin fotoğrafının ürüne nasıl yerleşeceğini tarif eder. Şablonu
                bir ürüne bağladığınızda o ürünün sayfasında müşteriye açılır.
              </Text>

              <div>
                <Step number={1} title="Ürün türünü seçip şablon oluşturun">
                  <Text as="p">
                    <b>Yeni şablon</b>'a basın, satacağınız ürüne uyan türü seçin ve bir ad verin.
                    Ad yalnızca sizin listenizde görünür.
                  </Text>
                  <InlineStack><Button url="/app/personalizer/new" variant="primary">Yeni şablon</Button></InlineStack>
                </Step>

                <Step number={2} title="Tasarımı kurun ve kaydedin">
                  <Text as="p">
                    Açılan sayfada yalnızca seçtiğiniz türe ait ayarlar görünür. En üstteki
                    <b> Kurulum durumu</b> listesi neyin eksik olduğunu gösterir; eksik satırdaki
                    düğme sizi ilgili bölüme götürür. İşiniz bitince <b>Kaydet</b>'e basın.
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Çerçeve şablonları <b>Çerçeve Stüdyosu</b>'nda kurulur: ölçüyü seçer ya da tanımlarsınız,
                    hazır bir düzen seçip alanları sürükleyerek ayarlarsınız.
                  </Text>
                </Step>

                <Step number={3} title="Şablonu Shopify ürününe bağlayın">
                  <Text as="p">
                    Aynı sayfanın altındaki <b>Ürüne bağla</b> bölümünden ürünü seçip bağlayın.
                    Ürün listede yoksa adıyla arayın. Çoğu ürün için "Tüm varyantlar" doğru seçimdir.
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Shopify'da metafield oluşturmanıza veya ID kopyalamanıza gerek yok — uygulama bunu kendisi yapar.
                  </Text>
                </Step>

                <Step number={4} title="Ürün sayfasına bloğu bir kez ekleyin">
                  <Text as="p">
                    Tema kodunu düzenlemeyin. Aşağıdaki düğme tema düzenleyicisini blok eklenmiş hâlde
                    açar; sağ üstten <b>Kaydet</b>'e basmanız yeterli. Bu adım mağaza başına bir kez yapılır.
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button url={personalizerBlockUrl || undefined} external disabled={!personalizerBlockUrl}>
                      Çerçeve şablonları için: Kişiselleştirici bloğu
                    </Button>
                    <Button url={designerBlockUrl || undefined} external disabled={!designerBlockUrl}>
                      Tişört, boxer, AI için: DesignKit bloğu
                    </Button>
                  </InlineStack>
                </Step>

                <Step number={5} title="Şablonu aktifleştirip mağazada deneyin">
                  <Text as="p">
                    Şablon sayfasındaki <b>Şablonu aktifleştir</b> düğmesine basın. Ardından bağlı ürünün
                    sayfasını mağazada açıp bir fotoğrafla deneyin.
                  </Text>
                </Step>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Hangi türü seçmeliyim?</Text>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#616161" }}>
                      <th style={{ padding: "8px 12px 8px 0", fontWeight: 600 }}>Tür</th>
                      <th style={{ padding: "8px 12px", fontWeight: 600 }}>Örnek</th>
                      <th style={{ padding: "8px 12px", fontWeight: 600 }}>Ne ayarlarsınız</th>
                      <th style={{ padding: "8px 0 8px 12px", fontWeight: 600 }}>Müşteri nerede görür</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TYPES.map((type) => (
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
                <Text as="h2" variant="headingMd">Tamamlanmamış şablonlar</Text>
                <Text as="p" tone="subdued">Bu şablonlar şu an hiçbir müşteriye görünmüyor.</Text>
                {incomplete.map((t) => (
                  <Box key={t.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                    <InlineStack align="space-between" blockAlign="center" gap="300">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" fontWeight="semibold">{t.name}</Text>
                        {!t.active && <Badge>Pasif</Badge>}
                        {t.product_count === 0 && <Badge tone="attention">Ürüne bağlı değil</Badge>}
                      </InlineStack>
                      <Button size="slim" url={`/app/personalizer/${t.id}`}>Tamamla</Button>
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
              <Text as="h2" variant="headingMd">Ürün sayfasında görünmüyorsa</Text>
              <BlockStack gap="200">
                <Text as="p"><b>Şablon aktif mi?</b> Pasif şablonlar açılmaz.</Text>
                <Text as="p"><b>Ürün bağlı mı?</b> Şablon sayfasındaki "Bağlı ürünler" listesinde ürünü görmelisiniz.</Text>
                <Text as="p"><b>Blok temada var mı?</b> 4. adımdaki düğmeyle tema düzenleyicisini açıp kontrol edin. Birden fazla ürün şablonu kullanıyorsanız ürünün kullandığı tema şablonuna eklenmiş olmalı.</Text>
                <Text as="p"><b>Çerçeve şablonunda fotoğraf alanı kaydedildi mi?</b> Alan eklenip kaydedilmeden ürün bağlandıysa, kaydedip ürünü yeniden bağlayın ya da şablon listesinde <b>Bağlantıları denetle</b>'ye basın.</Text>
              </BlockStack>
              <Banner tone="info">
                Siparişte baskı dosyası otomatik hazırlanır; sipariş ayrıntısındaki özelliklerde görünür.
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
