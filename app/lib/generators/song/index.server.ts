import sharp from "sharp";
import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorServerModule } from "../server-types";
import { cleanText, loadLibraryFont, pickAllowed, textSvg, wrapText } from "../svg-text.server";
import { GeneratorInputError } from "../types";
import { SONG_LIMITS, SONG_STYLES, SONG_THEMES, songConfig, type SongConfig, type SongStyle, type SongTheme } from "./config";
import { codeSvg, fetchSpotifyCode, parseSpotifyLink, type SpotifyCodeShape } from "./spotify-code.server";
import { fetchSpotifyInfo, isSpotifyCoverUrl } from "./spotify-info.server";

/**
 * Şarkı / Spotify tasarımı çizimi.
 *
 * Dikey bir müzik çalar kartı: kare fotoğraf, şarkı adı + sanatçı + kalp,
 * ilerleme çubuğu ve süreler, oynatıcı düğmeleri, en altta Spotify kodu.
 * 2000 px genişlik ≈ 25 cm baskı; en küçük metin (süreler) 58 px, en ince
 * çizgi 9 px — baskıda dolmaz, kaybolmaz.
 *
 * Tuval yüksekliği içeriğe göre değişir: kod yoksa ya da başlık iki satırsa
 * boş bir bant bırakmak yerine kart kısalır/uzar. Oran ~1:1.6 civarında kalır.
 */

const W = 2000;
const PAD = 150;
const INNER = W - PAD * 2;
const PHOTO = INNER;
const PHOTO_RADIUS = 56;
const CARD_RADIUS = 96;
/** İlerleme çubuğunun dolu kısmı; mevcut süre de buna göre yazılır */
const PROGRESS = 0.36;
const DEFAULT_DURATION = 200; // 3:20

interface Palette {
  /** Kart zemini; minimal stilde yok */
  card: string | null;
  ink: string;
  soft: string;
  track: string;
}

// Kart renkleri Spotify'ın koyu/açık görünümüne yakın; minimalde gri tonlar
// kumaşa göre seçildi (beyaz tişörtte orta gri, siyah tişörtte açık gri).
function paletteFor(style: SongStyle, theme: SongTheme): Palette {
  if (style === "card") {
    return theme === "dark"
      ? { card: "#121212", ink: "#ffffff", soft: "#a7a7a7", track: "#4d4d4d" }
      : { card: "#ffffff", ink: "#121212", soft: "#6a6a6a", track: "#d6d6d6" };
  }
  return theme === "dark"
    ? { card: null, ink: "#111111", soft: "#5c5c5c", track: "#c4c4c4" }
    : { card: null, ink: "#ffffff", soft: "#bdbdbd", track: "#6e6e6e" };
}

// ── Süre ──────────────────────────────────────────────────────────────────
/** "3:45", "3.45", "03:45" → saniye; anlaşılmazsa null */
function parseDuration(v: string): number | null {
  const m = v.replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s >= 10 ? s : null;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ── Simgeler (100x100 kutuda) ────────────────────────────────────────────
const f1 = (n: number) => Number(n.toFixed(1));

function icon(cx: number, cy: number, size: number, body: string, mirror = false) {
  const k = size / 100;
  const flip = mirror ? ` translate(100 0) scale(-1 1)` : "";
  return `<g transform="translate(${f1(cx - size / 2)} ${f1(cy - size / 2)}) scale(${k})${flip}">${body}</g>`;
}

const strokeAttrs = (c: string, w: number) =>
  `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const shuffleIcon = (c: string) =>
  `<g ${strokeAttrs(c, 8)}><path d="M8 30 H24 C44 30 52 70 72 70 H88"/><path d="M8 70 H24 C44 70 52 30 72 30 H88"/>`
  + `<path d="M77 18 L89 30 L77 42"/><path d="M77 58 L89 70 L77 82"/></g>`;

const repeatIcon = (c: string) =>
  `<g ${strokeAttrs(c, 8)}><path d="M12 54 V44 C12 34 20 27 30 27 H86"/><path d="M74 15 L87 27 L74 39"/>`
  + `<path d="M88 46 V56 C88 66 80 73 70 73 H14"/><path d="M26 61 L13 73 L26 85"/></g>`;

// Önceki/sonraki: dolu üçgen + dikey çubuk; köşeler yuvarlatılmış
const skipIcon = (c: string) =>
  `<path d="M84 18 L36 50 L84 82 Z" fill="${c}" stroke="${c}" stroke-width="10" stroke-linejoin="round"/>`
  + `<path d="M18 16 V84" ${strokeAttrs(c, 13)}/>`;

const heartIcon = (c: string) =>
  `<path d="M50 86 C44 81 8 58 8 33 C8 20 18 11 31 11 C39 11 46 15 50 22 C54 15 61 11 69 11 C82 11 92 20 92 33 C92 58 56 81 50 86 Z" fill="${c}"/>`;

const noteIcon = (c: string) =>
  `<g fill="${c}"><ellipse cx="30" cy="76" rx="14" ry="11"/><ellipse cx="72" cy="68" rx="14" ry="11"/>`
  + `<rect x="38" y="22" width="7" height="55"/><rect x="80" y="14" width="7" height="55"/>`
  + `<path d="M38 22 L87 12 V26 L38 36 Z"/></g>`;

// ── Fotoğraf ──────────────────────────────────────────────────────────────
/** Müşterinin penceredeki kırpma ayarı: odak noktası (0–1) ve yakınlaştırma */
interface PhotoCrop { x: number; y: number; zoom: number }

function readCrop(choices: Record<string, unknown>): PhotoCrop | null {
  const x = Number(choices.photoX);
  const y = Number(choices.photoY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const zoom = Number(choices.photoZoom);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), zoom: clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4) };
}

async function photoLayer(photo: Buffer, crop: PhotoCrop | null): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg width="${PHOTO}" height="${PHOTO}"><rect width="${PHOTO}" height="${PHOTO}" rx="${PHOTO_RADIUS}" fill="#fff"/></svg>`,
  );
  try {
    let square: Buffer;
    if (crop) {
      // Müşteri fotoğrafı penceredeki karede kaydırıp yakınlaştırdı: aynı
      // hesap (kare kenarı = kısa kenar / zoom, merkez odak noktası, taşarsa
      // kenara yaslanır) tasarımcıda önizlemeyi de çiziyor
      const oriented = await sharp(photo, { limitInputPixels: false }).rotate().toBuffer();
      const m = await sharp(oriented).metadata();
      const w = m.width ?? 1;
      const h = m.height ?? 1;
      const side = Math.max(1, Math.min(w, h) / crop.zoom);
      const cx = Math.min(w - side / 2, Math.max(side / 2, crop.x * w));
      const cy = Math.min(h - side / 2, Math.max(side / 2, crop.y * h));
      const left = Math.max(0, Math.min(w - 1, Math.round(cx - side / 2)));
      const top = Math.max(0, Math.min(h - 1, Math.round(cy - side / 2)));
      const size = Math.max(1, Math.min(Math.round(side), w - left, h - top));
      square = await sharp(oriented)
        .extract({ left, top, width: size, height: size })
        .resize(PHOTO, PHOTO, { fit: "fill" })
        .removeAlpha()
        .toBuffer();
    } else {
      // Ayar yoksa yüz/ilgi alanı ortada tutulur (attention)
      square = await sharp(photo, { limitInputPixels: false })
        .rotate()
        .resize(PHOTO, PHOTO, { fit: "cover", position: sharp.strategy.attention })
        .removeAlpha()
        .toBuffer();
    }
    return await sharp(square).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  } catch {
    throw new GeneratorInputError("Fotoğraf okunamadı; JPG ya da PNG bir fotoğraf seçin");
  }
}

export const songGenerator: GeneratorServerModule<SongConfig> = {
  config: songConfig,

  publicAssets(config) {
    return {
      styles: SONG_STYLES.filter((s) => config.styles.includes(s.id)).map((s) => ({ id: s.id, label: s.label, labelEn: s.labelEn })),
      themes: SONG_THEMES.filter((t) => config.themes.includes(t.id))
        .map((t) => ({ id: t.id, label: t.label, labelEn: t.labelEn, swatch: t.swatch })),
      fonts: config.fonts.map((id) => {
        const lib = FONT_LIBRARY.find((f) => f.id === id);
        return { id, label: lib?.label ?? id, url: lib?.url ?? "" };
      }),
      requirePhoto: config.requirePhoto,
      showCode: config.showCode,
      sampleTitle: config.sampleTitle,
      sampleArtist: config.sampleArtist,
      limits: { title: SONG_LIMITS.title, artist: SONG_LIMITS.artist, duration: SONG_LIMITS.duration },
    };
  },

  async compose(config, input) {
    const style = pickAllowed(input.choices.style, config.styles);
    const theme = pickAllowed(input.choices.theme, config.themes);
    const fontId = pickAllowed(input.choices.font, config.fonts);
    const pal = paletteFor(style, theme);

    const title = cleanText(input.fields.title, SONG_LIMITS.title) || config.sampleTitle;
    const artist = cleanText(input.fields.artist, SONG_LIMITS.artist) || config.sampleArtist;
    const durationRaw = cleanText(input.fields.duration, SONG_LIMITS.duration);
    const total = (durationRaw && parseDuration(durationRaw)) || DEFAULT_DURATION;
    const current = Math.round(total * PROGRESS);

    let photo = input.photo && input.photo.length > 0 ? input.photo : null;
    // Müşteri fotoğraf yerine albüm kapağını seçtiyse kapak Spotify'dan
    // alınır; adres istemciden gelmez, bağlantıdan sunucu bulur
    if (!photo && input.choices.useCover === true) {
      const ref = parseSpotifyLink(cleanText(input.fields.link, SONG_LIMITS.link));
      const info = ref ? await fetchSpotifyInfo(ref) : null;
      if (info?.coverUrl && isSpotifyCoverUrl(info.coverUrl)) {
        const res = await fetch(info.coverUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (res?.ok) photo = Buffer.from(await res.arrayBuffer());
      }
      if (!photo) throw new GeneratorInputError("Albüm kapağı alınamadı; bir fotoğraf seçin");
    }
    if (!photo && config.requirePhoto) throw new GeneratorInputError("Bir fotoğraf seçin");

    // Spotify kodu: yanlış bağlantı müşteriye söylenir (ödediği kod eksik
    // basılmasın); servis geçici olarak yanıt vermezse tasarım kodsuz çizilir.
    let code: SpotifyCodeShape | null = null;
    const link = cleanText(input.fields.link, SONG_LIMITS.link);
    if (config.showCode && link) {
      const ref = parseSpotifyLink(link);
      if (!ref) {
        throw new GeneratorInputError("Spotify bağlantısı tanınmadı. Spotify'da şarkı → Paylaş → Şarkı bağlantısını kopyala ile alınan bağlantıyı yapıştırın.");
      }
      const res = await fetchSpotifyCode(ref);
      if (res.ok) code = res.shape;
      else if (res.reason === "missing") throw new GeneratorInputError("Bu Spotify bağlantısında bir şarkı bulunamadı; bağlantıyı kontrol edin.");
    }

    const font = await loadLibraryFont(fontId);
    const parts: string[] = [];

    // ── Başlık + sanatçı + kalp ──────────────────────────────────────────
    const HEART = 108;
    const textMax = INNER - HEART - 70;
    let y = PAD + PHOTO;
    const titleLines = wrapText(font, title, 124, textMax, 2);
    // Tek satıra küçülterek sığan başlık tek satır kalır; çok uzunsa iki satır
    const oneLine = textSvg({ font, text: title, x: 0, y: 0, size: 124, fill: "#000", maxWidth: textMax });
    const lines = titleLines.length > 1 && oneLine.size < 124 * 0.72 ? titleLines : [title];
    const titleSize = lines.length > 1 ? 108 : 124;
    y += 212;
    const titleTop = y - titleSize * 0.72;
    for (const [i, line] of lines.entries()) {
      if (i > 0) y += titleSize * 1.12;
      parts.push(textSvg({ font, text: line, x: PAD, y, size: titleSize, fill: pal.ink, maxWidth: textMax }).svg);
    }
    y += 116;
    parts.push(textSvg({ font, text: artist, x: PAD, y, size: 84, fill: pal.soft, maxWidth: textMax }).svg);
    const heartCy = (titleTop + y) / 2;
    parts.push(icon(W - PAD - HEART / 2, heartCy, HEART, heartIcon(pal.ink)));

    // ── İlerleme çubuğu ve süreler ───────────────────────────────────────
    y += 150;
    const barH = 16;
    const done = INNER * PROGRESS;
    parts.push(`<rect x="${PAD}" y="${y - barH / 2}" width="${INNER}" height="${barH}" rx="${barH / 2}" fill="${pal.track}"/>`);
    parts.push(`<rect x="${PAD}" y="${y - barH / 2}" width="${f1(done)}" height="${barH}" rx="${barH / 2}" fill="${pal.ink}"/>`);
    parts.push(`<circle cx="${f1(PAD + done)}" cy="${y}" r="32" fill="${pal.ink}"/>`);
    const timeY = y + 110;
    parts.push(textSvg({ font, text: fmt(current), x: PAD, y: timeY, size: 58, fill: pal.soft }).svg);
    parts.push(textSvg({ font, text: fmt(total), x: W - PAD, y: timeY, size: 58, fill: pal.soft, anchor: "end" }).svg);

    // ── Oynatıcı düğmeleri ───────────────────────────────────────────────
    const cy = timeY + 220;
    const PLAY_R = 142;
    const mid = W / 2;
    parts.push(icon(PAD + 52, cy, 104, shuffleIcon(pal.ink)));
    parts.push(icon(W - PAD - 52, cy, 104, repeatIcon(pal.ink)));
    parts.push(icon(mid - 390, cy, 124, skipIcon(pal.ink)));
    parts.push(icon(mid + 390, cy, 124, skipIcon(pal.ink), true));
    // Duraklat çubukları dairenin içinden oyulur: minimal stilde kumaş görünür
    const pw = PLAY_R * 0.17;
    const ph = PLAY_R * 0.66;
    const gap = PLAY_R * 0.2;
    parts.push(
      `<mask id="play"><rect width="${W}" height="100%" fill="#fff"/>`
      + `<rect x="${f1(mid - gap / 2 - pw)}" y="${f1(cy - ph / 2)}" width="${f1(pw)}" height="${f1(ph)}" rx="${f1(pw * 0.3)}" fill="#000"/>`
      + `<rect x="${f1(mid + gap / 2)}" y="${f1(cy - ph / 2)}" width="${f1(pw)}" height="${f1(ph)}" rx="${f1(pw * 0.3)}" fill="#000"/></mask>`
      + `<circle cx="${mid}" cy="${cy}" r="${PLAY_R}" fill="${pal.ink}" mask="url(#play)"/>`,
    );
    y = cy + PLAY_R;

    // ── Spotify kodu ─────────────────────────────────────────────────────
    if (code) {
      const cw = 1120;
      const top = y + 110;
      parts.push(codeSvg(code, (W - cw) / 2, top, cw, pal.ink));
      y = top + cw / 6;
    }

    const H = Math.round(y + PAD + 10);

    // ── Fotoğraf alanı ───────────────────────────────────────────────────
    const composites: sharp.OverlayOptions[] = [];
    if (photo) {
      composites.push({ input: await photoLayer(photo, readCrop(input.choices)), left: PAD, top: PAD });
    } else {
      // Kartta dolgulu kutu; şeffaf stilde kumaşa büyük bir mürekkep bloğu
      // basmamak için yalnızca çerçeve
      const box = pal.card
        ? `<rect x="${PAD}" y="${PAD}" width="${PHOTO}" height="${PHOTO}" rx="${PHOTO_RADIUS}" fill="${pal.track}"/>`
        : `<rect x="${PAD + 6}" y="${PAD + 6}" width="${PHOTO - 12}" height="${PHOTO - 12}" rx="${PHOTO_RADIUS}" fill="none" stroke="${pal.soft}" stroke-width="12"/>`;
      parts.unshift(box + icon(W / 2, PAD + PHOTO / 2, 420, noteIcon(pal.card ? pal.soft : pal.ink)));
    }
    if (pal.card) parts.unshift(`<rect width="${W}" height="${H}" rx="${CARD_RADIUS}" fill="${pal.card}"/>`);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`;
    const buffer = await sharp(Buffer.from(svg)).composite(composites).png().toBuffer();
    return { buffer, width: W, height: H };
  },
};
