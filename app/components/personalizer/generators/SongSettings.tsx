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

/**
 * Şarkı / Spotify tasarımının ayarları. Seçim listeleri "müşteriye
 * açılanlar": yalnızca bir stil/tema/font işaretliyse müşteri penceresinde o
 * seçim hiç görünmez. İlk işaretlenen varsayılan olur. Son seçeneğin
 * işaretini kaldırmak listeyi varsayılana döndürür (normalize).
 */
export function SongSettings({ value, onChange }: GeneratorSettingsProps<SongConfig>) {
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
        <Text as="h3" variant="headingSm">Müşteriye açılan stiller</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Kart: yuvarlak köşeli dolgulu zemin, her ürün renginde aynı görünür. Sade: şeffaf zemin, yalnızca mürekkep basılır.
        </Text>
        <InlineStack gap="200" wrap>
          {SONG_STYLES.map((s) => {
            const on = value.styles.includes(s.id);
            return (
              <button key={s.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set({ styles: toggle<SongStyle>(value.styles, s.id) })}>
                {s.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Renk temaları</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Ürününüz tek renkse yalnızca uyan temayı açın: beyaz tişörtte Koyu, siyah tişörtte Açık.
        </Text>
        <InlineStack gap="200" wrap>
          {SONG_THEMES.map((t) => {
            const on = value.themes.includes(t.id);
            return (
              <button key={t.id} type="button" style={chip(on)} aria-pressed={on}
                onClick={() => set({ themes: toggle<SongTheme>(value.themes, t.id) })}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: t.swatch, border: "1px solid #c9cccf" }} />
                {t.label}
                <span style={{ color: "#6d7175", fontSize: 12 }}>· {t.hint}</span>
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
              <button key={f.id} type="button" style={chip(on)} aria-pressed={on} title={f.role}
                onClick={() => set({ fonts: toggle(value.fonts, f.id) })}>
                {f.label}
              </button>
            );
          })}
        </InlineStack>
      </BlockStack>

      <FormLayout>
        <Checkbox
          label="Fotoğraf zorunlu"
          checked={value.requirePhoto}
          onChange={(v) => set({ requirePhoto: v })}
          helpText="Kapalıysa fotoğraf yüklemeyen müşterinin tasarımında fotoğraf yerine müzik notalı bir kutu çizilir."
        />
        <Checkbox
          label="Spotify kodunu göster"
          checked={value.showCode}
          onChange={(v) => set({ showCode: v })}
          helpText="Müşteri Spotify şarkı bağlantısını yapıştırır; tasarımın altına telefonla okutulunca şarkıyı açan kod basılır. Kapalıysa bağlantı sorulmaz."
        />
        <FormLayout.Group>
          <TextField
            label="Örnek şarkı adı"
            value={sampleTitle}
            onChange={(v) => { setSampleTitle(v); set({ sampleTitle: v }); }}
            maxLength={SONG_LIMITS.title}
            autoComplete="off"
            helpText="Müşteri penceresi bu metinle açılır."
          />
          <TextField
            label="Örnek sanatçı"
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
