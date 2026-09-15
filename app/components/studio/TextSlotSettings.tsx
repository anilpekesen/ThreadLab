import { useRef, useState } from "react";
import {
  BlockStack, InlineStack, Text, Button, Badge, Box,
  TextField, FormLayout, Select, Divider, Checkbox,
} from "@shopify/polaris";
import { TEXT_SIZE_STEPS, type TextSlot } from "~/lib/slots";
import type { PrintCanvas } from "~/lib/print-spec";
import { FONT_LIBRARY, findLibraryFont, isLibraryFontUrl } from "~/lib/font-library";
import { TEXT_PALETTE, PALETTE_GROUPS, isLightColor, normalizeHex } from "~/lib/text-palette";
import { NumberField } from "./NumberField";

/**
 * Metin alanının ayarları — slot tahtası ve Çerçeve Stüdyosu ortak kullanır.
 *
 * İki editörde ayrı kopya tutulunca müşteriye açılan font ve renk kuralları
 * birinde güncellenip ötekinde eski kalıyordu; tek bileşen bunu engelliyor.
 */

/**
 * Kütüphane fontlarını yönetim ekranına da yükler.
 *
 * Seçim kutusunda font adını okumak yeterli değil: mağaza sahibinin harfleri
 * görmesi gerekiyor. Aynı .ttf dosyaları hem burada hem müşteri sayfasında
 * kullanıldığı için önizleme baskıyla birebir aynı.
 */
export const FONT_FACE_CSS = FONT_LIBRARY
  .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.url}") format("truetype");font-display:swap;}`)
  .join("\n");

const FONT_SECENEKLERI = [
  { label: "Font seçilmedi (sunucu fontu)", value: "" },
  ...FONT_LIBRARY.map((f) => ({ label: f.label, value: f.url })),
];

/**
 * Bileşen dışında tanımlı olmalı: render içinde üretilen bir bileşen her
 * çizimde yeni tür sayılır, alt ağaç yeniden kurulur ve yazılan kutu odağını
 * kaybeder.
 */
function PlainGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Önizleme kutusunun font-family değeri; kütüphane dışı fontlar için yok */
export function fontPreviewFamily(url: string | undefined): string {
  const lib = findLibraryFont(url);
  return lib ? `"${lib.family}", serif` : "inherit";
}

export interface TextSlotSettingsProps {
  slot: TextSlot;
  canvas: PrintCanvas;
  dpi: number;
  onPatch: (patch: Partial<TextSlot>) => void;
  /** Dar panelde alanlar tek sütuna iner */
  compact?: boolean;
}

export function TextSlotSettings({ slot, canvas, dpi, onPatch, compact = false }: TextSlotSettingsProps) {
  const [fontBusy, setFontBusy] = useState(false);
  const [fontError, setFontError] = useState("");
  const [ozelRenk, setOzelRenk] = useState("#1a1a1a");
  const fontInputRef = useRef<HTMLInputElement>(null);

  const musteriFontlari = slot.font_choices ?? [];
  const musteriRenkleri = slot.color_choices ?? [];
  /** Mağazanın yüklediği font listede yok; seçili görünsün diye satır eklenir */
  const fontSecenekleri = slot.font_url && !isLibraryFontUrl(slot.font_url)
    ? [...FONT_SECENEKLERI, { label: "Yüklediğim font", value: "__yuklenen" }]
    : FONT_SECENEKLERI;

  async function uploadFont(file: File) {
    setFontBusy(true);
    setFontError("");
    try {
      const fd = new FormData();
      fd.append("font", file);
      const res = await fetch("/api/fonts/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Font yüklenemedi");
      onPatch({ font_url: data.url, font_family: data.family });
    } catch (err) {
      setFontError(err instanceof Error ? err.message : "Font yüklenemedi");
    } finally {
      setFontBusy(false);
    }
  }

  // Dar panelde FormLayout.Group alanları yan yana sıkıştırıyor; tek sütun
  // hem okunur hem dokunmatik ekranda tıklanabilir kalıyor.
  const Group = compact ? PlainGroup : FormLayout.Group;

  return (
    <BlockStack gap="300">
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
      <FormLayout>
        <Group>
          <TextField
            label="Etiket" autoComplete="off" value={slot.label}
            helpText="Müşteriye gösterilen ad"
            onChange={(v) => onPatch({ label: v })}
          />
          <Select
            label="Müşteri ne yapabilir"
            options={[
              { label: "Serbest yazar", value: "free" },
              { label: "Listeden seçer", value: "preset" },
              { label: "Değiştiremez (sabit)", value: "fixed" },
            ]}
            value={slot.mode}
            onChange={(v) => onPatch({ mode: v as TextSlot["mode"] })}
          />
          <TextField
            label="En fazla karakter" type="number" autoComplete="off"
            value={String(slot.max_length)}
            onChange={(v) => onPatch({ max_length: Math.max(0, Number(v) || 0) })}
          />
        </Group>
        <Group>
          <TextField
            label="Varsayılan metin" autoComplete="off" value={slot.default_value}
            helpText="Müşteri boş bırakırsa basılacak metin"
            onChange={(v) => onPatch({ default_value: v })}
          />
          <NumberField
            label="Yazı boyutu"
            value={fontSizeToMm(slot.font_size, canvas, dpi)}
            min={1}
            onCommit={(mm) => onPatch({ font_size: fontSizeFromMm(mm, canvas, dpi) })}
          />
          <InlineStack gap="200" blockAlign="end" wrap={false}>
            <div style={{ flex: 1 }}>
              <TextField
                label="Renk" autoComplete="off" value={slot.color}
                onChange={(v) => onPatch({ color: v })}
              />
            </div>
            <input
              type="color"
              aria-label="Yazı rengini seç"
              value={normalizeHex(slot.color) ?? "#000000"}
              onChange={(e) => onPatch({ color: e.target.value })}
              style={{ width: 36, height: 36, padding: 0, border: "1px solid #c9cccf", borderRadius: 8, background: "none", cursor: "pointer" }}
            />
          </InlineStack>
        </Group>
        <Group>
          <Select
            label="Hizalama"
            options={[
              { label: "Ortalı", value: "center" },
              { label: "Sola", value: "left" },
              { label: "Sağa", value: "right" },
            ]}
            value={slot.align}
            onChange={(v) => onPatch({ align: v as TextSlot["align"] })}
          />
          <Select
            label="Taşarsa"
            options={[
              { label: "Otomatik küçült", value: "shrink" },
              { label: "Kırp", value: "clip" },
            ]}
            value={slot.overflow}
            onChange={(v) => onPatch({ overflow: v as TextSlot["overflow"] })}
          />
          <Select
            label="Kalınlık"
            options={[{ label: "Normal", value: "no" }, { label: "Kalın", value: "yes" }]}
            value={slot.bold ? "yes" : "no"}
            onChange={(v) => onPatch({ bold: v === "yes" })}
          />
        </Group>
      </FormLayout>

      {/* Font: baskıda metin fontun kendi harf çizimlerine çevriliyor,
          dosya olmadan tasarımın yazısı tutmaz */}
      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <Text as="span" variant="bodySm" fontWeight="semibold">Font</Text>
            {slot.font_url
              ? <Badge tone="success">{slot.font_family || "Seçildi"}</Badge>
              : <Badge tone="warning">Seçilmedi</Badge>}
          </InlineStack>

          <Select
            label="Hazır fontlar"
            options={fontSecenekleri}
            value={
              isLibraryFontUrl(slot.font_url) ? slot.font_url!
                : slot.font_url ? "__yuklenen" : ""
            }
            onChange={(v) => {
              const lib = findLibraryFont(v);
              onPatch(lib
                ? { font_url: lib.url, font_family: lib.family }
                : { font_url: undefined, font_family: undefined });
            }}
            helpText={
              findLibraryFont(slot.font_url)?.role
              ?? (slot.font_url
                ? "Mağazanın yüklediği font kullanılıyor."
                : "Font seçilmezse baskıda sunucunun kendi fontu kullanılır ve tasarımdan sapar.")
            }
          />

          {slot.font_url && (
            <Box background="bg-surface" padding="300" borderRadius="200">
              <div style={{
                fontFamily: fontPreviewFamily(slot.font_url),
                fontSize: 22, lineHeight: 1.35, textAlign: "center",
                color: "#1a1a1a", wordBreak: "break-word",
              }}>
                {slot.default_value?.trim() || "İyi ki doğdun · ĞÜŞİÖÇ 123"}
              </div>
            </Box>
          )}

          <Divider />

          {/* Liste boşsa seçim kapalı, dolu ise açık: ayrı bir anahtar yok */}
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="span" variant="bodySm" fontWeight="semibold">Müşterinin seçebileceği fontlar</Text>
              {musteriFontlari.length > 0 && (
                <Badge tone="success">{`${musteriFontlari.length} açık`}</Badge>
              )}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Hiçbirini işaretlemezseniz müşteri fontu değiştiremez.
            </Text>
            <InlineStack gap="200" wrap>
              {FONT_LIBRARY.map((f) => {
                const acik = musteriFontlari.includes(f.url);
                return (
                  <Button
                    key={f.id}
                    size="slim"
                    pressed={acik}
                    onClick={() => onPatch({
                      font_choices: acik
                        ? musteriFontlari.filter((u) => u !== f.url)
                        : [...musteriFontlari, f.url],
                    })}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </InlineStack>
            {musteriFontlari.length > 0 && (
              <InlineStack gap="200">
                <Button variant="plain" onClick={() => onPatch({ font_choices: FONT_LIBRARY.map((f) => f.url) })}>
                  Hepsini aç
                </Button>
                <Button variant="plain" tone="critical" onClick={() => onPatch({ font_choices: [] })}>
                  Seçimi kapat
                </Button>
              </InlineStack>
            )}
          </BlockStack>

          <Divider />

          {/* Boyut: mağaza hangi kademeleri açarsa müşteri o düğmeleri görür.
              Normal her zaman seçili başlar ve listede kalır. */}
          <BlockStack gap="200">
            <Checkbox
              label="Müşteri yazı boyutunu değiştirebilsin"
              checked={(slot.size_choices ?? []).length > 0}
              onChange={(v) => onPatch({ size_choices: v ? TEXT_SIZE_STEPS.filter((st) => st.value !== 1).map((st) => st.value) : [] })}
              helpText="Yazı büyüdükçe kutusu da ortasından büyür; yakındaki yazılarla çakışmayacak kadar yer bırakın."
            />
            {(slot.size_choices ?? []).length > 0 && (
              <InlineStack gap="200" wrap>
                {TEXT_SIZE_STEPS.map((st) => {
                  const normal = st.value === 1;
                  const acik = normal || (slot.size_choices ?? []).includes(st.value);
                  return (
                    <Button
                      key={st.value}
                      size="slim"
                      pressed={acik}
                      disabled={normal}
                      onClick={() => {
                        const current = slot.size_choices ?? [];
                        const next = acik ? current.filter((v) => v !== st.value) : [...current, st.value];
                        onPatch({ size_choices: next.sort((a, b) => a - b) });
                      }}
                    >
                      {`${st.label} (%${Math.round(st.value * 100)})`}
                    </Button>
                  );
                })}
              </InlineStack>
            )}
          </BlockStack>

          <Divider />

          <BlockStack gap="200">
            <Checkbox
              label="Müşteri istediği rengi seçebilsin (renk seçici)"
              checked={slot.color_free === true}
              onChange={(v) => onPatch({ color_free: v })}
              helpText="Aşağıdaki renklerin yanına bir renk seçici eklenir. Açık renkler beyaz zeminde okunmaz basılabilir."
            />
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="span" variant="bodySm" fontWeight="semibold">Müşterinin seçebileceği renkler</Text>
              {musteriRenkleri.length > 0 && (
                <Badge tone="success">{`${musteriRenkleri.length} açık`}</Badge>
              )}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Şablonun kendi rengi her zaman varsayılan olarak gösterilir. Zeminle karışacak
              renkleri açmayın; yazı okunmaz basılır.
            </Text>
            {PALETTE_GROUPS.map((g) => {
              const grupRenkleri = TEXT_PALETTE.filter((c) => c.group === g.id);
              const hepsiAcik = grupRenkleri.every((c) => musteriRenkleri.includes(c.hex));
              return (
                <BlockStack key={g.id} gap="100">
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <Text as="span" variant="bodySm" tone="subdued">{g.label}</Text>
                    <Button
                      variant="plain"
                      onClick={() => onPatch({
                        color_choices: hepsiAcik
                          ? musteriRenkleri.filter((h) => !grupRenkleri.some((c) => c.hex === h))
                          : [
                              ...musteriRenkleri,
                              ...grupRenkleri.map((c) => c.hex).filter((h) => !musteriRenkleri.includes(h)),
                            ],
                      })}
                    >
                      {hepsiAcik ? "kaldır" : "tümü"}
                    </Button>
                  </InlineStack>
                  <InlineStack gap="200" wrap>
                    {grupRenkleri.map((c) => {
                      const acik = musteriRenkleri.includes(c.hex);
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.label}
                          aria-label={c.label}
                          aria-pressed={acik}
                          onClick={() => onPatch({
                            color_choices: acik
                              ? musteriRenkleri.filter((h) => h !== c.hex)
                              : [...musteriRenkleri, c.hex],
                          })}
                          style={{
                            width: 28, height: 28, borderRadius: "50%", padding: 0,
                            cursor: "pointer", background: c.hex,
                            border: `1px solid ${isLightColor(c.hex) ? "#8c9196" : "rgba(0,0,0,.2)"}`,
                            boxShadow: acik ? "0 0 0 2px #fff, 0 0 0 4px #303030" : "none",
                          }}
                        />
                      );
                    })}
                  </InlineStack>
                </BlockStack>
              );
            })}

            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <input
                type="color"
                value={ozelRenk}
                onChange={(e) => setOzelRenk(e.target.value)}
                aria-label="Özel renk"
                style={{ width: 38, height: 30, padding: 0, border: "1px solid #c9cccf", borderRadius: 6, background: "none", cursor: "pointer" }}
              />
              <Button
                size="slim"
                disabled={!normalizeHex(ozelRenk) || musteriRenkleri.includes(normalizeHex(ozelRenk)!)}
                onClick={() => {
                  const hex = normalizeHex(ozelRenk);
                  if (hex) onPatch({ color_choices: [...musteriRenkleri, hex] });
                }}
              >
                Bu rengi ekle
              </Button>
              {musteriRenkleri.length > 0 && (
                <Button variant="plain" tone="critical" onClick={() => onPatch({ color_choices: [] })}>
                  Seçimi kapat
                </Button>
              )}
            </InlineStack>

            {/* Palette olmayan, elle eklenmiş renkler ayrıca görünmeli;
                yoksa kaldırmanın yolu kalmıyor */}
            {musteriRenkleri.filter((h) => !TEXT_PALETTE.some((c) => c.hex === h)).length > 0 && (
              <InlineStack gap="200" blockAlign="center" wrap>
                <Text as="span" variant="bodySm" tone="subdued">Eklediğiniz renkler:</Text>
                {musteriRenkleri.filter((h) => !TEXT_PALETTE.some((c) => c.hex === h)).map((h) => (
                  <button
                    key={h}
                    type="button"
                    title={`${h} rengini kaldır`}
                    aria-label={`${h} rengini kaldır`}
                    onClick={() => onPatch({ color_choices: musteriRenkleri.filter((x) => x !== h) })}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", padding: 0,
                      cursor: "pointer", background: h,
                      border: `1px solid ${isLightColor(h) ? "#8c9196" : "rgba(0,0,0,.2)"}`,
                      boxShadow: "0 0 0 2px #fff, 0 0 0 4px #303030",
                    }}
                  />
                ))}
              </InlineStack>
            )}
          </BlockStack>

          <Divider />

          <Text as="p" variant="bodySm" tone="subdued">
            Listede olmayan bir font gerekiyorsa kendi lisanslı dosyanızı yükleyin:
            <b> .ttf, .otf veya .woff</b> (.woff2 okunamıyor).
          </Text>
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadFont(f);
            }}
          />
          <InlineStack gap="200">
            <Button onClick={() => fontInputRef.current?.click()} loading={fontBusy}>
              Kendi fontumu yükle
            </Button>
            {slot.font_url && !isLibraryFontUrl(slot.font_url) && (
              <Button variant="plain" tone="critical" onClick={() => onPatch({ font_url: undefined, font_family: undefined })}>
                Kaldır
              </Button>
            )}
          </InlineStack>
          {fontError && <Text as="p" variant="bodySm" tone="critical">{fontError}</Text>}
        </BlockStack>
      </Box>
    </BlockStack>
  );
}

/**
 * Punto tuval YÜKSEKLİĞİNE oranla saklanıyor (bkz. TextSlot.font_size).
 * Mağaza sahibi oranı değil milimetreyi düşünür; tuval dpi taşımadığı için
 * çeviride dpi ayrıca veriliyor.
 */
export function fontSizeToMm(fontSize: number, canvas: PrintCanvas, dpi: number): number {
  return ((fontSize * canvas.canvasHeight) / dpi) * 25.4;
}

export function fontSizeFromMm(mm: number, canvas: PrintCanvas, dpi: number): number {
  return ((mm / 25.4) * dpi) / canvas.canvasHeight;
}
