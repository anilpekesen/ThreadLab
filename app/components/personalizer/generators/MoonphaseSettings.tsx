import { BlockStack, Button, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useState, type CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  MOONPHASE_DATE_FORMATS,
  MOONPHASE_LABEL_MAX,
  MOONPHASE_LAYOUTS,
  MOONPHASE_LINE_MAX,
  MOONPHASE_STYLES,
  MOONPHASE_SWATCHES,
  MOONPHASE_TITLE_MAX,
  MOONPHASE_YEAR_FLOOR,
  moonphaseInkName,
  moonphaseYearCeil,
  type MoonphaseConfig,
  type MoonphaseDateFormat,
} from "~/lib/generators/moonphase/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/moonphase";

/**
 * Ay evresi şablonunun ayarları. Seçim listeleri "müşteriye açılanlar": ilk
 * işaretlenen varsayılan olur, yalnızca biri işaretliyse müşteri penceresinde
 * o seçim hiç görünmez. Son seçenek kapatılamaz (boş liste sunucuda
 * varsayılana döner ve mağaza sahibini şaşırtır).
 */
export function MoonphaseSettings({ value, onChange }: GeneratorSettingsProps<MoonphaseConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");

  const set = <K extends keyof MoonphaseConfig>(key: K, v: MoonphaseConfig[K]) => onChange({ ...value, [key]: v });

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

  const addInk = (raw: string) => {
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

  const ceil = moonphaseYearCeil();
  const years = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => ({ label: String(from + i), value: String(from + i) }));
  const offsets = Array.from({ length: 27 }, (_, i) => {
    const h = i - 12;
    return { label: `UTC${h >= 0 ? "+" : "−"}${Math.abs(h)}`, value: String(h) };
  });

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.layoutsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.layoutsHelp}</Text>
        <InlineStack gap="200" wrap>
          {MOONPHASE_LAYOUTS.map((l) => {
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
        <Text as="h3" variant="headingSm">{L.stylesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.stylesHelp}</Text>
        <InlineStack gap="200" wrap>
          {MOONPHASE_STYLES.map((s) => {
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
        <Text as="h3" variant="headingSm">{L.fontsTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.fontsHelp}</Text>
        <InlineStack gap="200" wrap>
          {FONT_LIBRARY.map((f) => {
            const on = value.fonts.includes(f.id);
            return (
              <button key={f.id} type="button" style={chip(on)} title={en ? (f.roleEn ?? f.role) : f.role} aria-pressed={on}
                onClick={() => set("fonts", toggle(value.fonts, f.id))}>
                {f.label} {on && badge(value.fonts.indexOf(f.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.inksTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.inksHelp}</Text>
        <InlineStack gap="200" wrap>
          {value.inks.map((c, i) => (
            <span key={c} style={{ ...chip(true), cursor: "default" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #c9cccf" }} />
              {moonphaseInkName(c, en)} {badge(i)}
              <button type="button" aria-label={L.removeColor(c)} disabled={value.inks.length <= 1}
                onClick={() => set("inks", value.inks.filter((x) => x !== c))}
                style={{ border: 0, background: "none", cursor: value.inks.length > 1 ? "pointer" : "not-allowed", color: "#6d7175", fontSize: 14, padding: 0 }}>
                ✕
              </button>
            </span>
          ))}
        </InlineStack>
        <InlineStack gap="150" wrap>
          {MOONPHASE_SWATCHES.filter((s) => !value.inks.includes(s.hex)).map((s) => (
            <button key={s.hex} type="button" style={chip(false)} onClick={() => addInk(s.hex)} title={L.addSwatch(en ? s.labelEn : s.label)}>
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
          <Button onClick={() => addInk(hex)} disabled={!hex.trim()}>{L.add}</Button>
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.textTitle}</Text>
        <FormLayout>
          <FormLayout.Group>
            <Select label={L.language} value={value.language}
              options={[
                { label: L.languageTr, value: "tr" },
                { label: L.languageEn, value: "en" },
              ]}
              onChange={(v) => set("language", v === "en" ? "en" : "tr")} />
            <Select label={L.dateFormat} value={value.dateFormat}
              options={MOONPHASE_DATE_FORMATS.map((d) => ({ label: value.language === "en" ? d.labelEn : d.label, value: d.id }))}
              onChange={(v) => set("dateFormat", v as MoonphaseDateFormat)} />
          </FormLayout.Group>
          <Checkbox label={L.showPhaseName} checked={value.showPhaseName} onChange={(v) => set("showPhaseName", v)} />
          {value.showPhaseName && (
            <Checkbox label={L.showIllumination} checked={value.showIllumination} onChange={(v) => set("showIllumination", v)} />
          )}
          <Checkbox label={L.titleEnabled} checked={value.titleEnabled} onChange={(v) => set("titleEnabled", v)} helpText={L.titleEnabledHelp} />
          {value.titleEnabled && (
            <TextField label={L.titlePlaceholder} value={value.titlePlaceholder} maxLength={MOONPHASE_TITLE_MAX}
              onChange={(v) => set("titlePlaceholder", v)} autoComplete="off" helpText={L.placeholderHelp} />
          )}
          <Checkbox label={L.lineEnabled} checked={value.lineEnabled} onChange={(v) => set("lineEnabled", v)} helpText={L.lineEnabledHelp} />
          {value.lineEnabled && (
            <TextField label={L.linePlaceholder} value={value.linePlaceholder} maxLength={MOONPHASE_LINE_MAX}
              onChange={(v) => set("linePlaceholder", v)} autoComplete="off" helpText={L.placeholderHelp} />
          )}
        </FormLayout>
      </BlockStack>

      {value.layouts.includes("trio") && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">{L.trioTitle}</Text>
          <Text as="p" tone="subdued" variant="bodySm">{L.trioHelp}</Text>
          <FormLayout>
            <FormLayout.Group condensed>
              {value.trioLabels.map((label, i) => (
                <TextField key={i} label={L.trioLabel(i + 1)} value={label} maxLength={MOONPHASE_LABEL_MAX} autoComplete="off"
                  onChange={(v) => {
                    const next = [...value.trioLabels] as MoonphaseConfig["trioLabels"];
                    next[i] = v;
                    set("trioLabels", next);
                  }} />
              ))}
            </FormLayout.Group>
          </FormLayout>
        </BlockStack>
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.astroTitle}</Text>
        <FormLayout>
          <FormLayout.Group>
            <Select label={L.utcOffset} value={String(value.utcOffset)} options={offsets}
              onChange={(v) => set("utcOffset", Number(v))} helpText={L.utcOffsetHelp} />
            <Select label={L.hemisphere} value={value.hemisphere}
              options={[
                { label: L.hemisphereNorth, value: "north" },
                { label: L.hemisphereSouth, value: "south" },
              ]}
              onChange={(v) => set("hemisphere", v === "south" ? "south" : "north")} helpText={L.hemisphereHelp} />
          </FormLayout.Group>
          <FormLayout.Group>
            <Select label={L.yearMin} value={String(value.yearMin)} options={years(MOONPHASE_YEAR_FLOOR, value.yearMax)}
              onChange={(v) => set("yearMin", Number(v))} />
            <Select label={L.yearMax} value={String(value.yearMax)} options={years(value.yearMin, ceil)}
              onChange={(v) => set("yearMax", Number(v))} />
          </FormLayout.Group>
        </FormLayout>
      </BlockStack>
    </BlockStack>
  );
}
