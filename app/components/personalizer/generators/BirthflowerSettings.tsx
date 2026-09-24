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
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/birthflower";

/**
 * Doğum çiçeği şablonunun ayarları. Seçim listeleri "müşteriye açılanlar"
 * demek: ilk işaretlenen varsayılan olur, yalnızca biri işaretliyse müşteri
 * penceresinde o seçim hiç görünmez.
 */
export function BirthflowerSettings({ value, onChange }: GeneratorSettingsProps<BirthflowerConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
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
    i === 0 ? <span style={{ fontSize: 11, color: "#616161" }}>{L.defaultBadge}</span> : null;

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ label: String(from + i), value: String(from + i) }));

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.stylesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.stylesHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_STYLES.map((s) => {
            const on = value.styles.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} title={en ? s.hintEn : s.hint} aria-pressed={on}
                onClick={() => set("styles", toggle(value.styles, s.id))}>
                {en ? s.labelEn : s.label} {on && badge(value.styles.indexOf(s.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.layoutsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.layoutsHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_LAYOUTS.map((l) => {
            const on = value.layouts.includes(l.id);
            return (
              <button key={l.id} type="button" style={chip(on)} title={en ? l.hintEn : l.hint} aria-pressed={on}
                onClick={() => set("layouts", toggle(value.layouts, l.id))}>
                {en ? l.labelEn : l.label} {on && badge(value.layouts.indexOf(l.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} title={lang === "en" ? (f.roleEn ?? f.role) : f.role} aria-pressed={on}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label} {on && badge(value.fonts.indexOf(f.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.inksTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.inksHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {BIRTHFLOWER_INKS.map((ink) => {
            const on = value.inks.includes(ink.id);
            return (
              <button key={ink.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("inks", toggle(value.inks, ink.id))}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: ink.hex, border: "1px solid #c9cccf" }} />
                {en ? ink.labelEn : ink.label} {on && badge(value.inks.indexOf(ink.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <Select
            label={L.maxPeople}
            options={range(1, 8)}
            value={String(value.maxPeople)}
            onChange={(v) => set("maxPeople", Number(v))}
            helpText={L.maxPeopleHelp}
          />
          <Select
            label={L.nameMaxLength}
            options={range(6, 20)}
            value={String(value.nameMaxLength)}
            onChange={(v) => set("nameMaxLength", Number(v))}
          />
        </FormLayout.Group>
        <Checkbox
          label={L.titleEnabled}
          checked={value.titleEnabled}
          onChange={(v) => set("titleEnabled", v)}
          helpText={L.titleEnabledHelp}
        />
        {value.titleEnabled && (
          <FormLayout.Group>
            <Select
              label={L.titleMaxLength}
              options={[20, 25, 30, 35, 40].map((n) => ({ label: String(n), value: String(n) }))}
              value={String(value.titleMaxLength)}
              onChange={(v) => set("titleMaxLength", Number(v))}
            />
            <TextField
              label={L.titlePlaceholder}
              value={value.titlePlaceholder}
              onChange={(v) => set("titlePlaceholder", v)}
              autoComplete="off"
              helpText={L.titlePlaceholderHelp}
            />
          </FormLayout.Group>
        )}
      </FormLayout>

      <Text as="p" tone="subdued" variant="bodySm">
        {L.monthFlowers}: {BIRTH_MONTHS.map((m) => en
          ? `${m.labelEn} ${m.flowerEn.toLocaleLowerCase("en-US")}`
          : `${m.label} ${m.flower.toLocaleLowerCase("tr-TR")}`).join(", ")}.
      </Text>
    </BlockStack>
  );
}
