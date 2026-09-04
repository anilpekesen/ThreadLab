/**
 * Harf şablonu üreticisi — "LOVE", "MOM", "ANNE", bir isim, bir yıl…
 *
 * Tasarım şöyle kuruluyor: yan yana N fotoğraf bir şerit oluşturuyor, üstlerine
 * BEYAZ harfler basılıyor. Yani harfler fotoğrafı kesmiyor, fotoğrafın üstünü
 * örtüyor; okunabilirliği veren de bu.
 *
 * Bunun sistemde zaten karşılığı var: 4 fotoğraf alanı + bir ÜST KATMAN.
 * Üst katman fotoğrafların üstüne çiziliyor (hem tarayıcıda hem baskıda), yani
 * müşterinin gördüğü ile basılan birebir aynı. Slotlara ayrı ayrı maske
 * vermek de mümkündü ama tarayıcı tarafı slot maskesini uygulamıyor — ekranda
 * dörtgen, baskıda harf çıkardı.
 *
 * Üretilen üst katman: beyaz sayfa, fotoğraf dikdörtgenleri delik, deliklerin
 * üstüne beyaz harfler.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import * as opentypeNs from "opentype.js";
const opentype = (opentypeNs as any).default ?? opentypeNs;

export interface HarfSablonu {
  /** Üst katman PNG */
  overlay: Buffer;
  /** Fotoğraf alanları, normalize (0–1) */
  slots: Array<{ id: string; harf: string; rect: { x: number; y: number; w: number; h: number } }>;
}

export interface HarfAyari {
  kelime: string;
  fontYolu: string;
  canvasW: number;
  canvasH: number;
  /** Şeridin tuvaldeki yeri, normalize */
  band: { x: number; y: number; w: number; h: number };
  /** Fotoğraflar arası boşluk, şerit genişliğine oran */
  bosluk?: number;
  /** Harflerin şerit yüksekliğine oranı */
  harfYuksekligi?: number;
}

export async function harfSablonu(a: HarfAyari): Promise<HarfSablonu> {
  const buf = await readFile(a.fontYolu);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  const harfler = [...a.kelime];
  const n = harfler.length;
  const bosluk = a.bosluk ?? 0.012;
  const W = a.canvasW, H = a.canvasH;

  const bandX = a.band.x * W, bandY = a.band.y * H;
  const bandW = a.band.w * W, bandH = a.band.h * H;

  // Her harfe eşit genişlikte bir sütun; referans tasarım da böyle
  const toplamBosluk = bosluk * bandW * (n - 1);
  const sutunW = (bandW - toplamBosluk) / n;

  // Punto: büyük harf yüksekliği şeridin belirlenen oranı kadar olsun
  const capHeight = (font.tables?.os2?.sCapHeight ?? font.unitsPerEm * 0.7);
  const hedefCap = bandH * (a.harfYuksekligi ?? 0.86);
  const fontSize = hedefCap * font.unitsPerEm / capHeight;
  const capPx = capHeight / font.unitsPerEm * fontSize;
  const baseline = bandY + bandH / 2 + capPx / 2;

  const delikler: string[] = [];
  const harfYollari: string[] = [];
  const slots: HarfSablonu["slots"] = [];

  harfler.forEach((harf, i) => {
    const x = bandX + i * (sutunW + bosluk * bandW);
    delikler.push(`M${x},${bandY} h${sutunW} v${bandH} h${-sutunW} Z`);
    slots.push({
      id: `foto_${i + 1}`,
      harf,
      rect: { x: x / W, y: bandY / H, w: sutunW / W, h: bandH / H },
    });

    // Harf sütununda ortalanıyor
    const genislik = font.getAdvanceWidth(harf, fontSize);
    const hx = x + (sutunW - genislik) / 2;
    // opentype'ın kendi toPathData'sı bazı komutlarda NaN üretiyor (metin
    // motorunda da aynı sorun vardı); komutları kendimiz yazıyoruz.
    for (const p of font.getPaths(harf, hx, baseline, fontSize)) {
      const d = yolVerisi(p.commands);
      if (!d) throw new Error(`"${harf}" harfi çizilemedi`);
      harfYollari.push(d);
    }
  });

  // Tek bileşik yol: tuval + fotoğraf dikdörtgenleri (evenodd ile delik olur)
  const beyazSayfa =
    `<path fill="#ffffff" fill-rule="evenodd" d="M0,0 H${W} V${H} H0 Z ${delikler.join(" ")}"/>`;
  const beyazHarfler = harfYollari.map((d) => `<path fill="#ffffff" d="${d}"/>`).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
    + beyazSayfa + beyazHarfler + `</svg>`;

  return { overlay: await sharp(Buffer.from(svg)).png().toBuffer(), slots };
}

/** opentype komutlarını SVG yol verisine çevirir; NaN üretmez. */
function yolVerisi(commands: any[]): string {
  const s = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : null);
  const parcalar: string[] = [];
  for (const c of commands) {
    if (c.type === "M" || c.type === "L") {
      const x = s(c.x), y = s(c.y);
      if (x === null || y === null) return "";
      parcalar.push(`${c.type}${x} ${y}`);
    } else if (c.type === "C") {
      const v = [c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(s);
      if (v.some((k) => k === null)) return "";
      parcalar.push(`C${v.join(" ")}`);
    } else if (c.type === "Q") {
      const v = [c.x1, c.y1, c.x, c.y].map(s);
      if (v.some((k) => k === null)) return "";
      parcalar.push(`Q${v.join(" ")}`);
    } else if (c.type === "Z") {
      parcalar.push("Z");
    }
  }
  return parcalar.join(" ");
}
