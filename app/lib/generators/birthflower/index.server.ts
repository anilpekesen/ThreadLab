import sharp from "sharp";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { FONT_LIBRARY } from "../../font-library";
import { cleanText, loadLibraryFont, pickAllowed, textInk, textSvg } from "../svg-text.server";
import {
  BIRTH_MONTHS, BIRTHFLOWER_INKS, BIRTHFLOWER_LAYOUTS, BIRTHFLOWER_STYLES,
  birthflowerConfig, type BirthflowerConfig, type BirthflowerLayout,
} from "./config";
import { FLOWERS, HEAD_EXTENT, type Part } from "./flowers.server";
import { type Mat, type Pt, Path, chain, poly, rot, smooth, tr } from "./geometry.server";
import { partsBox, partsSvg, type Box } from "./render.server";

/**
 * Doğum çiçeği üreticisi: kişileri (isim + ay) çiçeklere çevirir, seçilen
 * düzende yerleştirir ve baskıya hazır şeffaf PNG çizer.
 *
 * Yerleşim soyut birimlerde yapılır (çiçek başı ≈ 100 birim yarıçap); en son
 * tasarım 2600×3000 px kutuya sığacak ölçekle rasterleşir. Çizgi kalınlığı
 * piksel cinsinden seçilip birime çevrilir: az kişide büyük çiçek, çok kişide
 * küçük çiçek olsa da çizgi baskıda hep okunur kalınlıkta çıkar.
 */

const FIT_W = 2600;
const FIT_H = 3000;

interface Person { name: string; month: number }

interface TextItem { text: string; x: number; y: number; size: number; anchor: "start" | "middle"; maxWidth?: number }

interface Scene { parts: Part[]; texts: TextItem[] }

const mapParts = (parts: Part[], m: Mat): Part[] => parts.map((p) => ({ ...p, path: p.path.map(m) }));

/** Sabit tohum: aynı girdi her seferinde aynı çizimi verir (sepet ve baskı aynı olsun) */
function seedOf(p: Person, i: number): number {
  let h = 17 + i * 31 + p.month * 7;
  for (const ch of p.name) h = (h * 33 + ch.charCodeAt(0)) % 100003;
  return h;
}

// ── Kurdele ────────────────────────────────────────────────────────────

/** Buketin boğumundaki fiyonk: iki ilmek, düğüm ve V kesikli iki uç */
function bow(color: string): Part[] {
  const fill = (path: Path): Part => ({ path, role: "fill", color });
  const vein = (path: Path): Part => ({ path, role: "vein" });
  const out: Part[] = [];
  const tail = (sd: number, end: Pt) => {
    // Kurdele ucu: hafif dalgalı şerit, ucunda V kesik
    const w = 13;
    const a: Pt = [sd * 6, 8];
    const dx = end[0] - a[0], dy = end[1] - a[1];
    const l = Math.hypot(dx, dy);
    const nx = -dy / l, ny = dx / l;
    const mid: Pt = [a[0] + dx * 0.5 + nx * sd * 10, a[1] + dy * 0.5 + ny * sd * 10];
    const side = (p: Pt, k: number): Pt => [p[0] + nx * w * k, p[1] + ny * w * k];
    return poly([
      side(a, -0.8), side(mid, -1), side(end, -1.1),
      [end[0] - dx / l * 16, end[1] - dy / l * 16],
      side(end, 1.1), side(mid, 1), side(a, 0.8),
    ], true);
  };
  out.push(fill(tail(-1, [-58, 128])));
  out.push(fill(tail(1, [52, 138])));
  for (const sd of [-1, 1]) {
    out.push(fill(smooth([[sd * 6, -6], [sd * 40, -46], [sd * 84, -52], [sd * 102, -26], [sd * 88, 6], [sd * 46, 12], [sd * 10, 8]], true)));
    out.push(vein(smooth([[sd * 18, -2], [sd * 50, -18], [sd * 78, -24]])));
  }
  out.push(fill(smooth([[-15, -16], [0, -20], [15, -16], [18, 4], [14, 20], [0, 23], [-14, 20], [-18, 4]], true)));
  return out;
}

// ── Düzenler ───────────────────────────────────────────────────────────

function flowerAt(p: Person, i: number, opts: { stemLen: number; leafFrom: number; leafTo: number; basal?: number; bend?: number; flip?: boolean }, m: Mat): Part[] {
  const draw = FLOWERS[p.month];
  const seed = seedOf(p, i);
  const parts = draw({
    stemLen: opts.stemLen,
    bend: opts.bend ?? ((seed % 21) - 10),
    leafFrom: opts.leafFrom,
    leafTo: opts.leafTo,
    basal: opts.basal,
    flip: opts.flip ?? i % 2 === 1,
    seed,
  });
  return mapParts(parts, m);
}

/** Yan yana: her kişinin çiçeği ve altında adı; 6+ kişide iki sıra */
function rowScene(people: Person[]): Scene {
  const parts: Part[] = [];
  const texts: TextItem[] = [];
  const n = people.length;
  const rows = n <= 5 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const cw = 280;
  const stemLen = 330;
  const nameY = stemLen + 100;
  const rowH = nameY + 90 + 190;
  people.forEach((p, i) => {
    const r = Math.floor(i / perRow);
    const inRow = r === rows - 1 ? n - perRow * r : perRow;
    const c = i - r * perRow;
    const x = (c - (inRow - 1) / 2) * cw;
    const y = r * rowH;
    parts.push(...flowerAt(p, i, { stemLen, leafFrom: 0.34, leafTo: 0.84 }, tr(x, y)));
    if (p.name) texts.push({ text: p.name, x, y: y + nameY, size: 72, anchor: "middle", maxWidth: cw * 0.94 });
  });
  return { parts, texts };
}

/**
 * Buket: saplar aşağıda tek noktada (G = 0,0) toplanır, fiyonkla bağlanır ve
 * boğumun altında ters yöne açılır. Ortadaki çiçekler önde çizilir.
 */
function bouquetScene(people: Person[], ribbon: string): Scene {
  const parts: Part[] = [];
  const texts: TextItem[] = [];
  const n = people.length;
  const tail = 150;
  // 6+ kişide iki kat: arkada uzun saplı geniş bir yay, önde kısa saplı
  // küçük bir yay; öndekiler arkadakilerin arasına düşer.
  const back = n >= 6 ? Math.ceil(n / 2) + (n === 8 ? 1 : 0) : n;
  const front = n - back;
  const arc = (k: number, spread: number) => Array.from({ length: k }, (_, j) => (k === 1 ? 0 : (j / (k - 1) - 0.5) * spread));
  const backAngles = arc(back, n >= 6 ? Math.min(100, 27 * (back - 1)) : Math.min(100, 34 * (n - 1)));
  const frontAngles = arc(front, 29 * (front - 1));
  // Kişiler soldan sağa: arka ve ön kat açılarına sırayla dağıtılır
  const slots = [
    ...backAngles.map((theta) => ({ theta, tier: 0 })),
    ...frontAngles.map((theta) => ({ theta, tier: 1 })),
  ].sort((a, b) => a.theta - b.theta || a.tier - b.tier);
  const items = people.map((p, i) => {
    const { theta, tier } = slots[i];
    const u = spreadOf(theta);
    // Ortadakiler uzun, kenardakiler kısa; tek katta kalabalıksa bir içeri bir dışarı
    let d = n === 1 ? 300 : n >= 6 ? (tier === 0 ? 440 - 50 * u : 300) : 330 + 60 * (1 - u);
    if (n >= 4 && n <= 5 && i % 2 === 1) d -= 80;
    if (HEAD_EXTENT[p.month].top > 120) d += 10;
    return { p, i, theta, d, tier };
  });
  function spreadOf(theta: number) {
    return Math.min(1, Math.abs(theta) / 55);
  }
  // Arkadan öne: önce arka kat, her katta kenardakiler önce
  const order = [...items].sort((a, b) => a.tier - b.tier || Math.abs(b.theta) - Math.abs(a.theta) || a.d - b.d);
  for (const it of order) {
    const stemLen = it.d + tail;
    const m = chain(rot(it.theta), tr(0, -it.d));
    parts.push(...flowerAt(it.p, it.i, {
      stemLen,
      // Kalabalık buketlerde yapraklar fiyonkun üstünde bir yeşillik kuşağı olur
      leafFrom: n >= 4 ? (it.d - 170) / stemLen : 0.36,
      leafTo: (it.d - 70) / stemLen,
      // Kenardaki çiçeklerin yaprakları ve kavisleri buketin içine dönsün
      flip: it.theta > 1 ? true : it.theta < -1 ? false : undefined,
      basal: (it.d - 60) / stemLen,
      bend: 0,
    }, m));
  }
  parts.push(...bow(ribbon));
  // İsimler buketin altında tek ya da iki satır
  const names = people.map((p) => p.name).filter(Boolean);
  if (names.length) {
    const lines = names.length > 4 ? [names.slice(0, Math.ceil(names.length / 2)), names.slice(Math.ceil(names.length / 2))] : [names];
    lines.forEach((line, li) => texts.push({ text: line.join("  ·  "), x: 0, y: tail + 125 + li * 105, size: 78, anchor: "middle", maxWidth: Math.max(700, 280 * Math.min(n, 4)) }));
  }
  return { parts, texts };
}

/** Tek çiçek: büyük çiçek, ad sapın yanında boş kalan en uygun yükseklikte */
function singleScene(p: Person): Scene {
  const stemLen = 430;
  const parts = flowerAt(p, 0, { stemLen, leafFrom: 0.3, leafTo: 0.62, bend: -24 }, tr(0, 0));
  const texts: TextItem[] = [];
  if (p.name) {
    const size = 96;
    // Adın gireceği yükseklik bandında sağa en az taşan yeri seç
    let best = { y: stemLen * 0.8, x: Infinity };
    for (let k = 0; k <= 8; k++) {
      const y = stemLen * (0.45 + k * 0.05);
      let maxX = -Infinity;
      for (const part of parts) {
        for (const [px, py] of part.path.points()) if (py > y - size * 0.9 && py < y + size * 0.4 && px > maxX) maxX = px;
      }
      if (!Number.isFinite(maxX)) maxX = 0;
      if (maxX < best.x - 8) best = { y, x: maxX };
    }
    texts.push({ text: p.name, x: best.x + 50, y: best.y, size, anchor: "start", maxWidth: 330 });
  }
  return { parts, texts };
}

// ── Çizim ──────────────────────────────────────────────────────────────

async function renderPng(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { limitInputPixels: false }).resize(width, height).png().toBuffer();
}

/** PNG'yi saydam olmayan piksellerin sınırına + payla kırpar */
async function trimToInk(png: Buffer, margin: number): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(png).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let x1 = W, y1 = H, x2 = -1, y2 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (data[row + x] > 8) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return { buffer: png, width: W, height: H };
  const left = Math.max(0, x1 - margin), top = Math.max(0, y1 - margin);
  const width = Math.min(W, x2 + margin + 1) - left, height = Math.min(H, y2 + margin + 1) - top;
  const buffer = await sharp(png).extract({ left, top, width, height }).png({ compressionLevel: 9 }).toBuffer();
  return { buffer, width, height };
}

export const birthflowerGenerator: GeneratorServerModule<BirthflowerConfig> = {
  config: birthflowerConfig,

  publicAssets(config) {
    return {
      styles: BIRTHFLOWER_STYLES.filter((s) => config.styles.includes(s.id)).map(({ id, label, labelEn }) => ({ id, label, labelEn })),
      layouts: config.layouts
        .map((id) => BIRTHFLOWER_LAYOUTS.find((l) => l.id === id)!)
        .map(({ id, label, labelEn }) => ({ id, label, labelEn })),
      fonts: config.fonts.map((id) => ({ id, label: FONT_LIBRARY.find((f) => f.id === id)?.label ?? id })),
      inks: config.inks.map((id) => BIRTHFLOWER_INKS.find((i) => i.id === id)!).filter(Boolean),
      months: BIRTH_MONTHS,
      maxPeople: config.maxPeople,
      nameMaxLength: config.nameMaxLength,
      titleEnabled: config.titleEnabled,
      titleMaxLength: config.titleMaxLength,
      titlePlaceholder: config.titlePlaceholder,
    };
  },

  async compose(config, input) {
    const { fields, choices } = input;
    const style = pickAllowed(choices.style, config.styles);
    const layout: BirthflowerLayout = pickAllowed(choices.layout, config.layouts);
    const fontId = pickAllowed(choices.font, config.fonts);
    const inkId = pickAllowed(choices.ink, config.inks);
    const ink = BIRTHFLOWER_INKS.find((i) => i.id === inkId)?.hex ?? "#1a1a1a";

    const people: Person[] = [];
    for (let i = 1; i <= config.maxPeople; i++) {
      const month = Math.round(Number(fields[`month_${i}`] ?? choices[`month_${i}`]));
      if (!Number.isInteger(month) || month < 1 || month > 12) continue;
      people.push({ month, name: cleanText(fields[`name_${i}`], config.nameMaxLength) });
    }
    if (!people.length) throw new GeneratorInputError("En az bir kişi için doğum ayını seçin");
    const title = config.titleEnabled ? cleanText(fields.title, config.titleMaxLength) : "";

    // Kurdele: renkli stilde toz pembe; tek renkli stillerde mürekkeple aynı
    const scene = layout === "row" ? rowScene(people)
      : layout === "single" ? singleScene(people[0])
      : bouquetScene(people, "#ecc3cb");

    const font = await loadLibraryFont(fontId);

    // Sınır kutusu: çiçekler + metinler (+ en üstte başlık)
    const box = partsBox(scene.parts) ?? { x: -100, y: -100, w: 200, h: 200 };
    let x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h;
    const measured = scene.texts.map((t) => {
      const r = textSvg({ font, text: t.text, x: t.x, y: t.y, size: t.size, fill: ink, anchor: t.anchor, maxWidth: t.maxWidth });
      const ib = textInk(font, t.text, r.size);
      const left = t.anchor === "middle" ? t.x - r.width / 2 : t.x;
      x1 = Math.min(x1, left + (ib?.x1 ?? 0));
      x2 = Math.max(x2, left + (ib?.x2 ?? r.width));
      y1 = Math.min(y1, t.y + (ib?.y1 ?? -t.size));
      y2 = Math.max(y2, t.y + (ib?.y2 ?? t.size * 0.3));
      return r.svg;
    });
    if (title) {
      const size = 110;
      const maxWidth = Math.max((x2 - x1) * 0.96, 520);
      const cx = (x1 + x2) / 2;
      const r0 = textSvg({ font, text: title, x: cx, y: 0, size, fill: ink, anchor: "middle", maxWidth });
      const ib = textInk(font, title, r0.size);
      const baseline = y1 - 70 - (ib?.y2 ?? 0);
      const r = textSvg({ font, text: title, x: cx, y: baseline, size, fill: ink, anchor: "middle", maxWidth });
      measured.push(r.svg);
      y1 = baseline + (ib?.y1 ?? -size);
      x1 = Math.min(x1, cx - r.width / 2);
      x2 = Math.max(x2, cx + r.width / 2);
    }

    // Ölçek ve çizgi kalınlığı: çiçek başının basılı boyutuna göre
    const pad = 60;
    const bw = x2 - x1 + pad * 2, bh = y2 - y1 + pad * 2;
    const scale = Math.min(FIT_W / bw, FIT_H / bh);
    const headPx = 100 * scale;
    const strokePx = Math.min(14, Math.max(6, headPx * 0.045));
    const stroke = strokePx / scale;
    const view: Box = { x: x1 - pad, y: y1 - pad, w: bw, h: bh };
    const W = Math.round(bw * scale), H = Math.round(bh * scale);

    const art = partsSvg(scene.parts, style, ink, stroke, view);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}">${art}${measured.join("")}</svg>`;
    const png = await renderPng(svg, W, H);
    return trimToInk(png, Math.round(Math.max(W, H) * 0.02));
  },
};
