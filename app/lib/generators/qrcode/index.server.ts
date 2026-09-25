import sharp from "sharp";
import QRCode from "qrcode";
import type * as opentypeNs from "opentype.js";
import { FONT_LIBRARY } from "../../font-library";
import type { GeneratorServerModule } from "../server-types";
import { GeneratorInputError, type GeneratorInput } from "../types";
import { loadLibraryFont, pickAllowed, textInk, textSvg, PRINT_SCALE } from "../svg-text.server";
import {
  QR_CONTENT_TYPES,
  QR_ICONS,
  QR_LAYOUTS,
  QR_LIMITS,
  QR_STYLES,
  QR_WIFI_SECURITY,
  qrColorName,
  qrcodeConfig,
  qrDefaultCaption,
  type QrcodeConfig,
  type QrContentType,
  type QrIcon,
  type QrLayout,
  type QrStyle,
  type QrWifiSecurity,
} from "./config";

/**
 * QR kod çizimi.
 *
 * Modül matrisi `qrcode` paketinden alınır, modüller SVG olarak kendimiz
 * çizeriz: stil (kare / akışkan yuvarlak / nokta) ve ortadaki kalp paketin
 * kendi çıktısında yok. Yerleşim modül birimiyle yapılır (1 modül = U birim;
 * glif yolları 0,1 birim hassasiyetle yazıldığı için U küçük tutulamaz).
 *
 * Okunabilirlik kuralları:
 *  - Köşe gözleri her stilde dolu (halka + merkez) çizilir; noktalı stilde
 *    hizalama desenleri de göz gibi çizilir.
 *  - Sessiz bölge 4 modül: düz ve yazılı düzende PNG'de şeffaf pay olarak,
 *    çerçevede çerçevenin içinde kalır.
 *  - Kalp açıkken hata düzeltme H ve en az sürüm 3; ortadan kodun ~%9'u
 *    boşaltılır. İçerik uzunsa (H ile sürüm 10'u aşarsa) kalp bırakılır.
 *    Diğer durumlarda M.
 *  - Modül piksel boyu tam sayıya yuvarlanır: kenarlar baskıda keskin.
 */

const U = 40;
const QUIET = 4;
// Baskı ölçeğinde uzun kenar (bkz. PRINT_SCALE)
const OUT_LONG = Math.round(2400 * PRINT_SCALE);
/** Kalbin boşalttığı kare, kod alanına oranla */
const HEART_AREA = 0.09;

const f = (n: number) => Number(n.toFixed(1));

// ── İçerik ─────────────────────────────────────────────────────────────

const noCtl = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
const len = (s: string) => Array.from(s).length;

function urlPayload(raw: unknown): string {
  let s = String(raw ?? "").replace(/\s+/g, "");
  if (!s) throw new GeneratorInputError("Bağlantıyı yazın", "Enter the link");
  if (len(s) > QR_LIMITS.url) {
    throw new GeneratorInputError(`Bağlantı en fazla ${QR_LIMITS.url} karakter olabilir; kısaltılmış bir bağlantı deneyin`,
      `The link can be at most ${QR_LIMITS.url} characters; try a shortened link`);
  }
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (scheme && !/^https?$/i.test(scheme[1])) {
    throw new GeneratorInputError("Yalnızca http:// ya da https:// ile başlayan bağlantılar kullanılabilir", "Only links starting with http:// or https:// can be used");
  }
  if (!scheme) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new GeneratorInputError("Bağlantı geçerli görünmüyor", "The link doesn't look valid");
  }
  const host = url.hostname;
  if (!/^https?:$/.test(url.protocol) || !host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
    throw new GeneratorInputError("Bağlantı geçerli görünmüyor", "The link doesn't look valid");
  }
  // href: Türkçe harfler ve boşluklar yüzde kodlanır, her okuyucu açabilsin
  const href = url.href;
  if (len(href) > QR_LIMITS.url + 60) {
    throw new GeneratorInputError("Bağlantı çok uzun; kısaltılmış bir bağlantı deneyin", "The link is too long; try a shortened link");
  }
  return href;
}

function textPayload(raw: unknown): string {
  // Satır sonları korunur (okutunca mesaj satır satır görünür), fazlası atılır
  const s = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s) throw new GeneratorInputError("Mesajı yazın", "Enter the message");
  if (len(s) > QR_LIMITS.text) {
    throw new GeneratorInputError(`Mesaj en fazla ${QR_LIMITS.text} karakter olabilir`, `The message can be at most ${QR_LIMITS.text} characters`);
  }
  return s;
}

/** Wi-Fi biçiminde özel karakterler ters bölüyle kaçırılır: \ ; , : " */
const wifiEscape = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");

function wifiPayload(fields: Record<string, string>, security: QrWifiSecurity): string {
  const ssid = noCtl(fields.ssid).trim();
  if (!ssid) throw new GeneratorInputError("Ağ adını (SSID) yazın", "Enter the network name (SSID)");
  if (Buffer.byteLength(ssid, "utf8") > QR_LIMITS.ssid) {
    throw new GeneratorInputError("Ağ adı çok uzun (en fazla 32 bayt)", "The network name is too long (max 32 bytes)");
  }
  // Şifrenin baş/son boşluğu da şifrenin parçası olabilir: kırpılmaz
  const password = noCtl(fields.password);
  if (security === "WPA") {
    if (len(password) < 8 || len(password) > QR_LIMITS.password) {
      throw new GeneratorInputError("WPA şifresi 8–63 karakter olmalı", "A WPA password must be 8–63 characters");
    }
  } else if (security === "WEP") {
    const ok = [5, 13].includes(len(password)) || /^([0-9a-f]{10}|[0-9a-f]{26})$/i.test(password);
    if (!ok) throw new GeneratorInputError("WEP şifresi 5 ya da 13 karakter (veya 10/26 onaltılık) olmalı", "A WEP password must be 5 or 13 characters (or 10/26 hex digits)");
  }
  const pass = security === "nopass" ? "" : `P:${wifiEscape(password)};`;
  return `WIFI:T:${security};S:${wifiEscape(ssid)};${pass};`;
}

function phonePayload(raw: unknown): string {
  const s = String(raw ?? "").replace(/[\s\-().\/]/g, "");
  if (!s) throw new GeneratorInputError("Telefon numarasını yazın", "Enter the phone number");
  if (!/^\+?\d{7,15}$/.test(s)) {
    throw new GeneratorInputError("Telefon numarası geçerli görünmüyor (ör. +90 555 123 45 67)", "The phone number doesn't look valid (e.g. +1 555 123 4567)");
  }
  return `tel:${s}`;
}

function emailPayload(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new GeneratorInputError("E-posta adresini yazın", "Enter the email address");
  if (s.length > QR_LIMITS.email || !/^[^\s@"<>,;:]+@[^\s@"<>,;:]+\.[^\s@"<>,;:]{2,}$/.test(s)) {
    throw new GeneratorInputError("E-posta adresi geçerli görünmüyor", "The email address doesn't look valid");
  }
  return `mailto:${s}`;
}

function payloadFor(content: QrContentType, input: GeneratorInput, security: QrWifiSecurity): string {
  const { fields } = input;
  switch (content) {
    case "url": return urlPayload(fields.url);
    case "text": return textPayload(fields.text);
    case "wifi": return wifiPayload(fields, security);
    case "phone": return phonePayload(fields.phone);
    case "email": return emailPayload(fields.email);
  }
}

// ── Matris ─────────────────────────────────────────────────────────────

interface Matrix {
  n: number;
  dark: (r: number, c: number) => boolean;
  version: number;
}

/** Kalp bu sürümün üstünde bırakılır: H ile yoğunlaşan kod küçük baskıda bulanık okunmuyordu */
const HEART_MAX_VERSION = 10;

function buildMatrix(payload: string, wantHeart: boolean): Matrix & { heart: boolean } {
  const create = (ecc: "H" | "M", version?: number) =>
    QRCode.create(payload, version ? { errorCorrectionLevel: ecc, version } : { errorCorrectionLevel: ecc });
  let qr: ReturnType<typeof QRCode.create>;
  let heart = wantHeart;
  try {
    qr = create(heart ? "H" : "M");
    if (heart && qr.version > HEART_MAX_VERSION) {
      // Uzun içerik: kalpsiz ve M ile daha seyrek, daha kolay okunan kod
      heart = false;
      qr = create("M");
    }
    // Küçük kodda kalp modül ızgarasında kaba duruyor ve boşluk oranı artıyor
    if (heart && qr.version < 3) qr = create("H", 3);
  } catch {
    throw new GeneratorInputError("İçerik QR koda sığmayacak kadar uzun; kısaltın", "The content is too long for a QR code; please shorten it");
  }
  const n = qr.modules.size;
  const data = qr.modules.data;
  return { n, heart, version: qr.version, dark: (r, c) => r >= 0 && c >= 0 && r < n && c < n && data[r * n + c] === 1 };
}

/** Hizalama desenlerinin merkezleri (standart konum tablosunun formülü) */
function alignmentCenters(version: number): Array<[number, number]> {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const pos = [size - 7];
  for (let i = 1; i < count - 1; i++) pos[i] = pos[i - 1] - step;
  pos.push(6);
  pos.reverse();
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      // Köşe gözleriyle çakışanlar yok
      if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) continue;
      out.push([pos[i], pos[j]]);
    }
  }
  return out;
}

// ── Şekiller ───────────────────────────────────────────────────────────

/** Yuvarlak köşeli dikdörtgen (saat yönünde) */
function rrect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r === 0) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}`
    + `V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}`
    + `H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}`
    + `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}

/** Kalp: (x, y) sol üst, genişlik w, yükseklik ≈ 0.92w */
function heartPath(x: number, y: number, w: number): string {
  const P = (px: number, py: number) => `${f(x + px * w)} ${f(y + py * w)}`;
  return `M${P(0.5, 0.92)}C${P(0.2, 0.7)} ${P(0, 0.5)} ${P(0, 0.29)}`
    + `C${P(0, 0.12)} ${P(0.13, 0)} ${P(0.28, 0)}C${P(0.39, 0)} ${P(0.46, 0.06)} ${P(0.5, 0.14)}`
    + `C${P(0.54, 0.06)} ${P(0.61, 0)} ${P(0.72, 0)}C${P(0.87, 0)} ${P(1, 0.12)} ${P(1, 0.29)}`
    + `C${P(1, 0.5)} ${P(0.8, 0.7)} ${P(0.5, 0.92)}Z`;
}

/**
 * Göz: 7×7 halka + 3×3 merkez (hizalama deseni 5×5 halka + 1×1 merkez).
 * Kare stilde keskin, diğerlerinde yuvarlak köşeli.
 */
function eyeSvg(x: number, y: number, size: number, core: number, round: boolean): string {
  const k = size / 7;
  const ro = round ? size * 0.28 : 0;
  const ri = round ? (size - 2 * k) * 0.2 : 0;
  const ring = rrect(x, y, size, size, ro) + rrect(x + k, y + k, size - 2 * k, size - 2 * k, ri);
  const c = (size - core) / 2;
  const center = rrect(x + c, y + c, core, core, round ? core * 0.3 : 0);
  return `<path fill-rule="evenodd" d="${ring}"/><path d="${center}"/>`;
}

interface CodeArt {
  svg: string;
  size: number;
}

/** Kodun kendisi: (0,0)'da, n×U birim */
function codeSvg(m: Matrix, style: QrStyle, heart: boolean): CodeArt {
  const { n } = m;
  const S = n * U;
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const align = alignmentCenters(m.version);
  const inAlign = (r: number, c: number) => align.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);

  // Ortadaki boşluk: tek sayılı kenar, merkez modülde ortalı kare
  const mid = (n - 1) / 2;
  const koHalf = heart ? Math.floor((Math.sqrt(HEART_AREA) * n - 1) / 2) : -1;
  const inKo = (r: number, c: number) => heart && Math.abs(r - mid) <= koHalf && Math.abs(c - mid) <= koHalf;
  // Noktalı stilde hizalama desenleri göz olarak ayrıca çizilir
  const eyeAlign = style === "dots";
  const drawn = (r: number, c: number) =>
    m.dark(r, c) && !inFinder(r, c) && !inKo(r, c) && !(eyeAlign && inAlign(r, c));

  let d = "";
  if (style === "square") {
    // Satır satır bitişik koşular: tek yol, modüller arasında ince çizgi kalmaz
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!drawn(r, c)) { c++; continue; }
        const start = c;
        while (c < n && drawn(r, c)) c++;
        d += `M${start * U} ${r * U}h${(c - start) * U}v${U}h${-(c - start) * U}Z`;
      }
    }
  } else if (style === "rounded") {
    // Akışkan modüller: yalnızca iki yanı boş dış köşeler yuvarlanır (yalnızca
    // çapraz komşular böylece temiz ayrılır), L biçimli iç köşelere küçük dolgu
    const R = U / 2;
    const F = U * 0.28;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = c * U, y = r * U;
        if (drawn(r, c)) {
          const up = drawn(r - 1, c), dn = drawn(r + 1, c), lf = drawn(r, c - 1), rt = drawn(r, c + 1);
          const tl = !up && !lf ? R : 0, tr = !up && !rt ? R : 0, br = !dn && !rt ? R : 0, bl = !dn && !lf ? R : 0;
          d += `M${f(x + tl)} ${y}H${f(x + U - tr)}`
            + (tr ? `A${R} ${R} 0 0 1 ${x + U} ${f(y + tr)}` : "")
            + `V${f(y + U - br)}`
            + (br ? `A${R} ${R} 0 0 1 ${f(x + U - br)} ${y + U}` : "")
            + `H${f(x + bl)}`
            + (bl ? `A${R} ${R} 0 0 1 ${x} ${f(y + U - bl)}` : "")
            + `V${f(y + tl)}`
            + (tl ? `A${R} ${R} 0 0 1 ${f(x + tl)} ${y}` : "")
            + "Z";
        } else if (!inFinder(r, c) && !inKo(r, c)) {
          const up = drawn(r - 1, c), dn = drawn(r + 1, c), lf = drawn(r, c - 1), rt = drawn(r, c + 1);
          // Dolgu yalnızca gerçek L köşesinde (çapraz modül de dolu). Yalnızca
          // çapraz komşu iki modülün arasında dolgu, dört uçlu yıldız kıymığı çiziyordu
          if (up && lf && drawn(r - 1, c - 1)) d += `M${x} ${y}h${f(F)}A${f(F)} ${f(F)} 0 0 0 ${x} ${f(y + F)}Z`;
          if (up && rt && drawn(r - 1, c + 1)) d += `M${x + U} ${y}v${f(F)}A${f(F)} ${f(F)} 0 0 0 ${f(x + U - F)} ${y}Z`;
          if (dn && rt && drawn(r + 1, c + 1)) d += `M${x + U} ${y + U}h${f(-F)}A${f(F)} ${f(F)} 0 0 0 ${x + U} ${f(y + U - F)}Z`;
          if (dn && lf && drawn(r + 1, c - 1)) d += `M${x} ${y + U}v${f(-F)}A${f(F)} ${f(F)} 0 0 0 ${f(x + F)} ${y + U}Z`;
        }
      }
    }
  } else {
    const rad = U * 0.45;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!drawn(r, c)) continue;
        const cx = c * U + U / 2, cy = r * U + U / 2;
        d += `M${f(cx - rad)} ${cy}a${f(rad)} ${f(rad)} 0 1 0 ${f(rad * 2)} 0a${f(rad)} ${f(rad)} 0 1 0 ${f(-rad * 2)} 0Z`;
      }
    }
  }

  const round = style !== "square";
  let svg = `<path d="${d}"/>`;
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) svg += eyeSvg(c * U, r * U, 7 * U, 3 * U, round);
  if (eyeAlign) {
    for (const [ar, ac] of align) {
      if (inKo(ar, ac)) continue;
      svg += eyeSvg((ac - 2) * U, (ar - 2) * U, 5 * U, U, true);
    }
  }
  if (heart) {
    // Kalp boşluğun içinde, kenarlarda en az ~0,7 modül nefes payıyla
    const box = (koHalf * 2 + 1) * U;
    const w = box - U * 1.4;
    const x0 = (mid - koHalf) * U + (box - w) / 2;
    const y0 = (mid - koHalf) * U + (box - w * 0.92) / 2 + w * 0.02;
    svg += `<path d="${heartPath(x0, y0, w)}"/>`;
  }
  return { svg, size: S };
}

// ── Yazı ───────────────────────────────────────────────────────────────

const HEART_CHARS = /(?:❤️?|♥️?|♡|\ud83d[\udc93-\udc9f]|🤍|🖤)/g;

/**
 * Müşterinin yazısı: kalp emojileri tek bir ♥ işaretine iner (vektör kalp
 * olarak çizilir); fontta olmayan karakterler atılır (baskıda boş kutu çıkmasın).
 */
function cleanCaption(raw: unknown, font: opentypeNs.Font): string {
  const s = String(raw ?? "").replace(HEART_CHARS, "♥").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const kept = Array.from(s).filter((ch) => ch === "♥" || ch === " " || font.hasChar(ch));
  return kept.slice(0, QR_LIMITS.caption).join("").replace(/\s+/g, " ").trim();
}

interface CaptionArt {
  svg: string;
  /** Mürekkep kutusu (taban çizgisine göre değil, mutlak) */
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/**
 * Tek satır yazı, ortası cx, taban çizgisi y. "♥" karakterleri fontun
 * glifi yerine vektör kalp olarak dizilir. Sığmazsa punto küçülür.
 */
function captionSvg(font: opentypeNs.Font, text: string, cx: number, y: number, size0: number, maxWidth: number, fill: string, spacing: number): CaptionArt | null {
  const segs = text.split("♥");
  const layoutAt = (size: number) => {
    const hw = size * 0.6;
    const items: Array<{ kind: "t"; text: string; w: number } | { kind: "h"; w: number }> = [];
    segs.forEach((seg, i) => {
      const t = seg.trim();
      if (t) items.push({ kind: "t", text: t, w: textSvg({ font, text: t, x: 0, y: 0, size, fill, letterSpacing: spacing }).width });
      if (i < segs.length - 1) items.push({ kind: "h", w: hw });
    });
    const gap = size * 0.24;
    let total = 0;
    items.forEach((it, i) => { total += it.w + (i > 0 ? gap : 0); });
    return { items, total, gap, hw };
  };
  let size = size0;
  let lay = layoutAt(size);
  if (!lay.items.length) return null;
  if (lay.total > maxWidth) {
    size = size * (maxWidth / lay.total);
    lay = layoutAt(size);
  }
  const H = textInk(font, "H", size);
  const capH = H ? -H.y1 : size * 0.7;
  let x = cx - lay.total / 2;
  let svg = "";
  let y1 = y - capH, y2 = y;
  let first = true;
  for (const it of lay.items) {
    if (!first) x += lay.gap;
    first = false;
    if (it.kind === "t") {
      svg += textSvg({ font, text: it.text, x, y, size, fill, letterSpacing: spacing }).svg;
      const ib = textInk(font, it.text, size);
      if (ib) { y1 = Math.min(y1, y + ib.y1); y2 = Math.max(y2, y + ib.y2); }
    } else {
      // Kalp büyük harf yüksekliğinde, taban çizgisine oturur
      const w = Math.min(it.w, capH / 0.92);
      svg += `<path fill="${fill}" d="${heartPath(x + (it.w - w) / 2, y - w * 0.92, w)}"/>`;
    }
    x += it.w;
  }
  return { svg, x1: cx - lay.total / 2, x2: cx + lay.total / 2, y1, y2 };
}

// ── Modül ──────────────────────────────────────────────────────────────

const SCRIPT_FONTS = ["great-vibes", "dancing-script"];

export const qrcodeGenerator: GeneratorServerModule<QrcodeConfig> = {
  config: qrcodeConfig,

  publicAssets(config) {
    const opt = <T extends { id: string; label: string; labelEn: string }>(all: readonly T[], ids: readonly string[]) =>
      ids.map((id) => all.find((x) => x.id === id)).filter((x): x is T => !!x).map(({ id, label, labelEn }) => ({ id, label, labelEn }));
    return {
      contentTypes: config.contentTypes.map((id) => {
        const m = QR_CONTENT_TYPES.find((x) => x.id === id)!;
        return { id, label: m.label, labelEn: m.labelEn, hint: m.hint, hintEn: m.hintEn };
      }),
      styles: opt(QR_STYLES, config.styles),
      layouts: opt(QR_LAYOUTS, config.layouts),
      // Kalp önce: mağaza sahibi açtıysa varsayılan kalpli
      icons: config.centerIcon ? opt(QR_ICONS, ["heart", "none"]) : [],
      security: opt(QR_WIFI_SECURITY, QR_WIFI_SECURITY.map((s) => s.id)),
      fonts: config.fonts.map((id) => ({ id, label: FONT_LIBRARY.find((x) => x.id === id)?.label ?? id })),
      inks: config.inks.map((hex) => ({ id: hex, hex, label: qrColorName(hex), labelEn: qrColorName(hex, true) })),
      captionEnabled: config.captionEnabled,
      // İçerik türüne göre başlangıç yazısı (mağaza sahibinin yazısı varsa hepsinde o)
      captions: Object.fromEntries(config.contentTypes.map((id) => [id, qrDefaultCaption(config, id)])),
      limits: QR_LIMITS,
    };
  },

  async compose(config, input) {
    const { fields, choices } = input;
    const content = pickAllowed(choices.content, config.contentTypes);
    const style: QrStyle = pickAllowed(choices.style, config.styles);
    const layout: QrLayout = pickAllowed(choices.layout, config.layouts);
    const icon: QrIcon = config.centerIcon ? pickAllowed(choices.icon, ["heart", "none"] as const) : "none";
    const security = pickAllowed(choices.security, QR_WIFI_SECURITY.map((s) => s.id));
    const fontId = pickAllowed(choices.font, config.fonts);
    const inkRaw = typeof choices.ink === "string" ? choices.ink.trim().toLowerCase() : "";
    const ink = config.inks.includes(inkRaw) ? inkRaw : config.inks[0];

    const payload = payloadFor(content, input, security);
    const m = buildMatrix(payload, icon === "heart");
    const code = codeSvg(m, style, m.heart);
    const S = code.size;
    const Q = QUIET * U;

    // Yazı: müşteri değiştirebiliyorsa onun yazdığı (boş bırakabilir),
    // değiştiremiyorsa şablonun yazısı
    let caption = "";
    let font: opentypeNs.Font | null = null;
    if (layout !== "plain") {
      font = await loadLibraryFont(fontId);
      const raw = config.captionEnabled && typeof fields.caption === "string"
        ? fields.caption
        : qrDefaultCaption(config, content);
      caption = cleanCaption(raw, font);
    }
    // Yazı boşsa: "altında yazı" yalnızca kod, çerçeve alt şeritsiz çizilir
    const script = SCRIPT_FONTS.includes(fontId);
    const spacing = script ? 0 : 0.03;

    let body = code.svg;
    let defs = "";
    // Görünüm kutusu (birim): kodun sol üstü (0,0)
    let x1 = -Q, y1 = -Q, x2 = S + Q, y2 = S + Q;

    if (layout === "caption" && caption && font) {
      const size = S * 0.125 * (script ? 1.25 : 1);
      const gap = Math.max(3 * U, S * 0.07);
      const H = textInk(font, "H", size);
      const capH = H ? -H.y1 : size * 0.7;
      const cap = captionSvg(font, caption, S / 2, S + gap + capH, size, S + Q * 1.5, ink, spacing);
      if (cap) {
        body += cap.svg;
        x1 = Math.min(x1, cap.x1 - U);
        x2 = Math.max(x2, cap.x2 + U);
        y2 = cap.y2 + Math.max(U, S * 0.03);
      }
    } else if (layout === "badge") {
      const t = Math.max(U, S * 0.04);
      const R = S * 0.09 + t;
      const fx = -Q - t, fy = -Q - t, fw = S + 2 * Q + 2 * t;
      let fh = S + 2 * Q + 2 * t;
      let band = "";
      if (caption && font) {
        const size = S * 0.12 * (script ? 1.25 : 1);
        const bandH = size * 1.75;
        fh = S + 2 * Q + t + bandH;
        const H = textInk(font, "H", size);
        const capH = H ? -H.y1 : size * 0.7;
        const bandTop = S + Q;
        const cap = captionSvg(font, caption, S / 2, bandTop + bandH / 2 + capH / 2, size, fw - R * 1.4, "#000", spacing);
        if (cap) {
          // Şeritteki yazı mürekkepten oyulur: tişört rengi görünür
          defs = `<mask id="qrband" maskUnits="userSpaceOnUse" x="${f(fx - U)}" y="${f(fy - U)}" width="${f(fw + 2 * U)}" height="${f(fh + 2 * U)}">`
            + `<rect x="${f(fx - U)}" y="${f(fy - U)}" width="${f(fw + 2 * U)}" height="${f(fh + 2 * U)}" fill="#fff"/>${cap.svg}</mask>`;
          band = `<path d="${rrect(fx, bandTop, fw, fy + fh - bandTop, 0)}"/>`;
        }
      }
      // Çerçeve: dış kutu eksi iç boşluk (kodun sessiz bölgesi); şerit iç boşluğun altında
      const inner = band
        ? rrect(-Q, -Q, S + 2 * Q, S + 2 * Q, Math.max(0, R - t))
        : rrect(fx + t, fy + t, fw - 2 * t, fh - 2 * t, Math.max(0, R - t));
      const frame = `<path fill-rule="evenodd" d="${rrect(fx, fy, fw, fh, R)}${inner}"/>`;
      // Şerit dış kutunun alt köşelerine kırpılır
      const bandClip = band
        ? `<clipPath id="qrclip"><path d="${rrect(fx, fy, fw, fh, R)}"/></clipPath>`
        : "";
      defs += bandClip;
      body += band ? `<g mask="url(#qrband)">${frame}<g clip-path="url(#qrclip)">${band}</g></g>` : frame;
      const pad = Math.max(U / 2, S * 0.02);
      x1 = fx - pad; y1 = fy - pad; x2 = fx + fw + pad; y2 = fy + fh + pad;
    }

    // Görünüm kutusu tam modüllere yuvarlanır: modül kenarları tam piksele düşer
    x1 = Math.floor(x1 / U) * U; y1 = Math.floor(y1 / U) * U;
    x2 = Math.ceil(x2 / U) * U; y2 = Math.ceil(y2 / U) * U;
    const vw = x2 - x1, vh = y2 - y1;
    const modPx = Math.max(4, Math.floor((OUT_LONG / Math.max(vw, vh)) * U));
    const width = Math.round((vw / U) * modPx);
    const height = Math.round((vh / U) * modPx);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x1} ${y1} ${vw} ${vh}">`
      + (defs ? `<defs>${defs}</defs>` : "")
      + `<g fill="${ink}">${body}</g></svg>`;
    const buffer = await sharp(Buffer.from(svg), { limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
    return { buffer, width, height };
  },
};
