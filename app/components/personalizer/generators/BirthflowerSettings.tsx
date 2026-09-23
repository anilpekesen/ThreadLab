import { BlockStack, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import type { CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  BIRTH_MONTHS,
  BIRTHFLOWER_INKS,
  BIRTHFLOWER_LAYOUTS,
  BIRTHFLOWER_STYLES,
  type BirthflowerConfig,
} from "~/lib/generators/birthflower/config";
import type { GeneratorSettingsProps } from "./types";

/**
 * Doğum çiçeği şablonunun ayarları. Seçim listeleri "müşteriye açılanlar"
 * demek: ilk işaretlenen varsayılan olur, yalnızca biri işaretliyse müşteri
 * penceresinde o seçim hiç görünmez.
 */
export function BirthflowerSettings({ value, onChange }: GeneratorSettingsProps<BirthflowerConfig>) {
  const set = <K extends keyof BirthflowerConfig>(key: K, v: BirthflowerConfig[K]) => onChange({ ...value, [key]: v });

  // Son seçenek kapatılamaz: boş liste normalize'da varsayılana döner ve
  // mağaza sahibi kapattığı seçeneklerin geri geldiğini görür
  const toggle = <T extends string>(list: T[], id: T): T[] =>
    list.includes(id) ? (list.length > 1 ? list.filter((x) => x !== id) : list) : [...list, id];

  const chip = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });
  const badge = (i: number) =>
    i === 0 ? <span style={{ fontSize: 11, color: "#616161" }}>(varsayılan)</span> : null;

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ label: String(from + i), value: String(from + i) }));

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Çizim stilleri</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Çizgi ve siluet tek renk basılır; renkli stil çiçekleri kendi renkleriyle doldurur (DTF/DTG gibi tam renkli baskı gerekir).
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_STYLES.map((s) => {
            const on = value.styles.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} title={s.hint} aria-pressed={on}
                onClick={() => set("styles", toggle(value.styles, s.id))}>
                {s.label} {on && badge(value.styles.indexOf(s.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Düzenler</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Buket saplarını fiyonkla toplar; yan yana düzen her çiçeğin altına adı yazar; tek çiçek yalnızca ilk kişiyi kullanır.
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_LAYOUTS.map((l) => {
            const on = value.layouts.includes(l.id);
            return (
              <button key={l.id} type="button" style={chip(on)} title={l.hint} aria-pressed={on}
                onClick={() => set("layouts", toggle(value.layouts, l.id))}>
                {l.label} {on && badge(value.layouts.indexOf(l.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Yazı tipleri</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} title={f.role} aria-pressed={on}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label} {on && badge(value.fonts.indexOf(f.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Mürekkep renkleri</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Çizgilerin ve isimlerin rengi. Koyu ürünler için Beyaz'ı açık tutun.
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_INKS.map((ink) => {
            const on = value.inks.includes(ink.id);
            return (
              <button key={ink.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("inks", toggle(value.inks, ink.id))}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: ink.hex, border: "1px solid #c9cccf" }} />
                {ink.label} {on && badge(value.inks.indexOf(ink.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <Select
            label="En fazla kişi"
            options={range(1, 8)}
            value={String(value.maxPeople)}
            onChange={(v) => set("maxPeople", Number(v))}
            helpText="Buket 6 kişiden sonra iki kat dizilir."
          />
          <Select
            label="İsim başına en fazla harf"
            options={range(6, 20)}
            value={String(value.nameMaxLength)}
            onChange={(v) => set("nameMaxLength", Number(v))}
          />
        </FormLayout.Group>
        <Checkbox
          label="Müşteri bir başlık yazabilsin"
          checked={value.titleEnabled}
          onChange={(v) => set("titleEnabled", v)}
          helpText="Tasarımın üstünde, isimlerle aynı yazı tipinde (örn. Annemin Bahçesi)."
        />
        {value.titleEnabled && (
          <FormLayout.Group>
            <Select
              label="Başlık en fazla harf"
              options={[20, 25, 30, 35, 40].map((n) => ({ label: String(n), value: String(n) }))}
              value={String(value.titleMaxLength)}
              onChange={(v) => set("titleMaxLength", Number(v))}
            />
            <TextField
              label="Başlık kutusundaki örnek"
              value={value.titlePlaceholder}
              onChange={(v) => set("titlePlaceholder", v)}
              autoComplete="off"
              helpText="Müşteri penceresinde soluk örnek olarak görünür; boş başlık basılmaz."
            />
          </FormLayout.Group>
        )}
      </FormLayout>

      <Text as="p" tone="subdued" variant="bodySm">
        Ay çiçekleri: {BIRTH_MONTHS.map((m) => `${m.label} ${m.flower.toLocaleLowerCase("tr-TR")}`).join(", ")}.
      </Text>
    </BlockStack>
  );
}
