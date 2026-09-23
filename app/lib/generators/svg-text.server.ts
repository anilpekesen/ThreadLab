import sharp from "sharp";
import { findLibraryFont, FONT_LIBRARY } from "../font-library";
import { glyphPathData, inkBox, loadFont, measure } from "../text-render.server";
import type * as opentypeNs from "opentype.js";

/**
 * Üreticilerin ortak metin çizimi: metni fontun kendi glif yollarıyla SVG'ye
 * çevirir. Sunucuda font kurulumu gerekmez, her ortamda aynı basılır (bkz.
 * text-render.server).
 */

export async function loadLibraryFont(fontId: string): Promise<opentypeNs.Font> {
  const lib = findLibraryFont(`/fonts/library/${fontId}.ttf`) ?? FONT_LIBRARY[0];
  const font = await loadFont(lib.url);
  if (!font) throw new Error(`Font yüklenemedi: ${lib.id}`);
  return font;
}

export interface TextSvgOptions {
  font: opentypeNs.Font;
  text: string;
  /** Hizalama noktası: anchor'a göre sol, orta ya da sağ; y taban çizgisi */
  x: number;
  y: number;
  size: number;
  fill: string;
  anchor?: "start" | "middle" | "end";
  /** Verilirse metin bu genişliğe sığana kadar küçültülür */
  maxWidth?: number;
  /** Harf aralığı, punto oranı olarak (0.1 = %10) */
  letterSpacing?: number;
  /** Ek SVG öznitelikleri (opacity, stroke...) */
  attrs?: string;
}

export interface TextSvgResult {
  svg: string;
  width: number;
  size: number;
}

const f = (n: number) => Number(n.toFixed(1));
const esc = (s: string) => s.replace(/[<>&"]/g, "");

/**
 * Tek satır metni SVG `<g>` olarak döndürür. Harf aralığı istendiğinde her
 * harf ayrı yerleştirilir (kerning kaybolur, geniş aralıklı başlıklarda fark
 * edilmez).
 */
export function textSvg(o: TextSvgOptions): TextSvgResult {
  const text = o.text ?? "";
  if (!text.trim()) return { svg: "", width: 0, size: o.size };
  let size = o.size;
  const spacingOf = (s: number) => (o.letterSpacing ?? 0) * s;
  const widthAt = (s: number) => {
    if (!o.letterSpacing) return measure(o.font, text, s);
    const chars = Array.from(text);
    return chars.reduce((w, ch) => w + measure(o.font, ch, s), 0) + spacingOf(s) * (chars.length - 1);
  };
  let width = widthAt(size);
  if (o.maxWidth && width > o.maxWidth && width > 0) {
    size = size * (o.maxWidth / width);
    width = widthAt(size);
  }
  const startX = o.anchor === "middle" ? o.x - width / 2 : o.anchor === "end" ? o.x - width : o.x;

  let body = "";
  if (!o.letterSpacing) {
    body = glyphPathData(o.font, text, size).map((d) => `<path d="${d}"/>`).join("");
    return {
      svg: `<g transform="translate(${f(startX)} ${f(o.y)})" fill="${esc(o.fill)}"${o.attrs ? " " + o.attrs : ""}>${body}</g>`,
      width,
      size,
    };
  }
  let cx = 0;
  for (const ch of Array.from(text)) {
    const paths = glyphPathData(o.font, ch, size);
    if (paths.length) body += `<g transform="translate(${f(cx)} 0)">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
    cx += measure(o.font, ch, size) + spacingOf(size);
  }
  return {
    svg: `<g transform="translate(${f(startX)} ${f(o.y)})" fill="${esc(o.fill)}"${o.attrs ? " " + o.attrs : ""}>${body}</g>`,
    width,
    size,
  };
}

/** Metnin gerçek mürekkep kutusu (taban çizgisi 0); dikey ortalama için */
export function textInk(font: opentypeNs.Font, text: string, size: number) {
  return inkBox(font, text, size);
}

/**
 * Metni verilen genişliğe sığacak şekilde satırlara böler (kelime sınırından).
 * Tek kelime genişliği aşarsa olduğu gibi bırakılır; çağıran `maxWidth` ile
 * küçültür.
 */
export function wrapText(font: opentypeNs.Font, text: string, size: number, maxWidth: number, maxLines = 3): string[] {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(font, next, size) > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(" "));
    return head;
  }
  return lines;
}

/** Müşteri metnini temizler: kontrol karakterleri atılır, boşluk sadeleşir, sınır uygulanır */
export function cleanText(v: unknown, maxLength: number): string {
  return Array.from(String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
    .slice(0, maxLength)
    .join("");
}

/** Renk yalnızca #rrggbb biçiminde kabul edilir; değilse yedek döner */
export function cleanColor(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** Seçim izinli listede değilse listenin ilk elemanı */
export function pickAllowed<T extends string>(v: unknown, allowed: readonly T[], fallback?: T): T {
  return (allowed as readonly unknown[]).includes(v) ? (v as T) : (allowed[0] ?? (fallback as T));
}

/**
 * Baskı ölçeği. Üreticiler 2400 px'lik koordinatla çizer; PNG'ye çevirirken
 * bu katla büyütülür (3360 px ≈ 28 cm'de 300 DPI). Tasarım 2400 px çıktığında
 * 28 cm'lik baskı alanına büyütülüyor, ~215 DPI kalıyor ve yazı kenarları
 * yumuşuyordu. Çizimler vektör olduğu için büyütme kayıpsız.
 *
 * Daha büyüğü (ör. 4200 px) tarayıcıda 20+ megapiksel görsel demek; iPhone
 * Safari bu boyutlarda sekmeyi kapatabiliyor.
 */
export const PRINT_SCALE = 1.4;

/** SVG'yi baskı ölçeğinde rasterleştirir (librsvg `density` ile ölçekler) */
export function svgRaster(svg: string, scale = PRINT_SCALE): sharp.Sharp {
  return sharp(Buffer.from(svg), { density: 72 * scale, limitInputPixels: false });
}
