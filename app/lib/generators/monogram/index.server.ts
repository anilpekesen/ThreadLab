import sharp from "sharp";
import type * as opentypeNs from "opentype.js";
import { FONT_LIBRARY } from "../../font-library";
import { glyphPathData } from "../../text-render.server";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanColor, cleanText, loadLibraryFont, pickAllowed, textInk } from "../svg-text.server";
import {
  cleanMonogramLetters,
  MONOGRAM_BOTTOM_MAX,
  MONOGRAM_FRAMES,
  MONOGRAM_JOINERS,
  MONOGRAM_LAYOUTS,
  MONOGRAM_SCRIPT_FONTS,
  MONOGRAM_TOP_MAX,
  monogramColorName,
  monogramConfig,
  type MonogramConfig,
  type MonogramJoiner,
  type MonogramLayout,
} from "./config";
import { CANVAS, CX, CY, diamondDot, drawFrame, RING_TEXT, type FitArea } from "./frames.server";

/**
 * Monogram çizimi.
 *
 * Harfler, fontun glif yollarıyla "yerel" bir koordinat sisteminde dizilir:
 * ana harfin büyük harf yüksekliği 1000 birim. Üst/alt yazılarla birlikte bu
 * blok, çerçevenin iç alanına orantılı büyütülüp ortalanır. Yerleşim fontun
 * gerçek mürekkep kutularıyla yapılır (ilerleme genişliğiyle değil): el yazısı
 * fontların kuyrukları ve serif harflerin boşlukları görsel dengeyi bozmasın.
 *
 * Son adımda tasarım, mürekkebin sınırına küçük bir payla kırpılır: çerçevesiz
 * bir üç harf, tuvalin ortasında yüzen küçük bir şerit olarak gitmesin.
 */

type Box = { x1: number; y1: number; x2: number; y2: number };
interface Piece {
  svg: string;
  /** Mürekkebin tamamı (şapka, çengel, kuyruk dahil) */
  box: Box;
  /**
   * Görsel ortalamada kullanılan kutu: harflerde büyük harf bandı. Ş'nin
   * çengeli ya da Ö'nün noktaları monogramı yukarı/aşağı kaydırmasın.
   */
  vis: Box;
}

const f = (n: number) => Number(n.toFixed(1));
const CAP = 1000;

/** Yerleşimde kullanılan harf: yerel koordinatta yollar ve mürekkep kutusu */
interface Glyph {
  paths: string[];
  ink: Box;
}

function glyphAt(font: opentypeNs.Font, ch: string, size: number): Glyph | null {
  const paths = glyphPathData(font, ch, size);
  const ink = textInk(font, ch, size);
  if (!paths.length || !ink) return null;
  return { paths, ink };
}

/** Fontun büyük harf yüksekliğini CAP birime getiren punto */
function capSize(font: opentypeNs.Font): number {
  const h = textInk(font, "H", 1000);
  const cap = h ? h.y2 - h.y1 : 700;
  return (1000 * CAP) / Math.max(cap, 1);
}

function union(a: Box | null, b: Box): Box {
  if (!a) return { ...b };
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

let maskSeq = 0;

/**
 * Baş harfleri seçilen düzende dizer. Taban çizgisi y=0, ana harflerin büyük
 * harf yüksekliği CAP; yan harfler dikeyde ana harfin büyük harf ortasına
 * hizalanır (geleneksel monogramda üç harfin ortası aynı çizgidedir).
 */
function buildLetters(
  font: opentypeNs.Font,
  letters: string[],
  layout: MonogramLayout,
  joiner: MonogramJoiner,
  script: boolean,
): Piece {
  const S = capSize(font);
  const capMid = -CAP / 2;
  const chars = layout === "single" ? letters.slice(0, 1) : letters;

  // Harf başına boyut oranı: klasik üçlüde yanlar %64
  const scaleOf = (i: number) => (layout === "classic" && chars.length === 3 && i !== 1 ? 0.64 : 1);
  // Harfler arası boşluk (mürekkepten mürekkebe): el yazısında kuyruklar zaten
  // yakınlaşıyor, geniş boşluk harfleri kopuk gösterir
  const gap = (script ? 0.04 : layout === "classic" ? 0.16 : 0.12) * CAP;

  const glyphs: Array<{ g: Glyph; ty: number; scale: number }> = [];

  // Fontta olmayan harf (ör. Kiril, Arap) boş kutu olarak basılmasın
  const missing = chars.find((ch) => font.charToGlyphIndex(ch) === 0);
  if (missing) throw new GeneratorInputError(`"${missing}" harfi bu yazı tipinde yok; Latin harfleri ya da rakam kullanın`);

  chars.forEach((ch, i) => {
    const sc = scaleOf(i);
    const g = glyphAt(font, ch, S * sc);
    if (!g) return;
    // Küçük harfin büyük harf ortası ana harfinkine otursun
    const ty = sc === 1 ? 0 : capMid + (CAP * sc) / 2;
    glyphs.push({ g, ty, scale: sc });
  });
  if (!glyphs.length) throw new GeneratorInputError("Bu harfler seçilen yazı tipiyle çizilemedi");

  const pathsSvg = (g: Glyph) => g.paths.map((d) => `<path d="${d}"/>`).join("");

  if (layout === "interlock" && glyphs.length > 1) {
    return interlock(glyphs.map((x) => x.g), script);
  }

  let cursor = 0;
  let box: Box | null = null;
  let svg = "";
  const place = (g: Glyph, ty: number) => {
    const tx = cursor - g.ink.x1;
    svg += `<g transform="translate(${f(tx)} ${f(ty)})">${pathsSvg(g)}</g>`;
    box = union(box, { x1: tx + g.ink.x1, y1: ty + g.ink.y1, x2: tx + g.ink.x2, y2: ty + g.ink.y2 });
    cursor = tx + g.ink.x2;
  };

  glyphs.forEach(({ g, ty }, i) => {
    if (i > 0) {
      const twoClassic = layout === "classic" && glyphs.length === 2;
      if (twoClassic && joiner === "line") {
        const w = 0.028 * CAP;
        const h = 0.92 * CAP;
        cursor += 0.17 * CAP;
        svg += `<rect x="${f(cursor)}" y="${f(capMid - h / 2)}" width="${f(w)}" height="${f(h)}"/>`;
        cursor += w + 0.17 * CAP;
      } else if (twoClassic && joiner === "amp") {
        const amp = glyphAt(font, "&", S * 0.48);
        if (amp) {
          cursor += 0.1 * CAP;
          const ampMid = (amp.ink.y1 + amp.ink.y2) / 2;
          place(amp, capMid - ampMid);
          cursor += 0.1 * CAP;
        } else cursor += gap;
      } else if (twoClassic && joiner === "dot") {
        cursor += 0.14 * CAP;
        svg += diamondDot(cursor + 0.05 * CAP, capMid, 0.08 * CAP);
        cursor += 0.1 * CAP + 0.14 * CAP;
      } else {
        cursor += gap;
      }
    }
    place(g, ty);
  });
  // Ayraç çizgisi ve noktası kutuya girmez; yükseklikleri harflerin içinde kalıyor
  const b: Box = box ?? { x1: 0, y1: -CAP, x2: CAP, y2: 0 };
  return { svg, box: b, vis: { x1: b.x1, y1: -CAP, x2: b.x2, y2: 0 } };
}

/**
 * İç içe düzen: harfler üst üste biner, öndeki harfin çevresinde arkadakinde
 * ince bir boşluk açılır (öndekinin kalın konturlu kopyası maske olarak).
 * Böylece tek renkle basılsa da hangi harfin önde olduğu okunur.
 *
 * İki harfte ikinci harf önde ve biraz aşağıda; üç harfte ortadaki önde.
 */
function interlock(glyphs: Glyph[], script: boolean): Piece {
  const n = glyphs.length;
  const overlap = (script ? 0.24 : 0.34) * (n === 3 ? 0.6 : 1);
  const dy = n === 2 ? [-0.09 * CAP, 0.09 * CAP] : [0, 0, 0];
  const pos: Array<{ tx: number; ty: number }> = [];
  let cursor = 0;
  glyphs.forEach((g, i) => {
    const w = g.ink.x2 - g.ink.x1;
    const prevW = i > 0 ? glyphs[i - 1].ink.x2 - glyphs[i - 1].ink.x1 : 0;
    if (i > 0) cursor -= Math.min(w, prevW) * overlap;
    const tx = cursor - g.ink.x1;
    pos.push({ tx, ty: dy[i] ?? 0 });
    cursor = tx + g.ink.x2;
  });
  const front = 1;
  const gapW = 0.075 * CAP;
  const paths = (g: Glyph) => g.paths.map((d) => `<path d="${d}"/>`).join("");
  const tr = (i: number) => `translate(${f(pos[i].tx)} ${f(pos[i].ty)})`;

  let defs = "";
  let svg = "";
  let box: Box | null = null;
  glyphs.forEach((g, i) => {
    box = union(box, {
      x1: pos[i].tx + g.ink.x1, y1: pos[i].ty + g.ink.y1, x2: pos[i].tx + g.ink.x2, y2: pos[i].ty + g.ink.y2,
    });
    if (i === front) return;
    const id = `mgm${++maskSeq}`;
    defs += `<mask id="${id}" maskUnits="userSpaceOnUse" x="-20000" y="-20000" width="40000" height="40000">`
      + `<rect x="-20000" y="-20000" width="40000" height="40000" fill="#fff"/>`
      + `<g transform="${tr(front)}" fill="#000" stroke="#000" stroke-width="${f(gapW * 2)}" stroke-linejoin="round">${paths(glyphs[front])}</g>`
      + `</mask>`;
    svg += `<g mask="url(#${id})"><g transform="${tr(i)}">${paths(g)}</g></g>`;
  });
  svg += `<g transform="${tr(front)}">${paths(glyphs[front])}</g>`;
  const b: Box = box!;
  const vy1 = Math.min(...dy) - CAP;
  const vy2 = Math.max(...dy);
  return { svg: `<defs>${defs}</defs>${svg}`, box: b, vis: { x1: b.x1, y1: vy1, x2: b.x2, y2: vy2 } };
}

/**
 * Geniş aralıklı, büyük harfli tek satır yazı. Harfler tek tek dizilir;
 * `maxWidth` aşılırsa önce aralık, sonra punto küçülür (en az `minCap`).
 */
function spacedLine(font: opentypeNs.Font, text: string, cap: number, maxWidth: number, minCap: number) {
  const chars = Array.from(text);
  const capAt1000 = (() => {
    const h = textInk(font, "H", 1000);
    return h ? h.y2 - h.y1 : 700;
  })();
  let size = (1000 * cap) / capAt1000;
  let spacing = 0.2;
  const adv = (s: number) => chars.map((ch) => (ch === " " ? font.getAdvanceWidth(" ", s) * 1.3 : font.getAdvanceWidth(ch, s)));
  const widthOf = (s: number, sp: number) => {
    const a = adv(s);
    return a.reduce((x, y) => x + y, 0) + sp * s * (chars.length - 1);
  };
  let w = widthOf(size, spacing);
  if (w > maxWidth) {
    spacing = Math.max(0.08, spacing - ((w - maxWidth) / (size * Math.max(chars.length - 1, 1))));
    w = widthOf(size, spacing);
  }
  if (w > maxWidth) {
    const minSize = (1000 * minCap) / capAt1000;
    size = Math.max(minSize, size * (maxWidth / w));
    w = widthOf(size, spacing);
  }
  return { chars, size, spacing, advances: adv(size), width: w, capH: (capAt1000 * size) / 1000 };
}

/** Düz satır: merkez x'e ortalı, y taban çizgisi */
function straightLine(font: opentypeNs.Font, text: string, cap: number, maxWidth: number, cx: number, baseline: number): Piece {
  const L = spacedLine(font, text, cap, maxWidth, cap * 0.55);
  let x = cx - L.width / 2;
  let svg = "";
  L.chars.forEach((ch, i) => {
    const p = glyphPathData(font, ch, L.size);
    if (p.length) svg += `<g transform="translate(${f(x)} ${f(baseline)})">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    x += L.advances[i] + L.spacing * L.size;
  });
  const box = { x1: cx - L.width / 2, y1: baseline - L.capH, x2: cx + L.width / 2, y2: baseline };
  return { svg, box, vis: box };
}

/**
 * Yay üzerine yazı: harfler tek tek, her biri yayın o noktadaki teğet açısıyla
 * döndürülür. Üst yayda harfler dışa, alt yayda merkeze bakar (ikisi de
 * soldan sağa okunur). Yay boyu en fazla ±74°; sığmazsa aralık ve punto küçülür.
 */
function arcText(font: opentypeNs.Font, text: string, where: "top" | "bottom", cap: number): string {
  const rMid = RING_TEXT.mid;
  const maxArc = rMid * ((148 * Math.PI) / 180);
  const L = spacedLine(font, text, cap, maxArc, cap * 0.62);
  const span = L.width / rMid; // radyan
  const rBase = where === "top" ? rMid - L.capH / 2 : rMid + L.capH / 2;
  let s = 0;
  let svg = "";
  L.chars.forEach((ch, i) => {
    const adv = L.advances[i];
    const centerAlong = s + adv / 2;
    s += adv + L.spacing * L.size;
    const p = glyphPathData(font, ch, L.size);
    if (!p.length) return;
    // Harfin ortası yay üzerinde; açı tepeden (üst) ya da dipten (alt)
    const a = -span / 2 + centerAlong / rMid;
    let x: number, y: number, rot: number;
    if (where === "top") {
      x = CX + rBase * Math.sin(a);
      y = CY - rBase * Math.cos(a);
      rot = (a * 180) / Math.PI;
    } else {
      x = CX + rBase * Math.sin(a);
      y = CY + rBase * Math.cos(a);
      rot = (-a * 180) / Math.PI;
    }
    svg += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) translate(${f(-adv / 2)} 0)">${p.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  });
  return svg;
}

/**
 * Bloğu çerçevenin iç alanına sığdıran ölçek ve öteleme. Blok görsel
 * merkezinden (`vis`) alanın merkezine oturur; ölçek, her parçanın köşeleri
 * alanın içinde kalacak en büyük değerdir. Harf kutusunun köşeleri çoğunlukla
 * boş olduğundan dairede/baklavada küçük bir tolerans alır; yazı satırları
 * ise gerçekten köşesine kadar dolu, toleranssız.
 */
function fitInto(parts: Array<{ box: Box; tol: number }>, vis: Box, area: FitArea): { s: number; tx: number; ty: number } {
  const cx = (vis.x1 + vis.x2) / 2;
  const cy = (vis.y1 + vis.y2) / 2;
  let s = Infinity;
  for (const { box, tol } of parts) {
    for (const [x, y] of [[box.x1, box.y1], [box.x2, box.y1], [box.x1, box.y2], [box.x2, box.y2]]) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      if (area.shape === "rect") {
        if (dx > 0) s = Math.min(s, area.w / 2 / dx);
        if (dy > 0) s = Math.min(s, area.h / 2 / dy);
      } else if (area.shape === "circle") {
        s = Math.min(s, (area.r * tol) / Math.max(Math.hypot(dx, dy), 1));
        // Tolerans yalnızca köşeler için: kenar ortaları da çizgiyi geçmesin
        if (dx > 0) s = Math.min(s, area.r / dx);
        if (dy > 0) s = Math.min(s, area.r / dy);
      } else {
        s = Math.min(s, (area.d * tol) / Math.max(dx + dy, 1));
        if (dx > 0) s = Math.min(s, (area.d * 0.8) / dx);
        if (dy > 0) s = Math.min(s, (area.d * 0.8) / dy);
      }
    }
  }
  if (!Number.isFinite(s)) s = 1;
  return { s, tx: area.cx - cx * s, ty: area.cy - cy * s };
}

/**
 * Mürekkebin sınırı: tasarım küçük boyutta çizilip alfa kanalı taranır.
 * `sharp().trim()` şeffaf zeminde sol üst pikseli referans alır ve kenara
 * değen bir çerçevede yanlış kırpabilir; kendi taramamız belirsizlik bırakmaz.
 */
async function inkBounds(svg: string): Promise<Box | null> {
  const small = 600;
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .resize(small, small)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x1 = info.width, y1 = info.height, x2 = -1, y2 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 8) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  const k = CANVAS / small;
  // Küçük görüntüde bir piksel = 4 birim; kırpma payı bunu karşılıyor
  return { x1: x1 * k, y1: y1 * k, x2: (x2 + 1) * k, y2: (y2 + 1) * k };
}

const OUT_LONG = 2400;

export const monogramGenerator: GeneratorServerModule<MonogramConfig> = {
  config: monogramConfig,

  publicAssets(config) {
    return {
      layouts: config.layouts.map((id) => {
        const m = MONOGRAM_LAYOUTS.find((l) => l.id === id)!;
        return { id, label: m.label, labelEn: m.labelEn };
      }),
      frames: config.frames.map((id) => {
        const m = MONOGRAM_FRAMES.find((l) => l.id === id)!;
        return { id, label: m.label, labelEn: m.labelEn };
      }),
      joiners: config.joiners.map((id) => {
        const m = MONOGRAM_JOINERS.find((l) => l.id === id)!;
        return { id, label: m.label, labelEn: m.labelEn };
      }),
      fonts: config.fonts.map((id) => {
        const lib = FONT_LIBRARY.find((x) => x.id === id);
        return { id, label: lib?.label ?? id, script: MONOGRAM_SCRIPT_FONTS.includes(id) };
      }),
      colors: config.colors.map((hex) => ({ hex, label: monogramColorName(hex), labelEn: monogramColorName(hex, true) })),
      maxLetters: config.maxLetters,
      topText: config.topText ? { max: MONOGRAM_TOP_MAX } : null,
      bottomText: config.bottomText ? { max: MONOGRAM_BOTTOM_MAX } : null,
    };
  },

  async compose(config, input) {
    const letters = Array.from(cleanMonogramLetters(input.fields.letters, config.maxLetters));
    if (!letters.length) throw new GeneratorInputError("En az bir harf yazın");

    const layout = pickAllowed(input.choices.layout, config.layouts);
    const frame = pickAllowed(input.choices.frame, config.frames);
    const joiner = pickAllowed(input.choices.joiner, config.joiners);
    const fontId = pickAllowed(input.choices.font, config.fonts);
    const color = cleanColor(input.choices.color, config.colors[0]);
    const ink = config.colors.includes(color.toLowerCase()) ? color.toLowerCase() : config.colors[0];
    const upper = (v: string) => v.toLocaleUpperCase("tr-TR");
    const topText = config.topText ? upper(cleanText(input.fields.topText, MONOGRAM_TOP_MAX)) : "";
    const bottomText = config.bottomText ? upper(cleanText(input.fields.bottomText, MONOGRAM_BOTTOM_MAX)) : "";

    const script = MONOGRAM_SCRIPT_FONTS.includes(fontId);
    const font = await loadLibraryFont(fontId);
    // Küçük yazılar el yazısında geniş aralıkla okunmuyor: eşlikçi serif
    const captionFont = script ? await loadLibraryFont("cormorant") : font;

    const letterPiece = buildLetters(font, letters, layout, joiner, script);
    const fr = drawFrame(frame);

    // Blok: [üst yazı] + harfler + [alt yazı]. Yazılı dairede yazılar yayda.
    let block = letterPiece.svg;
    let box = { ...letterPiece.box };
    let vis = { ...letterPiece.vis };
    const parts: Array<{ box: Box; tol: number }> = [{ box: letterPiece.box, tol: 1.05 }];
    let extra = "";
    if (frame === "circle-text") {
      if (topText) extra += arcText(captionFont, topText, "top", 118);
      if (bottomText) extra += arcText(captionFont, bottomText, "bottom", 118);
      // İki yazının buluştuğu yanlarda küçük süs noktaları
      extra += diamondDot(CX - RING_TEXT.mid, CY, 34, 90) + diamondDot(CX + RING_TEXT.mid, CY, 34, 90);
    } else {
      const lw = box.x2 - box.x1;
      const lh = box.y2 - box.y1;
      const capH = Math.max(115, Math.min(170, lh * 0.14));
      const gapY = capH * 1.25;
      // Yazı harflerden çok taşarsa blok küçülür ve harfler (asıl tasarım)
      // cılızlaşır; önce yazı daralır. Baklava ve armanın dar uçlarında pay az.
      const widthFactor = frame === "diamond" ? 0.95 : frame === "crest" || frame === "circle" ? 1.1 : 1.3;
      const maxW = Math.max(lw * widthFactor, 1000);
      const cx = (box.x1 + box.x2) / 2;
      if (topText) {
        const t = straightLine(captionFont, topText, capH, maxW, cx, box.y1 - gapY);
        block += t.svg;
        box = union(box, t.box);
        vis = union(vis, t.box);
        parts.push({ box: t.box, tol: 1 });
      }
      if (bottomText) {
        const bt = straightLine(captionFont, bottomText, capH, maxW, cx, box.y2 + gapY + capH);
        block += bt.svg;
        // Kısa alt yazının iki yanına ince çizgi: "— EST. 2020 —"
        const room = Math.max(lw, bt.box.x2 - bt.box.x1);
        const ruleLen = Math.min(260, (room - (bt.box.x2 - bt.box.x1)) / 2 - capH * 0.7);
        if (ruleLen > capH * 0.9) {
          const ry = bt.box.y1 + capH / 2 - 4;
          block += `<rect x="${f(bt.box.x1 - capH * 0.6 - ruleLen)}" y="${f(ry)}" width="${f(ruleLen)}" height="8"/>`;
          block += `<rect x="${f(bt.box.x2 + capH * 0.6)}" y="${f(ry)}" width="${f(ruleLen)}" height="8"/>`;
        }
        box = union(box, bt.box);
        vis = union(vis, bt.box);
        parts.push({ box: bt.box, tol: 1 });
      }
    }

    const fit = fitInto(parts, vis, fr.fit);
    const body = `<g fill="${ink}" stroke="${ink}" stroke-width="0">`
      + `${fr.svg}${extra}`
      + `<g transform="translate(${f(fit.tx)} ${f(fit.ty)}) scale(${fit.s.toFixed(4)})">${block}</g>`
      + `</g>`;
    const full = (vb: string, w: number, h: number) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${body}</svg>`;

    const b = await inkBounds(full(`0 0 ${CANVAS} ${CANVAS}`, 600, 600));
    if (!b) throw new GeneratorInputError("Tasarım çizilemedi, lütfen başka bir yazı tipi deneyin");
    const pad = Math.max(b.x2 - b.x1, b.y2 - b.y1) * 0.03 + 8;
    const vx = b.x1 - pad;
    const vy = b.y1 - pad;
    const vw = b.x2 - b.x1 + pad * 2;
    const vh = b.y2 - b.y1 + pad * 2;
    const k = OUT_LONG / Math.max(vw, vh);
    const width = Math.round(vw * k);
    const height = Math.round(vh * k);
    const buffer = await sharp(Buffer.from(full(`${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}`, width, height)))
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { buffer, width, height };
  },
};
