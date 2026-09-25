import { BlockStack, Button, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useState, type CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  WORDSEARCH_ALPHABETS,
  WORDSEARCH_DIRECTIONS,
  WORDSEARCH_GRID_MAX,
  WORDSEARCH_GRID_MIN,
  WORDSEARCH_SCRIPT_FONTS,
  WORDSEARCH_STYLES,
  WORDSEARCH_SWATCHES,
  wordsearchColorName,
  type WordsearchAlphabet,
  type WordsearchConfig,
} from "~/lib/generators/wordsearch/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/wordsearch";

/**
 * Kelime avı şablonunun ayarları. Seçim listeleri "müşteriye açılanlar":
 * ilk işaretlenen varsayılan olur, yalnızca biri işaretliyse müşteri
 * penceresinde o seçim hiç görünmez. Yönler müşteriye sorulmaz.
 */
export function WordsearchSettings({ value, onChange }: GeneratorSettingsProps<WordsearchConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");
  const set = <K extends keyof WordsearchConfig>(key: K, v: WordsearchConfig[K]) => onChange({ ...value, [key]: v });

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

  const addColor = (raw: string) => {
    let v = raw.trim().toLowerCase();
    if (/^[0-9a-f]{6}$/.test(v)) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (!/^#[0-9a-f]{6}$/.test(v)) { setHexError(L.hexInvalid); return; }
    setHexError("");
    if (value.inks.includes(v)) return;
    if (value.inks.length >= 12) { setHexError(L.hexMax); return; }
    set("inks", [...value.inks, v]);
    setHex("");
  };

  const fontChips = (key: "fonts" | "titleFonts", allowScript: boolean) => (
    <InlineStack gap="200" wrap>
      {FONT_LIBRARY.filter((f) => allowScript || !WORDSEARCH_SCRIPT_FONTS.includes(f.id)).map((f) => {
        const on = value[key].includes(f.id);
        return (
          <button key={f.id} type="button" style={chip(on)} title={en ? (f.roleEn ?? f.role) : f.role} aria-pressed={on}
            onClick={() => set(key, toggle(value[key], f.id))}>
            {f.label} {on && badge(value[key].indexOf(f.id))}
          </button>
        );
      })}
    </InlineStack>
  );

  const sizes = Array.from({ length: WORDSEARCH_GRID_MAX - WORDSEARCH_GRID_MIN + 1 }, (_, i) => WORDSEARCH_GRID_MIN + i);

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.stylesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.stylesHelp}</Text>
        <InlineStack gap="200" wrap>
          {WORDSEARCH_STYLES.map((s) => {
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
        <Text as="h3" variant="headingSm">{L.alphabetTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.alphabetHelp}</Text>
        <InlineStack gap="200" wrap>
          {WORDSEARCH_ALPHABETS.map((a) => {
            const on = value.alphabet === a.id;
            return (
              <button key={a.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("alphabet", a.id as WordsearchAlphabet)}>
                {en ? a.labelEn : a.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.directionsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.directionsHelp}</Text>
        <InlineStack gap="200" wrap>
          {WORDSEARCH_DIRECTIONS.map((d) => {
            const on = value.directions.includes(d.id);
            return (
              <button key={d.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("directions", toggle(value.directions, d.id))}>
                {en ? d.labelEn : d.label}
              </button>
            );
          })}
        </InlineStack>
        <Checkbox label={L.reversed} checked={value.reversed} onChange={(v) => set("reversed", v)} helpText={L.reversedHelp} />
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.fontsHelp}</Text>
        {fontChips("fonts", false)}
      </BlockStack>

      {value.titleEnabled && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">{L.titleFontsTitle}</Text>
          {fontChips("titleFonts", true)}
        </BlockStack>
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.inksTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.inksHelp}</Text>
        <InlineStack gap="200" wrap>
          {value.inks.map((c, i) => (
            <span key={c} style={{ ...chip(true), cursor: "default" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #c9cccf" }} />
              {wordsearchColorName(c, en)} {badge(i)}
              <button type="button" aria-label={L.removeColor(c)} disabled={value.inks.length <= 1}
                onClick={() => set("inks", value.inks.filter((x) => x !== c))}
                style={{ border: 0, background: "none", cursor: value.inks.length > 1 ? "pointer" : "not-allowed", color: "#6d7175", fontSize: 14, padding: 0 }}>
                ✕
              </button>
            </span>
          ))}
        </InlineStack>
        <InlineStack gap="150" wrap>
          {WORDSEARCH_SWATCHES.filter((s) => !value.inks.includes(s.hex)).map((s) => (
            <button key={s.hex} type="button" style={chip(false)} onClick={() => addColor(s.hex)} title={L.addSwatch(en ? s.labelEn : s.label)}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: s.hex, border: "1px solid #c9cccf" }} />
              + {en ? s.labelEn : s.label}
            </button>
          ))}
        </InlineStack>
        <InlineStack gap="200" blockAlign="end">
          <div style={{ width: 180 }}>
            <TextField label={L.customColor} value={hex} onChange={(v) => { setHex(v); setHexError(""); }}
              placeholder="#1e3a5f" autoComplete="off" error={hexError || undefined}
              prefix={/^#?[0-9a-f]{6}$/i.test(hex.trim())
                ? <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}` }} />
                : undefined} />
          </div>
          <Button onClick={() => addColor(hex)} disabled={!hex.trim()}>{L.add}</Button>
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <FormLayout.Group>
          <Select
            label={L.maxWords}
            options={Array.from({ length: 11 }, (_, i) => ({ label: String(i + 2), value: String(i + 2) }))}
            value={String(value.maxWords)}
            onChange={(v) => set("maxWords", Number(v))}
            helpText={L.maxWordsHelp}
          />
          <Select
            label={L.gridSize}
            options={[{ label: L.gridAuto, value: "0" }, ...sizes.map((n) => ({ label: L.gridAtLeast(n), value: String(n) }))]}
            value={String(value.gridSize)}
            onChange={(v) => set("gridSize", Number(v))}
            helpText={L.gridSizeHelp}
          />
        </FormLayout.Group>
        <Checkbox label={L.wordList} checked={value.wordList} onChange={(v) => set("wordList", v)} />
        <Checkbox label={L.frame} checked={value.frame} onChange={(v) => set("frame", v)} />
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
              options={Array.from(new Set([16, 20, 24, 28, 32, value.titleMaxLength])).sort((a, b) => a - b).map((n) => ({ label: String(n), value: String(n) }))}
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
    </BlockStack>
  );
}
