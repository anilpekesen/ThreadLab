import { Banner, BlockStack, Checkbox, FormLayout, InlineStack, Select, Text } from "@shopify/polaris";
import type { CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import { CITYMAP_CITIES, citymapCityLabel } from "~/lib/generators/citymap/cities";
import {
  CITYMAP_FONT_IDS,
  CITYMAP_RADII,
  CITYMAP_SHAPES,
  CITYMAP_STYLES,
  type CitymapConfig,
} from "~/lib/generators/citymap/config";
import type { GeneratorSettingsProps } from "./types";

/**
 * Şehir haritası şablonunun ayarları. Listeler "müşteriye açılanlar": ilk
 * işaretlenen varsayılan olur, tek seçenek işaretliyse müşteri penceresinde o
 * seçim hiç görünmez.
 */
export function CitymapSettings({ value, onChange }: GeneratorSettingsProps<CitymapConfig>) {
  const set = <K extends keyof CitymapConfig>(k: K, v: CitymapConfig[K]) => onChange({ ...value, [k]: v });
  // Son işaret kaldırılamaz: boş liste normalize'da varsayılana döner ve
  // mağaza sahibinin kaldırdığı seçenekler geri gelir, şaşırtıcı olur.
  const toggle = <T,>(list: T[], id: T): T[] =>
    list.includes(id) ? (list.length > 1 ? list.filter((x) => x !== id) : list) : [...list, id];

  const chip = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

  const cities = value.cityScope === "tr" ? CITYMAP_CITIES.filter((c) => c.country === "TR") : CITYMAP_CITIES;
  const libFonts = FONT_LIBRARY.filter((f) => (CITYMAP_FONT_IDS as readonly string[]).includes(f.id));

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Stiller</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Tişört için şeffaf zeminli çizgi stillerini (beyaz ürüne siyah, koyu ürüne beyaz), çerçeve ve poster için zeminli stilleri açın.
        </Text>
        <InlineStack gap="200" wrap>
          {CITYMAP_STYLES.map((s) => {
            const on = value.styles.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} title={s.hint} aria-pressed={on}
                onClick={() => set("styles", toggle(value.styles, s.id))}>
                <span style={{
                  width: 18, height: 18, borderRadius: 4, border: "1px solid #c9cccf",
                  background: s.bg || (s.ink === "#ffffff" ? "#303030" : "#fff"),
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ width: 10, height: 3, background: s.ink, borderRadius: 2 }} />
                </span>
                {s.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Harita şekilleri</Text>
        <InlineStack gap="200" wrap>
          {CITYMAP_SHAPES.map((s) => {
            const on = value.shapes.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("shapes", toggle(value.shapes, s.id))}>
                <svg width="18" height="18" viewBox="0 0 100 100" aria-hidden="true"><path d={s.path} fill="currentColor" /></svg>
                {s.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Yakınlık (merkezden yarıçap)</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          1 km mahalle sokaklarını, 5 km şehrin genelini gösterir. Geniş alanlar küçük illerde boş, büyük şehirlerde çok sık görünebilir.
        </Text>
        <InlineStack gap="200" wrap blockAlign="center">
          {CITYMAP_RADII.map((r) => {
            const on = value.radii.includes(r);
            return (
              <button key={r} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("radii", toggle(value.radii, r))}>
                {String(r).replace(".", ",")} km
              </button>
            );
          })}
        </InlineStack>
        <div style={{ maxWidth: 220 }}>
          <Select
            label="Varsayılan yakınlık"
            options={value.radii.map((r) => ({ label: `${String(r).replace(".", ",")} km`, value: String(r) }))}
            value={String(value.defaultRadius)}
            onChange={(v) => set("defaultRadius", Number(v))}
          />
        </div>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Başlık yazı tipleri</Text>
        <InlineStack gap="200" wrap>
          {libFonts.map((f) => {
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

      <FormLayout>
        <FormLayout.Group>
          <Select
            label="Şehir listesi"
            options={[
              { label: "Türkiye ve dünya şehirleri", value: "all" },
              { label: "Yalnız Türkiye (81 il + ilçeler)", value: "tr" },
            ]}
            value={value.cityScope}
            onChange={(v) => set("cityScope", v as CitymapConfig["cityScope"])}
          />
          <Select
            label="Pencere açılınca seçili şehir"
            options={cities.map((c) => ({ label: citymapCityLabel(c), value: c.id }))}
            value={value.defaultCity}
            onChange={(v) => set("defaultCity", v)}
          />
        </FormLayout.Group>
        <FormLayout.Group>
          <Select
            label="Merkez işareti"
            options={[
              { label: "Kalp", value: "heart" },
              { label: "Konum iğnesi", value: "pin" },
              { label: "İşaret yok", value: "none" },
            ]}
            value={value.marker}
            onChange={(v) => set("marker", v as CitymapConfig["marker"])}
          />
          <Select
            label="Baskıdaki sabit yazıların dili"
            options={[
              { label: "Türkçe (41.0082° K / 28.9784° D, TÜRKİYE)", value: "tr" },
              { label: "English (41.0082° N / 28.9784° E)", value: "en" },
            ]}
            value={value.labelLanguage}
            onChange={(v) => set("labelLanguage", v as CitymapConfig["labelLanguage"])}
          />
        </FormLayout.Group>
        <Checkbox
          label="Koordinat satırını göster"
          checked={value.showCoordinates}
          onChange={(v) => set("showCoordinates", v)}
        />
        <Checkbox
          label="Parkları yeşil boya (poster stilleri)"
          checked={value.showParks}
          onChange={(v) => set("showParks", v)}
          helpText="Tek renk çizgi stillerinde park çizilmez."
        />
        <Checkbox
          label="Müşteri listede olmayan bir nokta girebilsin (enlem/boylam)"
          checked={value.allowCustomPoint}
          onChange={(v) => set("allowCustomPoint", v)}
          helpText="Köy, düğün salonu, ilk buluşma yeri gibi noktalar için. Yeni her nokta haritanın ilk çiziminde 10–20 saniye sürebilir."
        />
      </FormLayout>

      <Banner tone="info">
        Harita verisi OpenStreetMap'ten (ODbL lisansı) gelir; lisans gereği haritanın altında küçük bir
        "© OpenStreetMap katkıda bulunanlar" yazısı her zaman basılır.
      </Banner>
    </BlockStack>
  );
}
