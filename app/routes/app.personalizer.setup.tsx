import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button,
  Banner, Box, Badge, Divider,
} from "@shopify/polaris";
import { authenticate } from "~/lib/authenticate.server";
import { listPersonalizerTemplates } from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const templates = await listPersonalizerTemplates(session.shop, true);
  return json({ shop: session.shop, templates });
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <BlockStack gap="100">
      {label && <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">{label}</Text>}
      <Box
        background="bg-surface-secondary"
        padding="400"
        borderRadius="200"
        borderWidth="025"
        borderColor="border"
      >
        <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.6, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
          {code}
        </pre>
      </Box>
    </BlockStack>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <Box background="bg-surface" padding="400" borderRadius="200" borderWidth="025" borderColor="border">
      <BlockStack gap="300">
        <InlineStack gap="300" blockAlign="center">
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
            {number}
          </div>
          <Text as="h3" variant="headingSm" fontWeight="bold">{title}</Text>
        </InlineStack>
        {children}
      </BlockStack>
    </Box>
  );
}

export default function PersonalizerSetup() {
  const { templates } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const appUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "https://app.printlabapp.com";

  const snippetCode = `{% comment %}
  PrintLab Personalizer — Shopify Tema Entegrasyonu
  Bu snippet'ı themes/snippets/personalizer-embed.liquid olarak kaydedin
{% endcomment %}

{%- assign pl_template_id = product.metafields.personalizer.template_id -%}

{%- if pl_template_id != blank -%}
  {%- assign pl_variant_id = product.selected_or_first_available_variant.id -%}
  {%- assign pl_shop = shop.permanent_domain -%}
  {%- assign pl_locale = request.locale.iso_code | default: "tr" -%}
  {%- assign pl_app_url = "${appUrl}" -%}

  <div class="pl-personalizer" style="margin:24px 0;">
    <div id="pl-loading" style="text-align:center;padding:48px 0;color:#6b7280;font-size:14px;">
      ⏳ Yükleniyor...
    </div>
    <iframe
      id="pl-iframe"
      src=""
      style="display:none;width:100%;border:none;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);"
      allow="camera *; microphone *"
      scrolling="no"
      loading="lazy"
    ></iframe>
  </div>

  <script>
  (function() {
    var APP_URL   = {{ pl_app_url | json }};
    var TEMPLATE  = {{ pl_template_id | json }};
    var SHOP      = {{ pl_shop | json }};
    var LOCALE    = {{ pl_locale | json }};

    function getVariantId() {
      var m = window.location.search.match(/[?&]variant=(\\d+)/);
      return m ? m[1] : {{ pl_variant_id | json }};
    }

    var iframe  = document.getElementById('pl-iframe');
    var loading = document.getElementById('pl-loading');

    iframe.src = APP_URL + '/embed/personalizer'
      + '?templateId=' + TEMPLATE
      + '&variantId='  + getVariantId()
      + '&shop='       + SHOP
      + '&locale='     + LOCALE;

    iframe.onload = function() {
      loading.style.display = 'none';
      iframe.style.display = 'block';
      iframe.style.height  = '680px';
    };

    // iframe yüksekliğini otomatik ayarla
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'PERSONALIZER_RESIZE') {
        iframe.style.height = (e.data.height + 32) + 'px';
      }
    });

    // Varyant değiştiğinde iframe URL'ini güncelle
    document.addEventListener('change', function(e) {
      if (e.target && e.target.name === 'id') {
        var newSrc = APP_URL + '/embed/personalizer'
          + '?templateId=' + TEMPLATE
          + '&variantId='  + e.target.value
          + '&shop='       + SHOP
          + '&locale='     + LOCALE;
        loading.style.display = 'block';
        iframe.style.display  = 'none';
        iframe.src = newSrc;
      }
    });

    // Sepete ekle mesajını yakala
    window.addEventListener('message', function(e) {
      if (!e.data || e.data.type !== 'PERSONALIZER_ADD_TO_CART') return;
      var d = e.data;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: d.variantId,
          quantity: d.quantity || 1,
          properties: d.properties || {}
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(item) {
        if (item.id) {
          // Sepet açılır veya /cart sayfasına git
          if (window.Shopify && window.Shopify.theme && typeof window.Shopify.theme.openCart === 'function') {
            window.Shopify.theme.openCart();
          } else {
            window.location.href = '/cart';
          }
        }
      })
      .catch(function() { window.location.href = '/cart'; });
    });
  })();
  </script>
{%- endif -%}`;

  const productTemplateInclude = `{% comment %} product.liquid veya sections/main-product.liquid içine ekleyin {% endcomment %}
{% render 'personalizer-embed' %}`;

  return (
    <Page
      title="Mağaza Entegrasyonu"
      backAction={{ content: "Personalizer", onAction: () => navigate("/app/personalizer") }}
    >
      <Layout>
        {/* Nasıl çalışır */}
        <Layout.Section>
          <Banner tone="info">
            <BlockStack gap="200">
              <Text as="p" fontWeight="semibold">Müşteri akışı şöyle çalışıyor:</Text>
              <Text as="p">
                Ürün sayfası → Çerçeve seç → Fotoğraf yükle + Yazı gir → AI karikatür oluşturur → Çerçeveye yerleştirir → Önizle → Sepete Ekle → Sipariş
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>

        {/* Templates listesi — her biri için Template ID */}
        {templates.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Aktif Şablonlarınız</Text>
                <Text as="p" tone="subdued">Her şablonu farklı bir ürüne bağlayabilirsiniz.</Text>
                {templates.map((t) => (
                  <Box key={t.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                    <InlineStack gap="300" blockAlign="center">
                      {t.template_url && (
                        <img src={t.template_url} alt={t.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", flexShrink: 0 }} />
                      )}
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">{t.name}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Template ID: <code style={{ fontSize: 11, background: "#e5e7eb", padding: "1px 5px", borderRadius: 3, userSelect: "all" }}>{t.id}</code>
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Adım adım kurulum */}
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingMd">Kurulum Adımları</Text>

              <Step number={1} title="Shopify'da Metafield Tanımı Oluşturun">
                <Text as="p" tone="subdued">
                  Bu sayede her ürüne farklı bir şablon bağlayabilirsiniz.
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>Shopify Admin → Settings → Custom Data → Products → Add Definition</strong>
                  </Text>
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm"><strong>Name:</strong> Personalizer Template ID</Text>
                      <Text as="p" variant="bodySm"><strong>Namespace & key:</strong> <code>personalizer.template_id</code></Text>
                      <Text as="p" variant="bodySm"><strong>Type:</strong> Single line text</Text>
                    </BlockStack>
                  </Box>
                  <Button
                    url="https://admin.shopify.com/store/-/settings/custom_data"
                    external
                    size="slim"
                  >
                    Shopify Custom Data Ayarlarını Aç →
                  </Button>
                </BlockStack>
              </Step>

              <Step number={2} title="Ürüne Template ID Ekleyin">
                <Text as="p" tone="subdued">
                  Hangi ürün bu personalizeri kullanacaksa o ürünü açın ve metafield'ı doldurun.
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>Shopify Admin → Products → [Karikatür Tablo] → Metafields bölümü</strong>
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>Personalizer Template ID</strong> alanına yukarıdaki şablonlardan birinin ID'sini yazın.
                  </Text>
                  {templates.length > 0 && (
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <Text as="p" variant="bodySm">
                        Örnek: <code style={{ userSelect: "all" }}>{templates[0].id}</code>
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </Step>

              <Step number={3} title="Tema Snippet Dosyasını Ekleyin">
                <Text as="p" tone="subdued">
                  Shopify Admin → Online Store → Themes → düzenlediğiniz tema → Edit Code →
                  <strong> snippets</strong> klasöründe <strong>personalizer-embed.liquid</strong> adıyla yeni dosya oluşturun, aşağıdaki kodu yapıştırın.
                </Text>
                <CodeBlock code={snippetCode} label="snippets/personalizer-embed.liquid" />
              </Step>

              <Step number={4} title="Ürün Sayfası Şablonuna Dahil Edin">
                <Text as="p" tone="subdued">
                  Tema dosyalarından <code>sections/main-product.liquid</code> veya <code>templates/product.liquid</code> açın.
                  "Sepete Ekle" butonunun altına veya istediğiniz yere şu satırı ekleyin:
                </Text>
                <CodeBlock code={productTemplateInclude} label="sections/main-product.liquid içine" />
                <Banner tone="warning">
                  <Text as="p">
                    Bu satırı eklemek için tema kodu düzenleme gerekir. Tema düzenleme konusunda yardıma ihtiyacınız varsa
                    Shopify tema geliştiricinizle çalışın. Kod değişikliğini yanlış yere eklemek sayfayı bozabilir.
                  </Text>
                </Banner>
              </Step>

              <Step number={5} title="Test Edin">
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">Kurulumdan sonra ürün sayfasında şunları görmelisiniz:</Text>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="p" variant="bodySm">Çerçeve seçim grid'i (4 farklı çerçeve)</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="p" variant="bodySm">Fotoğraf yükleme alanı</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="p" variant="bodySm">Metin alanları (varsa)</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="p" variant="bodySm">Önizle butonu → AI karikatür + çerçeve önizlemesi</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge tone="success">✓</Badge>
                      <Text as="p" variant="bodySm">Sepete Ekle → /cart sayfasına yönlendirme</Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Step>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Sipariş sonrası */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Sipariş Sonrası (Baskı Dosyası)</Text>
              <Text as="p" tone="subdued">
                Müşteri satın aldığında, sipariş line item'ların özelliklerinde şunlar bulunur:
              </Text>
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm"><code>_design_token</code> — tasarım kaydını bulmanızı sağlar</Text>
                  <Text as="p" variant="bodySm"><code>_print_file</code> — baskıya hazır yüksek kaliteli PNG dosyasının URL'i</Text>
                  <Text as="p" variant="bodySm"><code>_personalizer_frame</code> — müşterinin seçtiği çerçeve ID'si</Text>
                  <Text as="p" variant="bodySm"><code>İsim, Tarih ...</code> — müşterinin girdiği metin değerleri</Text>
                </BlockStack>
              </Box>
              <Text as="p" tone="subdued" variant="bodySm">
                Siparişi Shopify'da açtığınızda bu bilgileri görürsünüz. <strong>_print_file</strong> URL'ini indirerek baskı işlemine gönderebilirsiniz.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Hızlı test */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tema Kurulumu Olmadan Test Edin</Text>
              <Text as="p" tone="subdued">
                Tema entegrasyonu kurmadan önce widget'ın çalıştığını doğrudan test edebilirsiniz:
              </Text>
              {templates.map((t) => (
                <InlineStack key={t.id} gap="200" blockAlign="center">
                  <Text as="p" variant="bodySm" fontWeight="semibold">{t.name}:</Text>
                  <Button
                    url={`${appUrl}/embed/personalizer?templateId=${t.id}&variantId=TEST&shop=test&locale=tr`}
                    external
                    size="slim"
                  >
                    Widget'ı Aç →
                  </Button>
                </InlineStack>
              ))}
              {templates.length === 0 && (
                <Text as="p" tone="subdued">Önce aktif bir şablon ve çerçeve ekleyin.</Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
