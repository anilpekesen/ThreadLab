import sharp from "sharp";
import type * as opentypeNs from "opentype.js";
import { FONT_LIBRARY } from "../../font-library";
import { glyphPathData } from "../../text-render.server";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanColor, cleanText, loadLibraryFont, pickAllowed, textInk, textSvg, wrapText, PRINT_SCALE } from "../svg-text.server";
import {
  CALENDAR_LAYOUTS,
  CALENDAR_MARKERS,
  CALENDAR_MONTHS,
  CALENDAR_WEEKDAYS,
  calendarColorName,
  calendarConfig,
  type CalendarConfig,
  type CalendarLayout,
  type CalendarMarker,
} from "./config";

/**
 * Özel gün takvimi çizimi.
 *
 * Tasarım 2400 birim genişlikte bir tuvalde yukarıdan aşağıya dizilir:
 * [başlık] → ay başlığı → gün adları → 7 sütunlu tablo → [isimler]. Her
 * parçanın gerçek mürekkep kutusu izlenir; en son görünüm bu kutuya küçük bir
 * payla kırpılır ve uzun kenar baskı ölçeğine büyütülür. Harici görsel yok,
 * her şey fontun glif yollarıyla vektör çizilir.
 *
 * İşaretli gün: dolu şekillerde (kalp, yıldız, dolu daire) rakam şeklin
 * içinden maskeyle oyulur — tek renk baskıda da rakam okunur. Halka düzeninde
 * rakam olduğu gibi kalır, çevresine ince bir daire çizilir.
 */

type Box = { x1: number; y1: number; x2: number; y2: number };

const f = (n: number) => Number(n.toFixed(1));
const CX = 1200;
/** Tablo: 7 sütun × 300 birim */
const COL_W = 300;
const GRID_W = COL_W * 7;
const GRID_X = CX - GRID_W / 2;

// Baskı ölçeğinde uzun kenar (bkz. PRINT_SCALE)
const OUT_LONG = Math.round(2400 * PRINT_SCALE);

/** Düzen ölçüleri: büyük harf yükseklikleri (cap) ve aralıklar, birim cinsinden */
interface Spec {
  rowH: number;
  digitCap: number;
  weekdayCap: number;
  titleCap: number;
  namesCap: number;
  lines: "grid" | "rows" | "none";
}
const SPECS: Record<CalendarLayout, Spec> = {
  classic: { rowH: 250, digitCap: 92, weekdayCap: 50, titleCap: 190, namesCap: 66, lines: "grid" },
  minimal: { rowH: 280, digitCap: 128, weekdayCap: 52, titleCap: 190, namesCap: 66, lines: "none" },
  poster: { rowH: 240, digitCap: 88, weekdayCap: 50, titleCap: 170, namesCap: 62, lines: "rows" },
};

let maskSeq = 0;

// ── Tarih ──────────────────────────────────────────────────────────────

function parseDate(v: unknown, config: CalendarConfig): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) throw new GeneratorInputError("Lütfen geçerli bir tarih seçin", "Please choose a valid date");
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    throw new GeneratorInputError("Lütfen geçerli bir tarih seçin", "Please choose a valid date");
  }
  if (y < config.yearMin || y > config.yearMax) {
    throw new GeneratorInputError(
      `Tarih ${config.yearMin}–${config.yearMax} yılları arasında olmalı`,
      `The date must be between ${config.yearMin} and ${config.yearMax}`,
    );
  }
  return { y, m: mo, d };
}

/** Ayın tablosu: ilk günün sütunu ve gün sayısı (UTC, bağımlılıksız) */
function monthGrid(y: number, m: number, weekStart: CalendarConfig["weekStart"]) {
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = weekStart === "monday" ? (dow + 6) % 7 : dow;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { offset, days, rows: Math.ceil((offset + days) / 7) };
}

// ── Metin ──────────────────────────────────────────────────────────────

/** Fontun büyük harf yüksekliği / punto oranı */
function capRatio(font: opentypeNs.Font): number {
  const h = textInk(font, "H", 1000);
  return h ? (h.y2 - h.y1) / 1000 : 0.7;
}

/** Fontta olmayan karakter boş kutu basılmasın: müşteriye söylenir */
function assertGlyphs(font: opentypeNs.Font, text: string) {
  const missing = Array.from(text).find((ch) => ch.trim() && font.charToGlyphIndex(ch) === 0);
  if (missing) {
    throw new GeneratorInputError(
      `"${missing}" karakteri bu yazı tipinde yok; lütfen çıkarın ya da başka bir yazı tipi seçin`,
      `"${missing}" is not available in this font; please remove it or choose another font`,
    );
  }
}

class Canvas {
  svg = "";
  defs = "";
  box: Box | null = null;
  constructor(readonly ink: string) {}

  grow(b: Box) {
    this.box = this.box
      ? { x1: Math.min(this.box.x1, b.x1), y1: Math.min(this.box.y1, b.y1), x2: Math.max(this.box.x2, b.x2), y2: Math.max(this.box.y2, b.y2) }
      : { ...b };
  }

  /**
   * Tek satır, x'e ortalı. `top` verilen yükseklik bandının üstü: `band`
   * "cap" ise büyük harf bandı (aksan ve çengeller dizilimi kaydırmaz),
   * "ink" ise gerçek mürekkep. Dönen `bottom` bir sonraki parçanın dayanağı.
   */
  line(o: { font: opentypeNs.Font; text: string; cap: number; top: number; spacing?: number; maxWidth?: number; band?: "cap" | "ink"; cx?: number }) {
    const cx = o.cx ?? CX;
    const ratio = capRatio(o.font);
    const r0 = textSvg({ font: o.font, text: o.text, x: cx, y: 0, size: o.cap / ratio, fill: this.ink, anchor: "middle", maxWidth: o.maxWidth, letterSpacing: o.spacing });
    const ink = textInk(o.font, o.text, r0.size) ?? { x1: 0, y1: -o.cap, x2: r0.width, y2: 0 };
    const capH = ratio * r0.size;
    const baseline = o.band === "ink" ? o.top - ink.y1 : o.top + capH;
    const r = textSvg({ font: o.font, text: o.text, x: cx, y: baseline, size: r0.size, fill: this.ink, anchor: "middle", letterSpacing: o.spacing });
    this.svg += r.svg;
    const left = cx - r.width / 2;
    this.grow({ x1: left + Math.min(0, ink.x1), y1: baseline + ink.y1, x2: left + Math.max(r.width, ink.x2), y2: baseline + ink.y2 });
    return { baseline, bottom: o.band === "ink" ? baseline + ink.y2 : baseline, size: r.size, width: r.width };
  }

  rect(x: number, y: number, w: number, h: number) {
    this.svg += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
    this.grow({ x1: x, y1: y, x2: x + w, y2: y + h });
  }
}

/** Rakamın glif yolları, (cx, cy) merkezine ortalı; dikeyde rakam yüksekliğine göre */
function digitsAt(font: opentypeNs.Font, text: string, size: number, cx: number, cy: number): { svg: string; box: Box } {
  const ink = textInk(font, text, size);
  const digitInk = textInk(font, "0123456789", size);
  if (!ink) return { svg: "", box: { x1: cx, y1: cy, x2: cx, y2: cy } };
  // Yatayda gerçek mürekkebe, dikeyde rakam bandına ortala ("1" ile "31" aynı çizgide)
  const tx = cx - (ink.x1 + ink.x2) / 2;
  const band = digitInk ?? ink;
  const ty = cy - (band.y1 + band.y2) / 2;
  const paths = glyphPathData(font, text, size).map((d) => `<path d="${d}"/>`).join("");
  return {
    svg: `<g transform="translate(${f(tx)} ${f(ty)})">${paths}</g>`,
    box: { x1: tx + ink.x1, y1: ty + ink.y1, x2: tx + ink.x2, y2: ty + ink.y2 },
  };
}

// ── İşaretler ──────────────────────────────────────────────────────────

/** Kalp: birim kutuda (-1..1), görsel ağırlık merkezi yaklaşık y = -0.05 */
function heartPath(cx: number, cy: number, r: number): string {
  const P = (x: number, y: number) => `${f(cx + x * r)} ${f(cy + y * r)}`;
  return `M${P(0, 0.9)}`
    + `C${P(-0.2, 0.72)} ${P(-1.02, 0.18)} ${P(-1.02, -0.36)}`
    + `C${P(-1.02, -0.78)} ${P(-0.7, -1)} ${P(-0.44, -1)}`
    + `C${P(-0.2, -1)} ${P(-0.06, -0.86)} ${P(0, -0.66)}`
    + `C${P(0.06, -0.86)} ${P(0.2, -1)} ${P(0.44, -1)}`
    + `C${P(0.7, -1)} ${P(1.02, -0.78)} ${P(1.02, -0.36)}`
    + `C${P(1.02, 0.18)} ${P(0.2, 0.72)} ${P(0, 0.9)}Z`;
}

function starPath(cx: number, cy: number, r: number, inner = 0.52): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join("L")}Z`;
}

/**
 * İşaretli günü çizer. Dolu şekillerde rakam maskeyle oyulur; şeklin köşeleri
 * aynı renkte ince bir konturla yuvarlatılır (sivri yıldız uçları baskıda
 * kırılmasın).
 */
function marked(font: opentypeNs.Font, marker: CalendarMarker, day: string, size: number, cx: number, cy: number, r: number): { svg: string; defs: string; box: Box } {
  if (marker === "circle") {
    const d = digitsAt(font, day, size, cx, cy);
    const sw = Math.max(7, r * 0.055);
    // Halka iki haneli rakamı nefes payıyla çevrelesin
    const dw = textInk(font, day, size);
    const rr = Math.max(r * 0.9, dw ? (dw.x2 - dw.x1) * 0.5 + r * 0.3 : 0);
    return {
      svg: `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr)}" fill="none" stroke-width="${f(sw)}"/>${d.svg}`,
      defs: "",
      box: { x1: cx - rr - sw / 2, y1: cy - rr - sw / 2, x2: cx + rr + sw / 2, y2: cy + rr + sw / 2 },
    };
  }
  let shape: string;
  // Oyulan rakam: punto oranı ve sığması gereken en geniş yer (şeklin gövdesi)
  let numScale = 0.95;
  let fitW = r * 1.2;
  let numDy = 0;
  let round = r * 0.05;
  let ext = r;
  if (marker === "heart") {
    shape = `<path d="${heartPath(cx, cy + r * 0.06, r)}"/>`;
    numScale = 1.08;
    fitW = r * 1.22;
    numDy = -r * 0.12;
  } else if (marker === "star") {
    const sr = r * 1.16;
    shape = `<path d="${starPath(cx, cy + sr * 0.07, sr, 0.56)}"/>`;
    numScale = 0.9;
    fitW = sr * 0.92;
    numDy = sr * 0.1;
    round = sr * 0.07;
    ext = sr * 1.08;
  } else {
    const rr = r * 0.86;
    shape = `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rr)}"/>`;
    fitW = rr * 1.3;
    round = 0;
    ext = rr;
  }
  const w = textInk(font, day, size);
  const numSize = Math.min(size * numScale, w ? (size * fitW) / Math.max(w.x2 - w.x1, 1) : size);
  const d = digitsAt(font, day, numSize, cx, cy + numDy);
  const id = `cal${++maskSeq}`;
  const big = r * 3;
  const defs = `<mask id="${id}" maskUnits="userSpaceOnUse" x="${f(cx - big)}" y="${f(cy - big)}" width="${f(big * 2)}" height="${f(big * 2)}">`
    + `<rect x="${f(cx - big)}" y="${f(cy - big)}" width="${f(big * 2)}" height="${f(big * 2)}" fill="#fff"/>`
    + `<g fill="#000">${d.svg}</g></mask>`;
  const stroke = round > 0 ? ` stroke-width="${f(round * 2)}" stroke-linejoin="round"` : ` stroke-width="0"`;
  return {
    svg: `<g mask="url(#${id})"${stroke}>${shape}</g>`,
    defs,
    box: { x1: cx - ext - round, y1: cy - ext - round, x2: cx + ext + round, y2: cy + ext + round },
  };
}

// ── Sunucu modülü ──────────────────────────────────────────────────────

export const calendarGenerator: GeneratorServerModule<CalendarConfig> = {
  config: calendarConfig,

  publicAssets(config) {
    const opt = <T extends { id: string; label: string; labelEn: string }>(all: readonly T[], ids: string[]) =>
      ids.map((id) => all.find((x) => x.id === id)).filter((x): x is T => !!x).map(({ id, label, labelEn }) => ({ id, label, labelEn }));
    const font = (id: string) => ({ id, label: FONT_LIBRARY.find((x) => x.id === id)?.label ?? id });
    return {
      layouts: opt(CALENDAR_LAYOUTS, config.layouts),
      markers: opt(CALENDAR_MARKERS, config.markers),
      fonts: config.fonts.map(font),
      titleFonts: config.titleFonts.map(font),
      colors: config.colors.map((hex) => ({ id: hex, hex, label: calendarColorName(hex), labelEn: calendarColorName(hex, true) })),
      titleEnabled: config.titleEnabled,
      titleMaxLength: config.titleMaxLength,
      titlePlaceholder: config.titlePlaceholder,
      namesEnabled: config.namesEnabled,
      namesMaxLength: config.namesMaxLength,
      namesPlaceholder: config.namesPlaceholder,
      yearMin: config.yearMin,
      yearMax: config.yearMax,
    };
  },

  async compose(config, input) {
    const { fields, choices } = input;
    const date = parseDate(fields.date ?? choices.date, config);
    const layout = pickAllowed(choices.layout, config.layouts);
    const marker = pickAllowed(choices.marker, config.markers);
    const fontId = pickAllowed(choices.font, config.fonts);
    const titleFontId = pickAllowed(choices.titleFont, config.titleFonts);
    const color = cleanColor(choices.color, config.colors[0]).toLowerCase();
    const ink = config.colors.includes(color) ? color : config.colors[0];
    const lang = config.language;
    const locale = lang === "tr" ? "tr-TR" : "en-US";
    const upper = (s: string) => s.toLocaleUpperCase(locale);

    const title = config.titleEnabled ? cleanText(fields.title, config.titleMaxLength) : "";
    const names = config.namesEnabled ? cleanText(fields.names, config.namesMaxLength) : "";

    const font = await loadLibraryFont(fontId);
    const titleFont = titleFontId === fontId ? font : await loadLibraryFont(titleFontId);
    if (title) assertGlyphs(titleFont, title);
    if (names) assertGlyphs(font, upper(names));

    const spec = SPECS[layout];
    const c = new Canvas(ink);
    const month = CALENDAR_MONTHS[lang][date.m - 1];
    const grid = monthGrid(date.y, date.m, config.weekStart);
    let y = 0;

    // Başlık: el yazısında iri, uzunsa iki satır. Tek satıra sığdırmak için
    // %70'in altına küçülmesi gerekiyorsa kelime sınırından bölünür.
    const titleBlock = (top: number, cap: number) => {
      const size = cap / capRatio(titleFont);
      const lines = wrapText(titleFont, title, size, GRID_W, 2);
      const one = textSvg({ font: titleFont, text: title, x: 0, y: 0, size, fill: ink, maxWidth: GRID_W });
      const useLines = one.size < size * 0.7 && lines.length > 1 ? lines : [title];
      let t = top;
      useLines.forEach((line, i) => {
        const r = c.line({ font: titleFont, text: line, cap: useLines.length > 1 ? cap * 0.74 : cap, top: t + (i ? cap * 0.28 : 0), maxWidth: GRID_W, band: "ink" });
        t = r.bottom;
      });
      return t;
    };

    const namesLine = (top: number) =>
      c.line({ font, text: upper(names), cap: spec.namesCap, top, spacing: 0.24, maxWidth: GRID_W * 0.9 }).bottom;

    // ── Üst kısım
    if (layout === "poster") {
      // İri ay adı, altında iki yanı çizgili yıl
      const mr = c.line({ font, text: upper(month), cap: 300, top: y, spacing: 0.06, maxWidth: GRID_W });
      y = mr.bottom + 95;
      const yr = c.line({ font, text: String(date.y), cap: 64, top: y, spacing: 0.5 });
      const ruleY = y + 32 - 3;
      const ruleLen = Math.min(420, (GRID_W - yr.width) / 2 - 90);
      c.rect(CX - yr.width / 2 - 70 - ruleLen, ruleY, ruleLen, 6);
      c.rect(CX + yr.width / 2 + 40, ruleY, ruleLen, 6);
      y = yr.bottom + 150;
    } else {
      if (title) y = titleBlock(y, spec.titleCap) + 110;
      const header = layout === "minimal"
        ? `${upper(month)} · ${date.y}`
        : `${upper(month)} ${date.y}`;
      y = c.line({ font, text: header, cap: layout === "minimal" ? 84 : 100, top: y, spacing: layout === "minimal" ? 0.3 : 0.26, maxWidth: GRID_W }).bottom;
      if (layout === "classic") {
        // Ay başlığının altında kısa bir süs çizgisi
        y += 70;
        c.rect(CX - 90, y, 180, 6);
        y += 6 + 90;
      } else {
        y += 130;
      }
    }

    // ── Gün adları
    const weekdays = Array.from({ length: 7 }, (_, i) => {
      const idx = config.weekStart === "monday" ? (i + 1) % 7 : i;
      return upper(CALENDAR_WEEKDAYS[lang][idx]);
    });
    if (layout === "poster") {
      c.rect(GRID_X, y, GRID_W, 6);
      y += 6 + 60;
    }
    weekdays.forEach((w, i) => {
      c.line({ font, text: w, cap: spec.weekdayCap, top: y, spacing: 0.12, cx: GRID_X + COL_W * (i + 0.5), maxWidth: COL_W * 0.86 });
    });
    y += spec.weekdayCap + (layout === "classic" ? 50 : layout === "poster" ? 60 : 70);

    // ── Tablo
    const gridTop = y;
    const rowH = spec.rowH;
    const gridH = rowH * grid.rows;
    const lw = 5;
    if (spec.lines === "grid") {
      for (let r = 0; r <= grid.rows; r++) c.rect(GRID_X - lw / 2, gridTop + r * rowH - lw / 2, GRID_W + lw, lw);
      for (let k = 0; k <= 7; k++) c.rect(GRID_X + k * COL_W - lw / 2, gridTop - lw / 2, lw, gridH + lw);
    } else if (spec.lines === "rows") {
      c.rect(GRID_X, gridTop, GRID_W, 3);
      for (let r = 1; r < grid.rows; r++) c.rect(GRID_X, gridTop + r * rowH - 1.5, GRID_W, 3);
      c.rect(GRID_X, gridTop + gridH - 6, GRID_W, 6);
    }
    // Rakam boyu: rakam bandı `digitCap` birim; geniş fontta (Montserrat) iki
    // haneli sayı sütunun %58'ini geçmesin, yoksa komşu sayılar birbirine yapışır
    const band = textInk(font, "0123456789", 1000);
    const widest = Math.max(...["20", "28", "30", "22"].map((t) => {
      const b = textInk(font, t, 1000);
      return b ? b.x2 - b.x1 : 600;
    }));
    const digitSize = Math.min(
      (spec.digitCap * 1000) / Math.max(300, band ? band.y2 - band.y1 : 700),
      (COL_W * 0.58 * 1000) / Math.max(widest, 1),
    );
    const markR = Math.min(COL_W, rowH) * 0.44;
    for (let day = 1; day <= grid.days; day++) {
      const cell = grid.offset + day - 1;
      const cx = GRID_X + COL_W * ((cell % 7) + 0.5);
      const cy = gridTop + rowH * (Math.floor(cell / 7) + 0.5);
      if (day === date.d) {
        const m = marked(font, marker, String(day), digitSize, cx, cy, markR);
        c.svg += m.svg;
        c.defs += m.defs;
        c.grow(m.box);
      } else {
        const d = digitsAt(font, String(day), digitSize, cx, cy);
        c.svg += d.svg;
        c.grow(d.box);
      }
    }
    y = gridTop + gridH;

    // ── Alt kısım
    if (layout === "poster") {
      if (title) y = titleBlock(y + 150, spec.titleCap);
      if (names) namesLine(y + (title ? 90 : 150));
    } else if (names) {
      namesLine(y + 140);
    }

    const b = c.box;
    if (!b) throw new GeneratorInputError("Tasarım çizilemedi, lütfen başka bir yazı tipi deneyin", "The design could not be drawn, please try another font");
    const pad = Math.max(b.x2 - b.x1, b.y2 - b.y1) * 0.03 + 8;
    const vx = b.x1 - pad;
    const vy = b.y1 - pad;
    const vw = b.x2 - b.x1 + pad * 2;
    const vh = b.y2 - b.y1 + pad * 2;
    const k = OUT_LONG / Math.max(vw, vh);
    const width = Math.round(vw * k);
    const height = Math.round(vh * k);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}">`
      + `<defs>${c.defs}</defs><g fill="${ink}" stroke="${ink}" stroke-width="0">${c.svg}</g></svg>`;
    const buffer = await sharp(Buffer.from(svg), { limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
    return { buffer, width, height };
  },
};
