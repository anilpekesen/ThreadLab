import sharp from "sharp";
import { loadFont, glyphPathData, inkBox } from "./text-render.server";
import { PRINT_SCALE } from "./generators/svg-text.server";
import { findLibraryFont, FONT_LIBRARY } from "./font-library";
import {
  WORDART_SHAPES,
  wordArtShapePath,
  findPalette,
  isWordArtShape,
  PHOTO_PALETTE_ID,
  normalizeLetter,
  parseWordArtWords,
  type WordArtChoices,
  type WordArtShapeId,
  type WordArtTemplateConfig,
  type WordArtWord,
} from "./wordart";

/**
 * Kelime sanatı: kelimeleri bir siluetin içine, üst üste binmeden dizer.
 *
 * Yöntem wordcloud2 ile aynı fikir, ama kelimeler piksel piksel değil mürekkep
 * kutularıyla (dikdörtgen) yerleşiyor:
 *
 *   1. Şekil kaba bir ızgaraya (~400 hücre) çizilir; şeklin dışı "dolu" sayılır.
 *   2. Kelimeler büyükten küçüğe denenir. Bir kelime ancak kutusunun her
 *      hücresi boşsa yerleşir; kontrol integral görüntüyle O(1).
 *   3. Önce her kelime en az bir kez yerleşir (öne çıkanlar ortaya yakın ve
 *      büyük), sonra `repeatWords` açıksa kelimeler küçülen puntolarla
 *      tekrar edilerek boşluklar doldurulur.
 *
 * Çıktı yazıların fonttan alınmış yollarıyla (glyph path) çizilen şeffaf bir
 * PNG: sunucuda font kurulumu gerekmez, her ortamda aynı basılır.
 */

export interface ComposeWordArtOptions {
  words: WordArtWord[];
  config: WordArtTemplateConfig;
  shape: WordArtShapeId;
  /** Harf şekli için harf */
  letter: string;
  /** Kütüphane font kimliği */
  fontId: string;
  colors: string[];
  seed: number;
  /**
   * "Fotoğrafım" şekli için arka planı silinmiş fotoğraf (RGBA). Siluet
   * maske olur; `photoColors` açıksa her kelime fotoğrafta durduğu yerin
   * rengini alır — uzaktan bakınca kelimelerden oluşmuş bir portre.
   */
  photo?: Buffer | null;
  photoColors?: boolean;
}

export interface ComposeWordArtResult {
  buffer: Buffer;
  width: number;
  height: number;
  placed: number;
  /** Hiç yerleşemeyen kelimeler — çok uzun ya da şekil çok dar */
  skipped: string[];
}

/** Tekrarlarla birlikte yerleşecek en fazla kelime; dosya boyutu ve süre sınırı */
const MAX_PLACEMENTS = 2600;
/** Izgaranın uzun kenarındaki hücre sayısı */
const GRID_LONG_SIDE = 420;
/** Harf siluetinde kullanılan kalın font; gövdesi kalın olduğu için içi dolar */
const LETTER_FONT_ID = "archivo-black";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const esc = (s: string) => s.replace(/[<>&"]/g, "");

/** Müşteri aynı kelimelerle sınırsız dizilim denemesin */
const MAX_VARIANT = 20;

/**
 * Müşterinin kelimelerini ve seçimlerini şablonun izin verdiği ölçüde
 * yerleşim seçeneklerine çevirir. Şablonun açmadığı bir şekil, font ya da
 * palet gelirse sessizce ilk izinli değere dönülür: eski ya da kötü niyetli
 * bir istemci kapalı bir seçeneği gönderip üretimi değiştiremez.
 */
export function resolveWordArtRequest(
  config: WordArtTemplateConfig,
  rawWords: string | string[],
  choices: WordArtChoices,
): ComposeWordArtOptions | { error: string } {
  const words = parseWordArtWords(rawWords, config);
  if (words.length === 0) return { error: "En az bir kelime yazın" };

  const shape = isWordArtShape(choices.shape) && config.shapes.includes(choices.shape)
    ? choices.shape : config.shapes[0];
  const fontId = choices.font && config.fonts.includes(choices.font) ? choices.font : config.fonts[0];
  // Fotoğraf rengi paleti yalnızca fotoğraf şekliyle anlamlı; başka şekilde
  // seçilirse ya da ilk palet oysa ilk normal palete dönülür
  const usable = config.palettes.filter((p) => p !== PHOTO_PALETTE_ID || shape === "photo");
  const paletteId = choices.palette && usable.includes(choices.palette)
    ? choices.palette : (usable[0] ?? "black");
  const photoColors = paletteId === PHOTO_PALETTE_ID;
  const colors = photoColors ? ["#111111"] : findPalette(paletteId)?.colors ?? ["#111111"];
  const variant = Math.min(MAX_VARIANT, Math.max(0, Math.floor(Number(choices.variant) || 0)));

  return {
    words,
    config,
    shape,
    letter: normalizeLetter(choices.letter) || config.defaultLetter,
    fontId,
    colors,
    photoColors,
    seed: config.seed + variant * 977,
  };
}

interface ShapeGeometry {
  /** Çıktı PNG ölçüsü — şeklin kendi kutusu, tuvalin içinde oranı korunmuş */
  width: number;
  height: number;
  /** Şeklin çıktı koordinatındaki SVG gövdesi (`<path>` ya da `<g>`) */
  svgBody: string;
}

async function buildShape(
  shape: WordArtShapeId,
  letter: string,
  canvasW: number,
  canvasH: number,
): Promise<ShapeGeometry> {
  if (shape === "letter") {
    const lib = findLibraryFont(`/fonts/library/${LETTER_FONT_ID}.ttf`);
    const font = lib ? await loadFont(lib.url) : null;
    const ch = letter || "A";
    const box = font ? inkBox(font, ch, 1000) : null;
    const paths = font ? glyphPathData(font, ch, 1000) : [];
    if (font && box && paths.length) {
      const gw = box.x2 - box.x1;
      const gh = box.y2 - box.y1;
      const scale = Math.min(canvasW / gw, canvasH / gh);
      const width = Math.round(gw * scale);
      const height = Math.round(gh * scale);
      const body = `<g transform="scale(${scale}) translate(${-box.x1} ${-box.y1})">`
        + paths.map((d) => `<path d="${d}"/>`).join("") + `</g>`;
      return { width, height, svgBody: body };
    }
    // Font okunamazsa kalbe düşülür; sipariş düşmesin
    shape = "heart";
  }

  const aspect = WORDART_SHAPES.find((s) => s.id === shape)?.aspect ?? 1;
  let width = canvasW;
  let height = Math.round(canvasW / aspect);
  if (height > canvasH) {
    height = canvasH;
    width = Math.round(canvasH * aspect);
  }
  const d = wordArtShapePath(shape as Exclude<WordArtShapeId, "letter" | "photo">, width, height);
  return { width, height, svgBody: `<path d="${d}"/>` };
}

interface Placement {
  text: string;
  size: number;
  rotated: boolean;
  /** Kelimenin SVG dönüşümü (çıktı pikseli) */
  tx: number;
  ty: number;
  color: string;
  paths: string[];
}

export async function composeWordArt(opts: ComposeWordArtOptions): Promise<ComposeWordArtResult> {
  const { config, words } = opts;
  const rnd = mulberry32(opts.seed);

  const libFont = findLibraryFont(`/fonts/library/${opts.fontId}.ttf`) ?? FONT_LIBRARY[0];
  const font = await loadFont(libFont.url);
  if (!font) throw new Error(`Kelime sanatı fontu yüklenemedi: ${libFont.id}`);

  // Fotoğraf şekli: siluet, şeffaf kenarları kırpılıp tuvale oranı korunarak
  // oturtulur. Diğer şekiller SVG yolundan gelir.
  let photo: sharp.Sharp | null = null;
  let geo: ShapeGeometry;
  if (opts.shape === "photo") {
    if (!opts.photo) throw new Error("Fotoğraf şekli için fotoğraf gerekli");
    const trimmed = await sharp(opts.photo).ensureAlpha().trim({ threshold: 10 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const s = Math.min(config.canvasWidth / (meta.width ?? 1), config.canvasHeight / (meta.height ?? 1));
    geo = { width: Math.round((meta.width ?? 1) * s), height: Math.round((meta.height ?? 1) * s), svgBody: "" };
    photo = sharp(trimmed);
  } else {
    geo = await buildShape(opts.shape, opts.letter, config.canvasWidth, config.canvasHeight);
  }
  const W = geo.width;
  const H = geo.height;

  // ── Izgara ve şekil maskesi ────────────────────────────────────────────
  const cell = Math.max(2, Math.ceil(Math.max(W, H) / GRID_LONG_SIDE));
  const gw = Math.ceil(W / cell);
  const gh = Math.ceil(H / cell);

  // Fotoğrafta ızgara boyunda RGBA tutulur: alfa maske, RGB kelime rengi
  let photoGrid: Buffer | null = null;
  let alpha: Buffer;
  if (photo) {
    photoGrid = await photo.clone().resize(gw, gh, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    alpha = Buffer.alloc(gw * gh);
    for (let i = 0; i < gw * gh; i++) alpha[i] = photoGrid[i * 4 + 3];
  } else {
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${gh}" viewBox="0 0 ${gw * cell} ${gh * cell}">`
      + `<g fill="#fff">${geo.svgBody}</g></svg>`;
    alpha = await sharp(Buffer.from(maskSvg))
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer();
  }

  // 1 = dolu (şeklin dışı ya da bir kelime). Kenarda yarım kalan hücreler de
  // dolu sayılıyor: harfin şeklin dışına taşmasındansa hafif boşluk yeğ.
  // Fotoğraf silueti yumuşak kenarlı; orada yarı saydamlık eşiği daha düşük.
  const alphaMin = photo ? 128 : 200;
  const blocked = new Uint8Array(gw * gh);
  const inside: number[] = [];
  for (let i = 0; i < gw * gh; i++) {
    if (alpha[i] < alphaMin) blocked[i] = 1;
    else inside.push(i);
  }
  if (inside.length === 0) throw new Error("Şekil boş çıktı");

  /** Kelimenin kapladığı hücrelerin fotoğraftaki ortalama rengi */
  const photoColorAt = (x: number, y: number, w: number, h: number): string => {
    if (!photoGrid) return "#111111";
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * gw + xx) * 4;
        if (photoGrid[i + 3] < alphaMin) continue;
        r += photoGrid[i]; g += photoGrid[i + 1]; b += photoGrid[i + 2]; n++;
      }
    }
    if (!n) return "#111111";
    const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };

  // Integral görüntü: dikdörtgen içindeki dolu hücre sayısı O(1)
  const iw = gw + 1;
  const integral = new Int32Array(iw * (gh + 1));
  const rebuildIntegral = (y0: number) => {
    for (let y = Math.max(0, y0); y < gh; y++) {
      let row = 0;
      for (let x = 0; x < gw; x++) {
        row += blocked[y * gw + x];
        integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row;
      }
    }
  };
  rebuildIntegral(0);
  const rectSum = (x: number, y: number, w: number, h: number) =>
    integral[(y + h) * iw + x + w] - integral[y * iw + x + w]
    - integral[(y + h) * iw + x] + integral[y * iw + x];

  // Aday hücre sıraları: öne çıkanlar merkeze yakın başlar, diğerleri karışık
  const cx = gw / 2;
  const cy = gh / 2;
  const centerOrder = inside
    .map((i) => {
      const dx = (i % gw) - cx;
      const dy = Math.floor(i / gw) - cy;
      return { i, d: dx * dx + dy * dy + rnd() * gw * 2 };
    })
    .sort((a, b) => a.d - b.d)
    .map((o) => o.i);
  const randomOrder = shuffle(inside.slice(), rnd);

  const placements: Placement[] = [];
  const pad = (size: number) => Math.max(cell * 0.5, size * 0.045);
  const inkCache = new Map<string, { x1: number; y1: number; x2: number; y2: number } | null>();
  const ink = (text: string) => {
    if (!inkCache.has(text)) inkCache.set(text, inkBox(font, text, 1000));
    return inkCache.get(text)!;
  };

  const tryPlace = (text: string, size: number, rotated: boolean, order: number[], color: string): boolean => {
    const b0 = ink(text);
    if (!b0) return false;
    const k = size / 1000;
    const inkW = (b0.x2 - b0.x1) * k;
    const inkH = (b0.y2 - b0.y1) * k;
    const p = pad(size);
    const boxW = rotated ? inkH : inkW;
    const boxH = rotated ? inkW : inkH;
    const cw = Math.ceil((boxW + 2 * p) / cell);
    const ch = Math.ceil((boxH + 2 * p) / cell);
    if (cw > gw || ch > gh) return false;

    for (const idx of order) {
      if (blocked[idx]) continue;
      const x = Math.min(gw - cw, Math.max(0, (idx % gw) - (cw >> 1)));
      const y = Math.min(gh - ch, Math.max(0, Math.floor(idx / gw) - (ch >> 1)));
      if (rectSum(x, y, cw, ch) !== 0) continue;

      for (let yy = y; yy < y + ch; yy++) blocked.fill(1, yy * gw + x, yy * gw + x + cw);
      rebuildIntegral(y);

      // Kelimeyi hücre kutusunun ortasına oturt
      const bx = x * cell + (cw * cell - boxW) / 2;
      const by = y * cell + (ch * cell - boxH) / 2;
      const x1 = b0.x1 * k, y1 = b0.y1 * k, x2 = b0.x2 * k;
      // rotate(-90): (x, y) → (y, -x); kelime aşağıdan yukarı okunur
      const tx = rotated ? bx - y1 : bx - x1;
      const ty = rotated ? by + x2 : by - y1;
      const fill = opts.photoColors ? photoColorAt(x, y, cw, ch) : color;
      placements.push({ text, size, rotated, tx, ty, color: fill, paths: glyphPathData(font, text, size) });
      return true;
    }
    return false;
  };

  const pickColor = () => opts.colors[Math.floor(rnd() * opts.colors.length)] ?? "#111111";
  const pickRotation = (featured: boolean) => {
    if (config.orientation === "vertical") return true;
    if (config.orientation === "horizontal" || featured) return false;
    return rnd() < 0.3;
  };

  // Puntoyu çıktı ölçüsüne göre ayarla: tuvalden küçük bir şekilde (harf)
  // aynı punto oransız büyük kalırdı
  const scale = Math.max(W, H) / Math.max(config.canvasWidth, config.canvasHeight);
  // Fotoğraf renklerinde portre ancak çok sayıda küçük kelimeyle seçiliyor:
  // büyük kelime yüzün ayrıntısını tek renkle örtüyor
  const maxSize = config.maxFontPx * scale * (opts.photoColors ? 0.22 : 1);
  const minSize = config.minFontPx;
  const levels: number[] = [];
  for (let s = maxSize; s > minSize; s *= 0.9) levels.push(s);
  levels.push(minSize);

  // ── 1. Her kelime en az bir kez ─────────────────────────────────────────
  const ordered = [...words.filter((w) => w.featured), ...words.filter((w) => !w.featured)];
  const skipped: string[] = [];
  for (const w of ordered) {
    const startIdx = w.featured ? 0 : Math.min(levels.length - 1, Math.floor(levels.length * 0.35));
    let ok = false;
    for (let li = startIdx; li < levels.length && !ok; li++) {
      ok = tryPlace(w.text, levels[li], pickRotation(w.featured), w.featured ? centerOrder : randomOrder, pickColor());
    }
    if (!ok) skipped.push(w.text);
  }

  // ── 2. Boşlukları tekrarlarla doldur ───────────────────────────────────
  if (config.repeatWords && ordered.length) {
    const fillStart = Math.min(levels.length - 1, Math.floor(levels.length * 0.45));
    for (let li = fillStart; li < levels.length && placements.length < MAX_PLACEMENTS; li++) {
      for (let pass = 0; pass < 40 && placements.length < MAX_PLACEMENTS; pass++) {
        let placedThisPass = 0;
        for (const w of shuffle(ordered.slice(), rnd)) {
          const size = levels[li] * (0.92 + rnd() * 0.16);
          if (size < minSize) continue;
          if (tryPlace(w.text, size, pickRotation(false), randomOrder, pickColor())) placedThisPass++;
          if (placements.length >= MAX_PLACEMENTS) break;
        }
        if (placedThisPass === 0) break;
      }
    }
  }

  // ── Çizim ────────────────────────────────────────────────────────────
  const f = (n: number) => Number(n.toFixed(1));
  // Fotoğraf şeklinde zemin rengi uygulanmaz: siluetin SVG yolu yok
  const bg = config.background && geo.svgBody ? `<g fill="${esc(config.background)}">${geo.svgBody}</g>` : "";
  const body = placements.map((p) => {
    const t = p.rotated ? `translate(${f(p.tx)} ${f(p.ty)}) rotate(-90)` : `translate(${f(p.tx)} ${f(p.ty)})`;
    return `<g transform="${t}" fill="${esc(p.color)}">${p.paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg}${body}</svg>`;

  // Baskı ölçeğinde: 2400 px baskı alanına büyütülünce yazılar yumuşuyordu
  const buffer = await sharp(Buffer.from(svg), { limitInputPixels: false, density: 72 * PRINT_SCALE })
    .png({ compressionLevel: 8 })
    .toBuffer();

  return { buffer, width: Math.round(W * PRINT_SCALE), height: Math.round(H * PRINT_SCALE), placed: placements.length, skipped };
}
