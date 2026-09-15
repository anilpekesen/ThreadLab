import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PrintCanvas } from "~/lib/print-spec";
import { isImageSlot, isTextSlot, rotatedBounds, type Rect, type Slot } from "~/lib/slots";
import {
  canvasGuides, clampRect, resizeRotated, rotationFromPointer, slotShape, snapEdges, snapMove, unionRect,
  type ResizeHandle, type SnapLine,
} from "~/lib/frame-studio";
import { maskPathUrl, shapeMaskUrl } from "~/lib/slot-shapes";
import { fontPreviewFamily } from "./TextSlotSettings";

/**
 * Stüdyo tuvali — alanları gerçek baskı oranında gösterir ve fareyle ya da
 * dokunarak düzenletir.
 *
 * Geometri normalize (0–1) tutulur; ekran pikseli yalnızca etkileşim sırasında
 * hesaplanır. Sürükleme süresince değişiklik `onLive` ile akar, bitişte tek
 * bir geçmiş adımı olarak `onCommit` edilir; aksi hâlde her fare hareketi ayrı
 * bir "geri al" adımı olurdu.
 *
 * Seçim bir liste: Shift/⌘ ile tıklamak ya da boş yerden sürükleyerek
 * çerçeve çizmek birden fazla alan seçer. Birden fazla alan seçiliyken
 * sürükleme hepsini birlikte taşır; boyut ve açı tutamakları yalnızca tek
 * seçimde görünür.
 */

type Handle = "move" | "rotate" | ResizeHandle;

type Drag =
  | {
      kind: "slot";
      ids: string[];
      handle: Handle;
      startX: number;
      startY: number;
      before: Slot[];
      moved: boolean;
    }
  | { kind: "marquee"; startX: number; startY: number; x: number; y: number; additive: boolean; base: string[] };

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SNAP_PX = 6;

export interface StudioCanvasProps {
  canvas: PrintCanvas;
  slots: Slot[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  /** Sürükleme sırasında geçmişe yazmadan güncelle */
  onLive: (slots: Slot[]) => void;
  /** Sürükleme bitti; `before` geri alma için önceki hâl */
  onCommit: (slots: Slot[], before: Slot[]) => void;
  backgroundUrl?: string;
  overlayUrl?: string;
  showOverlay: boolean;
  showGuides: boolean;
}

export function StudioCanvas({
  canvas, slots, selectedIds, onSelect, onLive, onCommit,
  backgroundUrl, overlayUrl, showOverlay, showGuides,
}: StudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lines, setLines] = useState<SnapLine[]>([]);
  const [angleHint, setAngleHint] = useState<number | null>(null);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Tuval, sahneye oranını bozmadan sığdırılıyor. CSS aspect-ratio tek başına
  // yetmiyor: yatay bir sahnede dikey bir çerçeve yüksekliği aşıyordu.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const pad = 56;
      const availW = Math.max(120, stage.clientWidth - pad);
      const availH = Math.max(120, stage.clientHeight - pad);
      const ratio = canvas.canvasWidth / canvas.canvasHeight;
      let w = availW;
      let h = w / ratio;
      if (h > availH) { h = availH; w = h * ratio; }
      setBoardSize({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [canvas.canvasWidth, canvas.canvasHeight]);

  const cw = canvas.canvasWidth;
  const ch = canvas.canvasHeight;
  const guides = canvasGuides(canvas);
  const pct = (v: number) => `${v * 100}%`;
  const trim = { x: canvas.trim.x / cw, y: canvas.trim.y / ch, w: canvas.trim.width / cw, h: canvas.trim.height / ch };
  const safe = { x: canvas.safe.x / cw, y: canvas.safe.y / ch, w: canvas.safe.width / cw, h: canvas.safe.height / ch };
  const bounds = (s: Slot) => rotatedBounds(s, cw, ch);

  function pointerToNorm(e: { clientX: number; clientY: number }) {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function beginSlot(e: React.PointerEvent, slot: Slot, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    let ids = selectedIds;
    if (handle === "move") {
      if (additive) {
        // Shift ile tıklamak seçime ekler/çıkarır; sürükleme başlatmaz
        onSelect(selectedIds.includes(slot.id)
          ? selectedIds.filter((id) => id !== slot.id)
          : [...selectedIds, slot.id]);
        return;
      }
      // Seçili gruptaki bir alandan tutulursa grup birlikte taşınır
      if (!selectedIds.includes(slot.id)) ids = [slot.id];
    } else {
      ids = [slot.id];
    }
    onSelect(ids);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = pointerToNorm(e);
    setDrag({ kind: "slot", ids, handle, startX: p.x, startY: p.y, before: slotsRef.current, moved: false });
  }

  function beginMarquee(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const p = pointerToNorm(e);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    setDrag({ kind: "marquee", startX: p.x, startY: p.y, x: p.x, y: p.y, additive, base: additive ? selectedIds : [] });
  }

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const p = pointerToNorm(e);

      if (drag.kind === "marquee") {
        setDrag({ ...drag, x: p.x, y: p.y });
        return;
      }

      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const threshold = { x: SNAP_PX / Math.max(1, boardSize.w), y: SNAP_PX / Math.max(1, boardSize.h) };
      // Alt tuşu hizalamayı geçici kapatır; iki çizgi arasında ince ayar için
      const snapOn = !e.altKey;
      const chosen = drag.before.filter((s) => drag.ids.includes(s.id));
      if (chosen.length === 0) return;
      const others = drag.before.filter((s) => !drag.ids.includes(s.id)).map(bounds);

      let nextById = new Map<string, Rect>();
      let snapped: SnapLine[] = [];
      let hint: number | null = null;

      if (drag.handle === "move") {
        // Grup, sınır kutusu üzerinden hizalanır ve tuvalde tutulur
        const box = unionRect(chosen.map(bounds));
        let target: Rect = { ...box, x: box.x + dx, y: box.y + dy };
        if (snapOn) {
          const r = snapMove(target, others, guides, threshold);
          target = r.rect;
          snapped = r.lines;
        }
        // Döndürülmemiş alanlar tuvalin tamamen içinde kalır. Döndürülmüş bir
        // alanın köşesi bilerek taşabilir (polaroid kolaj); tamamen dışarı
        // çıkmasın diye onda yalnızca merkez tuvalde tutuluyor.
        const anyRotated = chosen.some((s) => s.rotation);
        const tx = anyRotated
          ? Math.min(1, Math.max(0, target.x + target.w / 2)) - target.w / 2
          : Math.min(1 - box.w, Math.max(0, target.x));
        const ty = anyRotated
          ? Math.min(1, Math.max(0, target.y + target.h / 2)) - target.h / 2
          : Math.min(1 - box.h, Math.max(0, target.y));
        const mx = tx - box.x;
        const my = ty - box.y;
        for (const s of chosen) nextById.set(s.id, { ...s.rect, x: s.rect.x + mx, y: s.rect.y + my });
      } else if (drag.handle === "rotate") {
        const s = chosen[0];
        const center = { x: (s.rect.x + s.rect.w / 2) * cw, y: (s.rect.y + s.rect.h / 2) * ch };
        const deg = rotationFromPointer(center, { x: p.x * cw, y: p.y * ch }, e.shiftKey ? 15 : undefined);
        hint = deg;
        nextById = new Map();
        onLive(drag.before.map((x) => (x.id === s.id ? { ...x, rotation: deg || undefined } : x)));
        setAngleHint(hint);
        if (!drag.moved) setDrag({ ...drag, moved: true });
        return;
      } else {
        const s = chosen[0];
        const rotation = s.rotation ?? 0;
        const circle = isImageSlot(s) && slotShape(s, canvas) === "circle";
        const h = drag.handle;
        let next = resizeRotated(s.rect, rotation, h, { x: dx * cw, y: dy * ch }, canvas, { square: circle });
        if (!rotation && !circle && snapOn) {
          const r = snapEdges(next, {
            left: h.includes("w"), right: h.includes("e"), top: h.includes("n"), bottom: h.includes("s"),
          }, others, guides, threshold);
          next = r.rect;
          snapped = r.lines;
        }
        if (!rotation) next = clampRect(next, Math.min(next.w, next.h, 0.02));
        nextById.set(s.id, next);
      }

      setLines(snapped);
      if (!drag.moved) setDrag({ ...drag, moved: true });
      onLive(drag.before.map((s) => (nextById.has(s.id) ? { ...s, rect: nextById.get(s.id)! } : s)));
    };

    const end = () => {
      if (drag.kind === "marquee") {
        const box = {
          x: Math.min(drag.startX, drag.x), y: Math.min(drag.startY, drag.y),
          w: Math.abs(drag.x - drag.startX), h: Math.abs(drag.y - drag.startY),
        };
        // Tıklayıp bırakmak seçimi temizler; küçük titremeler çerçeve sayılmaz
        if (box.w * boardSize.w < 4 && box.h * boardSize.h < 4) {
          onSelect(drag.additive ? drag.base : []);
        } else {
          const hit = slotsRef.current
            .filter((s) => intersects(bounds(s), box))
            .map((s) => s.id);
          onSelect([...new Set([...drag.base, ...hit])]);
        }
        setDrag(null);
        return;
      }
      setLines([]);
      setAngleHint(null);
      if (drag.moved) onCommit(slotsRef.current, drag.before);
      setDrag(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    // guides ve canvas her çizimde yeniden hesaplanıyor ama sürükleme boyunca
    // değişmiyor; bağımlılığa eklemek dinleyicileri her harekette söküyordu.
  }, [drag, boardSize.w, boardSize.h]);

  const scale = boardSize.w / cw;
  const single = selectedIds.length === 1 ? slots.find((s) => s.id === selectedIds[0]) ?? null : null;
  const group = selectedIds.length > 1 ? slots.filter((s) => selectedIds.includes(s.id)) : [];
  const groupBox = group.length > 1 ? unionRect(group.map(bounds)) : null;
  const marquee = drag?.kind === "marquee"
    ? { x: Math.min(drag.startX, drag.x), y: Math.min(drag.startY, drag.y), w: Math.abs(drag.x - drag.startX), h: Math.abs(drag.y - drag.startY) }
    : null;

  const rectStyle = (r: Rect, rotation?: number): React.CSSProperties => ({
    left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h),
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
  });

  return (
    <div ref={stageRef} className="fs-stage" onPointerDown={beginMarquee}>
      <div
        ref={boardRef}
        className={`fs-board${drag?.kind === "slot" ? " is-dragging" : ""}`}
        style={{ width: boardSize.w, height: boardSize.h }}
      >
        {backgroundUrl
          ? <img className="fs-layer-img" src={backgroundUrl} alt="" draggable={false} />
          : <div className="fs-board-blank" />}

        {showGuides && (
          <>
            {/* Taşma payı: kesimde gidecek bölge hafif koyu */}
            <div className="fs-bleed" style={{
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(trim.x)} ${pct(trim.y)}, ${pct(trim.x)} ${pct(trim.y + trim.h)}, ${pct(trim.x + trim.w)} ${pct(trim.y + trim.h)}, ${pct(trim.x + trim.w)} ${pct(trim.y)}, ${pct(trim.x)} ${pct(trim.y)})`,
            }} />
            <div className="fs-trim" style={{ left: pct(trim.x), top: pct(trim.y), width: pct(trim.w), height: pct(trim.h) }} />
            <div className="fs-safe" style={{ left: pct(safe.x), top: pct(safe.y), width: pct(safe.w), height: pct(safe.h) }} />
          </>
        )}

        {slots.map((s) => {
          const selected = selectedIds.includes(s.id);
          const wPx = s.rect.w * cw;
          const hPx = s.rect.h * ch;
          const style = rectStyle(s.rect, s.rotation);
          if (isImageSlot(s)) {
            const mask = s.mask_url
              ? `url("${s.mask_url}")`
              : s.mask_path
                ? maskPathUrl(s.mask_path, wPx, hPx)
                : s.shape ? shapeMaskUrl(s.shape, wPx, hPx) : "";
            if (mask) {
              style.WebkitMaskImage = mask;
              style.maskImage = mask;
              style.WebkitMaskSize = "100% 100%";
              style.maskSize = "100% 100%";
              style.WebkitMaskRepeat = "no-repeat";
              style.maskRepeat = "no-repeat";
            } else if (s.radius) {
              // Render motorunun kuralı: yarıçap kısa kenarın yarısıyla sınırlı
              const rPx = Math.min(s.radius * cw, Math.min(wPx, hPx) / 2);
              style.borderRadius = rPx * scale;
            }
          }
          return (
            <div
              key={s.id}
              className={`fs-slot ${isImageSlot(s) ? "is-image" : "is-text"}${selected ? " is-selected" : ""}${isImageSlot(s) && (s.shape || s.mask_url || s.mask_path) ? " is-shaped" : ""}`}
              style={style}
              onPointerDown={(e) => beginSlot(e, s, "move")}
              role="button"
              aria-label={s.label || s.id}
              aria-pressed={selected}
            >
              {isImageSlot(s) ? (
                <span className="fs-slot-tag">{s.order}</span>
              ) : isTextSlot(s) ? (
                <span
                  className="fs-slot-text"
                  style={{
                    fontFamily: fontPreviewFamily(s.font_url),
                    fontSize: Math.max(6, s.font_size * boardSize.h),
                    fontWeight: s.bold ? 700 : 400,
                    color: s.color,
                    textAlign: s.align,
                    justifyContent: s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center",
                  }}
                >
                  {s.default_value || s.label || "Yazı"}
                </span>
              ) : null}
            </div>
          );
        })}

        {overlayUrl && showOverlay && (
          <img className="fs-layer-img fs-overlay" src={overlayUrl} alt="" draggable={false} />
        )}

        {/* Şekilli alanın dikdörtgen sınırı ince çizgiyle; şeklin nereye kadar
            uzandığı görünmezse boyutlandırmak tahmine kalıyor */}
        {group.map((s) => (
          <div key={`g-${s.id}`} className="fs-group-item" style={rectStyle(s.rect, s.rotation)}
            onPointerDown={(e) => beginSlot(e, s, "move")} />
        ))}

        {groupBox && <div className="fs-group-box" style={rectStyle(groupBox)} />}

        {single && (
          <div
            className="fs-selection"
            style={rectStyle(single.rect, single.rotation)}
            onPointerDown={(e) => beginSlot(e, single, "move")}
          >
            {HANDLES.map((h) => (
              <span key={h} className={`fs-handle fs-handle-${h}`} onPointerDown={(e) => beginSlot(e, single, h)} />
            ))}
            <span className="fs-rotate-stem" aria-hidden="true" />
            <span
              className="fs-rotate"
              title="Döndür (Shift ile 15°)"
              onPointerDown={(e) => beginSlot(e, single, "rotate")}
            />
          </div>
        )}

        {single && angleHint !== null && (
          <div className="fs-angle" style={{ left: pct(single.rect.x + single.rect.w / 2), top: pct(single.rect.y + single.rect.h / 2) }}>
            {`${angleHint}°`}
          </div>
        )}

        {marquee && <div className="fs-marquee" style={rectStyle(marquee)} />}

        {lines.map((l, i) => (
          <div
            key={i}
            className={`fs-snap fs-snap-${l.axis}`}
            style={l.axis === "x" ? { left: pct(l.at) } : { top: pct(l.at) }}
          />
        ))}
      </div>
    </div>
  );
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
