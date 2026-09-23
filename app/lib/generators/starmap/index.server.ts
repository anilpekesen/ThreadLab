import sharp from "sharp";
import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError } from "../types";
import { cleanText, loadLibraryFont, pickAllowed, textInk, textSvg, wrapText, svgRaster } from "../svg-text.server";
import { horizontal, project, skyFrame, zonedTimeToUtc } from "./astro";
import {
  STARMAP_SUBTITLE_MAX,
  STARMAP_THEMES,
  STARMAP_TITLE_MAX,
  STARMAP_YEAR_MAX,
  STARMAP_YEAR_MIN,
  starmapConfig,
  type StarmapConfig,
  type StarmapThemeId,
} from "./config";
import { findStarmapCity, STARMAP_CITIES, TURKEY_CITY_COUNT, type StarmapCity } from "./data/cities";
// JSON import ile veri derlemeye girer; diskten yol aramaya gerek kalmaz
import starsData from "./data/stars.json";
import constellationsData from "./data/constellations.json";

/**
 * Yıldız haritası çizimi. Katalog (d3-celestial, kadir ≤ 5.5, ~2850 yıldız)
 * modül yüklenirken bir kez okunur; her istek yalnız o anın gökyüzünü
 * hesaplar (birkaç ms) ve SVG'yi PNG'ye çevirir.
 */

const W = 2400;
/** Poster (tüm tuval dolgulu) yüksekliği; şeffaf çıktıda içerik kadar kısalır */
const POSTER_H = 3200;
/** Ufuk çemberinin yarıçapı ve dış halka aralığı */
const R = 960;
const RING_GAP = 34;

/** Ham katalog: [ra, dec, kadir] üçlüleri, parlaktan sönüğe */
const STARS: number[] = (starsData as { stars: number[] }).stars;
const LINES: number[][] = (constellationsData as { lines: number[][] }).lines;

interface Palette {
  /** Daire (ve poster modunda tuval) zemini; şeffafta null */
  bg: string | null;
  /** Yıldız ve halka rengi */
  ink: string;
  /** Takımyıldız çizgisi ve ızgara: dolgulu zeminde yarı ton (baskıda saydamlık yerine düz renk) */
  line: string;
  grid: string;
}

const PALETTES: Record<StarmapThemeId, Palette> = {
  navy: { bg: "#13234a", ink: "#ffffff", line: "#8f9fc8", grid: "#4a5f99" },
  black: { bg: "#0b0b0d", ink: "#ffffff", line: "#8a8a92", grid: "#4a4a54" },
  "transparent-light": { bg: null, ink: "#ffffff", line: "#ffffff", grid: "#ffffff" },
  "transparent-dark": { bg: null, ink: "#111111", line: "#111111", grid: "#111111" },
};

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** El yazısı fontlar büyük harfe çevrilmez, aralık açılmaz ve biraz daha büyük basılır */
const SCRIPT_FONTS = new Set(["great-vibes", "dancing-script"]);
const SANS_FONTS = new Set(["montserrat", "poppins", "quicksand", "oswald", "montserrat-black", "archivo-black", "anton"]);

const f1 = (n: number) => Number(n.toFixed(1));

function parseDate(v: unknown): { y: number; m: number; d: number } {
  const s = typeof v === "string" ? v.trim() : "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw new GeneratorInputError("Lütfen geçerli bir tarih seçin.");
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < STARMAP_YEAR_MIN || y > STARMAP_YEAR_MAX) {
    throw new GeneratorInputError(`Tarih ${STARMAP_YEAR_MIN}–${STARMAP_YEAR_MAX} arasında olmalı.`);
  }
  // 31 Şubat gibi var olmayan günler Date'te taşar; geri okuyunca yakalanır
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new GeneratorInputError("Lütfen geçerli bir tarih seçin.");
  }
  return { y, m, d };
}

function parseTime(v: unknown): { h: number; mi: number } {
  const match = /^(\d{1,2}):(\d{2})/.exec(typeof v === "string" ? v.trim() : "");
  if (!match) return { h: 21, mi: 0 };
  const h = Number(match[1]);
  const mi = Number(match[2]);
  if (h > 23 || mi > 59) throw new GeneratorInputError("Lütfen geçerli bir saat seçin.");
  return { h, mi };
}

const pad = (n: number) => String(n).padStart(2, "0");

function dateLine(config: StarmapConfig, date: { y: number; m: number; d: number }, time: { h: number; mi: number }, city: StarmapCity) {
  const en = config.language === "en";
  const months = en ? MONTHS_EN : MONTHS_TR;
  const numeric = config.dateFormat.startsWith("numeric");
  const day = numeric
    ? en ? `${pad(date.m)}/${pad(date.d)}/${date.y}` : `${pad(date.d)}.${pad(date.m)}.${date.y}`
    : en ? `${months[date.m - 1]} ${date.d}, ${date.y}` : `${date.d} ${months[date.m - 1]} ${date.y}`;
  const parts = [day];
  if (config.dateFormat.endsWith("-time")) parts.push(`${pad(time.h)}:${pad(time.mi)}`);
  parts.push(en ? city.nameEn ?? city.name : city.name);
  return parts.join("  ·  ");
}

function coordLine(config: StarmapConfig, city: StarmapCity) {
  const en = config.language === "en";
  const ns = city.lat >= 0 ? (en ? "N" : "K") : (en ? "S" : "G");
  const ew = city.lon >= 0 ? (en ? "E" : "D") : (en ? "W" : "B");
  return `${Math.abs(city.lat).toFixed(4)}° ${ns}, ${Math.abs(city.lon).toFixed(4)}° ${ew}`;
}

/** Kadire göre yarıçap: Sirius ~27 px, en sönük 3.2 px (baskıda kaybolmasın) */
function starRadius(mag: number, scale: number) {
  return scale * (3.2 + 1.3 * Math.pow(Math.max(0, 5.5 - mag), 1.5));
}

/**
 * Gökyüzü dairesinin içi: ızgara, takımyıldız çizgileri, yıldızlar. Hepsi
 * ufuk çemberine kırpılır (kısmen batmış bir çizgi ya da büyük bir yıldızın
 * taşan kenarı halkaya binmesin).
 */
function skySvg(opts: {
  utcMs: number; lat: number; lon: number; cx: number; cy: number;
  pal: Palette; constellations: boolean; grid: boolean; glow: boolean;
}) {
  const { cx, cy, pal } = opts;
  const frame = skyFrame(opts.utcMs, opts.lat, opts.lon);
  const scale = R / 960;
  let out = "";

  if (opts.grid) {
    const dash = `stroke-dasharray="10 22"`;
    let g = "";
    for (const alt of [30, 60]) {
      const r = R * Math.tan(((90 - alt) * Math.PI) / 360);
      g += `<circle cx="${cx}" cy="${cy}" r="${f1(r)}" fill="none"/>`;
    }
    // Azimut çizgileri zenit çevresinde boş bırakılır; merkez düğüm gibi görünmesin
    const inner = R * Math.tan((10 * Math.PI) / 360);
    for (let az = 0; az < 360; az += 45) {
      const a = (az * Math.PI) / 180;
      g += `<line x1="${f1(cx - inner * Math.sin(a))}" y1="${f1(cy - inner * Math.cos(a))}" x2="${f1(cx - R * Math.sin(a))}" y2="${f1(cy - R * Math.cos(a))}"/>`;
    }
    out += `<g fill="none" stroke="${pal.grid}" stroke-width="${f1(4 * scale)}" ${dash}>${g}</g>`;
  }

  if (opts.constellations) {
    let d = "";
    for (const line of LINES) {
      let prev: { x: number; y: number; alt: number } | null = null;
      for (let i = 0; i < line.length; i += 2) {
        const h = horizontal(frame, line[i], line[i + 1]);
        const p = { ...project(h.alt, h.az, cx, cy, R), alt: h.alt };
        // Bir ucu ufkun üstündeyse çizilir; kırpma çemberi ufuk altını keser.
        // Çok aşağıdaki uç izdüşümde sonsuza kaçacağı için -40°'de durulur.
        if (prev && (prev.alt > 0 || p.alt > 0) && prev.alt > -40 && p.alt > -40) {
          d += `M${f1(prev.x)} ${f1(prev.y)}L${f1(p.x)} ${f1(p.y)}`;
        }
        prev = p;
      }
    }
    if (d) {
      out += `<path d="${d}" fill="none" stroke="${pal.line}" stroke-width="${f1(4.5 * scale)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }

  let dots = "";
  let halos = "";
  for (let i = 0; i < STARS.length; i += 3) {
    const h = horizontal(frame, STARS[i], STARS[i + 1]);
    if (h.alt <= 0) continue;
    const mag = STARS[i + 2];
    const p = project(h.alt, h.az, cx, cy, R);
    const r = starRadius(mag, scale);
    dots += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r)}"/>`;
    if (opts.glow && mag < 1.6) halos += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(r * 2.6)}"/>`;
  }
  if (halos) out += `<g fill="url(#halo)">${halos}</g>`;
  out += `<g fill="${pal.ink}">${dots}</g>`;

  return `<g clip-path="url(#sky)">${out}</g>`;
}

export const starmapGenerator: GeneratorServerModule<StarmapConfig> = {
  config: starmapConfig,

  publicAssets(config) {
    return {
      themes: config.themes.map((id) => {
        const t = STARMAP_THEMES.find((x) => x.id === id)!;
        return { id: t.id, label: t.label, labelEn: t.labelEn, swatch: t.swatch };
      }),
      fonts: config.fonts.map((id) => ({ id, label: FONT_LIBRARY.find((f) => f.id === id)?.label ?? id })),
      allowConstellationToggle: config.allowConstellationToggle,
      constellationsDefault: config.constellationsDefault,
      allowGridToggle: config.allowGridToggle,
      // Poster modunda zemin dolu: her tema her tişört renginde görünür
      fillCanvas: config.fillCanvas,
      gridDefault: config.gridDefault,
      defaultTitle: config.defaultTitle.trim(),
      defaultSubtitle: config.defaultSubtitle.trim(),
      titleMax: STARMAP_TITLE_MAX,
      subtitleMax: STARMAP_SUBTITLE_MAX,
      yearMin: STARMAP_YEAR_MIN,
      yearMax: STARMAP_YEAR_MAX,
      defaultTime: "21:00",
      defaultCity: config.defaultCity,
      // Pencere yalnız adları gösterir; koordinat ve saat dilimi sunucuda kalır
      cities: STARMAP_CITIES.map((c, i) => ({
        id: c.id,
        name: c.name,
        ...(c.nameEn ? { nameEn: c.nameEn } : {}),
        ...(c.country ? { country: c.country, countryEn: c.countryEn } : {}),
        turkey: i < TURKEY_CITY_COUNT,
      })),
    };
  },

  async compose(config, input) {
    const fields = input.fields ?? {};
    const choices = input.choices ?? {};

    const date = parseDate(fields.date);
    const time = parseTime(fields.time);
    const city = findStarmapCity(fields.city) ?? findStarmapCity(config.defaultCity)!;
    const title = cleanText(fields.title ?? config.defaultTitle, STARMAP_TITLE_MAX);
    const subtitle = cleanText(fields.subtitle ?? config.defaultSubtitle, STARMAP_SUBTITLE_MAX);
    const themeId = pickAllowed(choices.theme, config.themes);
    const fontId = pickAllowed(choices.font, config.fonts);
    // Anahtar kapalıysa müşterinin gönderdiği değer yok sayılır, şablonun varsayılanı geçer
    const constellations = config.allowConstellationToggle && typeof choices.constellations === "boolean"
      ? choices.constellations : config.constellationsDefault;
    const grid = config.allowGridToggle && typeof choices.grid === "boolean" ? choices.grid : config.gridDefault;

    let utcMs: number;
    try {
      utcMs = zonedTimeToUtc(date.y, date.m, date.d, time.h, time.mi, city.tz);
    } catch {
      // Sunucunun ICU'su dilimi tanımıyorsa (çok eski Node) boylamdan kaba bir fark kullanılır
      utcMs = Date.UTC(date.y, date.m - 1, date.d, time.h, time.mi) - Math.round(city.lon / 15) * 3600000;
    }

    const pal = PALETTES[themeId];
    const poster = config.fillCanvas && pal.bg !== null;
    // Poster modunda yazılar zeminin üstünde (açık renk); yalnız daire dolguluysa
    // yazılar şeffafın üstüne zemin renginde basılır — açık tişörtte okunur
    const textColor = pal.bg && !poster ? pal.bg : pal.ink;
    const ringColor = pal.bg && !poster ? pal.bg : pal.ink;

    const margin = poster ? 250 : 40;
    const cx = W / 2;
    const cy = margin + R + RING_GAP + 6;
    const discBottom = cy + R + RING_GAP + 6;

    // ── Yazılar ──────────────────────────────────────────────────────
    const [titleFont, bodyFont] = await Promise.all([loadLibraryFont(fontId), loadLibraryFont("montserrat")]);
    const script = SCRIPT_FONTS.has(fontId);
    const sans = SANS_FONTS.has(fontId);
    const maxTextW = W - 2 * 220;

    // Büyük harf dönüşümü şablon diline göre: Türkçede i → İ, İngilizcede I
    const locale = config.language === "en" ? "en-US" : "tr-TR";
    const titleText = sans ? title.toLocaleUpperCase(locale) : title;
    // Yazılar tişörtte haritanın gölgesinde kalıyordu: 28 cm genişlikte başlık
    // ~1 cm, tarih satırı ~4 mm basılıyor, tasarımcı önizlemesinde birkaç
    // piksele düşüyordu. Boyutlar bu yüzden ~1,5–1,8 katına çıkarıldı.
    const titleSize = script ? 300 : sans ? 190 : 220;
    const titleSpacing = sans ? 0.12 : script ? 0 : 0.02;

    const subSize = 108;
    const subLines = subtitle ? wrapText(bodyFont, subtitle, subSize, maxTextW, 2) : [];
    const meta = dateLine(config, date, time, city).toLocaleUpperCase(locale);
    const metaSize = 76;
    const coordSize = 62;

    // Satırlar yukarıdan aşağı: [taban çizgisine kadar ek, çizici]
    const blocks: Array<{ advance: number; draw: (y: number) => string }> = [];
    if (titleText) {
      const ink = textInk(titleFont, titleText, titleSize);
      // Başlığın yüksekliği gerçek mürekkebe göre: aksanlı büyük harfler (İ, Ş) üstte boşluk ister
      const asc = Math.max(titleSize * 0.72, -(ink?.y1 ?? 0));
      blocks.push({
        advance: asc,
        draw: (y) => textSvg({ font: titleFont, text: titleText, x: cx, y, size: titleSize, fill: textColor, anchor: "middle", maxWidth: maxTextW, letterSpacing: titleSpacing || undefined }).svg,
      });
    }
    subLines.forEach((line, i) => {
      blocks.push({
        advance: i === 0 ? (titleText ? (script ? 210 : 180) : 80) : subSize * 1.4,
        draw: (y) => textSvg({ font: bodyFont, text: line, x: cx, y, size: subSize, fill: textColor, anchor: "middle", maxWidth: maxTextW }).svg,
      });
    });
    // Ayraç çizgisi ve tarih satırı
    blocks.push({
      advance: blocks.length ? 130 : 0,
      draw: (y) => `<rect x="${cx - 130}" y="${y - 3}" width="260" height="6" fill="${textColor}"/>`,
    });
    blocks.push({
      advance: 150,
      draw: (y) => textSvg({ font: bodyFont, text: meta, x: cx, y, size: metaSize, fill: textColor, anchor: "middle", maxWidth: maxTextW, letterSpacing: 0.08 }).svg,
    });
    if (config.showCoordinates) {
      blocks.push({
        advance: 115,
        draw: (y) => textSvg({ font: bodyFont, text: coordLine(config, city), x: cx, y, size: coordSize, fill: textColor, anchor: "middle", maxWidth: maxTextW, letterSpacing: 0.06 }).svg,
      });
    }
    const blockH = blocks.reduce((s, b) => s + b.advance, 0);

    // Poster: yazı bloğu dairenin altındaki alanın ortasında. Şeffaf: sabit
    // bir boşlukla daireye yaslanır ve tuval içerik kadar kısalır.
    let height: number;
    let y0: number;
    if (poster) {
      // Uzun alt metinde yazı bloğu sabit yüksekliğe sığmazsa poster uzar
      height = Math.max(POSTER_H, Math.ceil(discBottom + 90 + blockH + 170));
      const free = height - discBottom - 170;
      y0 = discBottom + Math.max(90, (free - blockH) / 2);
    } else {
      y0 = discBottom + 150;
      height = Math.ceil(y0 + blockH + 40);
    }
    let textSvgs = "";
    let y = y0;
    for (const b of blocks) {
      y += b.advance;
      textSvgs += b.draw(y);
    }

    // ── Daire ve halkalar ────────────────────────────────────────────
    const outerR = R + RING_GAP;
    let disc = "";
    if (pal.bg) {
      disc += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${pal.bg}"/>`;
      // Dolgulu dairede iç halka zeminin içinde ince bir açık çizgi
      disc += `<circle cx="${cx}" cy="${cy}" r="${R - 16}" fill="none" stroke="${pal.line}" stroke-width="4"/>`;
    } else {
      disc += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${pal.ink}" stroke-width="5"/>`;
    }
    disc += `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${ringColor}" stroke-width="10"/>`;

    const clipR = pal.bg ? R - 22 : R - 8;
    const sky = skySvg({
      utcMs, lat: city.lat, lon: city.lon, cx, cy, pal,
      constellations, grid, glow: pal.bg !== null,
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
<defs>
<clipPath id="sky"><circle cx="${cx}" cy="${cy}" r="${clipR}"/></clipPath>
<radialGradient id="halo"><stop offset="0" stop-color="${pal.ink}" stop-opacity="0.35"/><stop offset="1" stop-color="${pal.ink}" stop-opacity="0"/></radialGradient>
</defs>
${poster ? `<rect width="${W}" height="${height}" fill="${pal.bg}"/>` : ""}
${disc}
${sky}
${textSvgs}
</svg>`;

    const out = await svgRaster(svg).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height };
  },
};
