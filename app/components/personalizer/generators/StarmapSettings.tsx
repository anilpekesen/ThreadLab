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

/**
 * Yıldız haritası şablonunun ayarları. Seçim listeleri "müşteriye açılanlar":
 * yalnızca bir tema ya da font işaretliyse pencerede o seçim hiç görünmez.
 */
export function StarmapSettings({ value, onChange }: GeneratorSettingsProps<StarmapConfig>) {
  const set = <K extends keyof StarmapConfig>(key: K, v: StarmapConfig[K]) => onChange({ ...value, [key]: v });
  const toggle = <T extends string>(list: T[], id: T) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

  const cityOptions = [
    { title: "Türkiye", options: STARMAP_CITIES.slice(0, TURKEY_CITY_COUNT).map((c) => ({ label: c.name, value: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label, "tr")) },
    { title: "Dünya", options: STARMAP_CITIES.slice(TURKEY_CITY_COUNT).map((c) => ({ label: `${c.name} (${c.country})`, value: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label, "tr")) },
  ];

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Müşteriye açılan temalar</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          İlk işaretlediğiniz tema varsayılan olur. Siyah tişört için "Beyaz mürekkep", beyaz tişört için "Siyah mürekkep" açın.
        </Text>
        <InlineStack gap="200" wrap>
          {STARMAP_THEMES.map((t) => {
            const on = value.themes.includes(t.id);
            return (
              <button key={t.id} type="button" style={chip(on)} title={t.hint} aria-pressed={on}
                onClick={() => set("themes", toggle<StarmapThemeId>(value.themes, t.id))}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", background: t.swatch.bg, border: "1px solid #c9cccf",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: t.swatch.ink }} />
                </span>
                {t.label}
              </button>
            );
          })}
        </InlineStack>
        <Checkbox
          label="Lacivert ve siyah temada zemini tüm tuvale yay (poster)"
          checked={value.fillCanvas}
          onChange={(v) => set("fillCanvas", v)}
          helpText="Poster ve çerçeve ürünleri için. Kapalıyken yalnız daire dolgulu olur, yazılar zemin renginde şeffafın üstüne basılır."
        />
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Başlık yazı tipleri</Text>
        <Text as="p" tone="subdued" variant="bodySm">Tarih ve koordinat satırı her zaman Montserrat ile basılır.</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} title={f.role} aria-pressed={on}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Gökyüzü</Text>
        <FormLayout>
          <FormLayout.Group>
            <BlockStack gap="100">
              <Checkbox label="Takımyıldız çizgileri varsayılan olarak açık" checked={value.constellationsDefault}
                onChange={(v) => set("constellationsDefault", v)} />
              <Checkbox label="Müşteri takımyıldız çizgilerini açıp kapatabilsin" checked={value.allowConstellationToggle}
                onChange={(v) => set("allowConstellationToggle", v)} />
            </BlockStack>
            <BlockStack gap="100">
              <Checkbox label="Koordinat ızgarası varsayılan olarak açık" checked={value.gridDefault}
                onChange={(v) => set("gridDefault", v)} />
              <Checkbox label="Müşteri ızgarayı açıp kapatabilsin" checked={value.allowGridToggle}
                onChange={(v) => set("allowGridToggle", v)} />
            </BlockStack>
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <TextField label="Varsayılan başlık" value={value.defaultTitle} maxLength={STARMAP_TITLE_MAX} showCharacterCount
            onChange={(v) => set("defaultTitle", v)} autoComplete="off" />
          <TextField label="Varsayılan alt metin" value={value.defaultSubtitle} maxLength={STARMAP_SUBTITLE_MAX} showCharacterCount
            onChange={(v) => set("defaultSubtitle", v)} autoComplete="off" placeholder="Örn: Ayşe & Oğuz" />
        </FormLayout.Group>
        <FormLayout.Group>
          <Select label="Varsayılan şehir" options={cityOptions} value={value.defaultCity}
            onChange={(v) => set("defaultCity", v)} />
          <Select label="Tarih satırı biçimi" value={value.dateFormat}
            options={STARMAP_DATE_FORMATS.map((d) => ({ label: d.label, value: d.id }))}
            onChange={(v) => set("dateFormat", v as StarmapDateFormat)} />
        </FormLayout.Group>
        <FormLayout.Group>
          <Select label="Tarih ve koordinat dili" value={value.language}
            options={[
              { label: "Türkçe (12 Haziran 2020 · 41.0082° K)", value: "tr" },
              { label: "İngilizce (June 12, 2020 · 41.0082° N)", value: "en" },
            ]}
            onChange={(v) => set("language", v === "en" ? "en" : "tr")} />
          <div style={{ paddingTop: 24 }}>
            <Checkbox label="Koordinat satırını göster" checked={value.showCoordinates}
              onChange={(v) => set("showCoordinates", v)} />
          </div>
        </FormLayout.Group>
      </FormLayout>
    </BlockStack>
  );
}
