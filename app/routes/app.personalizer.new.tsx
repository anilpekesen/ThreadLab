import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useNavigate } from "@remix-run/react";
import { Banner, Button, Page, Text, TextField } from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  createPersonalizerTemplate,
  normalizePersonalizerCategory,
  type PersonalizerCategory,
  type ScatterTemplateConfig,
  type TextFieldDef,
} from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate(request);
  return json({ ok: true });
};

function defaultAiTextFields(): TextFieldDef[] {
  return [
    {
      id: "name", label: "İsim", placeholder: "Örn: ELİF",
      x: 1200, y: 2520, font_size: 180, color: "#111111",
      bold: true, max_length: 20, align: "center",
    },
    {
      id: "story", label: "Hikâye / Not", placeholder: "Kısa bir cümle yazın",
      x: 1200, y: 2730, font_size: 78, color: "#444444",
      bold: false, max_length: 160, align: "center",
    },
  ];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const category = normalizePersonalizerCategory(form.get("category"));
  if (!name) return json({ error: "Şablon adı gerekli" }, { status: 400 });

  const layoutMode = category === "boxer" ? "scatter" : category === "ai" ? "ai" : "mask";
  const scatterConfig: ScatterTemplateConfig | undefined = category === "boxer" ? {
    faceCount: 13,
    decorationCount: 8,
    faceScale: 0.16,
    decorationScale: 0.1,
    sizeJitter: 0.18,
    angleJitter: 0,
    reserveCenter: null,
    seed: 1,
    canvasWidth: 2400,
    canvasHeight: 1650,
  } : undefined;

  const template = await createPersonalizerTemplate({
    shop: session.shop,
    name,
    description,
    category,
    layout_mode: layoutMode,
    template_url: "",
    photo_x: 440,
    photo_y: 600,
    photo_width: 1600,
    photo_height: 1600,
    text_fields: category === "ai" ? defaultAiTextFields() : [],
    ai_style: "caricature",
    scatter_config: scatterConfig,
    sort_order: 0,
  });

  return json({ redirectTo: `/app/personalizer/${template.id}` });
};

const TYPES: Array<{
  id: PersonalizerCategory;
  title: string;
  description: string;
  tags: string[];
  flow: Array<{ title: string; description: string }>;
}> = [
  {
    id: "apparel",
    title: "Tişört ve giyim",
    description: "Tişört, sweatshirt ve benzeri ürünlerde baskı alanına yerleşen tasarımlar.",
    tags: ["Tek görsel", "Ön / arka yüz"],
    flow: [
      { title: "Tasarımı yükleyin", description: "Müşteri fotoğrafının yerleşeceği tasarımı ekleyin." },
      { title: "Baskı alanını ayarlayın", description: "Görselin ürün üzerinde görüneceği alanı belirleyin." },
      { title: "Ürüne bağlayın", description: "Şablonu ilgili Shopify ürününe ve yüzüne bağlayın." },
    ],
  },
  {
    id: "boxer",
    title: "Boxer ve tekrarlı desen",
    description: "Müşteri fotoğrafını ve süslemeyi baskı yüzeyine tekrar eden desen olarak yayın.",
    tags: ["Tekrarlı desen", "Süsleme"],
    flow: [
      { title: "Deseni ayarlayın", description: "Fotoğraf sayısını, boyutunu ve desen yoğunluğunu belirleyin." },
      { title: "Süslemeyi ekleyin", description: "Kalp, yıldız veya ürüne özel saydam görseli yükleyin." },
      { title: "Müşteri seçeneklerini açın", description: "Boyut, yoğunluk ve farklı dizilim seçeneklerini belirleyin." },
    ],
  },
  {
    id: "frame",
    title: "Fotoğraflı çerçeve",
    description: "Tek fotoğraflı, kolaj veya birden fazla parçadan oluşan çerçeve ürünleri.",
    tags: ["Çoklu fotoğraf", "Set desteği"],
    flow: [
      { title: "Baskı ebadını seçin", description: "Çerçevenin fiziksel ölçüsünü ve baskı oranını belirleyin." },
      { title: "Fotoğraf alanlarını kurun", description: "Tekli, kolaj veya set parçalarındaki alanları yerleştirin." },
      { title: "Ürün görsellerini ekleyin", description: "Renk ve varyanta göre müşteri önizlemelerini tanımlayın." },
    ],
  },
  {
    id: "ai",
    title: "AI portre",
    description: "Müşteri fotoğrafından seçtiğiniz stile uygun sanatsal portre üretin.",
    tags: ["Ayrı akış", "Stil seçimi"],
    flow: [
      { title: "Portre stilini seçin", description: "Karikatür, suluboya veya diğer görsel stilini belirleyin." },
      { title: "Müşteri alanlarını düzenleyin", description: "Fotoğraf, isim ve kısa not alanlarını hazırlayın." },
      { title: "Çıktıyı ürüne bağlayın", description: "Üretilecek baskı dosyasını ilgili ürüne bağlayın." },
    ],
  },
];

function TypeIcon({ category }: { category: PersonalizerCategory }) {
  const line = {
    fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (category === "apparel") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="m8 4-5 3 2.3 4L8 9.5V20h8V9.5l2.7 1.5L21 7l-5-3c-.7 1.4-2 2-4 2S8.7 5.4 8 4Z" /></svg>;
  if (category === "boxer") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M5 4h14l-1 16h-5l-1-9-1 9H6L5 4Zm0 4h14M9 4v4m6-4v4" /></svg>;
  if (category === "ai") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2" /><circle {...line} cx="12" cy="12" r="4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...line} x="4" y="3" width="16" height="18" rx="1" /><path {...line} d="m7 17 4-5 3 3 2-2 2 4M9 8h.01" /></svg>;
}

export default function NewPersonalizerTemplate() {
  const fetcher = useFetcher<{ error?: string; redirectTo?: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<PersonalizerCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const selected = TYPES.find((item) => item.id === category) ?? null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.redirectTo) navigate(fetcher.data.redirectTo);
  }, [fetcher.state, fetcher.data, navigate]);

  function next() {
    if (step === 1 && category) setStep(2);
    if (step === 2) {
      if (!name.trim()) {
        setNameError("Şablon adı gerekli");
        return;
      }
      setNameError("");
      setStep(3);
    }
  }

  function createTemplate() {
    if (!selected || !name.trim()) return;
    fetcher.submit({
      name: name.trim(),
      description: description.trim(),
      category: selected.id,
    }, { method: "POST" });
  }

  const flow = selected?.flow ?? [
    { title: "Ürün yolunu seçin", description: "Satacağınız ürüne uygun kurulum akışını açın." },
    { title: "Temel bilgileri girin", description: "Ekibinizin kolay bulacağı bir ad ve açıklama ekleyin." },
    { title: "Gelişmiş kurulumu tamamlayın", description: "Baskı ve müşteri seçeneklerini editörde ayarlayın." },
  ];

  return (
    <Page
      title="Yeni şablon"
      subtitle="Ürününüze uygun akışla başlayın; teknik ayarları bir sonraki ekranda tamamlayın."
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
    >
      <div className="pl-new-shell">
        <div className="pl-stepper" aria-label="Şablon oluşturma adımları">
          {["Tür", "Temel bilgiler", "Kurulum"].map((label, index) => {
            const number = index + 1;
            const state = number === step ? "is-active" : number < step ? "is-complete" : "";
            return (
              <div className={`pl-step ${state}`} key={label} aria-current={number === step ? "step" : undefined}>
                <span className="pl-step-number">{number < step ? "✓" : number}</span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>

        {fetcher.data?.error ? <div style={{ marginBottom: 16 }}><Banner tone="critical">{fetcher.data.error}</Banner></div> : null}

        <div className="pl-new-grid">
          <section className="pl-new-main">
            <div className="pl-new-content">
              {step === 1 ? (
                <>
                  <div className="pl-new-heading">
                    <Text as="h2" variant="headingLg">Ne oluşturacaksınız?</Text>
                    <p>Doğru ürün grubunu seçtiğinizde yalnızca ihtiyacınız olan ayarlar hazırlanır.</p>
                  </div>
                  <div className="pl-type-list">
                    {TYPES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`pl-type-option${category === item.id ? " is-selected" : ""}`}
                        onClick={() => setCategory(item.id)}
                        aria-pressed={category === item.id}
                      >
                        <span className="pl-type-icon"><TypeIcon category={item.id} /></span>
                        <span className="pl-type-copy">
                          <strong>{item.title}</strong>
                          <span>{item.description}</span>
                        </span>
                        <span className="pl-type-tags">
                          {item.tags.map((tag) => <span className="pl-type-tag" key={tag}>{tag}</span>)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="pl-new-heading">
                    <Text as="h2" variant="headingLg">Temel bilgiler</Text>
                    <p>Şablonu listenizde kolayca ayırt edebileceğiniz kısa bilgiler girin.</p>
                  </div>
                  <div className="pl-details-form">
                    <TextField
                      label="Şablon adı"
                      value={name}
                      onChange={(value) => { setName(value); if (value.trim()) setNameError(""); }}
                      error={nameError}
                      autoComplete="off"
                      placeholder={selected?.id === "boxer" ? "Örn: Kalpli boxer deseni" : selected?.id === "frame" ? "Örn: 12 fotoğraflı 30×40 çerçeve" : "Örn: Anneler Günü tasarımı"}
                      helpText="Bu ad yalnızca yönetim ekranında görünür."
                    />
                    <TextField
                      label="Açıklama"
                      value={description}
                      onChange={setDescription}
                      autoComplete="off"
                      multiline={3}
                      placeholder="Şablonun ne zaman ve hangi ürünlerde kullanıldığını yazın."
                      helpText="İsteğe bağlı"
                    />
                  </div>
                </>
              ) : null}

              {step === 3 && selected ? (
                <>
                  <div className="pl-new-heading">
                    <Text as="h2" variant="headingLg">Şablonu oluşturun</Text>
                    <p>Temel kayıt oluşturulduktan sonra gelişmiş kurulum ekranına geçeceksiniz.</p>
                  </div>
                  <div className="pl-review">
                    <div className="pl-review-row"><span className="pl-review-label">Ürün grubu</span><span className="pl-review-value">{selected.title}</span></div>
                    <div className="pl-review-row"><span className="pl-review-label">Şablon adı</span><span className="pl-review-value">{name}</span></div>
                    <div className="pl-review-row">
                      <span className="pl-review-label">Sonraki adım</span>
                      <span className="pl-review-value">
                        {selected.id === "boxer" ? "Desen ve süsleme ayarları" : selected.id === "frame" ? "Baskı ebadı ve fotoğraf alanları" : selected.id === "ai" ? "Portre stili ve çıktı ayarları" : "Tasarım ve baskı alanı"}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <Banner tone="info">Şablon henüz bir ürüne bağlı değildir. Önizleme ve baskı ayarlarını tamamladıktan sonra Shopify ürününe bağlayabilirsiniz.</Banner>
                  </div>
                </>
              ) : null}
            </div>

            <div className="pl-new-actions">
              <Button variant="plain" onClick={() => step === 1 ? navigate("/app/personalizer") : setStep(step - 1)}>
                {step === 1 ? "Vazgeç" : "Geri"}
              </Button>
              {step < 3 ? (
                <Button variant="primary" onClick={next} disabled={step === 1 && !category}>Devam et</Button>
              ) : (
                <Button variant="primary" onClick={createTemplate} loading={fetcher.state !== "idle"}>Şablonu oluştur</Button>
              )}
            </div>
          </section>

          <aside className="pl-new-aside">
            <h3>Bu akışta</h3>
            <p>{selected ? `${selected.title} için önerilen kurulum sırası` : "Seçiminize göre kurulum adımları burada gösterilir."}</p>
            <ol className="pl-flow-list">
              {flow.map((item, index) => (
                <li key={item.title}>
                  <span className="pl-flow-number">{index + 1}</span>
                  <span className="pl-flow-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </Page>
  );
}
