/**
 * Çerçeve Stüdyosu'nun hesap katmanı — ekrandan bağımsız, saf fonksiyonlar.
 *
 * Stüdyo slot verisini `slots.ts`'deki formatta tutar ve yazar; burada yalnızca
 * mağaza sahibinin düşündüğü birimlerle (milimetre, kesim kenarı, daire) veri
 * formatı arasındaki çeviri ve hizalama hesapları var. Render motoru ve müşteri
 * sayfası bu dosyayı hiç bilmez.
 */

import type { PrintCanvas } from "~/lib/print-spec";
import {
  buildGridSlots, isImageSlot, rotatedBounds, DEFAULT_GRID,
  type GridConfig, type ImageSlot, type Rect, type Slot, type TemplatePiece,
} from "~/lib/slots";
import type { SlotShapeId } from "~/lib/slot-shapes";

// ─────────────────────────────────────────────────────────────────────────────
// Milimetre ↔ normalize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Konum KESİM kenarından ölçülür: mağaza sahibi "soldan 2 cm" derken taşma
 * payını değil, kesilmiş ürünün kenarını kasteder. Izgara üreticisi de aynı
 * referansı kullanıyor.
 */
export interface MmRect { x: number; y: number; w: number; h: number }

export function rectToMm(rect: Rect, canvas: PrintCanvas, dpi: number): MmRect {
  const pxToMm = (px: number) => (px / dpi) * 25.4;
  return {
    x: pxToMm(rect.x * canvas.canvasWidth - canvas.trim.x),
    y: pxToMm(rect.y * canvas.canvasHeight - canvas.trim.y),
    w: pxToMm(rect.w * canvas.canvasWidth),
    h: pxToMm(rect.h * canvas.canvasHeight),
  };
}

export function rectFromMm(mm: MmRect, canvas: PrintCanvas, dpi: number): Rect {
  const mmToPx = (v: number) => (v / 25.4) * dpi;
  return {
    x: (mmToPx(mm.x) + canvas.trim.x) / canvas.canvasWidth,
    y: (mmToPx(mm.y) + canvas.trim.y) / canvas.canvasHeight,
    w: mmToPx(mm.w) / canvas.canvasWidth,
    h: mmToPx(mm.h) / canvas.canvasHeight,
  };
}

/** Görüntülemek için tek ondalık; baskı toleransının altında hassasiyet gürültü */
export function roundMm(v: number): number {
  return Math.round(v * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Şekil
// ─────────────────────────────────────────────────────────────────────────────

export type SlotShape = "rect" | "rounded" | "circle" | "mask" | "letter" | SlotShapeId;

/**
 * Köşe yuvarlaması tuval GENİŞLİĞİNE oranla saklanıyor ve render motoru onu
 * alanın kısa kenarının yarısıyla sınırlıyor. Yarıçap o sınırı geçiyorsa alan
 * fiilen daire (kare alanda) ya da kapsüldür; ayrı bir "şekil" alanı tutmadan
 * şekli buradan çıkarıyoruz ki eski kayıtlar da doğru okunsun.
 */
export function slotShape(slot: ImageSlot, canvas: PrintCanvas): SlotShape {
  if (slot.mask_url) return "mask";
  if (slot.mask_path) return "letter";
  if (slot.shape) return slot.shape;
  const radiusPx = (slot.radius ?? 0) * canvas.canvasWidth;
  if (radiusPx <= 0) return "rect";
  const wPx = slot.rect.w * canvas.canvasWidth;
  const hPx = slot.rect.h * canvas.canvasHeight;
  return radiusPx >= Math.min(wPx, hPx) / 2 - 0.5 ? "circle" : "rounded";
}

/** Daire için sınırsız yarıçap: motor kısa kenarın yarısına indiriyor */
export const CIRCLE_RADIUS = 1;

export function radiusToMm(slot: ImageSlot, canvas: PrintCanvas, dpi: number): number {
  return ((slot.radius ?? 0) * canvas.canvasWidth / dpi) * 25.4;
}

export function radiusFromMm(mm: number, canvas: PrintCanvas, dpi: number): number | undefined {
  if (!(mm > 0)) return undefined;
  return ((mm / 25.4) * dpi) / canvas.canvasWidth;
}

/**
 * Alanı merkezini koruyarak gerçek (piksel olarak) kareye çevirir. Tuval kare
 * değilse normalize w ile h eşit olunca alan kare görünmez; hesap pikselde.
 */
export function squareAroundCenter(rect: Rect, canvas: PrintCanvas): Rect {
  const wPx = rect.w * canvas.canvasWidth;
  const hPx = rect.h * canvas.canvasHeight;
  const side = Math.min(wPx, hPx);
  const w = side / canvas.canvasWidth;
  const h = side / canvas.canvasHeight;
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hazır düzenler
// ─────────────────────────────────────────────────────────────────────────────

export interface LayoutPreset {
  id: string;
  label: string;
  /** Tuvale göre ızgara; oryantasyon tuvalden okunup satır/sütun çevrilebilir */
  grid: (canvas: PrintCanvas) => Pick<GridConfig, "cols" | "rows" | "merges">;
}

const portrait = (c: PrintCanvas) => c.aspect < 0.98;

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "single", label: "Tek fotoğraf", grid: () => ({ cols: 1, rows: 1 }) },
  {
    id: "two", label: "2 fotoğraf",
    grid: (c) => (portrait(c) ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 }),
  },
  { id: "four", label: "4'lü ızgara", grid: () => ({ cols: 2, rows: 2 }) },
  {
    id: "six", label: "6'lı ızgara",
    grid: (c) => (portrait(c) ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 }),
  },
  { id: "nine", label: "9'lu ızgara", grid: () => ({ cols: 3, rows: 3 }) },
  {
    id: "twelve", label: "12'li ızgara",
    grid: (c) => (portrait(c) ? { cols: 3, rows: 4 } : { cols: 4, rows: 3 }),
  },
  {
    id: "hero-4", label: "1 büyük + 5 küçük",
    grid: () => ({ cols: 3, rows: 3, merges: [{ col: 0, row: 0, col_span: 2, row_span: 2 }] }),
  },
  {
    id: "hero-row", label: "1 büyük + 3 alt",
    grid: () => ({ cols: 3, rows: 3, merges: [{ col: 0, row: 0, col_span: 3, row_span: 2 }] }),
  },
];

/** Yeni şablon için makul boşluklar: kesimden 1 cm içeride, 4 mm aralık */
export const STUDIO_DEFAULT_GRID: GridConfig = {
  ...DEFAULT_GRID,
  margin_mm: { top: 10, right: 10, bottom: 10, left: 10 },
  gap_x_mm: 4,
  gap_y_mm: 4,
  corner_radius_mm: 0,
  merges: [],
};

export function presetSlots(
  preset: LayoutPreset,
  base: GridConfig,
  canvas: PrintCanvas,
  dpi: number,
): { slots: ImageSlot[]; grid: GridConfig } {
  const grid: GridConfig = { ...base, merges: [], ...preset.grid(canvas) };
  return { slots: buildGridSlots(grid, canvas, dpi), grid };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kimlikler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parça içinde benzersiz, parçalar arasında çakışmayan kimlik. İlk parça
 * ("main"/"frame_1") önek almıyor: tek parçalı şablonlarda kimlikler geriye
 * dönük olarak `photo_1` biçiminde kalmalı.
 */
export function nextSlotId(piece: TemplatePiece, allPieces: TemplatePiece[], base: "photo" | "text"): string {
  const prefix = allPieces[0]?.id === piece.id ? "" : `${piece.id}__`;
  const taken = new Set(allPieces.flatMap((p) => p.slots.map((s) => s.id)));
  let n = piece.slots.filter((s) => (base === "photo" ? isImageSlot(s) : !isImageSlot(s))).length + 1;
  let id = `${prefix}${base}_${n}`;
  while (taken.has(id)) id = `${prefix}${base}_${++n}`;
  return id;
}

/** Izgaradan gelen `photo_N` kimliklerini parçanın önekine taşır */
export function prefixSlotIds<T extends Slot>(slots: T[], piece: TemplatePiece, allPieces: TemplatePiece[]): T[] {
  if (allPieces[0]?.id === piece.id) return slots;
  return slots.map((s) => {
    const id = `${piece.id}__${s.id}`;
    return (isImageSlot(s) ? { ...s, id, source: id } : { ...s, id }) as T;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hizalama (mıknatıs)
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapLine {
  axis: "x" | "y";
  /** Normalize konum */
  at: number;
}

export interface SnapResult {
  rect: Rect;
  lines: SnapLine[];
}

/** Tuvalin sabit çizgileri: taşma kenarı, kesim, güvenli alan, orta */
export function canvasGuides(canvas: PrintCanvas): { x: number[]; y: number[] } {
  const nx = (px: number) => px / canvas.canvasWidth;
  const ny = (px: number) => px / canvas.canvasHeight;
  return {
    x: [0, 0.5, 1,
      nx(canvas.trim.x), nx(canvas.trim.x + canvas.trim.width),
      nx(canvas.safe.x), nx(canvas.safe.x + canvas.safe.width)],
    y: [0, 0.5, 1,
      ny(canvas.trim.y), ny(canvas.trim.y + canvas.trim.height),
      ny(canvas.safe.y), ny(canvas.safe.y + canvas.safe.height)],
  };
}

function nearest(values: number[], targets: number[], threshold: number) {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const delta = t - v;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, at: t };
      }
    }
  }
  return best;
}

/**
 * Taşınan alanı en yakın çizgiye yapıştırır. Diğer alanların kenarları ve
 * merkezleri de aday: kolajlarda asıl ihtiyaç komşu kutuyla hizalanmak.
 * Eşik normalize birimde ve eksene göre ayrı, çünkü tuval kare olmayabilir.
 */
export function snapMove(
  rect: Rect,
  others: Rect[],
  guides: { x: number[]; y: number[] },
  threshold: { x: number; y: number },
): SnapResult {
  const xs = [...guides.x, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ys = [...guides.y, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const lines: SnapLine[] = [];
  const next = { ...rect };

  const sx = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], xs, threshold.x);
  if (sx) { next.x += sx.delta; lines.push({ axis: "x", at: sx.at }); }
  const sy = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], ys, threshold.y);
  if (sy) { next.y += sy.delta; lines.push({ axis: "y", at: sy.at }); }

  return { rect: next, lines };
}

/** Boyutlandırmada yalnızca hareket eden kenar yapışır; karşı kenar sabit kalır */
export function snapEdges(
  rect: Rect,
  moving: { left: boolean; right: boolean; top: boolean; bottom: boolean },
  others: Rect[],
  guides: { x: number[]; y: number[] },
  threshold: { x: number; y: number },
): SnapResult {
  const xs = [...guides.x, ...others.flatMap((o) => [o.x, o.x + o.w])];
  const ys = [...guides.y, ...others.flatMap((o) => [o.y, o.y + o.h])];
  const lines: SnapLine[] = [];
  let { x, y, w, h } = rect;

  if (moving.left) {
    const s = nearest([x], xs, threshold.x);
    if (s) { w -= s.delta; x += s.delta; lines.push({ axis: "x", at: s.at }); }
  } else if (moving.right) {
    const s = nearest([x + w], xs, threshold.x);
    if (s) { w += s.delta; lines.push({ axis: "x", at: s.at }); }
  }
  if (moving.top) {
    const s = nearest([y], ys, threshold.y);
    if (s) { h -= s.delta; y += s.delta; lines.push({ axis: "y", at: s.at }); }
  } else if (moving.bottom) {
    const s = nearest([y + h], ys, threshold.y);
    if (s) { h += s.delta; lines.push({ axis: "y", at: s.at }); }
  }
  return { rect: { x, y, w, h }, lines };
}

export function clampRect(rect: Rect, min = 0.02): Rect {
  const w = Math.min(1, Math.max(min, rect.w));
  const h = Math.min(1, Math.max(min, rect.h));
  return {
    x: Math.min(1 - w, Math.max(0, rect.x)),
    y: Math.min(1 - h, Math.max(0, rect.y)),
    w,
    h,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parça ↔ şablon
// ─────────────────────────────────────────────────────────────────────────────

/** Tek parçalı şablonun stüdyodaki parça kimliği; kayıtta tekrar tek parçaya döner */
export const SINGLE_PIECE_ID = "main";

export interface StudioTemplateFields {
  slots: Slot[];
  pieces: TemplatePiece[];
  print_product_id: string;
  template_url: string;
  overlay_url: string;
  expected_slots: number;
}

/**
 * Stüdyonun parça listesini şablon kolonlarına çevirir.
 *
 * Tek parça ve kimliği "main" ise şablon tek parçalı kaydedilir — bugüne kadar
 * her şablon böyle çalışıyor ve render motoru, müşteri sayfası, sürüm geçmişi
 * bu biçimi bekliyor. Aksi hâlde `pieces` dolu yazılır; kolonlardaki eski tek
 * parça değerleri dokunulmadan kalır ki geri dönülebilsin.
 */
export function piecesToTemplateFields(
  pieces: TemplatePiece[],
  current: { template_url: string; overlay_url: string; print_product_id: string; slots: Slot[] },
): StudioTemplateFields {
  if (pieces.length === 1 && pieces[0].id === SINGLE_PIECE_ID) {
    const p = pieces[0];
    return {
      slots: p.slots,
      pieces: [],
      print_product_id: p.print_product_id,
      template_url: p.background_url ?? "",
      overlay_url: p.overlay_url ?? "",
      expected_slots: p.slots.filter(isImageSlot).length,
    };
  }
  return {
    slots: current.slots,
    pieces: pieces.map((p, i) => ({ ...p, order: i + 1 })),
    print_product_id: current.print_product_id,
    template_url: current.template_url,
    overlay_url: current.overlay_url,
    expected_slots: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Döndürme
// ─────────────────────────────────────────────────────────────────────────────

export type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/**
 * Döndürülmüş bir alanı tutamaktan boyutlandırır.
 *
 * Hesap tuval PİKSELİNDE yapılıyor: dönme piksel uzayında tanımlı ve tuval
 * kare değilse normalize koordinatta döndürmek alanı çarpıtırdı. İşaretçinin
 * hareketi alanın kendi eksenine çevriliyor, karşı kenar (ya da köşe) dünyada
 * sabit tutuluyor ve yeni merkez oradan geri hesaplanıyor. Döndürülmemiş alanda
 * da aynı sonucu verir.
 */
export function resizeRotated(
  origin: Rect,
  rotation: number,
  handle: ResizeHandle,
  deltaPx: { x: number; y: number },
  canvas: PrintCanvas,
  options: { minPx?: number; square?: boolean } = {},
): Rect {
  const cw = canvas.canvasWidth;
  const ch = canvas.canvasHeight;
  const t = (rotation * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const minPx = options.minPx ?? Math.min(cw, ch) * 0.02;

  const w = origin.w * cw;
  const h = origin.h * ch;
  const cx = (origin.x + origin.w / 2) * cw;
  const cy = (origin.y + origin.h / 2) * ch;

  // İşaretçi hareketi alanın kendi eksenlerinde
  const lx = deltaPx.x * cos + deltaPx.y * sin;
  const ly = -deltaPx.x * sin + deltaPx.y * cos;

  let nw = sx !== 0 ? Math.max(minPx, w + sx * lx) : w;
  let nh = sy !== 0 ? Math.max(minPx, h + sy * ly) : h;
  if (options.square) {
    const side = sx !== 0 && sy !== 0 ? Math.max(nw, nh) : sx !== 0 ? nw : nh;
    nw = side;
    nh = side;
  }

  // Sabit kalan nokta (yerel), dünyada; yeni merkez ondan geri
  const ax = -sx * w / 2;
  const ay = -sy * h / 2;
  const worldAx = cx + ax * cos - ay * sin;
  const worldAy = cy + ax * sin + ay * cos;
  const bx = sx * nw / 2;
  const by = sy * nh / 2;
  const ncx = worldAx + bx * cos - by * sin;
  const ncy = worldAy + bx * sin + by * cos;

  return {
    x: (ncx - nw / 2) / cw,
    y: (ncy - nh / 2) / ch,
    w: nw / cw,
    h: nh / ch,
  };
}

/**
 * İşaretçinin merkeze göre açısından alanın dönüşü. Tutamak alanın üstünde
 * durduğu için 90° ekleniyor. `step` verilirse o adıma yuvarlanır; verilmezse
 * yalnızca 0/90/180/270'e 3° yakınlıkta yapışır.
 */
export function rotationFromPointer(
  centerPx: { x: number; y: number },
  pointerPx: { x: number; y: number },
  step?: number,
): number {
  let deg = (Math.atan2(pointerPx.y - centerPx.y, pointerPx.x - centerPx.x) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 540) % 360 - 180;
  if (step) return Math.round(deg / step) * step;
  for (const a of [-180, -90, 0, 90, 180]) {
    if (Math.abs(deg - a) <= 3) return a === -180 ? 180 : a;
  }
  return Math.round(deg * 10) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Çoklu seçim işlemleri
// ─────────────────────────────────────────────────────────────────────────────

export function unionRect(rects: Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Seçili fotoğraf alanlarını kaplayan tek bir alana çevirir.
 *
 * İlk alan (okuma sırasında en öndeki) kimliğini, adını ve ayarlarını korur;
 * diğerleri silinir. Silinen bir alanın fotoğrafını tekrarlayan alanlar kendi
 * fotoğraflarına döner, yoksa var olmayan bir kaynağa bağlı kalırlardı.
 */
export function mergeImageSlots(slots: Slot[], ids: string[], canvas: PrintCanvas): { slots: Slot[]; keptId: string } | null {
  const chosen = slots.filter((s): s is ImageSlot => isImageSlot(s) && ids.includes(s.id))
    .sort((a, b) => a.order - b.order);
  if (chosen.length < 2) return null;
  const keep = chosen[0];
  const removed = new Set(chosen.slice(1).map((s) => s.id));
  const rect = unionRect(chosen.map((s) => rotatedBounds(s, canvas.canvasWidth, canvas.canvasHeight)));
  const next = slots
    .filter((s) => !removed.has(s.id))
    .map((s) => {
      if (s.id === keep.id) return { ...keep, rect, rotation: undefined };
      if (isImageSlot(s) && removed.has(s.source)) return { ...s, source: s.id };
      return s;
    });
  return { slots: next, keptId: keep.id };
}

/**
 * Bir alanı eşit hücrelere böler; aralık milimetre. İlk hücre alanın
 * kimliğini ve ayarlarını korur.
 */
export function splitImageSlot(
  slot: ImageSlot,
  cols: number,
  rows: number,
  gapMm: number,
  canvas: PrintCanvas,
  dpi: number,
  makeId: (index: number) => string,
): ImageSlot[] {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const gapPx = (gapMm / 25.4) * dpi;
  const gx = gapPx / canvas.canvasWidth;
  const gy = gapPx / canvas.canvasHeight;
  const cellW = (slot.rect.w - gx * (c - 1)) / c;
  const cellH = (slot.rect.h - gy * (r - 1)) / r;
  if (!(cellW > 0) || !(cellH > 0)) return [slot];
  const out: ImageSlot[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const i = out.length;
      const id = i === 0 ? slot.id : makeId(i);
      out.push({
        ...slot,
        id,
        source: i === 0 ? slot.source : id,
        label: i === 0 ? slot.label : `${slot.order + i}. Fotoğraf`,
        order: slot.order + i,
        rotation: undefined,
        rect: {
          x: slot.rect.x + col * (cellW + gx),
          y: slot.rect.y + row * (cellH + gy),
          w: cellW,
          h: cellH,
        },
      });
    }
  }
  return out;
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/**
 * Seçili alanları ortak bir kenara ya da merkeze hizalar. Tek alan seçiliyse
 * kesim alanına göre hizalanır: "tam ortaya al" tek alanda en sık istek.
 */
export function alignSlots(slots: Slot[], ids: string[], mode: AlignMode, canvas: PrintCanvas): Slot[] {
  const chosen = slots.filter((s) => ids.includes(s.id));
  if (chosen.length === 0) return slots;
  const bounds = (s: Slot) => rotatedBounds(s, canvas.canvasWidth, canvas.canvasHeight);
  const ref: Rect = chosen.length === 1
    ? {
        x: canvas.trim.x / canvas.canvasWidth, y: canvas.trim.y / canvas.canvasHeight,
        w: canvas.trim.width / canvas.canvasWidth, h: canvas.trim.height / canvas.canvasHeight,
      }
    : unionRect(chosen.map(bounds));
  return slots.map((s) => {
    if (!ids.includes(s.id)) return s;
    const b = bounds(s);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = ref.x - b.x;
    if (mode === "right") dx = ref.x + ref.w - (b.x + b.w);
    if (mode === "hcenter") dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (mode === "top") dy = ref.y - b.y;
    if (mode === "bottom") dy = ref.y + ref.h - (b.y + b.h);
    if (mode === "vcenter") dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    return { ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } };
  });
}

/** Üç ya da daha fazla alanı aralarındaki boşluk eşit olacak şekilde dağıtır */
export function distributeSlots(slots: Slot[], ids: string[], axis: "x" | "y", canvas: PrintCanvas): Slot[] {
  const chosen = slots.filter((s) => ids.includes(s.id));
  if (chosen.length < 3) return slots;
  const withBounds = chosen
    .map((s) => ({ s, b: rotatedBounds(s, canvas.canvasWidth, canvas.canvasHeight) }))
    .sort((a, b) => (axis === "x" ? a.b.x - b.b.x : a.b.y - b.b.y));
  const size = (b: Rect) => (axis === "x" ? b.w : b.h);
  const start = axis === "x" ? withBounds[0].b.x : withBounds[0].b.y;
  const last = withBounds[withBounds.length - 1].b;
  const end = axis === "x" ? last.x + last.w : last.y + last.h;
  const total = withBounds.reduce((n, item) => n + size(item.b), 0);
  const gap = (end - start - total) / (withBounds.length - 1);
  const moved = new Map<string, Rect>();
  let cursor = start;
  for (const { s, b } of withBounds) {
    const d = cursor - (axis === "x" ? b.x : b.y);
    moved.set(s.id, axis === "x" ? { ...s.rect, x: s.rect.x + d } : { ...s.rect, y: s.rect.y + d });
    cursor += size(b) + gap;
  }
  return slots.map((s) => (moved.has(s.id) ? { ...s, rect: moved.get(s.id)! } : s));
}

/** Seçili alanları ilk seçilenin genişliğine ya da yüksekliğine eşitler (merkezleri korunur) */
export function matchSize(slots: Slot[], ids: string[], dimension: "w" | "h"): Slot[] {
  const first = slots.find((s) => s.id === ids[0]);
  if (!first) return slots;
  return slots.map((s) => {
    if (!ids.includes(s.id) || s.id === first.id) return s;
    const value = first.rect[dimension];
    const rect = dimension === "w"
      ? { ...s.rect, x: s.rect.x + (s.rect.w - value) / 2, w: value }
      : { ...s.rect, y: s.rect.y + (s.rect.h - value) / 2, h: value };
    return { ...s, rect };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Harf şekilli fotoğraflar
// ─────────────────────────────────────────────────────────────────────────────

export interface LetterGlyph {
  label: string;
  d: string;
  /** Glifin kelime içindeki sınır kutusu, font biriminde */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Harfleri kesim alanına yerleştirip her biri için bir fotoğraf alanı üretir.
 *
 * Kelime fontun kendi dizilişini korur; `gapMm` her harf arasına ek boşluk
 * koyar (fotoğrafların birbirine değmemesi için). Kelime, kenar boşluğu
 * bırakılarak kesim alanına en büyük hâliyle sığdırılır ve ortalanır.
 * `heightRatio` yazının kesim yüksekliğinin en fazla ne kadarını kaplayacağı;
 * altta isim, tarih gibi yazılara yer kalsın diye.
 */
export function layoutLetterSlots(
  glyphs: LetterGlyph[],
  canvas: PrintCanvas,
  dpi: number,
  options: {
    marginMm: number;
    gapMm: number;
    heightRatio: number;
    /** Harf gövdesini her yönden bunun yarısı kadar genişleten kalınlaştırma, mm */
    strokeMm?: number;
    /** "top": kesim kenarından kenar boşluğu kadar aşağıda; altta yazılara yer kalır */
    position?: "top" | "center";
    makeId: (index: number) => string;
  },
): ImageSlot[] {
  if (glyphs.length === 0) return [];
  const mmPx = (mm: number) => (mm / 25.4) * dpi;
  const minX = Math.min(...glyphs.map((g) => g.x));
  const minY = Math.min(...glyphs.map((g) => g.y));
  const wordW = Math.max(...glyphs.map((g) => g.x + g.w)) - minX;
  const wordH = Math.max(...glyphs.map((g) => g.y + g.h)) - minY;
  const gapPx = mmPx(Math.max(0, options.gapMm));
  const totalGap = gapPx * (glyphs.length - 1);

  const availW = canvas.trim.width - mmPx(options.marginMm) * 2;
  const availH = Math.min(canvas.trim.height - mmPx(options.marginMm) * 2, canvas.trim.height * options.heightRatio);
  // Kalınlaştırma her harfin kutusuna iki yandan yarım çizgi ekler; kelimenin
  // toplam genişliği ve yüksekliği bu payla birlikte sığmalı
  const strokePx = mmPx(Math.max(0, options.strokeMm ?? 0));
  const n = glyphs.length;
  const scale = Math.min((availW - totalGap - strokePx * n) / wordW, (availH - strokePx) / wordH);
  if (!(scale > 0)) return [];
  const bold = strokePx / scale;

  const totalW = wordW * scale + totalGap + strokePx * n;
  const left = canvas.trim.x + (canvas.trim.width - totalW) / 2;
  const top = options.position === "top"
    ? canvas.trim.y + mmPx(options.marginMm)
    : canvas.trim.y + (canvas.trim.height - (wordH * scale + strokePx)) / 2;

  return glyphs.map((g, i) => {
    const id = options.makeId(i);
    const x = left + (g.x - minX) * scale + (gapPx + strokePx) * i;
    const y = top + (g.y - minY) * scale;
    return {
      id,
      kind: "image" as const,
      source: id,
      rect: {
        x: x / canvas.canvasWidth,
        y: y / canvas.canvasHeight,
        w: (g.w * scale + strokePx) / canvas.canvasWidth,
        h: (g.h * scale + strokePx) / canvas.canvasHeight,
      },
      mask_path: { d: g.d, x: g.x, y: g.y, w: g.w, h: g.h, ...(bold > 0 ? { bold } : {}) },
      mask_label: g.label,
      fit: "cover" as const,
      allow: { pan: true, zoom: true, rotate: true },
      label: `${i + 1}. Fotoğraf (${g.label})`,
      order: i + 1,
    };
  });
}

/** Harf alanının kalınlaştırması, mm (kesilmiş üründe çizgi kalınlığı) */
export function letterStrokeMm(slot: ImageSlot, canvas: PrintCanvas, dpi: number): number {
  const m = slot.mask_path;
  if (!m?.bold) return 0;
  const pxPerUnit = (slot.rect.w * canvas.canvasWidth) / (m.w + m.bold);
  return ((m.bold * pxPerUnit) / dpi) * 25.4;
}

/**
 * Harf alanını yeni kalınlıkla günceller. Harfin çizim ölçeği sabit kalır,
 * kutu merkezinden kalınlık farkı kadar büyür ya da küçülür: harf yerinde
 * durur, yalnızca gövdesi kalınlaşır.
 */
export function withLetterStroke(slot: ImageSlot, mm: number, canvas: PrintCanvas, dpi: number): ImageSlot {
  const m = slot.mask_path;
  if (!m) return slot;
  const oldBold = m.bold ?? 0;
  const pxPerUnitX = (slot.rect.w * canvas.canvasWidth) / (m.w + oldBold);
  const pxPerUnitY = (slot.rect.h * canvas.canvasHeight) / (m.h + oldBold);
  const strokePx = (Math.max(0, mm) / 25.4) * dpi;
  const bold = strokePx / pxPerUnitX;
  const wPx = (m.w + bold) * pxPerUnitX;
  const hPx = (m.h + bold) * pxPerUnitY;
  const cx = (slot.rect.x + slot.rect.w / 2) * canvas.canvasWidth;
  const cy = (slot.rect.y + slot.rect.h / 2) * canvas.canvasHeight;
  const { bold: _old, ...rest } = m;
  return {
    ...slot,
    mask_path: bold > 0 ? { ...rest, bold } : rest,
    rect: {
      x: (cx - wPx / 2) / canvas.canvasWidth,
      y: (cy - hPx / 2) / canvas.canvasHeight,
      w: wPx / canvas.canvasWidth,
      h: hPx / canvas.canvasHeight,
    },
  };
}
