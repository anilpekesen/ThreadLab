import sharp from "sharp";
import type * as opentypeNs from "opentype.js";
import { FONT_LIBRARY } from "../../font-library";
import { glyphPathData } from "../../text-render.server";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanColor, cleanText, loadLibraryFont, pickAllowed, textInk, textSvg, PRINT_SCALE } from "../svg-text.server";
import {
  cleanWordsearchWord,
  WORDSEARCH_ALPHABETS,
  WORDSEARCH_GRID_MAX,
  WORDSEARCH_GRID_MIN,
  WORDSEARCH_SCRIPT_FONTS,
  WORDSEARCH_STYLES,
  WORDSEARCH_WORD_MAX,
  WORDSEARCH_WORD_MIN,
  wordsearchColorName,
  wordsearchConfig,
  type WordsearchConfig,
  type WordsearchDirection,
} from "./config";

/**
 * Kelime avı çizimi.
 *
 * 1) Yerleşim: kelimeler uzundan kısaya, girdiden türeyen sabit tohumlu
 *    rastgeleyle geri izlemeli olarak yerleştirilir. Sığmazsa tablo büyür;
 *    15×15'te de sığmazsa müşteriye daha az/kısa kelime önerilir.
 * 2) Dolgu: boş hücreler aynı tohumla alfabeden doldurulur; dolgunun yanlışlıkla
 *    bir kelimeyi ikinci kez oluşturduğu yerlerde dolgu harfi yeniden çekilir.
 * 3) Çizim: hücre 100 birim; harfler mürekkep kutusuyla yatayda, büyük harf
 *    bandıyla dikeyde hücreye ortalanır (Ç'nin çengeli, İ'nin noktası harfi
 *    kaydırmasın). Çözülmüş görünümde kelimeler yalnızca çizgili (dolgusuz)
 *    kapsüllerle çevrilir ki harfler okunur kalsın.
 */

const C = 100;
const OUT_LONG = Math.round(2400 * PRINT_SCALE);
const f = (n: number) => Number(n.toFixed(1));

type Box = { x1: number; y1: number; x2: number; y2: number };

function union(a: Box | null, b: Box): Box {
  if (!a) return { ...b };
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

// ── Sabit tohumlu rastgele ─────────────────────────────────────────────

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: küçük, hızlı ve her ortamda aynı diziyi veren üreteç */
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Yerleşim ───────────────────────────────────────────────────────────

/** Yön vektörü (satır, sütun) ve aynı eksendeki yönleri tanımak için eksen adı */
interface Dir { dr: number; dc: number; axis: string }

function directionsOf(allowed: WordsearchDirection[], reversed: boolean): Dir[] {
  const out: Dir[] = [];
  const add = (dr: number, dc: number, axis: string) => {
    out.push({ dr, dc, axis });
    if (reversed) out.push({ dr: -dr, dc: -dc, axis });
  };
  if (allowed.includes("horizontal")) add(0, 1, "h");
  if (allowed.includes("vertical")) add(1, 0, "v");
  if (allowed.includes("diagonal")) {
    add(1, 1, "d1");
    add(-1, 1, "d2");
  }
  return out;
}

interface Placement { word: string; r: number; c: number; dir: Dir; cells: number[] }

interface Candidate { r: number; c: number; dir: Dir; overlap: number; score: number }

/**
 * Kelimeleri n×n tabloya yerleştirir; bulamazsa null. Aday konumlar yön
 * çeşitliliğini (aynı yön üst üste gelmesin) ve biraz kesişmeyi ödüllendirir;
 * sıralamadaki rastgele pay tohumdan gelir. Geri izleme bütçeyle sınırlı ki
 * imkânsız bir girdi isteği kilitlemesin.
 */
function placeWords(words: string[], n: number, dirs: Dir[], rng: () => number): Placement[] | null {
  const grid: string[] = new Array(n * n).fill("");
  const axes: string[][] = Array.from({ length: n * n }, () => []);
  const dirUse = new Map<string, number>();
  const placed: Placement[] = [];
  let budget = 3000;

  const candidates = (w: string): Candidate[] => {
    const len = w.length;
    const out: Candidate[] = [];
    for (const dir of dirs) {
      const diag = dir.dr !== 0 && dir.dc !== 0;
      for (let r = 0; r < n; r++) {
        const er = r + dir.dr * (len - 1);
        if (er < 0 || er >= n) continue;
        for (let c = 0; c < n; c++) {
          const ec = c + dir.dc * (len - 1);
          if (ec < 0 || ec >= n) continue;
          let overlap = 0;
          let hug = 0;
          let ok = true;
          for (let i = 0; i < len; i++) {
            const rr = r + dir.dr * i, cc = c + dir.dc * i;
            const cell = rr * n + cc;
            // Komşu paralel çaprazlar yalnızca 0,7 hücre aralıklı: iki kapsül
            // birbirine yapışıp çift çizgi gibi görünür, bu konum geri plana
            if (diag) {
              for (const [nr, nc] of [[rr, cc + 1], [rr, cc - 1], [rr + 1, cc], [rr - 1, cc]]) {
                if (nr >= 0 && nr < n && nc >= 0 && nc < n && axes[nr * n + nc].includes(dir.axis)) hug++;
              }
            }
            const g = grid[cell];
            if (!g) continue;
            // Aynı eksende üst üste binen iki kelimenin kapsülleri birbirine karışır
            if (g !== w[i] || axes[cell].includes(dir.axis)) { ok = false; break; }
            overlap++;
          }
          // Kelime tamamen başka bir kelimenin içinde kalmasın
          if (!ok || overlap >= len) continue;
          const use = dirUse.get(`${dir.dr},${dir.dc}`) ?? 0;
          out.push({ r, c, dir, overlap, score: use * 1.1 - Math.min(overlap, 2) * 0.6 + Math.min(hug, 3) * 1.5 + rng() * 2 });
        }
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 24);
  };

  const place = (k: number): boolean => {
    if (k === words.length) return true;
    if (--budget < 0) return false;
    const w = words[k];
    for (const cand of candidates(w)) {
      const cells: number[] = [];
      const fresh: number[] = [];
      for (let i = 0; i < w.length; i++) {
        const cell = (cand.r + cand.dir.dr * i) * n + cand.c + cand.dir.dc * i;
        cells.push(cell);
        if (!grid[cell]) { grid[cell] = w[i]; fresh.push(cell); }
        axes[cell].push(cand.dir.axis);
      }
      const key = `${cand.dir.dr},${cand.dir.dc}`;
      dirUse.set(key, (dirUse.get(key) ?? 0) + 1);
      placed.push({ word: w, r: cand.r, c: cand.c, dir: cand.dir, cells });
      if (place(k + 1)) return true;
      placed.pop();
      dirUse.set(key, (dirUse.get(key) ?? 1) - 1);
      for (const cell of cells) axes[cell].pop();
      for (const cell of fresh) grid[cell] = "";
      if (budget < 0) return false;
    }
    return false;
  };

  return place(0) ? placed : null;
}

/** Kelimenin tablodaki tüm geçişleri (8 yön), hücre dizileri olarak */
function occurrences(grid: string[], n: number, w: string): number[][] {
  const out: number[][] = [];
  const len = w.length;
  const all = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r * n + c] !== w[0]) continue;
      for (const [dr, dc] of all) {
        const er = r + dr * (len - 1), ec = c + dc * (len - 1);
        if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
        const cells: number[] = [];
        let ok = true;
        for (let i = 0; i < len; i++) {
          const cell = (r + dr * i) * n + c + dc * i;
          if (grid[cell] !== w[i]) { ok = false; break; }
          cells.push(cell);
        }
        if (ok) out.push(cells);
      }
    }
  }
  return out;
}

/**
 * Boş hücreleri doldurur. Dolgunun çoğu alfabeden eşit olasılıkla; bir kısmı
 * kelimelerin kendi harflerinden (ör. İngilizce alfabede "Ş" tek başına göze
 * batıp kelimeyi ele vermesin). Sonra kelimenin ikinci bir kopyası oluştuysa
 * o kopyadaki bir dolgu harfi yeniden çekilir.
 */
function fillGrid(grid: string[], n: number, placements: Placement[], letters: string, rng: () => number): void {
  const alphabet = Array.from(letters);
  const pool = placements.flatMap((p) => Array.from(p.word));
  const draw = () => (rng() < 0.25 && pool.length ? pool[Math.floor(rng() * pool.length)] : alphabet[Math.floor(rng() * alphabet.length)]);
  const filler = new Set<number>();
  for (let i = 0; i < n * n; i++) {
    if (!grid[i]) { grid[i] = draw(); filler.add(i); }
  }
  const keyOf = (cells: number[]) => [...cells].sort((a, b) => a - b).join(",");
  const own = new Map<string, Set<string>>();
  for (const p of placements) {
    if (!own.has(p.word)) own.set(p.word, new Set());
    own.get(p.word)!.add(keyOf(p.cells));
  }
  for (let iter = 0; iter < 400; iter++) {
    let fixed = false;
    for (const [word, keys] of own) {
      for (const occ of occurrences(grid, n, word)) {
        if (keys.has(keyOf(occ))) continue;
        const free = occ.filter((cell) => filler.has(cell));
        if (!free.length) continue;
        grid[free[Math.floor(rng() * free.length)]] = alphabet[Math.floor(rng() * alphabet.length)];
        fixed = true;
      }
    }
    if (!fixed) break;
  }
}

interface Puzzle { n: number; grid: string[]; placements: Placement[] }

function buildPuzzle(words: string[], config: WordsearchConfig): Puzzle {
  const dirs = directionsOf(config.directions, config.reversed);
  const letters = WORDSEARCH_ALPHABETS.find((a) => a.id === config.alphabet)?.letters ?? WORDSEARCH_ALPHABETS[0].letters;
  // Uzundan kısaya; eşitlikte girildiği sıra (sabit sıralama)
  const order = words.map((w, i) => ({ w, i })).sort((a, b) => b.w.length - a.w.length || a.i - b.i).map((x) => x.w);
  const longest = order[0].length;
  const total = words.reduce((s, w) => s + w.length, 0);
  // Otomatik boyut: kelime harfleri hücrelerin yarısını geçmesin, yoksa tablo
  // kelimelerle tıkanır ve çözülmüş görünümde kapsüller birbirine yapışır
  const auto = Math.max(WORDSEARCH_GRID_MIN, longest, Math.ceil(Math.sqrt(total / 0.5)));
  const start = Math.min(WORDSEARCH_GRID_MAX, Math.max(auto, config.gridSize || 0));
  const seedText = [words.join("|"), config.alphabet, config.directions.join(","), config.reversed ? "r" : ""].join("#");
  for (let n = Math.max(start, longest); n <= WORDSEARCH_GRID_MAX; n++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rng = rngOf(hash32(`${seedText}#${n}#${attempt}`));
      const placements = placeWords(order, n, dirs, rng);
      if (!placements) continue;
      const grid: string[] = new Array(n * n).fill("");
      for (const p of placements) p.cells.forEach((cell, i) => { grid[cell] = p.word[i]; });
      fillGrid(grid, n, placements, letters, rng);
      // Kapsüller ve liste girilen sırayla çizilsin
      placements.sort((a, b) => words.indexOf(a.word) - words.indexOf(b.word));
      return { n, grid, placements };
    }
  }
  throw new GeneratorInputError(
    "Kelimeler tabloya sığmadı; daha az ya da daha kısa kelime deneyin",
    "The words don't fit in the grid; try fewer or shorter words",
  );
}

// ── Çizim ──────────────────────────────────────────────────────────────

interface Glyph { paths: string[]; ink: Box }

/** Fontun büyük harf yüksekliği (punto başına) */
function capRatio(font: opentypeNs.Font): number {
  const h = textInk(font, "H", 1000);
  return (h ? h.y2 - h.y1 : 700) / 1000;
}

function assertGlyphs(font: opentypeNs.Font, text: string) {
  const missing = Array.from(text).find((ch) => ch.trim() && font.charToGlyphIndex(ch) === 0);
  if (missing) {
    throw new GeneratorInputError(
      `"${missing}" karakteri bu yazı tipinde yok; çıkarın ya da başka bir yazı tipi seçin`,
      `"${missing}" is not available in this font; remove it or choose another font`,
    );
  }
}

/** Tablo harfleri: her harf hücre ortasına, ortak taban çizgisiyle */
function drawGrid(font: opentypeNs.Font, pz: Puzzle): { svg: string; box: Box | null } {
  const size = (C * 0.5) / capRatio(font);
  const cap = capRatio(font) * size;
  const cache = new Map<string, Glyph | null>();
  const glyph = (ch: string) => {
    if (!cache.has(ch)) {
      const paths = glyphPathData(font, ch, size);
      const ink = textInk(font, ch, size);
      cache.set(ch, paths.length && ink ? { paths, ink } : null);
    }
    return cache.get(ch)!;
  };
  let svg = "";
  let box: Box | null = null;
  for (let r = 0; r < pz.n; r++) {
    for (let c = 0; c < pz.n; c++) {
      const g = glyph(pz.grid[r * pz.n + c]);
      if (!g) continue;
      const tx = (c + 0.5) * C - (g.ink.x1 + g.ink.x2) / 2;
      const ty = (r + 0.5) * C + cap / 2;
      svg += `<g transform="translate(${f(tx)} ${f(ty)})">${g.paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
      box = union(box, { x1: tx + g.ink.x1, y1: ty + g.ink.y1, x2: tx + g.ink.x2, y2: ty + g.ink.y2 });
    }
  }
  return { svg, box };
}

/**
 * Çözülmüş görünüm: her kelimenin çevresinde yönü boyunca uzanan, uçları
 * yuvarlak kapsül; yalnızca çizgi, harfler okunur kalsın.
 */
function drawCapsules(pz: Puzzle, stroke: number): string {
  return pz.placements.map((p) => {
    // Çaprazda komşu harfin köşesi çizgiye ~0,39 hücre yaklaşıyor: kapsül incelir
    const diag = p.dir.dr !== 0 && p.dir.dc !== 0;
    const h = C * (diag ? 0.6 : 0.72);
    const ext = C * (diag ? 0.44 : 0.42);
    const last = p.word.length - 1;
    const x0 = (p.c + 0.5) * C, y0 = (p.r + 0.5) * C;
    const x1 = (p.c + p.dir.dc * last + 0.5) * C, y1 = (p.r + p.dir.dr * last + 0.5) * C;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    return `<rect x="${f(-ext)}" y="${f(-h / 2)}" width="${f(len + ext * 2)}" height="${f(h)}" rx="${f(h / 2)}" `
      + `transform="translate(${f(x0)} ${f(y0)}) rotate(${f(ang)})" fill="none" stroke-width="${f(stroke)}"/>`;
  }).join("");
}

/**
 * Kelime listesi: tablonun altında ortalanmış satırlar, kelimeler arasında
 * küçük baklava. Satır tablo genişliğini geçerse alta kayar.
 */
function drawWordList(font: opentypeNs.Font, words: string[], ink: string, top: number, cx: number, maxWidth: number, capTarget: number): { svg: string; box: Box | null } {
  const size = capTarget / capRatio(font);
  const cap = capRatio(font) * size;
  const spacing = 0.12;
  const widthOf = (w: string) => {
    const r = textSvg({ font, text: w, x: 0, y: 0, size, fill: "none", letterSpacing: spacing });
    // Son harften sonraki aralık görsel genişliğe dahil değil
    return r.width - spacing * size;
  };
  const gap = cap * 2.4;
  const rows: string[][] = [];
  let cur: string[] = [];
  let curW = 0;
  for (const w of words) {
    const ww = widthOf(w);
    const next = cur.length ? curW + gap + ww : ww;
    if (cur.length && next > maxWidth) {
      rows.push(cur);
      cur = [w];
      curW = ww;
    } else {
      cur.push(w);
      curW = next;
    }
  }
  if (cur.length) rows.push(cur);
  // Son satır tek kelimeyle kalmasın: önceki satırdan bir kelime insin
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 2].length > 2) {
    rows[rows.length - 1].unshift(rows[rows.length - 2].pop()!);
  }

  let svg = "";
  let box: Box | null = null;
  const lineH = cap * 2.3;
  const dot = cap * 0.2;
  rows.forEach((row, ri) => {
    const widths = row.map(widthOf);
    const total = widths.reduce((s, x) => s + x, 0) + gap * (row.length - 1);
    let x = cx - total / 2;
    const base = top + cap + ri * lineH;
    row.forEach((w, i) => {
      svg += textSvg({ font, text: w, x, y: base, size, fill: ink, letterSpacing: spacing }).svg;
      box = union(box, { x1: x, y1: base - cap, x2: x + widths[i], y2: base + cap * 0.3 });
      x += widths[i];
      if (i < row.length - 1) {
        const mx = x + gap / 2, my = base - cap / 2;
        svg += `<rect x="${f(mx - dot / 2)}" y="${f(my - dot / 2)}" width="${f(dot)}" height="${f(dot)}" transform="rotate(45 ${f(mx)} ${f(my)})"/>`;
        x += gap;
      }
    });
  });
  return { svg, box };
}

export const wordsearchGenerator: GeneratorServerModule<WordsearchConfig> = {
  config: wordsearchConfig,

  publicAssets(config) {
    const fontOpt = (id: string) => ({ id, label: FONT_LIBRARY.find((x) => x.id === id)?.label ?? id });
    return {
      styles: config.styles.map((id) => {
        const s = WORDSEARCH_STYLES.find((x) => x.id === id)!;
        return { id, label: s.label, labelEn: s.labelEn };
      }),
      fonts: config.fonts.map(fontOpt),
      titleFonts: config.titleFonts.map(fontOpt),
      inks: config.inks.map((hex) => ({ hex, label: wordsearchColorName(hex), labelEn: wordsearchColorName(hex, true) })),
      alphabet: config.alphabet,
      maxWords: config.maxWords,
      wordMinLength: WORDSEARCH_WORD_MIN,
      wordMaxLength: WORDSEARCH_WORD_MAX,
      titleEnabled: config.titleEnabled,
      titleMaxLength: config.titleMaxLength,
      titlePlaceholder: config.titlePlaceholder,
    };
  },

  async compose(config, input) {
    const { fields, choices } = input;

    // Kelimeler: boşlar atlanır, tekrarlar bir kez; tek harf müşteriye söylenir
    const words: string[] = [];
    for (let i = 1; i <= config.maxWords; i++) {
      const raw = fields[`word_${i}`];
      if (raw == null || !String(raw).trim()) continue;
      const w = cleanWordsearchWord(raw, config.alphabet);
      if (!w) continue;
      if (Array.from(w).length < WORDSEARCH_WORD_MIN) {
        throw new GeneratorInputError(
          `"${w}" çok kısa; her kelime en az ${WORDSEARCH_WORD_MIN} harf olmalı`,
          `"${w}" is too short; each word needs at least ${WORDSEARCH_WORD_MIN} letters`,
        );
      }
      if (!words.includes(w)) words.push(w);
    }
    if (!words.length) throw new GeneratorInputError("En az bir kelime yazın", "Enter at least one word");
    // Yerleşim harf harf çalışır: birleşik karakterler (ör. ayrık nokta) tek hücreye
    const cells = words.map((w) => Array.from(w));
    if (cells.some((c, i) => c.length !== words[i].length)) {
      throw new GeneratorInputError("Kelimelerde desteklenmeyen bir harf var", "A word contains an unsupported letter");
    }

    const style = pickAllowed(choices.style, config.styles);
    const fontId = pickAllowed(choices.font, config.fonts);
    const titleFontId = pickAllowed(choices.titleFont, config.titleFonts);
    const color = cleanColor(choices.ink, config.inks[0]).toLowerCase();
    const ink = config.inks.includes(color) ? color : config.inks[0];
    const title = config.titleEnabled ? cleanText(fields.title, config.titleMaxLength) : "";

    const font = await loadLibraryFont(fontId);
    for (const w of words) assertGlyphs(font, w);
    const titleFont = title ? await loadLibraryFont(titleFontId) : null;
    if (titleFont) assertGlyphs(titleFont, title);

    const pz = buildPuzzle(words, config);
    const G = pz.n * C;
    const stroke = C * 0.055;

    // Tablo + kapsüller + çerçeve
    const letters = drawGrid(font, pz);
    let body = letters.svg;
    let box: Box = letters.box ?? { x1: 0, y1: 0, x2: G, y2: G };
    let lines = "";
    if (style === "solved") {
      lines += drawCapsules(pz, stroke);
      box = union(box, { x1: 0, y1: 0, x2: G, y2: G });
    }
    const m = C * 0.42;
    if (config.frame) {
      const fs = C * 0.04;
      lines += `<rect x="${f(-m)}" y="${f(-m)}" width="${f(G + 2 * m)}" height="${f(G + 2 * m)}" rx="${f(C * 0.32)}" fill="none" stroke-width="${f(fs)}"/>`;
      box = union(box, { x1: -m - fs / 2, y1: -m - fs / 2, x2: G + m + fs / 2, y2: G + m + fs / 2 });
    }
    const outer = { x1: config.frame ? -m : 0, x2: config.frame ? G + m : G };
    const outerW = outer.x2 - outer.x1;

    // Başlık: tablonun üstünde, çerçeve genişliğine sığacak kadar
    if (title && titleFont) {
      const script = WORDSEARCH_SCRIPT_FONTS.includes(titleFontId);
      const capT = Math.min(C * 1.3, Math.max(C * 0.78, G * 0.075)) * (script ? 1.35 : 1);
      const size0 = capT / capRatio(titleFont);
      const spacing = script ? 0 : 0.03;
      const cx = G / 2;
      const probe = textSvg({ font: titleFont, text: title, x: cx, y: 0, size: size0, fill: ink, anchor: "middle", maxWidth: outerW, letterSpacing: spacing });
      const ib = textInk(titleFont, title, probe.size);
      const topEdge = config.frame ? box.y1 : Math.min(box.y1, 0);
      const baseline = topEdge - C * 0.6 - (ib?.y2 ?? 0);
      const r = textSvg({ font: titleFont, text: title, x: cx, y: baseline, size: size0, fill: ink, anchor: "middle", maxWidth: outerW, letterSpacing: spacing });
      body += r.svg;
      box = union(box, {
        x1: cx - r.width / 2 + (ib?.x1 ?? 0), y1: baseline + (ib?.y1 ?? -capT),
        x2: cx - r.width / 2 + (ib?.x2 ?? r.width), y2: baseline + (ib?.y2 ?? 0),
      });
    }

    // Kelime listesi: tablonun altında
    if (config.wordList) {
      const capL = Math.max(C * 0.3, G * 0.028);
      const bottom = config.frame ? G + m : G;
      const list = drawWordList(font, words, ink, bottom + C * 0.62, G / 2, outerW, capL);
      body += list.svg;
      if (list.box) box = union(box, list.box);
    }

    const vw0 = box.x2 - box.x1, vh0 = box.y2 - box.y1;
    const pad = Math.max(vw0, vh0) * 0.03;
    const vx = box.x1 - pad, vy = box.y1 - pad;
    const vw = vw0 + pad * 2, vh = vh0 + pad * 2;
    const k = OUT_LONG / Math.max(vw, vh);
    const width = Math.round(vw * k);
    const height = Math.round(vh * k);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}">`
      + `<g fill="${ink}">${body}</g>`
      + `<g stroke="${ink}" stroke-linejoin="round" fill="none">${lines}</g>`
      + `</svg>`;
    const buffer = await sharp(Buffer.from(svg), { limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
    return { buffer, width, height };
  },
};
