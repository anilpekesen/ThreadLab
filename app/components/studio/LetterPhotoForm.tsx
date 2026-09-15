import { useRef, useState } from "react";
import { BlockStack, InlineStack, Text, Button, Select, TextField, Checkbox, Banner } from "@shopify/polaris";
import { FONT_LIBRARY, findLibraryFont } from "~/lib/font-library";
import type { LetterGlyph } from "~/lib/frame-studio";
import { NumberField } from "./NumberField";
import { FONT_FACE_CSS, fontPreviewFamily } from "./TextSlotSettings";

/**
 * "LOVE", "AŞKIM", bir isim — her harf ayrı bir fotoğraf alanı olur ve
 * müşterinin fotoğrafı harfin şeklinin içinde görünür.
 *
 * Harf çizimleri sunucuda fontun kendisinden üretiliyor; stüdyo onları
 * kesim alanına yerleştiriyor. Fotoğrafın harfin gövdesinde görünmesi için
 * kalın bir font gerekiyor, varsayılan o yüzden en kalın aile.
 */

export interface LetterPhotoOptions {
  glyphs: LetterGlyph[];
  gapMm: number;
  heightRatio: number;
  position: "top" | "center";
  replace: boolean;
}

const HEAVY_FIRST = ["archivo-black", "montserrat-black", "anton"];

export function LetterPhotoForm({ onApply, onCancel }: {
  onApply: (options: LetterPhotoOptions) => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState("LOVE");
  const [fontUrl, setFontUrl] = useState(FONT_LIBRARY.find((f) => f.id === HEAVY_FIRST[0])?.url ?? FONT_LIBRARY[0].url);
  const [uploaded, setUploaded] = useState<{ url: string; family: string } | null>(null);
  const [gapMm, setGapMm] = useState(2);
  // Sosyopix tarzı LOVE çerçevelerinde harfler kesim yüksekliğinin dörtte biri
  // kadar; daha büyüğü genişliğe dayanıp altta yazıya yer bırakmıyor
  const [heightPct, setHeightPct] = useState(25);
  const [position, setPosition] = useState<"top" | "center">("top");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = [...FONT_LIBRARY].sort((a, b) => {
    const ia = HEAVY_FIRST.indexOf(a.id);
    const ib = HEAVY_FIRST.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const options = [
    ...sorted.map((f) => ({ label: HEAVY_FIRST.includes(f.id) ? `${f.label} (kalın, önerilir)` : f.label, value: f.url })),
    ...(uploaded ? [{ label: `Yüklediğim font: ${uploaded.family}`, value: uploaded.url }] : []),
  ];
  const libraryFont = findLibraryFont(fontUrl);

  async function uploadFont(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("font", file);
      const res = await fetch("/api/fonts/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Font yüklenemedi");
      setUploaded({ url: data.url, family: data.family });
      setFontUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Font yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/personalizer/letter-shapes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: word, fontUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Harfler oluşturulamadı");
      onApply({ glyphs: data.glyphs as LetterGlyph[], gapMm, heightRatio: heightPct / 100, position, replace });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harfler oluşturulamadı");
    } finally {
      setBusy(false);
    }
  }

  const letterCount = [...word].filter((c) => c.trim()).length;

  return (
    <div className="fs-size-form">
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Harf şekilli fotoğraflar</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Her harf ayrı bir fotoğraf alanı olur; müşterinin fotoğrafı harfin içinde görünür.
        </Text>
        <TextField
          label="Yazı"
          autoComplete="off"
          value={word}
          maxLength={24}
          onChange={(v) => setWord(v)}
          helpText={letterCount > 0 ? `${letterCount} fotoğraf alanı oluşur` : "Örn: LOVE, AŞKIM, bir isim"}
        />
        {libraryFont && word.trim() && (
          <div
            aria-hidden="true"
            style={{ fontFamily: fontPreviewFamily(fontUrl), fontSize: 34, lineHeight: 1.1, textAlign: "center", color: "#2f6fd0", overflow: "hidden", whiteSpace: "nowrap" }}
          >
            {word}
          </div>
        )}
        <Select label="Font" options={options} value={fontUrl} onChange={setFontUrl} />
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadFont(f);
          }}
        />
        <InlineStack>
          <Button variant="plain" onClick={() => fileRef.current?.click()} disabled={busy}>
            Tasarımımdaki fontu yükle (.ttf, .otf)
          </Button>
        </InlineStack>
        <div className="fs-grid-2">
          <NumberField label="Harf arası" value={gapMm} min={0} onCommit={setGapMm} />
          <NumberField label="Yükseklik" suffix="%" step={5} value={heightPct} min={10} onCommit={(v) => setHeightPct(Math.min(100, v))} />
        </div>
        <Select
          label="Konum"
          options={[
            { label: "Üstte (altta yazılara yer kalır)", value: "top" },
            { label: "Ortada", value: "center" },
          ]}
          value={position}
          onChange={(v) => setPosition(v === "center" ? "center" : "top")}
        />
        <Checkbox
          label="Mevcut fotoğraf alanlarının yerine koy"
          checked={replace}
          onChange={setReplace}
          helpText="Yazı alanları korunur."
        />
        {error && <Banner tone="critical">{error}</Banner>}
        <InlineStack gap="200">
          <Button variant="primary" loading={busy} disabled={letterCount === 0} onClick={() => void apply()}>
            Harfleri oluştur
          </Button>
          <Button onClick={onCancel} disabled={busy}>Vazgeç</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}
