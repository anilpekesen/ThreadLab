import { useState } from "react";
import {
  BlockStack, InlineStack, Text, Button, Checkbox, Select, TextField, Banner, ButtonGroup,
} from "@shopify/polaris";
import type { PrintCanvas } from "~/lib/print-spec";
import {
  isImageSlot, isTextSlot, rectToPx, normalizeRotation,
  type ImageSlot, type Rect, type Slot, type SlotIssue, type TextSlot,
} from "~/lib/slots";
import {
  CIRCLE_RADIUS, alignSlots, distributeSlots, matchSize, radiusFromMm, radiusToMm, rectFromMm, rectToMm,
  slotShape, squareAroundCenter, type AlignMode, type SlotShape,
} from "~/lib/frame-studio";
import { SLOT_SHAPES, shapePath } from "~/lib/slot-shapes";
import { NumberField } from "./NumberField";
import { TextSlotSettings } from "./TextSlotSettings";

/**
 * Sağ panel — seçimin ayarları.
 *
 * Seçim yoksa parçanın özeti ve denetim, tek alan seçiliyse o alanın ölçüsü,
 * şekli ve açısı, birden fazla alan seçiliyse hizalama ve birleştirme.
 * Değerler milimetre olarak gösteriliyor ve kesim kenarından ölçülüyor;
 * kayıttaki normalize oranları mağaza sahibi hiç görmüyor.
 */

export interface StudioInspectorProps {
  canvas: PrintCanvas;
  dpi: number;
  slots: Slot[];
  selected: Slot | null;
  selectedSlots: Slot[];
  issues: SlotIssue[];
  /** Tek alan değişikliği; `key` aynı alana art arda yazmayı tek geri alma adımında birleştirir */
  onPatchSlot: (id: string, patch: Partial<ImageSlot> | Partial<TextSlot>, key?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelect: (id: string) => void;
  onMerge: () => void;
  onSplit: (cols: number, rows: number, gapMm: number) => void;
  onTransform: (fn: (slots: Slot[]) => Slot[]) => void;
}

export function StudioInspector(props: StudioInspectorProps) {
  const { selected, selectedSlots } = props;
  if (selectedSlots.length > 1) return <MultiSelection {...props} />;
  if (!selected) return <Overview {...props} />;
  return <SingleSelection {...props} selected={selected} />;
}

// ─────────────────────────────────────────────────────────────────────────────

function Overview({ slots, issues, onSelect }: StudioInspectorProps) {
  const images = slots.filter(isImageSlot);
  const texts = slots.filter(isTextSlot);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">Bu tasarım</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {`${images.length} fotoğraf alanı · ${texts.length} yazı alanı`}
        </Text>
      </BlockStack>

      {slots.length === 0 ? (
        <Text as="p" tone="subdued">
          Soldan hazır bir düzen seçin ya da "Fotoğraf alanı" ile kendiniz ekleyin. Alanı
          seçince ölçüsü, şekli ve açısı burada görünür.
        </Text>
      ) : errors.length === 0 && warnings.length === 0 ? (
        <Banner tone="success">Denetimden geçti. Kaydedip deneme baskısı alabilirsiniz.</Banner>
      ) : (
        <BlockStack gap="200">
          {[...errors, ...warnings].map((issue, i) => (
            <button
              key={i}
              type="button"
              className={`fs-issue ${issue.level === "error" ? "is-error" : "is-warning"}`}
              onClick={() => issue.slot_id && onSelect(issue.slot_id)}
              disabled={!issue.slot_id}
            >
              {issue.message}
            </button>
          ))}
        </BlockStack>
      )}

      <BlockStack gap="150">
        <Text as="h3" variant="headingXs">Kısayollar</Text>
        <dl className="fs-shortcuts">
          <dt>Shift + tıkla</dt><dd>Birden fazla alan seç (boş yerden sürükleyerek de)</dd>
          <dt>Ok tuşları</dt><dd>1 mm kaydır (Shift ile 10 mm)</dd>
          <dt>⌘/Ctrl + Z</dt><dd>Geri al</dd>
          <dt>⌘/Ctrl + D</dt><dd>Çoğalt</dd>
          <dt>⌘/Ctrl + G</dt><dd>Seçili fotoğraf alanlarını birleştir</dd>
          <dt>⌘/Ctrl + A</dt><dd>Tümünü seç</dd>
          <dt>Sil</dt><dd>Seçimi kaldır</dd>
          <dt>Alt ile sürükle</dt><dd>Hizalama çizgilerini kapat</dd>
        </dl>
      </BlockStack>
    </BlockStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const ALIGN_BUTTONS: Array<{ mode: AlignMode; label: string }> = [
  { mode: "left", label: "Sola" },
  { mode: "hcenter", label: "Yatay orta" },
  { mode: "right", label: "Sağa" },
  { mode: "top", label: "Üste" },
  { mode: "vcenter", label: "Dikey orta" },
  { mode: "bottom", label: "Alta" },
];

function AlignGroup({ ids, canvas, onTransform, hint }: {
  ids: string[];
  canvas: PrintCanvas;
  onTransform: StudioInspectorProps["onTransform"];
  hint: string;
}) {
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingXs">Hizala</Text>
      <div className="fs-align-grid">
        {ALIGN_BUTTONS.map((b) => (
          <Button key={b.mode} size="slim" onClick={() => onTransform((slots) => alignSlots(slots, ids, b.mode, canvas))}>
            {b.label}
          </Button>
        ))}
      </div>
      <Text as="p" tone="subdued" variant="bodySm">{hint}</Text>
    </BlockStack>
  );
}

function MultiSelection({ canvas, selectedSlots, onMerge, onTransform, onDelete, onDuplicate }: StudioInspectorProps) {
  const ids = selectedSlots.map((s) => s.id);
  const imageCount = selectedSlots.filter(isImageSlot).length;
  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
        <Text as="h2" variant="headingSm">{`${selectedSlots.length} alan seçili`}</Text>
        <ButtonGroup variant="segmented">
          <Button size="slim" onClick={onDuplicate}>Çoğalt</Button>
          <Button size="slim" tone="critical" onClick={onDelete}>Sil</Button>
        </ButtonGroup>
      </InlineStack>

      {imageCount > 1 && (
        <BlockStack gap="200">
          <Button variant="primary" onClick={onMerge}>{`${imageCount} fotoğraf alanını birleştir`}</Button>
          <Text as="p" tone="subdued" variant="bodySm">
            Seçili alanları kaplayan tek büyük alan olur; ilk alanın adı ve ayarları korunur.
          </Text>
        </BlockStack>
      )}

      <AlignGroup ids={ids} canvas={canvas} onTransform={onTransform} hint="Alanlar birbirine göre hizalanır." />

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Eşit aralıkla dağıt</Text>
        <div className="fs-grid-2">
          <Button size="slim" disabled={selectedSlots.length < 3}
            onClick={() => onTransform((slots) => distributeSlots(slots, ids, "x", canvas))}>Yatayda</Button>
          <Button size="slim" disabled={selectedSlots.length < 3}
            onClick={() => onTransform((slots) => distributeSlots(slots, ids, "y", canvas))}>Dikeyde</Button>
        </div>
        {selectedSlots.length < 3 && <Text as="p" tone="subdued" variant="bodySm">En az 3 alan seçin.</Text>}
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Aynı boyut</Text>
        <div className="fs-grid-2">
          <Button size="slim" onClick={() => onTransform((slots) => matchSize(slots, ids, "w"))}>Genişlik</Button>
          <Button size="slim" onClick={() => onTransform((slots) => matchSize(slots, ids, "h"))}>Yükseklik</Button>
        </div>
        <Text as="p" tone="subdued" variant="bodySm">İlk seçilen alanın ölçüsü alınır.</Text>
      </BlockStack>
    </BlockStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SingleSelection({
  canvas, dpi, slots, selected, issues, onPatchSlot, onDelete, onDuplicate, onTransform, onSplit,
}: StudioInspectorProps & { selected: Slot }) {
  const mm = rectToMm(selected.rect, canvas, dpi);
  const setMm = (patch: Partial<typeof mm>, key: string) => {
    let rect: Rect = rectFromMm({ ...mm, ...patch }, canvas, dpi);
    if (isImageSlot(selected) && slotShape(selected, canvas) === "circle" && (patch.w !== undefined || patch.h !== undefined)) {
      // Dairede genişlik ve yükseklik birlikte değişir
      const side = patch.w ?? patch.h ?? mm.w;
      rect = rectFromMm({ ...mm, w: side, h: side }, canvas, dpi);
    }
    onPatchSlot(selected.id, { rect }, key);
  };
  const slotIssues = issues.filter((i) => i.slot_id === selected.id);

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
        <Text as="h2" variant="headingSm">
          {isImageSlot(selected) ? `${selected.order}. fotoğraf alanı` : "Yazı alanı"}
        </Text>
        <ButtonGroup variant="segmented">
          <Button size="slim" onClick={onDuplicate}>Çoğalt</Button>
          <Button size="slim" tone="critical" onClick={onDelete}>Sil</Button>
        </ButtonGroup>
      </InlineStack>

      {slotIssues.map((issue, i) => (
        <Banner key={i} tone={issue.level === "error" ? "critical" : "warning"}>{issue.message}</Banner>
      ))}

      {isImageSlot(selected) && (
        <TextField
          label="Müşterinin göreceği ad"
          autoComplete="off"
          value={selected.label}
          onChange={(v) => onPatchSlot(selected.id, { label: v }, `label:${selected.id}`)}
        />
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Konum ve boyut</Text>
        <div className="fs-grid-2">
          <NumberField label="Soldan" value={mm.x} onCommit={(v) => setMm({ x: v }, `x:${selected.id}`)} />
          <NumberField label="Üstten" value={mm.y} onCommit={(v) => setMm({ y: v }, `y:${selected.id}`)} />
          <NumberField label="Genişlik" value={mm.w} min={1} onCommit={(v) => setMm({ w: v }, `w:${selected.id}`)} />
          <NumberField label="Yükseklik" value={mm.h} min={1} onCommit={(v) => setMm({ h: v }, `h:${selected.id}`)} />
        </div>
        <InlineStack gap="200" blockAlign="end" wrap={false}>
          <div style={{ flex: 1 }}>
            <NumberField
              label="Açı"
              suffix="°"
              step={1}
              value={selected.rotation ?? 0}
              onCommit={(v) => onPatchSlot(selected.id, { rotation: normalizeRotation(v) }, `rot:${selected.id}`)}
            />
          </div>
          <Button
            disabled={!selected.rotation}
            onClick={() => onPatchSlot(selected.id, { rotation: undefined })}
          >
            Düzelt
          </Button>
        </InlineStack>
        <Text as="p" tone="subdued" variant="bodySm">
          Kesim kenarından ölçülür. Açıyı tuvaldeki yuvarlak tutamakla da değiştirebilirsiniz.
        </Text>
      </BlockStack>

      <AlignGroup
        ids={[selected.id]}
        canvas={canvas}
        onTransform={onTransform}
        hint="Tek alan seçiliyken kesim alanına göre hizalanır."
      />

      {isImageSlot(selected) && (
        <ImageSettings slot={selected} slots={slots} canvas={canvas} dpi={dpi} onPatch={onPatchSlot} onSplit={onSplit} />
      )}

      {isTextSlot(selected) && (
        <TextSlotSettings
          slot={selected}
          canvas={canvas}
          dpi={dpi}
          compact
          onPatch={(patch) => onPatchSlot(selected.id, patch, `text:${selected.id}:${Object.keys(patch).join(",")}`)}
        />
      )}
    </BlockStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Şekil düğmesinin küçük çizimi; baskıdaki yolun aynısı */
function ShapeIcon({ shape }: { shape: SlotShape }) {
  if (shape === "rect") return <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="5" width="20" height="16" /></svg>;
  if (shape === "rounded") return <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="5" width="20" height="16" rx="5" /></svg>;
  if (shape === "circle") return <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="3" width="20" height="20" rx="10" /></svg>;
  if (shape === "mask" || shape === "letter") return <svg viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="3" width="20" height="20" rx="3" /></svg>;
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <g transform="translate(3 3)"><path d={shapePath(shape, 20, 20)} /></g>
    </svg>
  );
}

function ImageSettings({
  slot, slots, canvas, dpi, onPatch, onSplit,
}: {
  slot: ImageSlot;
  slots: Slot[];
  canvas: PrintCanvas;
  dpi: number;
  onPatch: StudioInspectorProps["onPatchSlot"];
  onSplit: StudioInspectorProps["onSplit"];
}) {
  const shape = slotShape(slot, canvas);
  const px = rectToPx(slot.rect, canvas.canvasWidth, canvas.canvasHeight);
  const radiusMm = radiusToMm(slot, canvas, dpi);
  const [split, setSplit] = useState({ cols: 2, rows: 1, gap: 4 });

  function setShape(next: SlotShape) {
    // Hazır bir şekil seçilince harf maskesi de kalkar; ikisi birlikte olamaz
    if (next === "rect") onPatch(slot.id, { radius: undefined, mask_url: undefined, mask_path: undefined, shape: undefined });
    else if (next === "rounded") {
      onPatch(slot.id, {
        mask_url: undefined, mask_path: undefined, shape: undefined,
        radius: radiusFromMm(shape === "rounded" ? radiusMm : 4, canvas, dpi),
      });
    } else if (next === "circle") {
      onPatch(slot.id, {
        mask_url: undefined, mask_path: undefined, shape: undefined, radius: CIRCLE_RADIUS, rect: squareAroundCenter(slot.rect, canvas),
      });
    } else if (next !== "mask" && next !== "letter") {
      // Kalp ve yıldız kare kutuda en doğal görünüyor; oval ve kemer mevcut
      // oranını korur, çünkü onların anlamı zaten o orandan geliyor.
      const squareFirst = (next === "heart" || next === "star" || next === "hexagon" || next === "diamond")
        && shape !== "heart" && shape !== "star" && shape !== "hexagon" && shape !== "diamond";
      onPatch(slot.id, {
        mask_url: undefined, mask_path: undefined, radius: undefined, shape: next,
        ...(squareFirst ? { rect: squareAroundCenter(slot.rect, canvas) } : {}),
      });
    }
  }

  const options: Array<{ id: SlotShape; label: string }> = [
    { id: "rect", label: "Köşeli" },
    { id: "rounded", label: "Yuvarlak köşe" },
    { id: "circle", label: "Daire" },
    ...SLOT_SHAPES,
  ];
  const sameAs = slots.filter((s): s is ImageSlot => isImageSlot(s) && s.id !== slot.id);

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Şekil</Text>
        <div className="fs-shape-grid" role="group" aria-label="Alan şekli">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="fs-shape"
              aria-pressed={shape === o.id}
              onClick={() => setShape(o.id)}
            >
              <ShapeIcon shape={o.id} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
        {shape === "letter" && (
          <Text as="span" variant="bodySm" tone="subdued">
            {`Harf şekli${slot.mask_label ? ` (${slot.mask_label})` : ""}. Başka bir şekil seçerseniz harf şekli kalkar.`}
          </Text>
        )}
        {shape === "mask" && (
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">Tasarımdaki delikten alınmış özel şekil.</Text>
          </InlineStack>
        )}
        {shape === "rounded" && (
          <NumberField
            label="Köşe yuvarlaklığı"
            value={radiusMm}
            min={0}
            onCommit={(v) => onPatch(slot.id, { radius: radiusFromMm(v, canvas, dpi) }, `radius:${slot.id}`)}
          />
        )}
      </BlockStack>

      <Select
        label="Fotoğraf alana nasıl yerleşsin"
        options={[
          { label: "Alanı doldursun (kenarlar kırpılır)", value: "cover" },
          { label: "Tamamı görünsün (boşluk kalabilir)", value: "contain" },
        ]}
        value={slot.fit}
        onChange={(v) => onPatch(slot.id, { fit: v === "contain" ? "contain" : "cover" })}
      />

      <BlockStack gap="100">
        <Text as="h3" variant="headingXs">Müşteri</Text>
        <Checkbox
          label="Fotoğrafı alan içinde kaydırabilir"
          checked={slot.allow.pan}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, pan: v } })}
        />
        <Checkbox
          label="Fotoğrafı yakınlaştırabilir"
          checked={slot.allow.zoom}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, zoom: v } })}
        />
        <Checkbox
          label="Fotoğrafı 90° döndürebilir"
          checked={slot.allow.rotate}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, rotate: v } })}
          helpText="Telefonla yan çekilmiş fotoğrafları düzeltmek için."
        />
      </BlockStack>

      {sameAs.length > 0 && (
        <Select
          label="Hangi fotoğrafı göstersin"
          options={[
            { label: "Kendi fotoğrafı (müşteri ayrı yükler)", value: slot.id },
            ...sameAs
              .filter((s) => (s.source || s.id) === s.id)
              .map((s) => ({ label: `${s.order}. alanla aynı fotoğraf`, value: s.id })),
          ]}
          value={slot.source === slot.id ? slot.id : slot.source}
          onChange={(v) => onPatch(slot.id, { source: v })}
          helpText="Aynı fotoğrafı birden fazla yerde tekrarlamak için."
        />
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Alanı böl</Text>
        <div className="fs-grid-2">
          <NumberField label="Sütun" suffix="" step={1} min={1} value={split.cols}
            onCommit={(v) => setSplit({ ...split, cols: Math.max(1, Math.round(v)) })} />
          <NumberField label="Satır" suffix="" step={1} min={1} value={split.rows}
            onCommit={(v) => setSplit({ ...split, rows: Math.max(1, Math.round(v)) })} />
        </div>
        <NumberField label="Aralık" min={0} value={split.gap}
          onCommit={(v) => setSplit({ ...split, gap: Math.max(0, v) })} />
        <Button
          disabled={split.cols * split.rows < 2}
          onClick={() => onSplit(split.cols, split.rows, split.gap)}
        >
          {`${split.cols * split.rows} alana böl`}
        </Button>
      </BlockStack>

      <Text as="p" tone="subdued" variant="bodySm">
        {`Net baskı için müşterinin fotoğrafı en az ${px.width} × ${px.height} piksel olmalı (${dpi} dpi).`}
      </Text>
    </BlockStack>
  );
}
