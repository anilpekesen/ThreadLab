import {
  BlockStack, InlineStack, Text, Button, Checkbox, Select, TextField, Banner, ButtonGroup,
} from "@shopify/polaris";
import type { PrintCanvas } from "~/lib/print-spec";
import {
  isImageSlot, isTextSlot, rectToPx, type ImageSlot, type Rect, type Slot, type SlotIssue, type TextSlot,
} from "~/lib/slots";
import {
  CIRCLE_RADIUS, radiusFromMm, radiusToMm, rectFromMm, rectToMm, slotShape, squareAroundCenter,
  type SlotShape,
} from "~/lib/frame-studio";
import { NumberField } from "./NumberField";
import { TextSlotSettings } from "./TextSlotSettings";

/**
 * Sağ panel — seçili alanın ayarları; seçim yoksa parçanın özeti ve denetim.
 *
 * Değerler milimetre olarak gösteriliyor ve kesim kenarından ölçülüyor.
 * Kayıttaki normalize oranları mağaza sahibi hiç görmüyor.
 */

export interface StudioInspectorProps {
  canvas: PrintCanvas;
  dpi: number;
  slots: Slot[];
  selected: Slot | null;
  issues: SlotIssue[];
  /** Tek alan değişikliği; `key` aynı alana art arda yazmayı tek geri alma adımında birleştirir */
  onPatchSlot: (id: string, patch: Partial<ImageSlot> | Partial<TextSlot>, key?: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSelect: (id: string) => void;
}

export function StudioInspector({
  canvas, dpi, slots, selected, issues, onPatchSlot, onDelete, onDuplicate, onSelect,
}: StudioInspectorProps) {
  if (!selected) {
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
            seçince ölçüsü ve şekli burada görünür.
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
            <dt>Ok tuşları</dt><dd>1 mm kaydır (Shift ile 10 mm)</dd>
            <dt>⌘/Ctrl + Z</dt><dd>Geri al</dd>
            <dt>⌘/Ctrl + D</dt><dd>Seçili alanı çoğalt</dd>
            <dt>Sil</dt><dd>Seçili alanı kaldır</dd>
            <dt>Alt ile sürükle</dt><dd>Hizalama çizgilerini kapat</dd>
          </dl>
        </BlockStack>
      </BlockStack>
    );
  }

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
          <Button size="slim" onClick={() => onDuplicate(selected.id)}>Çoğalt</Button>
          <Button size="slim" tone="critical" onClick={() => onDelete(selected.id)}>Sil</Button>
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
        <Text as="p" tone="subdued" variant="bodySm">Kesim kenarından ölçülür.</Text>
      </BlockStack>

      {isImageSlot(selected) && <ImageSettings slot={selected} slots={slots} canvas={canvas} dpi={dpi} onPatch={onPatchSlot} />}

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

function ImageSettings({
  slot, slots, canvas, dpi, onPatch,
}: {
  slot: ImageSlot;
  slots: Slot[];
  canvas: PrintCanvas;
  dpi: number;
  onPatch: StudioInspectorProps["onPatchSlot"];
}) {
  const shape = slotShape(slot, canvas);
  const px = rectToPx(slot.rect, canvas.canvasWidth, canvas.canvasHeight);
  const radiusMm = radiusToMm(slot, canvas, dpi);

  function setShape(next: SlotShape) {
    if (next === "rect") onPatch(slot.id, { radius: undefined, mask_url: undefined });
    if (next === "rounded") {
      onPatch(slot.id, { mask_url: undefined, radius: radiusFromMm(shape === "rounded" ? radiusMm : 4, canvas, dpi) });
    }
    if (next === "circle") {
      onPatch(slot.id, { mask_url: undefined, radius: CIRCLE_RADIUS, rect: squareAroundCenter(slot.rect, canvas) });
    }
  }

  const sameAs = slots.filter((s): s is ImageSlot => isImageSlot(s) && s.id !== slot.id);

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="h3" variant="headingXs">Şekil</Text>
        {shape === "mask" ? (
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodySm">Tasarımdaki delikten alınmış özel şekil</Text>
            <Button variant="plain" onClick={() => setShape("rect")}>Kaldır</Button>
          </InlineStack>
        ) : (
          <ButtonGroup variant="segmented" fullWidth>
            <Button pressed={shape === "rect"} onClick={() => setShape("rect")}>Köşeli</Button>
            <Button pressed={shape === "rounded"} onClick={() => setShape("rounded")}>Yuvarlatılmış</Button>
            <Button pressed={shape === "circle"} onClick={() => setShape("circle")}>Daire</Button>
          </ButtonGroup>
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

      <Text as="p" tone="subdued" variant="bodySm">
        {`Net baskı için müşterinin fotoğrafı en az ${px.width} × ${px.height} piksel olmalı (${dpi} dpi).`}
      </Text>
    </BlockStack>
  );
}
