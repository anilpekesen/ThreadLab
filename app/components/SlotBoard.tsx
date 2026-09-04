import { useCallback, useMemo, useRef, useState } from "react";
import {
  Card, BlockStack, InlineStack, Text, Button, Badge, Box,
  TextField, FormLayout, Select, Banner, Divider,
} from "@shopify/polaris";
import {
  buildGridSlots, sortReadingOrder, validateSlots, isImageSlot, isTextSlot, rectToPx,
  DEFAULT_GRID,
  type GridConfig, type ImageSlot, type Slot, type SlotIssue, type TextSlot,
} from "~/lib/slots";
import type { PrintCanvas } from "~/lib/print-spec";
import { FONT_LIBRARY, findLibraryFont, isLibraryFontUrl } from "~/lib/font-library";

/**
 * Slot tahtası — şablondaki fotoğraf alanlarının görsel editörü.
 *
 * Slotlar normalize (0–1) koordinatta tutulur; bu bileşen yalnızca ekranda
 * gösterirken piksele çevirir. Böylece aynı şablon farklı ebatlarda da doğru
 * kalır ve editörün ekran genişliği hiçbir zaman kayda karışmaz.
 *
 * İki üretim yolu bir arada: ızgara parametreleriyle toplu üretim ve fareyle
 * tek tek düzeltme. İkisi de aynı diziyi üretir.
 */

/**
 * Kütüphane fontlarını yönetim ekranına da yükler.
 *
 * Seçim kutusunda font adını okumak yeterli değil: mağaza sahibinin harfleri
 * görmesi gerekiyor. Aynı .ttf dosyaları hem burada hem müşteri sayfasında
 * kullanıldığı için önizleme baskıyla birebir aynı.
 */
const FONT_FACE_CSS = FONT_LIBRARY
  .map((f) => `@font-face{font-family:"${f.family}";src:url("${f.url}") format("truetype");font-display:swap;}`)
  .join("\n");

const FONT_SECENEKLERI = [
  { label: "Font seçilmedi (sunucu fontu)", value: "" },
  ...FONT_LIBRARY.map((f) => ({ label: f.label, value: f.url })),
];

type Handle = "move" | "nw" | "ne" | "sw" | "se";

interface DragState {
  slotId: string;
  handle: Handle;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
}

export interface SlotBoardProps {
  slots: Slot[];
  onChange: (slots: Slot[]) => void;
  canvas: PrintCanvas;
  /** Arkada gösterilecek tasarım görseli; yoksa boş tuval çizilir */
  templateUrl?: string;
  /** Yöneticinin beklediği fotoğraf alanı sayısı */
  expectedSlots: number;
  onExpectedSlotsChange: (value: number) => void;
  gridConfig: GridConfig | null;
  onGridConfigChange: (config: GridConfig) => void;
  dpi: number;
}

const MIN_SIZE = 0.02; // normalize; bundan küçük slot kazayla üretiliyor

export function SlotBoard({
  slots, onChange, canvas, templateUrl,
  expectedSlots, onExpectedSlotsChange,
  gridConfig, onGridConfigChange, dpi,
}: SlotBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [holeBusy, setHoleBusy] = useState(false);
  const [holeNote, setHoleNote] = useState<{ tone: "info" | "warning" | "critical"; text: string } | null>(null);
  const [fontBusy, setFontBusy] = useState(false);
  const [fontError, setFontError] = useState("");
  const fontInputRef = useRef<HTMLInputElement>(null);

  /** Mağazanın yüklediği font listede yok; seçili görünsün diye satır eklenir */
  const fontSecenekleri = useMemo(() => {
    const sl = slots.find((x) => x.id === selectedId);
    const url = sl && isTextSlot(sl) ? sl.font_url : undefined;
    return url && !isLibraryFontUrl(url)
      ? [...FONT_SECENEKLERI, { label: "Yüklediğim font", value: "__yuklenen" }]
      : FONT_SECENEKLERI;
  }, [selectedId, slots]);

  /** Önizleme kutusunun font-family değeri; kütüphane dışı fontlar için yok */
  function fontOnizlemeAdi(url: string | undefined): string {
    const lib = findLibraryFont(url);
    return lib ? `"${lib.family}", serif` : "inherit";
  }

  const grid = gridConfig ?? DEFAULT_GRID;
  const imageSlots = useMemo(() => slots.filter(isImageSlot), [slots]);

  // Birleştirilmiş hücreler yüzünden sütun × satır gerçek sayıyı vermiyor;
  // butonda söz verilen sayı üreticinin kendi sonucu olmalı.
  const gridPreviewCount = useMemo(
    () => buildGridSlots(grid, canvas, dpi).length,
    [grid, canvas, dpi],
  );

  const issues: SlotIssue[] = useMemo(
    () => validateSlots(slots, canvas, { expected_image_slots: expectedSlots }),
    [slots, canvas, expectedSlots],
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  // Güvenli alan, normalize koordinatta — çerçeve olarak çizilir
  const safeBox = {
    left: (canvas.safe.x / canvas.canvasWidth) * 100,
    top: (canvas.safe.y / canvas.canvasHeight) * 100,
    width: (canvas.safe.width / canvas.canvasWidth) * 100,
    height: (canvas.safe.height / canvas.canvasHeight) * 100,
  };

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  }, []);

  function startDrag(e: React.MouseEvent, slot: Slot, handle: Handle) {
    e.stopPropagation();
    e.preventDefault();
    const p = toNormalized(e.clientX, e.clientY);
    setSelectedId(slot.id);
    setDrag({
      slotId: slot.id,
      handle,
      startX: p.x,
      startY: p.y,
      origin: { ...slot.rect },
    });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const p = toNormalized(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const o = drag.origin;

    let next = { ...o };
    if (drag.handle === "move") {
      next.x = clamp(o.x + dx, 0, 1 - o.w);
      next.y = clamp(o.y + dy, 0, 1 - o.h);
    } else {
      // Köşe tutamakları: karşı köşe sabit kalır
      const right = o.x + o.w;
      const bottom = o.y + o.h;
      if (drag.handle === "se") {
        next.w = clamp(o.w + dx, MIN_SIZE, 1 - o.x);
        next.h = clamp(o.h + dy, MIN_SIZE, 1 - o.y);
      } else if (drag.handle === "ne") {
        next.w = clamp(o.w + dx, MIN_SIZE, 1 - o.x);
        next.y = clamp(o.y + dy, 0, bottom - MIN_SIZE);
        next.h = bottom - next.y;
      } else if (drag.handle === "sw") {
        next.x = clamp(o.x + dx, 0, right - MIN_SIZE);
        next.w = right - next.x;
        next.h = clamp(o.h + dy, MIN_SIZE, 1 - o.y);
      } else if (drag.handle === "nw") {
        next.x = clamp(o.x + dx, 0, right - MIN_SIZE);
        next.w = right - next.x;
        next.y = clamp(o.y + dy, 0, bottom - MIN_SIZE);
        next.h = bottom - next.y;
      }
    }

    onChange(slots.map((s) => (s.id === drag.slotId ? { ...s, rect: next } : s)));
  }

  function endDrag() {
    setDrag(null);
  }

  function addSlot() {
    const order = imageSlots.length + 1;
    let id = `photo_${order}`;
    let n = order;
    while (slots.some((s) => s.id === id)) id = `photo_${++n}`;
    const slot: ImageSlot = {
      id,
      kind: "image",
      source: id,
      rect: { x: 0.35, y: 0.35, w: 0.3, h: 0.3 },
      fit: "cover",
      allow: { pan: true, zoom: true, rotate: false },
      label: `${order}. Fotoğraf`,
      order,
    };
    onChange([...slots, slot]);
    setSelectedId(id);
  }

  function addTextSlot() {
    const count = slots.filter(isTextSlot).length + 1;
    let id = `text_${count}`;
    let n = count;
    while (slots.some((s) => s.id === id)) id = `text_${++n}`;
    const slot: TextSlot = {
      id,
      kind: "text",
      rect: { x: 0.15, y: 0.82, w: 0.70, h: 0.07 },
      label: `Metin ${count}`,
      order: 100 + count,
      mode: "free",
      default_value: "",
      max_length: 30,
      // Tuval yüksekliğine oran; 0.04 ≈ 30x40'ta 1.6 cm
      font_size: 0.04,
      font_family: "Arial, Helvetica, sans-serif",
      color: "#000000",
      bold: false,
      align: "center",
      overflow: "shrink",
    };
    onChange([...slots, slot]);
    setSelectedId(id);
  }

  function patchText(id: string, patch: Partial<TextSlot>) {
    onChange(slots.map((s) => (s.id === id && isTextSlot(s) ? { ...s, ...patch } : s)));
  }

  async function uploadFont(file: File, slotId: string) {
    setFontBusy(true);
    setFontError("");
    try {
      const fd = new FormData();
      fd.append("font", file);
      const res = await fetch("/api/fonts/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Font yüklenemedi");
      patchText(slotId, { font_url: data.url, font_family: data.family });
    } catch (err) {
      setFontError(err instanceof Error ? err.message : "Font yüklenemedi");
    } finally {
      setFontBusy(false);
    }
  }

  function removeSelected() {
    if (!selectedId) return;
    onChange(slots.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }

  function applyGrid() {
    const generated = buildGridSlots(grid, canvas, dpi);
    if (generated.length === 0) return;
    // Yalnızca fotoğraf alanları değişir; metin alanları korunur
    const texts = slots.filter((s) => !isImageSlot(s));
    onChange([...generated, ...texts]);
    onExpectedSlotsChange(generated.length);
    setSelectedId(null);
  }

  /**
   * Şeffaf deliklerden fotoğraf alanı üretir.
   *
   * Tarama sunucuda yapılıyor çünkü tasarımın piksellerini dolaşmak ve her
   * delik için maske dosyası üretmek gerekiyor. Bu yüzden şablon görselinin
   * erişilebilir bir adreste olması şart — henüz kaydedilmemiş bir yükleme
   * (blob: adresi) sunucudan okunamaz.
   */
  async function detectFromHoles() {
    if (!templateUrl || !/^https?:/i.test(templateUrl)) {
      setHoleNote({
        tone: "warning",
        text: "Önce şablonu kaydedin; tarama, yüklenmiş tasarım dosyası üzerinde çalışıyor.",
      });
      return;
    }
    setHoleBusy(true);
    setHoleNote(null);
    try {
      const res = await fetch("/api/personalizer/detect-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateUrl, expected: expectedSlots }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Tarama başarısız");

      if (!data.found) {
        setHoleNote({ tone: "warning", text: data.message });
        return;
      }
      // Yalnızca fotoğraf alanları değişir; metin alanları korunur
      const texts = slots.filter((x) => !isImageSlot(x));
      onChange([...(data.slots as Slot[]), ...texts]);
      setSelectedId(null);
      setHoleNote(
        data.mismatch
          ? { tone: "critical", text: data.mismatch }
          : { tone: "info", text: `${data.slots.length} alan bulundu ve okuma sırasına dizildi.` },
      );
    } catch (err) {
      setHoleNote({ tone: "critical", text: err instanceof Error ? err.message : "Tarama başarısız" });
    } finally {
      setHoleBusy(false);
    }
  }

  function renumber() {
    const images = sortReadingOrder(slots.filter(isImageSlot));
    const relabeled = images.map((s) => ({ ...s, label: `${s.order}. Fotoğraf` }));
    onChange([...relabeled, ...slots.filter((s) => !isImageSlot(s))]);
  }

  const selected = slots.find((s) => s.id === selectedId) ?? null;
  const selectedPx = selected ? rectToPx(selected.rect, canvas.canvasWidth, canvas.canvasHeight) : null;

  function patchGrid(patch: Partial<GridConfig>) {
    onGridConfigChange({ ...grid, ...patch });
  }
  function patchMargin(key: keyof GridConfig["margin_mm"], value: string) {
    const v = Number(value.replace(",", ".")) || 0;
    onGridConfigChange({ ...grid, margin_mm: { ...grid.margin_mm, [key]: v } });
  }

  return (
    <Card>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE_CSS }} />
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">Fotoğraf alanları</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {imageSlots.length} alan · tuval {canvas.canvasWidth} × {canvas.canvasHeight} px
            </Text>
          </BlockStack>
          <InlineStack gap="200">
            <Button onClick={() => setShowGrid((v) => !v)} pressed={showGrid}>
              Izgara üreticisi
            </Button>
            <Button onClick={detectFromHoles} loading={holeBusy}>
              Şeffaf deliklerden üret
            </Button>
            <Button onClick={renumber} disabled={imageSlots.length < 2}>Sırayı düzelt</Button>
            <Button onClick={addSlot}>Fotoğraf alanı</Button>
            <Button onClick={addTextSlot}>Metin alanı</Button>
          </InlineStack>
        </InlineStack>

        {holeNote && (
          <Banner tone={holeNote.tone === "info" ? "info" : holeNote.tone}>
            <p>{holeNote.text}</p>
          </Banner>
        )}

        {showGrid && (
          <Box background="bg-surface-secondary" padding="400" borderRadius="200">
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">Izgara üreticisi</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Kenar boşlukları kesim çizgisinden ölçülür. Uygulandığında mevcut fotoğraf
                alanlarının yerine geçer; metin alanları korunur.
              </Text>
              <FormLayout>
                <FormLayout.Group>
                  <TextField label="Sütun" type="number" autoComplete="off"
                    value={String(grid.cols)}
                    onChange={(v) => patchGrid({ cols: Math.max(1, Number(v) || 1) })} />
                  <TextField label="Satır" type="number" autoComplete="off"
                    value={String(grid.rows)}
                    onChange={(v) => patchGrid({ rows: Math.max(1, Number(v) || 1) })} />
                  <TextField label="Yatay boşluk (mm)" type="number" autoComplete="off"
                    value={String(grid.gap_x_mm)}
                    onChange={(v) => patchGrid({ gap_x_mm: Number(v.replace(",", ".")) || 0 })} />
                  <TextField label="Dikey boşluk (mm)" type="number" autoComplete="off"
                    helpText="Satır aralarında etiket varsa yataydan büyük olur"
                    value={String(grid.gap_y_mm)}
                    onChange={(v) => patchGrid({ gap_y_mm: Number(v.replace(",", ".")) || 0 })} />
                  <TextField label="Köşe yuvarlaması (mm)" type="number" autoComplete="off"
                    value={String(grid.corner_radius_mm)}
                    onChange={(v) => patchGrid({ corner_radius_mm: Number(v.replace(",", ".")) || 0 })} />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField label="Üst boşluk (mm)" type="number" autoComplete="off"
                    value={String(grid.margin_mm.top)} onChange={(v) => patchMargin("top", v)} />
                  <TextField label="Sağ boşluk (mm)" type="number" autoComplete="off"
                    value={String(grid.margin_mm.right)} onChange={(v) => patchMargin("right", v)} />
                  <TextField label="Alt boşluk (mm)" type="number" autoComplete="off"
                    value={String(grid.margin_mm.bottom)} onChange={(v) => patchMargin("bottom", v)} />
                  <TextField label="Sol boşluk (mm)" type="number" autoComplete="off"
                    value={String(grid.margin_mm.left)} onChange={(v) => patchMargin("left", v)} />
                </FormLayout.Group>
              </FormLayout>
              <InlineStack gap="200" blockAlign="center">
                <Button variant="primary" onClick={applyGrid}>
                  {`${gridPreviewCount} alan üret`}
                </Button>
                <Text as="span" variant="bodySm" tone="subdued">
                  Yazı için altta yer bırakmak isterseniz alt boşluğu artırın.
                </Text>
              </InlineStack>
            </BlockStack>
          </Box>
        )}

        {/* ── Tahta ───────────────────────────────────────────────── */}
        <div
          ref={boardRef}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onMouseDown={() => setSelectedId(null)}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: `${canvas.canvasWidth} / ${canvas.canvasHeight}`,
            background: templateUrl ? "#fff" : "repeating-conic-gradient(#f1f1f1 0% 25%, #fff 0% 50%) 50% / 24px 24px",
            border: "1px solid #d9d9d9",
            borderRadius: 6,
            overflow: "hidden",
            userSelect: "none",
            cursor: drag ? "grabbing" : "default",
          }}
        >
          {templateUrl && (
            <img
              src={templateUrl}
              alt=""
              draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }}
            />
          )}

          {/* güvenli alan */}
          <div
            style={{
              position: "absolute",
              left: `${safeBox.left}%`, top: `${safeBox.top}%`,
              width: `${safeBox.width}%`, height: `${safeBox.height}%`,
              border: "1px dashed rgba(46,125,91,.85)",
              pointerEvents: "none",
            }}
          />

          {slots.map((s) => {
            const isSel = s.id === selectedId;
            const isImage = isImageSlot(s);
            const color = isImage ? "#2f6fd0" : "#9a6b00";
            return (
              <div
                key={s.id}
                onMouseDown={(e) => startDrag(e, s, "move")}
                style={{
                  position: "absolute",
                  left: `${s.rect.x * 100}%`,
                  top: `${s.rect.y * 100}%`,
                  width: `${s.rect.w * 100}%`,
                  height: `${s.rect.h * 100}%`,
                  border: `2px solid ${color}`,
                  background: isSel ? "rgba(47,111,208,.22)" : "rgba(47,111,208,.10)",
                  boxSizing: "border-box",
                  cursor: "grab",
                  boxShadow: isSel ? `0 0 0 2px rgba(47,111,208,.35)` : "none",
                }}
              >
                <span
                  style={{
                    position: "absolute", top: 2, left: 4,
                    fontSize: 11, fontWeight: 600, color: "#fff",
                    background: color, padding: "1px 5px", borderRadius: 3,
                    pointerEvents: "none", whiteSpace: "nowrap",
                  }}
                >
                  {isImage ? s.order : "T"}
                </span>
                {isSel && (["nw", "ne", "sw", "se"] as const).map((h) => (
                  <span
                    key={h}
                    onMouseDown={(e) => startDrag(e, s, h)}
                    style={{
                      position: "absolute",
                      width: 12, height: 12,
                      background: "#fff",
                      border: `2px solid ${color}`,
                      borderRadius: 2,
                      cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                      left: h === "nw" || h === "sw" ? -6 : undefined,
                      right: h === "ne" || h === "se" ? -6 : undefined,
                      top: h === "nw" || h === "ne" ? -6 : undefined,
                      bottom: h === "sw" || h === "se" ? -6 : undefined,
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* ── Seçili alan ─────────────────────────────────────────── */}
        {selected && selectedPx && (
          <Box background="bg-surface-secondary" padding="300" borderRadius="200">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone="info">{isImageSlot(selected) ? `${selected.order}. alan` : "Metin"}</Badge>
                  <Text as="span" variant="bodySm">
                    {selectedPx.width} × {selectedPx.height} px
                    {"  ·  "}konum {selectedPx.x}, {selectedPx.y}
                  </Text>
                </InlineStack>
                <Button tone="critical" variant="plain" onClick={removeSelected}>Alanı sil</Button>
              </InlineStack>

              {isTextSlot(selected) && (
                <BlockStack gap="300">
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Etiket" autoComplete="off" value={selected.label}
                        helpText="Müşteriye gösterilen ad"
                        onChange={(v) => patchText(selected.id, { label: v })}
                      />
                      <Select
                        label="Müşteri ne yapabilir"
                        options={[
                          { label: "Serbest yazar", value: "free" },
                          { label: "Listeden seçer", value: "preset" },
                          { label: "Değiştiremez (sabit)", value: "fixed" },
                        ]}
                        value={selected.mode}
                        onChange={(v) => patchText(selected.id, { mode: v as TextSlot["mode"] })}
                      />
                      <TextField
                        label="En fazla karakter" type="number" autoComplete="off"
                        value={String(selected.max_length)}
                        onChange={(v) => patchText(selected.id, { max_length: Math.max(0, Number(v) || 0) })}
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Varsayılan değer" autoComplete="off" value={selected.default_value}
                        helpText="Müşteri boş bırakırsa basılacak metin"
                        onChange={(v) => patchText(selected.id, { default_value: v })}
                      />
                      <TextField
                        label="Punto (tuval yüksekliğine oran)" type="number" autoComplete="off"
                        value={String(selected.font_size)}
                        helpText={`≈ ${Math.round(selected.font_size * canvas.canvasHeight)} px`}
                        onChange={(v) => patchText(selected.id, { font_size: Number(v.replace(",", ".")) || 0.04 })}
                      />
                      <TextField
                        label="Renk" autoComplete="off" value={selected.color}
                        onChange={(v) => patchText(selected.id, { color: v })}
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <Select
                        label="Hizalama"
                        options={[
                          { label: "Ortalı", value: "center" },
                          { label: "Sola", value: "left" },
                          { label: "Sağa", value: "right" },
                        ]}
                        value={selected.align}
                        onChange={(v) => patchText(selected.id, { align: v as TextSlot["align"] })}
                      />
                      <Select
                        label="Taşarsa"
                        options={[
                          { label: "Otomatik küçült", value: "shrink" },
                          { label: "Kırp", value: "clip" },
                        ]}
                        value={selected.overflow}
                        onChange={(v) => patchText(selected.id, { overflow: v as TextSlot["overflow"] })}
                      />
                      <Select
                        label="Kalınlık"
                        options={[{ label: "Normal", value: "no" }, { label: "Kalın", value: "yes" }]}
                        value={selected.bold ? "yes" : "no"}
                        onChange={(v) => patchText(selected.id, { bold: v === "yes" })}
                      />
                    </FormLayout.Group>
                  </FormLayout>

                  {/* Font: baskıda metin fontun kendi harf çizimlerine
                      çevriliyor, dosya olmadan tasarımın yazısı tutmaz */}
                  <Box background="bg-surface" padding="300" borderRadius="200">
                    <BlockStack gap="300">
                      <InlineStack gap="200" blockAlign="center" wrap={false}>
                        <Text as="span" variant="bodySm" fontWeight="semibold">Font</Text>
                        {selected.font_url
                          ? <Badge tone="success">{selected.font_family || "Seçildi"}</Badge>
                          : <Badge tone="warning">Seçilmedi</Badge>}
                      </InlineStack>

                      <Select
                        label="Hazır fontlar"
                        options={fontSecenekleri}
                        value={
                          isLibraryFontUrl(selected.font_url) ? selected.font_url!
                            : selected.font_url ? "__yuklenen" : ""
                        }
                        onChange={(v) => {
                          const lib = findLibraryFont(v);
                          patchText(selected.id, lib
                            ? { font_url: lib.url, font_family: lib.family }
                            : { font_url: undefined, font_family: undefined });
                        }}
                        helpText={
                          findLibraryFont(selected.font_url)?.role
                          ?? (selected.font_url
                            ? "Mağazanın yüklediği font kullanılıyor."
                            : "Font seçilmezse baskıda sunucunun kendi fontu kullanılır ve tasarımdan sapar.")
                        }
                      />

                      {/* Önizleme: seçilen fontun harflerini gerçekten göstermek,
                          adını okumaktan çok daha hızlı karar verdiriyor */}
                      {selected.font_url && (
                        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                          <div style={{
                            fontFamily: fontOnizlemeAdi(selected.font_url),
                            fontSize: 26, lineHeight: 1.35, textAlign: "center",
                            color: "#1a1a1a", wordBreak: "break-word",
                          }}>
                            {selected.default_value?.trim() || "İyi ki doğdun · ĞÜŞİÖÇ 123"}
                          </div>
                        </Box>
                      )}

                      <Divider />

                      <Text as="p" variant="bodySm" tone="subdued">
                        Listede olmayan bir font gerekiyorsa kendi lisanslı dosyanızı yükleyin:
                        <b> .ttf, .otf veya .woff</b> — .woff2 okunamıyor.
                      </Text>
                      <input
                        ref={fontInputRef}
                        type="file"
                        accept=".ttf,.otf,.woff"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadFont(f, selected.id);
                        }}
                      />
                      <InlineStack gap="200">
                        <Button onClick={() => fontInputRef.current?.click()} loading={fontBusy}>
                          Kendi fontumu yükle
                        </Button>
                        {selected.font_url && !isLibraryFontUrl(selected.font_url) && (
                          <Button variant="plain" tone="critical"
                            onClick={() => patchText(selected.id, { font_url: undefined, font_family: undefined })}>
                            Kaldır
                          </Button>
                        )}
                      </InlineStack>
                      {fontError && <Text as="p" variant="bodySm" tone="critical">{fontError}</Text>}
                    </BlockStack>
                  </Box>
                </BlockStack>
              )}

              {isImageSlot(selected) && (
                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Etiket" autoComplete="off" value={selected.label}
                      onChange={(v) =>
                        onChange(slots.map((s) => (s.id === selected.id ? { ...s, label: v } : s)))
                      }
                    />
                    <Select
                      label="Doldurma"
                      options={[
                        { label: "Alanı doldur (kırparak)", value: "cover" },
                        { label: "Tamamını sığdır", value: "contain" },
                      ]}
                      value={selected.fit}
                      onChange={(v) =>
                        onChange(slots.map((s) =>
                          s.id === selected.id && isImageSlot(s)
                            ? { ...s, fit: v === "contain" ? "contain" : "cover" }
                            : s,
                        ))
                      }
                    />
                    <TextField
                      label="Kaynak girdi" autoComplete="off" value={selected.source}
                      helpText="Aynı kaynağı yazan alanlar aynı fotoğrafı gösterir"
                      onChange={(v) =>
                        onChange(slots.map((s) =>
                          s.id === selected.id && isImageSlot(s) ? { ...s, source: v.trim() || s.id } : s,
                        ))
                      }
                    />
                  </FormLayout.Group>
                </FormLayout>
              )}
            </BlockStack>
          </Box>
        )}

        <Divider />

        {/* ── Denetim ─────────────────────────────────────────────── */}
        <FormLayout>
          <TextField
            label="Beklenen fotoğraf alanı sayısı"
            type="number"
            autoComplete="off"
            value={String(expectedSlots)}
            onChange={(v) => onExpectedSlotsChange(Math.max(0, Number(v) || 0))}
            helpText="0 = kontrol etme. Doldurursanız sayı tutmadığında uyarılırsınız."
          />
        </FormLayout>

        {errors.length > 0 && (
          <Banner tone="critical" title="Düzeltilmesi gereken">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((e, i) => <li key={i}>{e.message}</li>)}
            </ul>
          </Banner>
        )}
        {warnings.length > 0 && (
          <Banner tone="warning" title="Uyarı">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
            </ul>
          </Banner>
        )}
        {errors.length === 0 && warnings.length === 0 && slots.length > 0 && (
          <Banner tone="success">
            <p>{imageSlots.length} fotoğraf alanı tanımlı, denetimden geçti.</p>
          </Banner>
        )}
      </BlockStack>
    </Card>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
