import {
  BlockStack, Button, Checkbox, FormLayout, InlineStack, Select, Text, TextField, Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  WORDART_PALETTES,
  WORDART_SHAPES,
  normalizeWordArtConfig,
  wordArtShapePath,
  type WordArtOrientation,
  type WordArtShapeId,
  type WordArtTemplateConfig,
} from "~/lib/wordart";

/**
 * Kelime sanatı şablonunun ayarları. Durumu kendi içinde tutar ve kaydetme
 * formuna `wordart_config` gizli alanıyla katılır.
 *
 * Seçim listeleri "müşteriye açılanlar" demek: yalnızca bir şekil/font/palet
 * işaretliyse müşteri penceresinde o seçim hiç görünmez.
 */
export function WordArtSettings({ initial }: { initial: unknown }) {
  const start = normalizeWordArtConfig(initial);
  const [shapes, setShapes] = useState<WordArtShapeId[]>(start.shapes);
  const [fonts, setFonts] = useState<string[]>(start.fonts);
  const [palettes, setPalettes] = useState<string[]>(start.palettes);
  const [orientation, setOrientation] = useState<WordArtOrientation>(start.orientation);
  const [minFontPx, setMinFontPx] = useState(String(start.minFontPx));
  const [maxFontPx, setMaxFontPx] = useState(String(start.maxFontPx));
  const [maxWords, setMaxWords] = useState(String(start.maxWords));
  const [maxWordLength, setMaxWordLength] = useState(String(start.maxWordLength));
  const [sampleWords, setSampleWords] = useState(start.sampleWords.join("\n"));
  const [defaultLetter, setDefaultLetter] = useState(start.defaultLetter);
  const [background, setBackground] = useState(start.background);
  const [repeatWords, setRepeatWords] = useState(start.repeatWords);
  const [canvasWidth, setCanvasWidth] = useState(String(start.canvasWidth));
  const [canvasHeight, setCanvasHeight] = useState(String(start.canvasHeight));

  const config: WordArtTemplateConfig = normalizeWordArtConfig({
    shapes, fonts, palettes, orientation,
    minFontPx: Number(minFontPx), maxFontPx: Number(maxFontPx),
    maxWords: Number(maxWords), maxWordLength: Number(maxWordLength),
    sampleWords: sampleWords.split(/\r?\n/),
    defaultLetter, background, repeatWords,
    canvasWidth: Number(canvasWidth), canvasHeight: Number(canvasHeight),
    seed: start.seed,
  }, FONT_LIBRARY.map((f) => f.id));

  // ── Önizleme ─────────────────────────────────────────────────────────
  const [previewShape, setPreviewShape] = useState<string>("");
  const [preview, setPreview] = useState<{ image: string; placed: number; skipped: string[] } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [variant, setVariant] = useState(0);

  async function runPreview(nextVariant = variant) {
    setPreviewing(true);
    setPreviewError("");
    try {
      const res = await fetch("/api/personalizer/wordart-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          words: config.sampleWords.join("\n"),
          choices: { shape: previewShape || config.shapes[0], variant: nextVariant },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Önizleme üretilemedi");
      setPreview(data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Önizleme üretilemedi");
    } finally {
      setPreviewing(false);
    }
  }

  const toggle = <T extends string>(list: T[], set: (v: T[]) => void, id: T) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Müşteriye açılan şekiller</Text>
        <Text as="p" tone="subdued" variant="bodySm">İlk işaretlediğiniz şekil varsayılan olur. Harf şeklinde müşteri kendi harfini seçer.</Text>
        <InlineStack gap="200" wrap>
          {WORDART_SHAPES.map((s) => {
            const on = shapes.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} onClick={() => toggle(shapes, setShapes, s.id)} aria-pressed={on}>
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  {s.id === "letter"
                    ? <text x="11" y="17" textAnchor="middle" fontSize="17" fontWeight="900" fill="currentColor">A</text>
                    : <path d={wordArtShapePath(s.id, 20, 20)} transform="translate(1 1)" fill="currentColor" />}
                </svg>
                {s.label}
              </button>
            );
          })}
        </InlineStack>
        {shapes.includes("letter") && (
          <div style={{ maxWidth: 160 }}>
            <TextField label="Varsayılan harf" value={defaultLetter} onChange={(v) => setDefaultLetter(v.slice(0, 2))} autoComplete="off" />
          </div>
        )}
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Yazı tipleri</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} onClick={() => toggle(fonts, setFonts, f.id)} aria-pressed={on} title={f.role}>
                {f.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Renk paletleri</Text>
        <Text as="p" tone="subdued" variant="bodySm">Koyu ürünler için Beyaz ya da Neon, açık ürünler için diğerlerini açın.</Text>
        <InlineStack gap="200" wrap>
          {WORDART_PALETTES.map((p) => {
            const on = palettes.includes(p.id);
            return (
              <button key={p.id} type="button" style={chip(on)} onClick={() => toggle(palettes, setPalettes, p.id)} aria-pressed={on}>
                <span style={{ display: "inline-flex" }}>
                  {p.colors.slice(0, 5).map((c) => (
                    <span key={c} style={{ width: 12, height: 12, background: c, border: "1px solid #d0d0d0", marginRight: -3, borderRadius: 3 }} />
                  ))}
                </span>
                <span style={{ marginLeft: 4 }}>{p.label}</span>
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <Select
            label="Kelime yönü"
            options={[
              { label: "Karışık (çoğu yatay, bazıları dikey)", value: "mixed" },
              { label: "Hepsi yatay", value: "horizontal" },
              { label: "Hepsi dikey", value: "vertical" },
            ]}
            value={orientation}
            onChange={(v) => setOrientation(v as WordArtOrientation)}
          />
          <TextField
            label="Şekil zemin rengi"
            value={background}
            onChange={setBackground}
            autoComplete="off"
            placeholder="#ffffff"
            helpText="Boş bırakılırsa şeffaf; kelimeler doğrudan ürünün üstüne basılır."
          />
        </FormLayout.Group>
        <FormLayout.Group>
          <TextField label="En fazla kelime" type="number" value={maxWords} onChange={setMaxWords} autoComplete="off" />
          <TextField label="Kelime başına en fazla harf" type="number" value={maxWordLength} onChange={setMaxWordLength} autoComplete="off" />
        </FormLayout.Group>
        <Checkbox
          label="Boşlukları kelimeleri tekrarlayarak doldur"
          checked={repeatWords}
          onChange={setRepeatWords}
          helpText="Kapalıysa her kelime yalnızca bir kez yazılır; az kelimede şekil seçilemeyecek kadar boş kalır."
        />
        <TextField
          label="Örnek kelimeler"
          value={sampleWords}
          onChange={setSampleWords}
          multiline={5}
          autoComplete="off"
          helpText="Her satıra bir kelime. Başına * koyulan kelime büyük yazılır. Müşteri penceresi bu listeyle açılır."
        />
      </FormLayout>

      <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#303030" }}>
          Tuval ve punto
        </summary>
        <div style={{ marginTop: 16 }}>
          <FormLayout>
            <FormLayout.Group>
              <TextField label="Tuval genişliği (px)" type="number" value={canvasWidth} onChange={setCanvasWidth} autoComplete="off" />
              <TextField label="Tuval yüksekliği (px)" type="number" value={canvasHeight} onChange={setCanvasHeight} autoComplete="off" />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField label="En küçük punto (px)" type="number" value={minFontPx} onChange={setMinFontPx} autoComplete="off"
                helpText="Baskıda okunabilirlik sınırı. 2400 px ≈ 30 cm basılırsa 28 px ≈ 3,5 mm." />
              <TextField label="En büyük punto (px)" type="number" value={maxFontPx} onChange={setMaxFontPx} autoComplete="off" />
            </FormLayout.Group>
          </FormLayout>
        </div>
      </details>

      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Önizleme</Text>
        <InlineStack gap="200" blockAlign="end">
          <div style={{ minWidth: 160 }}>
            <Select
              label="Şekil"
              options={config.shapes.map((id) => ({ label: WORDART_SHAPES.find((s) => s.id === id)?.label ?? id, value: id }))}
              value={previewShape || config.shapes[0]}
              onChange={setPreviewShape}
            />
          </div>
          <Button onClick={() => { setVariant(0); runPreview(0); }} loading={previewing}>Örnek kelimelerle önizle</Button>
          {preview && (
            <Button variant="plain" onClick={() => { const v = (variant + 1) % 20; setVariant(v); runPreview(v); }} disabled={previewing}>
              Farklı dizilim
            </Button>
          )}
        </InlineStack>
        {previewError && <Banner tone="critical">{previewError}</Banner>}
        {preview && (
          <BlockStack gap="200">
            <div style={{
              background: "repeating-conic-gradient(#f1f1f1 0% 25%, #fff 0% 50%) 50% / 20px 20px",
              border: "1px solid #e1e3e5", borderRadius: 8, padding: 12, display: "flex", justifyContent: "center",
            }}>
              <img src={preview.image} alt="Kelime sanatı önizlemesi" style={{ maxWidth: "100%", maxHeight: 420 }} />
            </div>
            <Text as="p" tone="subdued" variant="bodySm">
              {`${preview.placed} kelime yerleşti.`}
              {preview.skipped.length > 0 && ` Sığmayan: ${preview.skipped.join(", ")}.`}
            </Text>
          </BlockStack>
        )}
      </BlockStack>

      <input type="hidden" name="wordart_config" readOnly value={JSON.stringify(config)} />
    </BlockStack>
  );
}
