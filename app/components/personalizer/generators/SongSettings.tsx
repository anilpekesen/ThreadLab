import { BlockStack, Checkbox, FormLayout, InlineStack, Text, TextField } from "@shopify/polaris";
import { useState, type CSSProperties } from "react";
import { FONT_LIBRARY } from "~/lib/font-library";
import {
  SONG_LIMITS,
  SONG_STYLES,
  SONG_THEMES,
  type SongConfig,
  type SongStyle,
  type SongTheme,
} from "~/lib/generators/song/config";
import type { GeneratorSettingsProps } from "./types";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/generators/song";

/**
 * Şarkı / Spotify tasarımının ayarları. Seçim listeleri "müşteriye
 * açılanlar": yalnızca bir stil/tema/font işaretliyse müşteri penceresinde o
 * seçim hiç görünmez. İlk işaretlenen varsayılan olur. Son seçeneğin
 * işaretini kaldırmak listeyi varsayılana döndürür (normalize).
 */
export function SongSettings({ value, onChange }: GeneratorSettingsProps<SongConfig>) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const en = lang === "en";
  const set = (patch: Partial<SongConfig>) => onChange({ ...value, ...patch });
  // Metin alanları yerel tutulur: sarmalayıcı her değişikliği normalize
  // ediyor, bu da yazarken sondaki boşluğu siliyor ve boş alanı hemen
  // varsayılanla dolduruyordu
  const [sampleTitle, setSampleTitle] = useState(value.sampleTitle);
  const [sampleArtist, setSampleArtist] = useState(value.sampleArtist);
  const toggle = <T extends string>(list: T[], id: T) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const chip = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px",
    borderRadius: 8, cursor: "pointer", fontSize: 13,
    border: active ? "2px solid #303030" : "1px solid #c9cccf",
    background: active ? "#f1f2f4" : "#fff",
  });

  return (
    <BlockStack gap="500">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.stylesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.stylesHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {SONG_STYLES.map((s) => {
            const on = value.styles.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set({ styles: toggle<SongStyle>(value.styles, s.id) })}>
                {en ? s.labelEn : s.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{L.themesTitle}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.themesHelp}
        </Text>
        <InlineStack gap="200" wrap>
          {SONG_THEMES.map((t) => {
            const on = value.themes.includes(t.id);
            return (
              <button key={t.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set({ themes: toggle<SongTheme>(value.themes, t.id) })}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.swatch, border: "1px solid #c9cccf" }} />
                {en ? t.labelEn : t.label}
                <span style={{ color: "#6d7175", fontSize: 12 }}>· {en ? t.hintEn : t.hint}</span>
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
              <button key={f.id} type="button" style={chip(on)} aria-pressed={on} title={lang === "en" ? (f.roleEn ?? f.role) : f.role}
                onClick={() => set({ fonts: toggle(value.fonts, f.id) })}>
                {f.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <Checkbox
          label={L.requirePhoto}
          checked={value.requirePhoto}
          onChange={(v) => set({ requirePhoto: v })}
          helpText={L.requirePhotoHelp}
        />
        <Checkbox
          label={L.showCode}
          checked={value.showCode}
          onChange={(v) => set({ showCode: v })}
          helpText={L.showCodeHelp}
        />
        <FormLayout.Group>
          <TextField
            label={L.sampleTitle}
            value={sampleTitle}
            onChange={(v) => { setSampleTitle(v); set({ sampleTitle: v }); }}
            maxLength={SONG_LIMITS.title}
            autoComplete="off"
            helpText={L.sampleTitleHelp}
          />
          <TextField
            label={L.sampleArtist}
            value={sampleArtist}
            onChange={(v) => { setSampleArtist(v); set({ sampleArtist: v }); }}
            maxLength={SONG_LIMITS.artist}
            autoComplete="off"
          />
        </FormLayout.Group>
      </FormLayout>
    </BlockStack>
  );
}
