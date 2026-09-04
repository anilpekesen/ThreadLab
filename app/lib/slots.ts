/**
 * Şablon slotları — bir tasarımda müşterinin dolduracağı alanların tanımı.
 *
 * Slot geometrisi NORMALİZE tutulur: x, y, w, h değerleri 0–1 aralığında,
 * tuvalin (taşma payı dahil) tamamına orandır. Piksel yerine oran tutmanın
 * sebebi, aynı yerleşimin aynı en-boy oranındaki her ebatta çalışmasıdır;
 * 20x20 için tanımlanan bir ızgara 30x30'da da doğru yere düşer.
 *
 * Slotlar üç yoldan üretilebilir — ızgara üreticisi, şeffaf delik taraması ve
 * (ileride) SVG içe aktarma — ama üçü de bu tek formatı üretir. Render motoru,
 * müşteri arayüzü ve sipariş kaydı yalnızca bu formatı bilir.
 */

import type { PrintCanvas } from "~/lib/print-spec";

/** Normalize dikdörtgen; tuvalin tamamına orandır */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SlotKind = "image" | "text";

export interface ImageSlot {
  id: string;
  kind: "image";
  /**
   * Hangi müşteri girdisinden besleneceği. Genellikle slotun kendi kimliğidir,
   * ama birden fazla slot aynı kaynağı gösterebilir: çorap tasarımında tek
   * fotoğraf onlarca yerleşime gider, kolajda her slot kendi fotoğrafını alır.
   */
  source: string;
  rect: Rect;
  /** Delik taramasından çıkan şekil maskesi; yoksa dikdörtgen */
  mask_url?: string;
  /** Köşe yuvarlaması, tuval GENİŞLİĞİNE orandır (maske varsa yok sayılır) */
  radius?: number;
  fit: "cover" | "contain";
  allow: { pan: boolean; zoom: boolean; rotate: boolean };
  label: string;
  /** Müşteriye gösterilen sıra; 1'den başlar */
  order: number;
}

/** Metin slotunun müşteriye ne kadar açık olduğu */
export type TextMode = "fixed" | "preset" | "free";

export interface TextSlot {
  id: string;
  kind: "text";
  rect: Rect;
  label: string;
  order: number;
  mode: TextMode;
  /** mode = "preset" için seçenekler; her biri önceden render edilmiş görsel */
  options?: Array<{ value: string; image_url: string }>;
  default_value: string;
  max_length: number;
  /** Punto, tuval YÜKSEKLİĞİNE orandır */
  font_size: number;
  font_family: string;
  /** Sunucu çıktısında aynı görünüm için gereken font dosyası */
  font_url?: string;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
  /** Metin alana sığmazsa ne yapılacağı */
  overflow: "shrink" | "clip";
}

export type Slot = ImageSlot | TextSlot;

export function isImageSlot(s: Slot): s is ImageSlot {
  return s.kind === "image";
}

export function isTextSlot(s: Slot): s is TextSlot {
  return s.kind === "text";
}

/** Şablonun müşteriden kaç ayrı fotoğraf isteyeceği — slot sayısı değil, kaynak sayısı */
export function requiredPhotoCount(slots: Slot[]): number {
  const sources = new Set<string>();
  for (const s of slots) {
    if (isImageSlot(s)) sources.add(s.source || s.id);
  }
  return sources.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parçalar — bir şablonun ürettiği ayrı baskı dosyaları
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bir parça, kendi başına basılan tek bir fiziksel ürün.
 *
 * "3'lü çerçeve seti" gibi ürünlerde bir sipariş satırı üç ayrı 30x30 dosya
 * üretmeli. Hepsini tek tuvale koymak yanlış olur: onlar üç ayrı çerçeve ve
 * her birinin kendi taşma payı olmalı. Tek geniş dosyayı kesmek de yetmez,
 * çünkü o dosyada yalnızca dış kenarlar taşma alır.
 *
 * Parça, şablonun kendisiyle aynı yapıya sahip: kendi baskı ürünü, kendi
 * slotları, kendi arka planı. Böylece karışık setler de (farklı ebatlarda
 * parçalar) aynı modelle ifade edilebiliyor.
 *
 * `pieces` boşsa şablon tek parçalıdır ve mevcut alanlarından türetilir;
 * bugüne kadarki bütün şablonlar böyle çalışmaya devam eder.
 */
export interface TemplatePiece {
  id: string;
  /** Müşteriye ve üretime gösterilen ad — "1. Çerçeve" */
  name: string;
  print_product_id: string;
  slots: Slot[];
  /** Fotoğrafların altında duran tasarım */
  background_url?: string;
  /** Fotoğrafların üstünde duran tasarım */
  overlay_url?: string;
  /** Sıra; müşteri arayüzünde ve baskı dosyası adlandırmasında kullanılır */
  order: number;
}

export function normalizePieces(raw: unknown): TemplatePiece[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplatePiece[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = String(p.id ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: String(p.name ?? id),
      print_product_id: String(p.print_product_id ?? ""),
      slots: normalizeSlots(p.slots),
      background_url: p.background_url ? String(p.background_url) : undefined,
      overlay_url: p.overlay_url ? String(p.overlay_url) : undefined,
      order: Number(p.order ?? out.length + 1),
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

/**
 * Bir parçanın kopyasını üretir.
 *
 * Slot kimlikleri parça öneki alıyor: üç çerçevenin de "photo_1" adında bir
 * slotu olsaydı müşterinin yüklediği fotoğraflar birbirine karışırdı.
 */
export function clonePiece(source: TemplatePiece, newId: string, name: string, order: number): TemplatePiece {
  return {
    ...source,
    id: newId,
    name,
    order,
    slots: source.slots.map((slot) => {
      const localId = slot.id.includes("__") ? slot.id.split("__").slice(1).join("__") : slot.id;
      const id = `${newId}__${localId}`;
      return slot.kind === "image"
        ? { ...slot, id, source: id }
        : { ...slot, id };
    }),
  };
}

/** Parçanın toplam fotoğraf alanı sayısı */
export function pieceImageSlotCount(piece: TemplatePiece): number {
  return piece.slots.filter(isImageSlot).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalize ↔ piksel
// ─────────────────────────────────────────────────────────────────────────────

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectToPx(rect: Rect, canvasWidth: number, canvasHeight: number): PxRect {
  return {
    x: Math.round(rect.x * canvasWidth),
    y: Math.round(rect.y * canvasHeight),
    width: Math.max(1, Math.round(rect.w * canvasWidth)),
    height: Math.max(1, Math.round(rect.h * canvasHeight)),
  };
}

export function rectFromPx(px: PxRect, canvasWidth: number, canvasHeight: number): Rect {
  return {
    x: px.x / canvasWidth,
    y: px.y / canvasHeight,
    w: px.width / canvasWidth,
    h: px.height / canvasHeight,
  };
}

/**
 * Bir slotun baskı kalitesinde dolması için müşteri fotoğrafının en az kaç
 * piksel olması gerektiği. Kolaj ürünlerde asıl kalite sorunu buradan çıkıyor:
 * 30x40'ta on beş delik varsa her delik küçüktür, ama yine de 300 dpi ister.
 */
export function requiredPx(slot: ImageSlot, canvas: PrintCanvas): { width: number; height: number } {
  const px = rectToPx(slot.rect, canvas.canvasWidth, canvas.canvasHeight);
  return { width: px.width, height: px.height };
}

// ─────────────────────────────────────────────────────────────────────────────
// A yolu — ızgara üreticisi
// ─────────────────────────────────────────────────────────────────────────────

export interface GridMerge {
  /** 0 tabanlı hücre koordinatı */
  col: number;
  row: number;
  col_span: number;
  row_span: number;
}

export interface GridConfig {
  cols: number;
  rows: number;
  /** Kenar boşlukları KESİM çizgisinden içeri, milimetre */
  margin_mm: { top: number; right: number; bottom: number; left: number };
  /**
   * Hücreler arası boşluk, milimetre. Yatay ve dikey ayrı tutuluyor: gerçek
   * tasarımlarda satır aralarına etiket ("1. Ay", "2. Ay") giriyor ve dikey
   * boşluk yataydan büyük oluyor. Tek değerle bu şablonlar birebir üretilemez.
   */
  gap_x_mm: number;
  gap_y_mm: number;
  /** Köşe yuvarlaması, milimetre; 0 = keskin */
  corner_radius_mm: number;
  /**
   * Karışık boyutlu kolaj için hücre birleştirmeleri. Birleştirilen alanın
   * kapladığı diğer hücreler atlanır; "15'li kolaj" gibi tasarımlar böyle
   * kurulur.
   */
  merges?: GridMerge[];
}

export const DEFAULT_GRID: GridConfig = {
  cols: 3,
  rows: 2,
  margin_mm: { top: 20, right: 20, bottom: 20, left: 20 },
  gap_x_mm: 4,
  gap_y_mm: 4,
  corner_radius_mm: 2,
  merges: [],
};

/**
 * Kayıtlı ızgara ayarını okur. Eski kayıtlarda tek bir `gap_mm` vardı; iki
 * eksene bölündüğünde o değer her ikisine de uygulanır ki mevcut şablonlar
 * aynı yerleşimi üretmeye devam etsin.
 */
export function normalizeGridConfig(raw: unknown): GridConfig {
  const g = (raw ?? {}) as Record<string, unknown>;
  if (typeof g.cols !== "number" || typeof g.rows !== "number") return DEFAULT_GRID;
  const legacyGap = typeof g.gap_mm === "number" ? g.gap_mm : undefined;
  const margin = (g.margin_mm ?? {}) as Record<string, unknown>;
  return {
    cols: Math.max(1, Math.floor(g.cols)),
    rows: Math.max(1, Math.floor(g.rows)),
    margin_mm: {
      top: Number(margin.top ?? 20) || 0,
      right: Number(margin.right ?? 20) || 0,
      bottom: Number(margin.bottom ?? 20) || 0,
      left: Number(margin.left ?? 20) || 0,
    },
    gap_x_mm: Number(g.gap_x_mm ?? legacyGap ?? 4) || 0,
    gap_y_mm: Number(g.gap_y_mm ?? legacyGap ?? 4) || 0,
    corner_radius_mm: Number(g.corner_radius_mm ?? 0) || 0,
    merges: Array.isArray(g.merges) ? (g.merges as GridMerge[]) : [],
  };
}

/**
 * Izgara parametrelerinden slot üretir.
 *
 * Kenar boşlukları KESİM dikdörtgeninden ölçülür — tasarımcı da mağaza sahibi
 * de "üstten 2 cm" derken kesim kenarını kasteder, taşma payını değil. Sonuç
 * yine de tuvalin tamamına normalize edilir; render motoru tek referans bilir.
 */
export function buildGridSlots(config: GridConfig, canvas: PrintCanvas, dpi: number): ImageSlot[] {
  const cols = Math.max(1, Math.floor(config.cols));
  const rows = Math.max(1, Math.floor(config.rows));

  const mm = (v: number) => (v / 25.4) * dpi;

  const left = canvas.trim.x + mm(config.margin_mm.left);
  const top = canvas.trim.y + mm(config.margin_mm.top);
  const usableW = canvas.trim.width - mm(config.margin_mm.left + config.margin_mm.right);
  const usableH = canvas.trim.height - mm(config.margin_mm.top + config.margin_mm.bottom);

  const gapX = mm(config.gap_x_mm);
  const gapY = mm(config.gap_y_mm);
  const cellW = (usableW - gapX * (cols - 1)) / cols;
  const cellH = (usableH - gapY * (rows - 1)) / rows;

  if (!(cellW > 0) || !(cellH > 0)) return [];

  // Birleştirmelerin kapladığı hücreler işaretlenir; üretim sırasında atlanır
  const covered = new Set<string>();
  const merges = (config.merges ?? []).filter(
    (m) => m.col >= 0 && m.row >= 0 && m.col_span >= 1 && m.row_span >= 1
      && m.col + m.col_span <= cols && m.row + m.row_span <= rows,
  );
  for (const m of merges) {
    for (let c = m.col; c < m.col + m.col_span; c++) {
      for (let r = m.row; r < m.row + m.row_span; r++) {
        if (c === m.col && r === m.row) continue; // birleşimin başlangıcı kalır
        covered.add(`${c}:${r}`);
      }
    }
  }
  const mergeAt = new Map(merges.map((m) => [`${m.col}:${m.row}`, m]));

  const radius = config.corner_radius_mm > 0
    ? mm(config.corner_radius_mm) / canvas.canvasWidth
    : undefined;

  const slots: ImageSlot[] = [];
  let order = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c}:${r}`;
      if (covered.has(key)) continue;

      const merge = mergeAt.get(key);
      const colSpan = merge?.col_span ?? 1;
      const rowSpan = merge?.row_span ?? 1;

      const x = left + c * (cellW + gapX);
      const y = top + r * (cellH + gapY);
      const w = cellW * colSpan + gapX * (colSpan - 1);
      const h = cellH * rowSpan + gapY * (rowSpan - 1);

      order += 1;
      const id = `photo_${order}`;
      slots.push({
        id,
        kind: "image",
        source: id,
        rect: {
          x: x / canvas.canvasWidth,
          y: y / canvas.canvasHeight,
          w: w / canvas.canvasWidth,
          h: h / canvas.canvasHeight,
        },
        radius,
        fit: "cover",
        allow: { pan: true, zoom: true, rotate: false },
        label: `${order}. Fotoğraf`,
        order,
      });
    }
  }

  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Okuma sırası
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slotları soldan sağa, yukarıdan aşağıya sıralar.
 *
 * Düz `y` sıralaması yetmiyor: kaydırmalı ya da karışık boyutlu yerleşimlerde
 * aynı satırdaki iki slotun merkez y değeri birbirinden farklıdır ve sıralama
 * satırları birbirine karıştırır. Bu yüzden önce satır kümeleri çıkarılır,
 * sonra her satır kendi içinde x'e göre sıralanır.
 */
export function sortReadingOrder<T extends Slot>(slots: T[]): T[] {
  if (slots.length < 2) return slots.map((s, i) => ({ ...s, order: i + 1 }));

  const avgHeight = slots.reduce((sum, s) => sum + s.rect.h, 0) / slots.length;
  const tolerance = Math.max(avgHeight * 0.5, 0.01);

  const byTop = [...slots].sort((a, b) => centerY(a) - centerY(b));

  const rows: T[][] = [];
  let current: T[] = [byTop[0]];
  let rowAnchor = centerY(byTop[0]);

  for (let i = 1; i < byTop.length; i++) {
    const s = byTop[i];
    if (Math.abs(centerY(s) - rowAnchor) <= tolerance) {
      current.push(s);
    } else {
      rows.push(current);
      current = [s];
      rowAnchor = centerY(s);
    }
  }
  rows.push(current);

  const out: T[] = [];
  let order = 0;
  for (const row of rows) {
    row.sort((a, b) => a.rect.x - b.rect.x);
    for (const s of row) {
      order += 1;
      out.push({ ...s, order });
    }
  }
  return out;
}

function centerY(s: Slot): number {
  return s.rect.y + s.rect.h / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Doğrulama
// ─────────────────────────────────────────────────────────────────────────────

export type IssueLevel = "error" | "warning";

export interface SlotIssue {
  level: IssueLevel;
  slot_id?: string;
  message: string;
}

export interface ValidateOptions {
  /** Yöneticinin beklediği fotoğraf alanı sayısı; 0 = kontrol etme */
  expected_image_slots?: number;
  /** Müşteriden gelecek fotoğrafın gerçekçi kısa kenarı (uyarı eşiği için) */
  typical_photo_px?: number;
}

/**
 * Şablon kaydedilmeden önceki denetim.
 *
 * Amaç, hatalı şablonun canlıya çıkmasını engellemek. Hatalı şablon hatalı
 * baskı, hatalı baskı iade demektir; kaydetme anındaki bir uyarı en ucuz
 * müdahaledir.
 */
export function validateSlots(
  slots: Slot[],
  canvas: PrintCanvas,
  options: ValidateOptions = {},
): SlotIssue[] {
  const issues: SlotIssue[] = [];
  const images = slots.filter(isImageSlot);

  if (slots.length === 0) {
    issues.push({ level: "error", message: "Şablonda hiç alan tanımlı değil." });
    return issues;
  }

  const expected = options.expected_image_slots ?? 0;
  if (expected > 0 && images.length !== expected) {
    issues.push({
      level: "error",
      message: `Beklenen ${expected} fotoğraf alanı, bulunan ${images.length}. Fazla alanları silin veya beklenen sayıyı düzeltin.`,
    });
  }

  const ids = new Set<string>();
  for (const s of slots) {
    if (ids.has(s.id)) {
      issues.push({ level: "error", slot_id: s.id, message: `"${s.id}" kimliği birden fazla alanda kullanılmış.` });
    }
    ids.add(s.id);

    const { x, y, w, h } = s.rect;
    if (!(w > 0) || !(h > 0)) {
      issues.push({ level: "error", slot_id: s.id, message: `"${s.label || s.id}" alanının ölçüsü geçersiz.` });
      continue;
    }
    if (x < 0 || y < 0 || x + w > 1 || y + h > 1) {
      issues.push({ level: "error", slot_id: s.id, message: `"${s.label || s.id}" tuvalin dışına taşıyor.` });
      continue;
    }

    // Güvenli alan kontrolü normalize koordinatta yapılır
    const safeX0 = canvas.safe.x / canvas.canvasWidth;
    const safeY0 = canvas.safe.y / canvas.canvasHeight;
    const safeX1 = (canvas.safe.x + canvas.safe.width) / canvas.canvasWidth;
    const safeY1 = (canvas.safe.y + canvas.safe.height) / canvas.canvasHeight;
    if (x < safeX0 || y < safeY0 || x + w > safeX1 || y + h > safeY1) {
      issues.push({
        level: "warning",
        slot_id: s.id,
        message: `"${s.label || s.id}" güvenli alanın dışında; kesimde kırpılabilir.`,
      });
    }
  }

  // Çakışma — fotoğraf alanları üst üste binmemeli
  for (let i = 0; i < images.length; i++) {
    for (let j = i + 1; j < images.length; j++) {
      if (overlapRatio(images[i].rect, images[j].rect) > 0.02) {
        issues.push({
          level: "warning",
          slot_id: images[j].id,
          message: `"${images[i].label || images[i].id}" ile "${images[j].label || images[j].id}" çakışıyor.`,
        });
      }
    }
  }

  // Çözünürlük — müşterinin tipik fotoğrafı bu slotu doldurur mu
  const typical = options.typical_photo_px ?? 0;
  if (typical > 0) {
    for (const s of images) {
      const need = requiredPx(s, canvas);
      const shortEdge = Math.min(need.width, need.height);
      if (typical < shortEdge * 0.75) {
        issues.push({
          level: "warning",
          slot_id: s.id,
          message: `"${s.label || s.id}" için ${shortEdge} px gerekiyor; ${typical} px'lik fotoğraflar bulanık basılır.`,
        });
      }
    }
  }

  return issues;
}

function overlapRatio(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  return inter / Math.min(a.w * a.h, b.w * b.h);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eski şablonların göçü
// ─────────────────────────────────────────────────────────────────────────────

export interface LegacyTemplateShape {
  photo_x: number;
  photo_y: number;
  photo_width: number;
  photo_height: number;
  text_fields: Array<{
    id: string;
    label: string;
    default_value?: string;
    x: number;
    y: number;
    font_size: number;
    color: string;
    bold: boolean;
    max_length: number;
    align: "left" | "center" | "right";
  }>;
}

/**
 * Tek fotoğraflı eski şablonu slot dizisine çevirir.
 *
 * Göç yıkıcı değildir: eski kolonlar yerinde kalır, `slots` boşsa bu çeviri
 * OKUMA anında yapılır. Böylece mevcut şablonlar tek satır SQL çalıştırmadan
 * yeni motora girer ve bir şey ters giderse eski yol hâlâ ayaktadır.
 *
 * `templateWidth`/`templateHeight` şablon görselinin piksel ölçüsüdür; eski
 * koordinatlar o görsele göre kaydedilmişti.
 */
export function slotsFromLegacyTemplate(
  legacy: LegacyTemplateShape,
  templateWidth: number,
  templateHeight: number,
): Slot[] {
  if (!(templateWidth > 0) || !(templateHeight > 0)) return [];

  const slots: Slot[] = [];

  if (legacy.photo_width > 0 && legacy.photo_height > 0) {
    slots.push({
      id: "photo_1",
      kind: "image",
      source: "photo_1",
      rect: rectFromPx(
        { x: legacy.photo_x, y: legacy.photo_y, width: legacy.photo_width, height: legacy.photo_height },
        templateWidth,
        templateHeight,
      ),
      fit: "cover",
      allow: { pan: false, zoom: false, rotate: false },
      label: "Fotoğraf",
      order: 1,
    });
  }

  let order = slots.length;
  for (const f of legacy.text_fields ?? []) {
    order += 1;
    // Eski metin alanı bir nokta ve punto tutuyordu, dikdörtgen değil. Yaklaşık
    // bir kutu türetiyoruz: genişlik karakter sınırından, yükseklik puntodan.
    const width = Math.min(templateWidth, f.font_size * 0.6 * Math.max(1, f.max_length));
    const height = f.font_size * 1.35;
    const x = f.align === "center" ? f.x - width / 2 : f.align === "right" ? f.x - width : f.x;
    slots.push({
      id: f.id,
      kind: "text",
      rect: rectFromPx(
        { x, y: f.y - height / 2, width, height },
        templateWidth,
        templateHeight,
      ),
      label: f.label,
      order,
      mode: "free",
      default_value: f.default_value ?? "",
      max_length: f.max_length,
      font_size: (f.font_size * 1.0) / templateHeight,
      font_family: "Arial, Helvetica, sans-serif",
      color: f.color,
      bold: f.bold,
      align: f.align,
      overflow: "shrink",
    });
  }

  return slots;
}

/** JSONB'den okunan ham değeri güvenli slot dizisine çevirir */
export function normalizeSlots(raw: unknown): Slot[] {
  if (!Array.isArray(raw)) return [];
  const out: Slot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const rect = s.rect as Partial<Rect> | undefined;
    if (!rect || typeof rect.x !== "number" || typeof rect.y !== "number"
      || typeof rect.w !== "number" || typeof rect.h !== "number") continue;

    const base = {
      id: String(s.id ?? ""),
      rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      label: String(s.label ?? ""),
      order: Number(s.order ?? out.length + 1),
    };
    if (!base.id) continue;

    if (s.kind === "text") {
      out.push({
        ...base,
        kind: "text",
        mode: (s.mode === "fixed" || s.mode === "preset" ? s.mode : "free") as TextMode,
        options: Array.isArray(s.options) ? (s.options as TextSlot["options"]) : undefined,
        default_value: String(s.default_value ?? ""),
        max_length: Number(s.max_length ?? 40),
        font_size: Number(s.font_size ?? 0.04),
        font_family: String(s.font_family ?? "Arial, Helvetica, sans-serif"),
        font_url: s.font_url ? String(s.font_url) : undefined,
        color: String(s.color ?? "#000000"),
        bold: s.bold === true,
        align: (s.align === "left" || s.align === "right" ? s.align : "center") as TextSlot["align"],
        overflow: s.overflow === "clip" ? "clip" : "shrink",
      });
    } else {
      const allow = (s.allow ?? {}) as Record<string, unknown>;
      out.push({
        ...base,
        kind: "image",
        source: String(s.source ?? base.id),
        mask_url: s.mask_url ? String(s.mask_url) : undefined,
        radius: typeof s.radius === "number" ? s.radius : undefined,
        fit: s.fit === "contain" ? "contain" : "cover",
        allow: {
          pan: allow.pan !== false,
          zoom: allow.zoom !== false,
          rotate: allow.rotate === true,
        },
      });
    }
  }
  return out;
}
