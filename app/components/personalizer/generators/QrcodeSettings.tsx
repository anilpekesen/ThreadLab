import { BlockStack, Button, Checkbox, FormLayout, InlineStack, Select, Text, TextField } from "@shopify/polaris";
import { useState, type CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  QR_AUTO_CAPTIONS,
  QR_CONTENT_TYPES,
  QR_LAYOUTS,
  QR_LIMITS,
  QR_STYLES,
  QR_SWATCHES,
  qrColorName,
  type QrcodeConfig,
} from "~/lib/generators/qrcode/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/qrcode";

/**
 * QR kod şablonunun ayarları. Seçim listeleri "müşteriye açılanlar" demek:
 * ilk işaretlenen varsayılan olur, yalnızca biri işaretliyse müşteri
 * penceresinde o seçim hiç görünmez.
 */
export function QrcodeSettings({ value, onChange }: GeneratorSettingsProps<QrcodeConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const set = <K extends keyof QrcodeConfig>(key: K, v: QrcodeConfig[K]) => onChange({ ...value, [key]: v });
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");

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
  const swatch = (c: string) => <span style={{ width: 14, height: 14, borderRadius: 4, background: c, border: "1px solid #c9cccf" }} />;

  const addColor = (raw: string) => {
    const t = raw.trim().toLowerCase();
    const v = t.startsWith("#") ? t : `#${t}`;
    if (!/^#[0-9a-f]{6}$/.test(v)) { setHexError(L.hexInvalid); return; }
    if (value.inks.includes(v)) { setHex(""); return; }
    if (value.inks.length >= 12) { setHexError(L.hexMax); return; }
    set("inks", [...value.inks, v]);
    setHex("");
  };

  const hasCaptionLayout = value.layouts.some((l) => l !== "plain");
  // Hazır renkler + listede olan özel renkler
  const inkChoices = [...QR_SWATCHES.map((s) => s.hex), ...value.inks.filter((c) => !QR_SWATCHES.some((s) => s.hex === c))];
  const auto = QR_AUTO_CAPTIONS[value.language];

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.contentTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.contentHelp}</Text>
        <InlineStack gap="200" wrap>
          {QR_CONTENT_TYPES.map((c) => {
            const on = value.contentTypes.includes(c.id);
            return (
              <button key={c.id} type="button" style={chip(on)} title={en ? c.hintEn : c.hint} aria-pressed={on}
                onClick={() => set("contentTypes", toggle(value.contentTypes, c.id))}>
                {en ? c.labelEn : c.label} {on && badge(value.contentTypes.indexOf(c.id))}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.stylesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.stylesHelp}</Text>
        <InlineStack gap="200" wrap>
          {QR_STYLES.map((s) => {
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
        <Text as="p" tone="subdued" variant="bodySm">{L.layoutsHelp}</Text>
        <InlineStack gap="200" wrap>
          {QR_LAYOUTS.map((l) => {
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

      <Checkbox
        label={L.centerIcon}
        checked={value.centerIcon}
        onChange={(v) => set("centerIcon", v)}
        helpText={L.centerIconHelp}
      />

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.inksTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">{L.inksHelp}</Text>
        <InlineStack gap="200" wrap>
          {inkChoices.map((c) => {
            const on = value.inks.includes(c);
            return (
              <button key={c} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set("inks", toggle(value.inks, c))}>
                {swatch(c)}
                {qrColorName(c, en)} {on && badge(value.inks.indexOf(c))}
              </button>
            );
          })}
        </InlineStack>
        <InlineStack gap="200" blockAlign="end">
          <div style={{ width: 200 }}>
            <TextField label={L.customColor} value={hex} onChange={(v) => { setHex(v); setHexError(""); }}
              placeholder="#2f5d3a" autoComplete="off" error={hexError || undefined}
              prefix={/^#?[0-9a-f]{6}$/i.test(hex.trim())
                ? swatch(hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}`)
                : undefined} />
          </div>
          <Button onClick={() => addColor(hex)} disabled={!hex.trim()}>{L.add}</Button>
        </InlineStack>
      </BlockStack>

      {hasCaptionLayout && (
        <>
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

          <FormLayout>
            <Checkbox
              label={L.captionEnabled}
              checked={value.captionEnabled}
              onChange={(v) => set("captionEnabled", v)}
              helpText={L.captionEnabledHelp}
            />
            <FormLayout.Group>
              <TextField
                label={L.defaultCaption}
                value={value.defaultCaption}
                onChange={(v) => set("defaultCaption", v)}
                maxLength={QR_LIMITS.caption}
                showCharacterCount
                autoComplete="off"
                helpText={L.defaultCaptionHelp}
              />
              <Select
                label={L.language}
                options={[
                  { label: L.languageTr, value: "tr" },
                  { label: L.languageEn, value: "en" },
                ]}
                value={value.language}
                onChange={(v) => set("language", v === "en" ? "en" : "tr")}
              />
            </FormLayout.Group>
          </FormLayout>

          {!value.defaultCaption.trim() && (
            <Text as="p" tone="subdued" variant="bodySm">
              {L.autoPreview}: {value.contentTypes.map((id) => {
                const c = QR_CONTENT_TYPES.find((x) => x.id === id)!;
                return `${en ? c.labelEn : c.label} → "${auto[id]}"`;
              }).join(", ")}
            </Text>
          )}
        </>
      )}
    </BlockStack>
  );
}
