import { BlockStack, Button, Checkbox, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useState } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  MONOGRAM_FRAMES,
  MONOGRAM_JOINERS,
  MONOGRAM_LAYOUTS,
  MONOGRAM_SWATCHES,
  MONOGRAM_BOTTOM_MAX,
  MONOGRAM_TOP_MAX,
  monogramColorName,
  type MonogramConfig,
} from "~/lib/generators/monogram/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/monogram";

/**
 * Monogram şablonunun ayarları. Listeler "müşteriye açılanlar": ilk
 * işaretlenen müşterinin penceresinde varsayılan olur, tek seçenek kalırsa o
 * seçim pencerede hiç görünmez. Son seçenek kapatılamaz (boş liste sunucuda
 * varsayılana döner ve mağaza sahibini şaşırtır).
 */
export function MonogramSettings({ value, onChange }: GeneratorSettingsProps<MonogramConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");

  const set = <K extends keyof MonogramConfig>(key: K, v: MonogramConfig[K]) => onChange({ ...value, [key]: v });

  const toggle = <T extends string>(list: T[], id: T): T[] =>
    list.includes(id) ? (list.length > 1 ? list.filter((x) => x !== id) : list) : [...list, id];

  const chip = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

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

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.layoutsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.layoutsHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {MONOGRAM_LAYOUTS.map((l) => {
            const on = value.layouts.includes(l.id);
            return (
              <button key={l.id} type="button" style={chip(on)} aria-pressed={on} title={en ? l.hintEn : l.hint}
                onClick={() => set("layouts", toggle(value.layouts, l.id))}>
                {en ? l.labelEn : l.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.framesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.framesHelp}</Text>
        <InlineStack gap="200" wrap>
          {MONOGRAM_FRAMES.map((fr) => {
            const on = value.frames.includes(fr.id);
            return (
              <button key={fr.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("frames", toggle(value.frames, fr.id))}>
                {en ? fr.labelEn : fr.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.joinersTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.joinersHelp}</Text>
        <InlineStack gap="200" wrap>
          {MONOGRAM_JOINERS.map((j) => {
            const on = value.joiners.includes(j.id);
            return (
              <button key={j.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("joiners", toggle(value.joiners, j.id))}>
                {en ? j.labelEn : j.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.fontsHelp}</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} aria-pressed={on} title={lang === "en" ? (f.roleEn ?? f.role) : f.role}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label}
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
          {value.colors.map((c) => (
            <span key={c} style={{ ...chip(true), cursor: "default" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #c9cccf" }} />
              {monogramColorName(c, en)}
              <button type="button" aria-label={L.removeColor(c)} disabled={value.colors.length <= 1}
                onClick={() => set("colors", value.colors.filter((x) => x !== c))}
                style={{ border: 0, background: "none", cursor: value.colors.length > 1 ? "pointer" : "not-allowed", color: "#6d7175", fontSize: 14, padding: 0 }}>
                ✕
              </button>
            </span>
          ))}
        </InlineStack>
        <InlineStack gap="150" wrap>
          {MONOGRAM_SWATCHES.filter((s) => !value.colors.includes(s.hex)).map((s) => (
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
        <Text as="h3" variant="headingSm">{L.lettersTitle}</Text>
        <div style={{ maxWidth: 220 }}>
          <Select
            label={L.maxLetters}
            options={[
              { label: L.letters(1), value: "1" },
              { label: L.letters(2), value: "2" },
              { label: L.letters(3), value: "3" },
            ]}
            value={String(value.maxLetters)}
            onChange={(v) => set("maxLetters", Number(v))}
          />
        </div>
        <Checkbox
          label={L.topText(MONOGRAM_TOP_MAX)}
          checked={value.topText}
          onChange={(v) => set("topText", v)}
        />
        <Checkbox
          label={L.bottomText(MONOGRAM_BOTTOM_MAX)}
          checked={value.bottomText}
          onChange={(v) => set("bottomText", v)}
          helpText={L.bottomTextHelp}
        />
      </BlockStack>
    </BlockStack>
  );
}
