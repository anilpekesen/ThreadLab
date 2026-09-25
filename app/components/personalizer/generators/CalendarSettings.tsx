import { BlockStack, Button, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useState, type CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  CALENDAR_LAYOUTS,
  CALENDAR_MARKERS,
  CALENDAR_SWATCHES,
  CALENDAR_YEAR_CEIL,
  CALENDAR_YEAR_FLOOR,
  calendarColorName,
  type CalendarConfig,
} from "~/lib/generators/calendar/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/calendar";

/**
 * Özel gün takvimi şablonunun ayarları. Listeler "müşteriye açılanlar": ilk
 * işaretlenen varsayılan olur, tek seçenek kalırsa o seçim müşteri
 * penceresinde hiç görünmez. Son seçenek kapatılamaz. Dil ve haftanın ilk
 * günü mağazanın kararı; müşteriye sorulmaz.
 */
export function CalendarSettings({ value, onChange }: GeneratorSettingsProps<CalendarConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");

  const set = <K extends keyof CalendarConfig>(key: K, v: CalendarConfig[K]) => onChange({ ...value, [key]: v });

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

  const addColor = (raw: string) => {
    let v = raw.trim().toLowerCase();
    if (/^[0-9a-f]{6}$/.test(v)) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (!/^#[0-9a-f]{6}$/.test(v)) { setHexError(L.hexInvalid); return; }
    setHexError("");
    if (value.colors.includes(v)) return;
    if (value.colors.length >= 12) { setHexError(L.hexMax); return; }
    set("colors", [...value.colors, v]);
    setHex("");
  };

  const years = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ label: String(from + i), value: String(from + i) }));
  // Kayıtlı değer listede yoksa (eski şablon) seçim kutusu boş görünmesin
  const lengths = (list: number[], current: number) =>
    Array.from(new Set([...list, current])).sort((a, b) => a - b).map((n) => ({ label: String(n), value: String(n) }));

  const fontChips = (key: "fonts" | "titleFonts") => (
    <InlineStack gap="200" wrap>
      {FONT_LIBRARY.map((f) => {
        const list = value[key];
        const on = list.includes(f.id);
        return (
          <button key={f.id} type="button" style={chip(on)} title={en ? (f.roleEn ?? f.role) : f.role} aria-pressed={on}
            onClick={() => set(key, toggle(list, f.id))}>
            {f.label} {on && badge(list.indexOf(f.id))}
          </button>
        );
      })}
    </InlineStack>
  );

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.layoutsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.layoutsHelp}</Text>
        <InlineStack gap="200" wrap>
          {CALENDAR_LAYOUTS.map((l) => {
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
        <Text as="h3" variant="headingSm">{L.markersTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.markersHelp}</Text>
        <InlineStack gap="200" wrap>
          {CALENDAR_MARKERS.map((m) => {
            const on = value.markers.includes(m.id);
            return (
              <button key={m.id} type="button" style={chip(on)} title={en ? m.hintEn : m.hint} aria-pressed={on}
                onClick={() => set("markers", toggle(value.markers, m.id))}>
                {en ? m.labelEn : m.label} {on && badge(value.markers.indexOf(m.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.fontsHelp}</Text>
        {fontChips("fonts")}
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.titleFontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.titleFontsHelp}</Text>
        {fontChips("titleFonts")}
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.inksTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.inksHelp}</Text>
        <InlineStack gap="200" wrap>
          {value.colors.map((c, i) => (
            <span key={c} style={{ ...chip(true), cursor: "default" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #c9cccf" }} />
              {calendarColorName(c, en)} {badge(i)}
              <button type="button" aria-label={L.removeColor(c)} disabled={value.colors.length <= 1}
                onClick={() => set("colors", value.colors.filter((x) => x !== c))}
                style={{ border: 0, background: "none", cursor: value.colors.length > 1 ? "pointer" : "not-allowed", color: "#6d7175", fontSize: 14, padding: 0 }}>
                ✕
              </button>
            </span>
          ))}
        </InlineStack>
        <InlineStack gap="150" wrap>
          {CALENDAR_SWATCHES.filter((s) => !value.colors.includes(s.hex)).map((s) => (
            <button key={s.hex} type="button" style={chip(false)} onClick={() => addColor(s.hex)} title={L.addSwatch(en ? s.labelEn : s.label)}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: s.hex, border: "1px solid #c9cccf" }} />
              + {en ? s.labelEn : s.label}
            </button>
          ))}
        </InlineStack>
        <InlineStack gap="200" blockAlign="end">
          <div style={{ width: 180 }}>
            <TextField label={L.customColor} value={hex} onChange={(v) => { setHex(v); setHexError(""); }}
              placeholder="#b8860b" autoComplete="off" error={hexError || undefined}
              prefix={/^#?[0-9a-f]{6}$/i.test(hex.trim())
                ? <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}` }} />
                : undefined} />
          </div>
          <Button onClick={() => addColor(hex)} disabled={!hex.trim()}>{L.add}</Button>
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.calendarTitle}</Text>
        <FormLayout>
          <FormLayout.Group>
            <Select
              label={L.language}
              options={[{ label: L.languageTr, value: "tr" }, { label: L.languageEn, value: "en" }]}
              value={value.language}
              onChange={(v) => set("language", v === "en" ? "en" : "tr")}
            />
            <Select
              label={L.weekStart}
              options={[{ label: L.weekStartMonday, value: "monday" }, { label: L.weekStartSunday, value: "sunday" }]}
              value={value.weekStart}
              onChange={(v) => set("weekStart", v === "sunday" ? "sunday" : "monday")}
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <Select
              label={L.yearMin}
              options={years(CALENDAR_YEAR_FLOOR, value.yearMax)}
              value={String(value.yearMin)}
              onChange={(v) => set("yearMin", Number(v))}
            />
            <Select
              label={L.yearMax}
              options={years(value.yearMin, CALENDAR_YEAR_CEIL)}
              value={String(value.yearMax)}
              onChange={(v) => set("yearMax", Number(v))}
              helpText={L.yearHelp(value.yearMin, value.yearMax)}
            />
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.textsTitle}</Text>
        <FormLayout>
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
                options={lengths([16, 20, 24, 28, 32, 36, 40], value.titleMaxLength)}
                value={String(value.titleMaxLength)}
                onChange={(v) => set("titleMaxLength", Number(v))}
              />
              <TextField
                label={L.titlePlaceholder}
                value={value.titlePlaceholder}
                onChange={(v) => set("titlePlaceholder", v)}
                autoComplete="off"
                maxLength={40}
                helpText={L.placeholderHelp}
              />
            </FormLayout.Group>
          )}
          <Checkbox
            label={L.namesEnabled}
            checked={value.namesEnabled}
            onChange={(v) => set("namesEnabled", v)}
            helpText={L.namesEnabledHelp}
          />
          {value.namesEnabled && (
            <FormLayout.Group>
              <Select
                label={L.namesMaxLength}
                options={lengths([16, 20, 24, 30, 36, 40], value.namesMaxLength)}
                value={String(value.namesMaxLength)}
                onChange={(v) => set("namesMaxLength", Number(v))}
              />
              <TextField
                label={L.namesPlaceholder}
                value={value.namesPlaceholder}
                onChange={(v) => set("namesPlaceholder", v)}
                autoComplete="off"
                maxLength={40}
                helpText={L.placeholderHelp}
              />
            </FormLayout.Group>
          )}
        </FormLayout>
      </BlockStack>
    </BlockStack>
  );
}
