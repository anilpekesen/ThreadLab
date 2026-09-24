import { Fragment, useState } from "react";
import {
  BlockStack, InlineStack, Text, Button, Checkbox, Select, TextField, Banner, ButtonGroup,
} from "@shopify/polaris";
import type { PrintCanvas } from "~/lib/print-spec";
import {
  isImageSlot, isTextSlot, rectToPx, normalizeRotation,
  type ImageSlot, type Rect, type Slot, type SlotIssue, type TextSlot,
} from "~/lib/slots";
import {
  CIRCLE_RADIUS, alignSlots, distributeSlots, letterStrokeMm, matchSize, radiusFromMm, radiusToMm, rectFromMm, rectToMm,
  slotShape, squareAroundCenter, withLetterStroke, type AlignMode, type SlotShape,
} from "~/lib/frame-studio";
import { SLOT_SHAPES, shapePath } from "~/lib/slot-shapes";
import { NumberField } from "./NumberField";
import { TextSlotSettings } from "./TextSlotSettings";
import { useDict, useTranslation } from "~/i18n";
import inspectorDict from "~/i18n/studio/inspector";

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
  const L = useDict(inspectorDict);
  const images = slots.filter(isImageSlot);
  const texts = slots.filter(isTextSlot);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h2" variant="headingSm">{L.thisDesign}</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.slotCounts(images.length, texts.length)}
        </Text>
      </BlockStack>

      {slots.length === 0 ? (
        <Text as="p" tone="subdued">
          {L.emptyHint}
        </Text>
      ) : errors.length === 0 && warnings.length === 0 ? (
        <Banner tone="success">{L.passed}</Banner>
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
        <Text as="h3" variant="headingXs">{L.shortcuts}</Text>
        <dl className="fs-shortcuts">
          {L.shortcutList.map(([key, what]) => (
            <Fragment key={key}><dt>{key}</dt><dd>{what}</dd></Fragment>
          ))}
        </dl>
      </BlockStack>
    </BlockStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const ALIGN_BUTTONS: Array<{ mode: AlignMode; labelKey: "alignLeft" | "alignHCenter" | "alignRight" | "alignTop" | "alignVCenter" | "alignBottom" }> = [
  { mode: "left", labelKey: "alignLeft" },
  { mode: "hcenter", labelKey: "alignHCenter" },
  { mode: "right", labelKey: "alignRight" },
  { mode: "top", labelKey: "alignTop" },
  { mode: "vcenter", labelKey: "alignVCenter" },
  { mode: "bottom", labelKey: "alignBottom" },
];

function AlignGroup({ ids, canvas, onTransform, hint }: {
  ids: string[];
  canvas: PrintCanvas;
  onTransform: StudioInspectorProps["onTransform"];
  hint: string;
}) {
  const L = useDict(inspectorDict);
  return (
    <BlockStack gap="200">
      <Text as="h3" variant="headingXs">{L.align}</Text>
      <div className="fs-align-grid">
        {ALIGN_BUTTONS.map((b) => (
          <Button key={b.mode} size="slim" onClick={() => onTransform((slots) => alignSlots(slots, ids, b.mode, canvas))}>
            {L[b.labelKey]}
          </Button>
        ))}
      </div>
      <Text as="p" tone="subdued" variant="bodySm">{hint}</Text>
    </BlockStack>
  );
}

function MultiSelection({ canvas, dpi, selectedSlots, onMerge, onTransform, onDelete, onDuplicate }: StudioInspectorProps) {
  const L = useDict(inspectorDict);
  const ids = selectedSlots.map((s) => s.id);
  const imageCount = selectedSlots.filter(isImageSlot).length;
  const letters = selectedSlots.filter((s): s is ImageSlot => isImageSlot(s) && Boolean(s.mask_path));
  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
        <Text as="h2" variant="headingSm">{L.selectedCount(selectedSlots.length)}</Text>
        <ButtonGroup variant="segmented">
          <Button size="slim" onClick={onDuplicate}>{L.duplicate}</Button>
          <Button size="slim" tone="critical" onClick={onDelete}>{L.delete}</Button>
        </ButtonGroup>
      </InlineStack>

      {imageCount > 1 && (
        <BlockStack gap="200">
          <Button variant="primary" onClick={onMerge}>{L.mergeCount(imageCount)}</Button>
          <Text as="p" tone="subdued" variant="bodySm">
            {L.mergeHelp}
          </Text>
        </BlockStack>
      )}

      {letters.length > 0 && (
        <BlockStack gap="200">
          <NumberField
            label={L.letterStrokeCount(letters.length)}
            value={letterStrokeMm(letters[0], canvas, dpi)}
            min={0}
            onCommit={(v) => onTransform((slots) => slots.map((s) => (
              isImageSlot(s) && s.mask_path && ids.includes(s.id) ? withLetterStroke(s, Math.min(15, v), canvas, dpi) : s
            )))}
          />
          <Text as="p" tone="subdued" variant="bodySm">
            {L.letterStrokeHelp}
          </Text>
        </BlockStack>
      )}

      <AlignGroup ids={ids} canvas={canvas} onTransform={onTransform} hint={L.alignMultiHint} />

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">{L.distribute}</Text>
        <div className="fs-grid-2">
          <Button size="slim" disabled={selectedSlots.length < 3}
            onClick={() => onTransform((slots) => distributeSlots(slots, ids, "x", canvas))}>{L.horizontally}</Button>
          <Button size="slim" disabled={selectedSlots.length < 3}
            onClick={() => onTransform((slots) => distributeSlots(slots, ids, "y", canvas))}>{L.vertically}</Button>
        </div>
        {selectedSlots.length < 3 && <Text as="p" tone="subdued" variant="bodySm">{L.selectAtLeast3}</Text>}
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">{L.sameSize}</Text>
        <div className="fs-grid-2">
          <Button size="slim" onClick={() => onTransform((slots) => matchSize(slots, ids, "w"))}>{L.width}</Button>
          <Button size="slim" onClick={() => onTransform((slots) => matchSize(slots, ids, "h"))}>{L.height}</Button>
        </div>
        <Text as="p" tone="subdued" variant="bodySm">{L.sameSizeHelp}</Text>
      </BlockStack>
    </BlockStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SingleSelection({
  canvas, dpi, slots, selected, issues, onPatchSlot, onDelete, onDuplicate, onTransform, onSplit,
}: StudioInspectorProps & { selected: Slot }) {
  const L = useDict(inspectorDict);
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
          {isImageSlot(selected) ? L.photoSlotTitle(selected.order) : L.textSlotTitle}
        </Text>
        <ButtonGroup variant="segmented">
          <Button size="slim" onClick={onDuplicate}>{L.duplicate}</Button>
          <Button size="slim" tone="critical" onClick={onDelete}>{L.delete}</Button>
        </ButtonGroup>
      </InlineStack>

      {slotIssues.map((issue, i) => (
        <Banner key={i} tone={issue.level === "error" ? "critical" : "warning"}>{issue.message}</Banner>
      ))}

      {isImageSlot(selected) && (
        <TextField
          label={L.customerLabel}
          autoComplete="off"
          value={selected.label}
          onChange={(v) => onPatchSlot(selected.id, { label: v }, `label:${selected.id}`)}
        />
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">{L.positionSize}</Text>
        <div className="fs-grid-2">
          <NumberField label={L.fromLeft} value={mm.x} onCommit={(v) => setMm({ x: v }, `x:${selected.id}`)} />
          <NumberField label={L.fromTop} value={mm.y} onCommit={(v) => setMm({ y: v }, `y:${selected.id}`)} />
          <NumberField label={L.width} value={mm.w} min={1} onCommit={(v) => setMm({ w: v }, `w:${selected.id}`)} />
          <NumberField label={L.height} value={mm.h} min={1} onCommit={(v) => setMm({ h: v }, `h:${selected.id}`)} />
        </div>
        <InlineStack gap="200" blockAlign="end" wrap={false}>
          <div style={{ flex: 1 }}>
            <NumberField
              label={L.angle}
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
            {L.straighten}
          </Button>
        </InlineStack>
        <Text as="p" tone="subdued" variant="bodySm">
          {L.positionHelp}
        </Text>
      </BlockStack>

      <AlignGroup
        ids={[selected.id]}
        canvas={canvas}
        onTransform={onTransform}
        hint={L.alignSingleHint}
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
  const L = useDict(inspectorDict);
  const { lang } = useTranslation();

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
    { id: "rect", label: L.shapeRect },
    { id: "rounded", label: L.shapeRounded },
    { id: "circle", label: L.shapeCircle },
    ...SLOT_SHAPES.map((sh) => ({ id: sh.id, label: lang === "en" ? sh.labelEn : sh.label })),
  ];
  const sameAs = slots.filter((s): s is ImageSlot => isImageSlot(s) && s.id !== slot.id);

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">{L.shape}</Text>
        <div className="fs-shape-grid" role="group" aria-label={L.shapeGroup}>
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
          <BlockStack gap="200">
            <Text as="span" variant="bodySm" tone="subdued">
              {L.letterShape(slot.mask_label ?? "")}
            </Text>
            <NumberField
              label={L.letterStroke}
              value={letterStrokeMm(slot, canvas, dpi)}
              min={0}
              onCommit={(v) => onPatch(slot.id, withLetterStroke(slot, Math.min(15, v), canvas, dpi), `stroke:${slot.id}`)}
            />
          </BlockStack>
        )}
        {shape === "mask" && (
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">{L.maskShape}</Text>
          </InlineStack>
        )}
        {shape === "rounded" && (
          <NumberField
            label={L.cornerRadius}
            value={radiusMm}
            min={0}
            onCommit={(v) => onPatch(slot.id, { radius: radiusFromMm(v, canvas, dpi) }, `radius:${slot.id}`)}
          />
        )}
      </BlockStack>

      <Select
        label={L.fitLabel}
        options={[
          { label: L.fitCover, value: "cover" },
          { label: L.fitContain, value: "contain" },
        ]}
        value={slot.fit}
        onChange={(v) => onPatch(slot.id, { fit: v === "contain" ? "contain" : "cover" })}
      />

      <BlockStack gap="100">
        <Text as="h3" variant="headingXs">{L.customer}</Text>
        <Checkbox
          label={L.allowPan}
          checked={slot.allow.pan}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, pan: v } })}
        />
        <Checkbox
          label={L.allowZoom}
          checked={slot.allow.zoom}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, zoom: v } })}
        />
        <Checkbox
          label={L.allowRotate}
          checked={slot.allow.rotate}
          onChange={(v) => onPatch(slot.id, { allow: { ...slot.allow, rotate: v } })}
          helpText={L.allowRotateHelp}
        />
      </BlockStack>

      {sameAs.length > 0 && (
        <Select
          label={L.sourceLabel}
          options={[
            { label: L.sourceOwn, value: slot.id },
            ...sameAs
              .filter((s) => (s.source || s.id) === s.id)
              .map((s) => ({ label: L.sourceSameAs(s.order), value: s.id })),
          ]}
          value={slot.source === slot.id ? slot.id : slot.source}
          onChange={(v) => onPatch(slot.id, { source: v })}
          helpText={L.sourceHelp}
        />
      )}

      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">{L.split}</Text>
        <div className="fs-grid-2">
          <NumberField label={L.columns} suffix="" step={1} min={1} value={split.cols}
            onCommit={(v) => setSplit({ ...split, cols: Math.max(1, Math.round(v)) })} />
          <NumberField label={L.rows} suffix="" step={1} min={1} value={split.rows}
            onCommit={(v) => setSplit({ ...split, rows: Math.max(1, Math.round(v)) })} />
        </div>
        <NumberField label={L.gap} min={0} value={split.gap}
          onCommit={(v) => setSplit({ ...split, gap: Math.max(0, v) })} />
        <Button
          disabled={split.cols * split.rows < 2}
          onClick={() => onSplit(split.cols, split.rows, split.gap)}
        >
          {L.splitInto(split.cols * split.rows)}
        </Button>
      </BlockStack>

      <Text as="p" tone="subdued" variant="bodySm">
        {L.minPixels(px.width, px.height, dpi)}
      </Text>
    </BlockStack>
  );
}
