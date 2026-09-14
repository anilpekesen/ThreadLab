import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PrintCanvas } from "~/lib/print-spec";
import { isImageSlot, isTextSlot, type Rect, type Slot } from "~/lib/slots";
import {
  canvasGuides, clampRect, slotShape, snapEdges, snapMove, type SnapLine,
} from "~/lib/frame-studio";
import { fontPreviewFamily } from "./TextSlotSettings";

/**
 * Stüdyo tuvali — alanları gerçek baskı oranında gösterir ve fareyle ya da
 * dokunarak düzenletir.
 *
 * Geometri normalize (0–1) tutulur; ekran pikseli yalnızca etkileşim sırasında
 * hesaplanır. Sürükleme süresince değişiklik `onLive` ile akar, bitişte tek
 * bir geçmiş adımı olarak `onCommit` edilir; aksi hâlde her fare hareketi ayrı
 * bir "geri al" adımı olurdu.
 */

type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

interface Drag {
  slotId: string;
  handle: Handle;
  startX: number;
  startY: number;
  origin: Rect;
  before: Slot[];
  moved: boolean;
}

const HANDLES: Exclude<Handle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SNAP_PX = 6;

export interface StudioCanvasProps {
  canvas: PrintCanvas;
  slots: Slot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
  canvas, slots, selectedId, onSelect, onLive, onCommit,
  backgroundUrl, overlayUrl, showOverlay, showGuides,
}: StudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lines, setLines] = useState<SnapLine[]>([]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Tuval, sahneye oranını bozmadan sığdırılıyor. CSS aspect-ratio tek başına
  // yetmiyor: yatay bir sahnede dikey bir çerçeve yüksekliği aşıyordu.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const pad = 48;
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

  const guides = canvasGuides(canvas);
  const pct = (v: number) => `${v * 100}%`;
  const trim = {
    x: canvas.trim.x / canvas.canvasWidth, y: canvas.trim.y / canvas.canvasHeight,
    w: canvas.trim.width / canvas.canvasWidth, h: canvas.trim.height / canvas.canvasHeight,
  };
  const safe = {
    x: canvas.safe.x / canvas.canvasWidth, y: canvas.safe.y / canvas.canvasHeight,
    w: canvas.safe.width / canvas.canvasWidth, h: canvas.safe.height / canvas.canvasHeight,
  };

  function pointerToNorm(e: { clientX: number; clientY: number }) {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function begin(e: React.PointerEvent, slot: Slot, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = pointerToNorm(e);
    onSelect(slot.id);
    setDrag({
      slotId: slot.id, handle, startX: p.x, startY: p.y,
      origin: { ...slot.rect }, before: slotsRef.current, moved: false,
    });
  }

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const p = pointerToNorm(e);
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const o = drag.origin;
      const slot = drag.before.find((s) => s.id === drag.slotId);
      if (!slot) return;
      const others = drag.before.filter((s) => s.id !== drag.slotId).map((s) => s.rect);
      const threshold = { x: SNAP_PX / Math.max(1, boardSize.w), y: SNAP_PX / Math.max(1, boardSize.h) };
      // Alt tuşu hizalamayı geçici kapatır; iki çizgi arasında ince ayar için
      const snapOn = !e.altKey;
      const circle = isImageSlot(slot) && slotShape(slot, canvas) === "circle";

      let next: Rect;
      let snapped: SnapLine[] = [];
      if (drag.handle === "move") {
        next = { ...o, x: o.x + dx, y: o.y + dy };
        if (snapOn) {
          const r = snapMove(next, others, guides, threshold);
          next = r.rect;
          snapped = r.lines;
        }
        next = clampRect(next);
      } else {
        const h = drag.handle;
        const left = h.includes("w");
        const right = h.includes("e");
        const top = h.includes("n");
        const bottom = h.includes("s");
        let x = o.x;
        let y = o.y;
        let w = o.w;
        let hh = o.h;
        if (right) w = o.w + dx;
        if (left) { x = o.x + dx; w = o.w - dx; }
        if (bottom) hh = o.h + dy;
        if (top) { y = o.y + dy; hh = o.h - dy; }
        next = { x, y, w, h: hh };

        if (circle) {
          // Daire kare kalmalı — PİKSEL olarak; tuval kare değilse normalize
          // w ile h eşit olunca elips çıkar.
          const wPx = next.w * canvas.canvasWidth;
          const hPx = next.h * canvas.canvasHeight;
          const side = (left || right) && (top || bottom)
            ? Math.max(wPx, hPx)
            : left || right ? wPx : hPx;
          const nw = side / canvas.canvasWidth;
          const nh = side / canvas.canvasHeight;
          next = {
            x: left ? o.x + o.w - nw : (left || right) ? o.x : o.x + (o.w - nw) / 2,
            y: top ? o.y + o.h - nh : (top || bottom) ? o.y : o.y + (o.h - nh) / 2,
            w: nw,
            h: nh,
          };
        } else if (snapOn) {
          const r = snapEdges(next, { left, right, top, bottom }, others, guides, threshold);
          next = r.rect;
          snapped = r.lines;
        }

        const min = 0.02;
        if (next.w < min) { if (left) next.x = o.x + o.w - min; next.w = min; }
        if (next.h < min) { if (top) next.y = o.y + o.h - min; next.h = min; }
        next = clampRect(next, min);
      }

      setLines(snapped);
      if (!drag.moved) setDrag({ ...drag, moved: true });
      onLive(drag.before.map((s) => (s.id === drag.slotId ? { ...s, rect: next } : s)));
    };

    const end = () => {
      setLines([]);
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
    // guides/canvas her render'da yeniden hesaplanıyor ama değerleri drag
    // boyunca sabit; bağımlılığa eklemek dinleyicileri her harekette söküyordu.
  }, [drag, boardSize.w, boardSize.h]);

  const scale = boardSize.w / canvas.canvasWidth;

  return (
    <div
      ref={stageRef}
      className="fs-stage"
      onPointerDown={() => onSelect(null)}
    >
      <div
        ref={boardRef}
        className={`fs-board${drag ? " is-dragging" : ""}`}
        style={{ width: boardSize.w, height: boardSize.h }}
      >
        {backgroundUrl
          ? <img className="fs-layer-img" src={backgroundUrl} alt="" draggable={false} />
          : <div className="fs-board-blank" />}

        {showGuides && (
          <>
            {/* Taşma payı: kesimde gidecek bölge taralı değil, hafif koyu */}
            <div className="fs-bleed" style={{
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(trim.x)} ${pct(trim.y)}, ${pct(trim.x)} ${pct(trim.y + trim.h)}, ${pct(trim.x + trim.w)} ${pct(trim.y + trim.h)}, ${pct(trim.x + trim.w)} ${pct(trim.y)}, ${pct(trim.x)} ${pct(trim.y)})`,
            }} />
            <div className="fs-trim" style={{ left: pct(trim.x), top: pct(trim.y), width: pct(trim.w), height: pct(trim.h) }} />
            <div className="fs-safe" style={{ left: pct(safe.x), top: pct(safe.y), width: pct(safe.w), height: pct(safe.h) }} />
          </>
        )}

        {slots.map((s) => {
          const selected = s.id === selectedId;
          const wPx = s.rect.w * canvas.canvasWidth;
          const hPx = s.rect.h * canvas.canvasHeight;
          const style: React.CSSProperties = {
            left: pct(s.rect.x), top: pct(s.rect.y), width: pct(s.rect.w), height: pct(s.rect.h),
          };
          if (isImageSlot(s)) {
            if (s.mask_url) {
              style.WebkitMaskImage = `url(${s.mask_url})`;
              style.maskImage = `url(${s.mask_url})`;
              style.WebkitMaskSize = "100% 100%";
              style.maskSize = "100% 100%";
            } else if (s.radius) {
              // Render motorunun kuralı: yarıçap kısa kenarın yarısıyla sınırlı
              const rPx = Math.min(s.radius * canvas.canvasWidth, Math.min(wPx, hPx) / 2);
              style.borderRadius = rPx * scale;
            }
          }
          return (
            <div
              key={s.id}
              className={`fs-slot ${isImageSlot(s) ? "is-image" : "is-text"}${selected ? " is-selected" : ""}`}
              style={style}
              onPointerDown={(e) => begin(e, s, "move")}
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

        {/* Seçim çerçevesi üst katmanın da üstünde: kapalı bir alanı tutabilmek için */}
        {slots.filter((s) => s.id === selectedId).map((s) => (
          <div
            key={`sel-${s.id}`}
            className="fs-selection"
            style={{ left: pct(s.rect.x), top: pct(s.rect.y), width: pct(s.rect.w), height: pct(s.rect.h) }}
            onPointerDown={(e) => begin(e, s, "move")}
          >
            {HANDLES.map((h) => (
              <span
                key={h}
                className={`fs-handle fs-handle-${h}`}
                onPointerDown={(e) => begin(e, s, h)}
              />
            ))}
          </div>
        ))}

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
