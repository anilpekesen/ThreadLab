import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useNavigate } from "@remix-run/react";
import { Banner, Button, Page, Text, TextField } from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  createPersonalizerTemplate,
  normalizePersonalizerCategory,
  type PersonalizerCategory,
  type ScatterTemplateConfig,
  type TextFieldDef,
} from "~/models/personalizer.server";
import { DEFAULT_WORDART, normalizeWordArtConfig } from "~/lib/wordart";
import { GENERATOR_CONFIGS } from "~/lib/generators/configs";
import { GENERATOR_KINDS, isGeneratorKind, type GeneratorConfigBase, type GeneratorKind } from "~/lib/generators/types";
import { pickDict, useDict, useTranslation, type Lang } from "~/i18n";
import { langFromRequest } from "~/i18n/server";
import dict from "~/i18n/personalizer/new";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate(request);
  return json({ ok: true });
};

function defaultAiTextFields(L: typeof dict.tr): TextFieldDef[] {
  return [
    {
      id: "name", label: L.aiNameLabel, placeholder: L.aiNamePlaceholder,
      x: 1200, y: 2520, font_size: 180, color: "#111111",
      bold: true, max_length: 20, align: "center",
    },
    {
      id: "story", label: L.aiStoryLabel, placeholder: L.aiStoryPlaceholder,
      x: 1200, y: 2730, font_size: 78, color: "#444444",
      bold: false, max_length: 160, align: "center",
    },
  ];
}

const EN_WORDART_SAMPLE_WORDS = ["*I Love You", "My Love", "Sweetheart", "Forever", "Soulmate", "Always", "My Heart"];

/** Yönetim dili İngilizceyse yeni kelime sanatı şablonu İngilizce örnek kelimelerle başlar */
function defaultWordArt(lang: Lang) {
  if (lang !== "en") return DEFAULT_WORDART;
  return normalizeWordArtConfig({ ...DEFAULT_WORDART, sampleWords: EN_WORDART_SAMPLE_WORDS });
}

/** Yönetim dili İngilizceyse üreticinin metin varsayılanları İngilizce kurulur */
function defaultGeneratorConfig(kind: GeneratorKind, lang: Lang): GeneratorConfigBase {
  const mod = GENERATOR_CONFIGS[kind];
  if (lang !== "en") return mod.defaults;
  const overrides: Record<GeneratorKind, Record<string, unknown>> = {
    song: { sampleTitle: "Our Song", sampleArtist: "You and Me" },
    monogram: {},
    starmap: { language: "en", defaultTitle: "The Night We Met" },
    citymap: { labelLanguage: "en" },
    birthflower: { titlePlaceholder: "Mom's Garden" },
  };
  return mod.normalize({ ...mod.defaults, ...overrides[kind] });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await request.formData();
  const lang = langFromRequest(request, form);
  const L = pickDict(dict, lang);
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const category = normalizePersonalizerCategory(form.get("category"));
  if (!name) return json({ error: L.nameRequired }, { status: 400 });

  const generatorKind = String(form.get("generator_kind") ?? "");
  if (category === "generator" && !isGeneratorKind(generatorKind)) {
    return json({ error: L.kindMissing }, { status: 400 });
  }
  const layoutMode = category === "boxer" ? "scatter" : category === "ai" ? "ai"
    : category === "wordart" ? "wordart" : category === "generator" ? "generator" : "mask";
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
    text_fields: category === "ai" ? defaultAiTextFields(L) : [],
    ai_style: "caricature",
    scatter_config: scatterConfig,
    wordart_config: category === "wordart" ? defaultWordArt(lang) : undefined,
    generator_config: category === "generator"
      ? defaultGeneratorConfig(generatorKind as GeneratorKind, lang)
      : undefined,
    sort_order: 0,
  });

  // Çerçeve şablonunun asıl kurulumu stüdyoda; araya şablon sayfasını koymak
  // mağaza sahibini bir ekran daha dolaştırıyordu.
  return json({
    redirectTo: category === "frame"
      ? `/app/personalizer/${template.id}/studio`
      : `/app/personalizer/${template.id}`,
  });
};

type WizardType = {
  key: string;
  id: PersonalizerCategory;
  generatorKind?: GeneratorKind;
  title: string;
  description: string;
  tags: string[];
  flow: Array<{ title: string; description: string }>;
};

const BASE_TYPE_IDS = ["apparel", "boxer", "frame", "wordart", "ai"] as const;

/** Sihirbazdaki kartlar: temel türler + her hazır üretici ayrı bir kart */
function wizardTypes(L: typeof dict.tr, lang: Lang): WizardType[] {
  return [
    ...BASE_TYPE_IDS.map((id) => ({ key: id, id: id as PersonalizerCategory, ...L.types[id] })),
    ...GENERATOR_KINDS.map((g) => ({
      key: `generator:${g.kind}`,
      id: "generator" as PersonalizerCategory,
      generatorKind: g.kind,
      title: lang === "en" ? g.labelEn : g.label,
      description: lang === "en" ? g.descriptionEn : g.description,
      tags: lang === "en" ? g.tagsEn : g.tags,
      flow: L.generatorFlow,
    })),
  ];
}

function TypeIcon({ category }: { category: PersonalizerCategory }) {
  const line = {
    fill: "none", stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (category === "apparel") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="m8 4-5 3 2.3 4L8 9.5V20h8V9.5l2.7 1.5L21 7l-5-3c-.7 1.4-2 2-4 2S8.7 5.4 8 4Z" /></svg>;
  if (category === "boxer") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M5 4h14l-1 16h-5l-1-9-1 9H6L5 4Zm0 4h14M9 4v4m6-4v4" /></svg>;
  if (category === "generator") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3l2.2 5.6L20 9.3l-4.4 3.8L17 19l-5-3.1L7 19l1.4-5.9L4 9.3l5.8-.7L12 3Z" /></svg>;
  if (category === "wordart") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /><path {...line} d="M9 10h6M9.5 13h5" /></svg>;
  if (category === "ai") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...line} d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2m0-12-2 2M8 16l-2 2" /><circle {...line} cx="12" cy="12" r="4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...line} x="4" y="3" width="16" height="18" rx="1" /><path {...line} d="m7 17 4-5 3 3 2-2 2 4M9 8h.01" /></svg>;
}

export default function NewPersonalizerTemplate() {
  const fetcher = useFetcher<{ error?: string; redirectTo?: string }>();
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const L = useDict(dict);
  const TYPES = useMemo(() => wizardTypes(L, lang), [L, lang]);
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const selected = TYPES.find((item) => item.key === category) ?? null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.redirectTo) navigate(fetcher.data.redirectTo);
  }, [fetcher.state, fetcher.data, navigate]);

  function next() {
    if (step === 1 && category) setStep(2);
    if (step === 2) {
      if (!name.trim()) {
        setNameError(L.nameRequired);
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
      generator_kind: selected.generatorKind ?? "",
      _lang: lang,
    }, { method: "POST" });
  }

  const flow = selected?.flow ?? L.defaultFlow;

  return (
    <Page
      title={L.pageTitle}
      subtitle={L.pageSubtitle}
      backAction={{ content: L.back, onAction: () => navigate("/app/personalizer") }}
    >
      <div className="pl-new-shell">
        <div className="pl-stepper" aria-label={L.stepsAria}>
          {L.steps.map((label, index) => {
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
                    <Text as="h2" variant="headingLg">{L.step1Title}</Text>
                    <p>{L.step1Body}</p>
                  </div>
                  <div className="pl-type-list">
                    {TYPES.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`pl-type-option${category === item.key ? " is-selected" : ""}`}
                        onClick={() => setCategory(item.key)}
                        aria-pressed={category === item.key}
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
                    <Text as="h2" variant="headingLg">{L.step2Title}</Text>
                    <p>{L.step2Body}</p>
                  </div>
                  <div className="pl-details-form">
                    <TextField
                      label={L.nameLabel}
                      value={name}
                      onChange={(value) => { setName(value); if (value.trim()) setNameError(""); }}
                      error={nameError}
                      autoComplete="off"
                      placeholder={selected?.id === "boxer" ? L.placeholderBoxer : selected?.id === "frame" ? L.placeholderFrame : selected?.id === "wordart" ? L.placeholderWordart : selected?.generatorKind ? (() => { const g = GENERATOR_KINDS.find((k) => k.kind === selected.generatorKind); return lang === "en" ? g?.namePlaceholderEn : g?.namePlaceholder; })() : L.placeholderDefault}
                      helpText={L.nameHelp}
                    />
                    <TextField
                      label={L.descriptionLabel}
                      value={description}
                      onChange={setDescription}
                      autoComplete="off"
                      multiline={3}
                      placeholder={L.descriptionPlaceholder}
                      helpText={L.optional}
                    />
                  </div>
                </>
              ) : null}

              {step === 3 && selected ? (
                <>
                  <div className="pl-new-heading">
                    <Text as="h2" variant="headingLg">{L.step3Title}</Text>
                    <p>{L.step3Body}</p>
                  </div>
                  <div className="pl-review">
                    <div className="pl-review-row"><span className="pl-review-label">{L.reviewGroup}</span><span className="pl-review-value">{selected.title}</span></div>
                    <div className="pl-review-row"><span className="pl-review-label">{L.reviewName}</span><span className="pl-review-value">{name}</span></div>
                    <div className="pl-review-row">
                      <span className="pl-review-label">{L.reviewNext}</span>
                      <span className="pl-review-value">
                        {selected.id === "boxer" ? L.nextBoxer : selected.id === "frame" ? L.nextFrame : selected.id === "ai" ? L.nextAi : selected.id === "wordart" ? L.nextWordart : selected.id === "generator" ? L.nextGenerator : L.nextApparel}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <Banner tone="info">{L.notLinkedInfo}</Banner>
                  </div>
                </>
              ) : null}
            </div>

            <div className="pl-new-actions">
              <Button variant="plain" onClick={() => step === 1 ? navigate("/app/personalizer") : setStep(step - 1)}>
                {step === 1 ? L.cancel : L.backStep}
              </Button>
              {step < 3 ? (
                <Button variant="primary" onClick={next} disabled={step === 1 && !category}>{L.continue}</Button>
              ) : (
                <Button variant="primary" onClick={createTemplate} loading={fetcher.state !== "idle"}>{L.create}</Button>
              )}
            </div>
          </section>

          <aside className="pl-new-aside">
            <h3>{L.asideTitle}</h3>
            <p>{selected ? L.asideFor(selected.title) : L.asideEmpty}</p>
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
