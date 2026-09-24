import { BlockStack, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  STARMAP_DATE_FORMATS,
  STARMAP_SUBTITLE_MAX,
  STARMAP_THEMES,
  STARMAP_TITLE_MAX,
  type StarmapConfig,
  type StarmapDateFormat,
  type StarmapThemeId,
} from "~/lib/generators/starmap/config";
import { STARMAP_CITIES, TURKEY_CITY_COUNT } from "~/lib/generators/starmap/data/cities";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/starmap";

/**
 * Yıldız haritası şablonunun ayarları. Seçim listeleri "müşteriye açılanlar":
 * yalnızca bir tema ya da font işaretliyse pencerede o seçim hiç görünmez.
 */
export function StarmapSettings({ value, onChange }: GeneratorSettingsProps<StarmapConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const set = <K extends keyof StarmapConfig>(key: K, v: StarmapConfig[K]) => onChange({ ...value, [key]: v });
  const toggle = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

  const cityOptions = [
    { title: L.turkey, options: STARMAP_CITIES.slice(0, TURKEY_CITY_COUNT).map((c) => ({ label: en ? c.nameEn ?? c.name : c.name, value: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label, lang)) },
    { title: L.world, options: STARMAP_CITIES.slice(TURKEY_CITY_COUNT).map((c) => ({ label: en ? `${c.nameEn ?? c.name} (${c.countryEn ?? c.country})` : `${c.name} (${c.country})`, value: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label, lang)) },
  ];

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.themesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.themesHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {STARMAP_THEMES.map((t) => {
            const on = value.themes.includes(t.id);
            return (
              <button key={t.id} type="button" style={chip(on)} title={en ? t.hintEn : t.hint} aria-pressed={on}
                onClick={() => set("themes", toggle<StarmapThemeId>(value.themes, t.id))}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", background: t.swatch.bg, border: "1px solid #c9cccf",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: t.swatch.ink }} />
                </span>
                {en ? t.labelEn : t.label}
              </button>
            );
          })}
        </InlineStack>
        <Checkbox
          label={L.fillCanvas}
          checked={value.fillCanvas}
          onChange={(v) => set("fillCanvas", v)}
          helpText={L.fillCanvasHelp}
        />
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.fontsHelp}</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} title={lang === "en" ? (f.roleEn ?? f.role) : f.role} aria-pressed={on}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.skyTitle}</Text>
        <FormLayout>
          <FormLayout.Group>
            <BlockStack gap="100">
              <Checkbox label={L.constellationsDefault} checked={value.constellationsDefault}
                onChange={(v) => set("constellationsDefault", v)} />
              <Checkbox label={L.allowConstellationToggle} checked={value.allowConstellationToggle}
                onChange={(v) => set("allowConstellationToggle", v)} />
            </BlockStack>
            <BlockStack gap="100">
              <Checkbox label={L.gridDefault} checked={value.gridDefault}
                onChange={(v) => set("gridDefault", v)} />
              <Checkbox label={L.allowGridToggle} checked={value.allowGridToggle}
                onChange={(v) => set("allowGridToggle", v)} />
            </BlockStack>
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <TextField label={L.defaultTitle} value={value.defaultTitle} maxLength={STARMAP_TITLE_MAX} showCharacterCount
            onChange={(v) => set("defaultTitle", v)} autoComplete="off" />
          <TextField label={L.defaultSubtitle} value={value.defaultSubtitle} maxLength={STARMAP_SUBTITLE_MAX} showCharacterCount
            onChange={(v) => set("defaultSubtitle", v)} autoComplete="off" placeholder={L.defaultSubtitlePlaceholder} />
        </FormLayout.Group>
        <FormLayout.Group>
          <Select label={L.defaultCity} options={cityOptions} value={value.defaultCity}
            onChange={(v) => set("defaultCity", v)} />
          <Select label={L.dateFormat} value={value.dateFormat}
            options={STARMAP_DATE_FORMATS.map((d) => ({ label: value.language === "en" ? d.labelEn : d.label, value: d.id }))}
            onChange={(v) => set("dateFormat", v as StarmapDateFormat)} />
        </FormLayout.Group>
        <FormLayout.Group>
          <Select label={L.language} value={value.language}
            options={[
              { label: L.languageTr, value: "tr" },
              { label: L.languageEn, value: "en" },
            ]}
            onChange={(v) => set("language", v === "en" ? "en" : "tr")} />
          <div style={{ paddingTop: 24 }}>
            <Checkbox label={L.showCoordinates} checked={value.showCoordinates}
              onChange={(v) => set("showCoordinates", v)} />
          </div>
        </FormLayout.Group>
      </FormLayout>
    </BlockStack>
  );
}
