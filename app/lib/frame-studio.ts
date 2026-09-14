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
  buildGridSlots, isImageSlot, DEFAULT_GRID,
  type GridConfig, type ImageSlot, type Rect, type Slot, type TemplatePiece,
} from "~/lib/slots";

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

export type SlotShape = "rect" | "rounded" | "circle" | "mask";

/**
 * Köşe yuvarlaması tuval GENİŞLİĞİNE oranla saklanıyor ve render motoru onu
 * alanın kısa kenarının yarısıyla sınırlıyor. Yarıçap o sınırı geçiyorsa alan
 * fiilen daire (kare alanda) ya da kapsüldür; ayrı bir "şekil" alanı tutmadan
 * şekli buradan çıkarıyoruz ki eski kayıtlar da doğru okunsun.
 */
export function slotShape(slot: ImageSlot, canvas: PrintCanvas): SlotShape {
  if (slot.mask_url) return "mask";
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
