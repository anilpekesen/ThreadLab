import * as opentypeNs from "opentype.js";

/**
 * opentype.js hem CommonJS hem ESM derlemesi yayınlıyor ve `parse` paketleyiciye
 * göre bazen doğrudan ad alanında, bazen `default` altında kalıyor. Vite ile
 * çalışırken `default` boş geldiği için font sessizce yüklenemiyordu; ikisini de
 * kabul ediyoruz.
 */
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default
  ?? opentypeNs) as typeof opentypeNs;

/**
 * Metni yazı yoluna (glyph path) çevirir.
 *
 * Neden: sharp metni librsvg ile çiziyor ve librsvg yalnızca SUNUCUDA KURULU
 * fontları görüyor. Şablonun fontu VPS'e kurulmadıkça baskı sessizce Arial'e
 * düşüyordu — mağaza sahibi bunu ancak ürün elinde basıldığında fark ederdi.
 *
 * Metni yola çevirince SVG içinde font referansı hiç kalmıyor: yalnızca
 * <path> var. Sonuçlar:
 *
 *   - Mağaza kendi fontunu yükleyebiliyor, sunucuya kurulum gerekmiyor
 *   - Aynı dosya her sunucuda birebir aynı basılıyor
 *   - Taşma hesabı tahmin değil, gerçek ölçüm (fontun advance width'i)
 *
 * Font yüklenemezse eski davranışa düşülüyor: font adıyla <text>. Bir siparişin
 * font indirilemedi diye tamamen düşmesindense yanlış fontla basılması yeğdir;
 * çağıran taraf bunu logluyor.
 */

export interface TextLayout {
  /**
   * Harf başına bir SVG path verisi.
   *
   * Tüm metin tek bir <path> olarak verildiğinde librsvg çizimi ortada
   * kesiyor — 28 harflik bir metnin yalnızca ilk üçte biri basılıyordu.
   * Hassasiyeti düşürüp yolu yarıya indirmek de değiştirmedi, yani uzunluk
   * sınırı değil; çok sayıda alt-yol taşıyan tek path'te takılıyor. Harfleri
   * ayrı path'lere bölmek sorunu tamamen kaldırıyor.
   */
  paths: string[];
  /** Kullanılan punto — taşma varsa küçültülmüş hali */
  fontSize: number;
  /** Çizilen metnin gerçek genişliği */
  width: number;
}

/** Yüklenmiş fontlar süreç belleğinde tutulur; her sipariş için yeniden indirilmez. */
const cache = new Map<string, opentypeNs.Font>();
/** Sınırsız büyümesin — mağaza yüzlerce font yükleyebilir */
const MAX_CACHED = 24;
const FETCH_TIMEOUT = 20_000;

export async function loadFont(url: string): Promise<opentypeNs.Font | null> {
  const key = String(url ?? "").trim();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit) {
    // Son kullanılan sona alınır; taşma anında en eskisi düşer
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  try {
    const res = await fetch(key, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const font = opentype.parse(await res.arrayBuffer());
    cache.set(key, font);
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    return font;
  } catch (err) {
    console.error(`[text-render] font yüklenemedi (${key}):`, err);
    return null;
  }
}

/**
 * Yüklenen dosyanın gerçekten okunabilir bir font olup olmadığını söyler.
 *
 * Yükleme anında çağrılıyor: bozuk ya da desteklenmeyen (woff2) bir dosya
 * baskı anında değil, mağaza sahibi karşısındayken reddedilsin.
 */
export function inspectFont(buffer: Buffer): { family: string; style: string; glyphCount: number } | null {
  try {
    const view = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const font = opentype.parse(view);
    // opentype.js 2.x isimleri platforma göre gruplandırıyor: names.windows ve
    // names.macintosh. Hangisinin dolu olduğu fonta göre değişiyor, ikisine de
    // bakıyoruz; eski sürümlerdeki düz yapı da desteklensin diye kök de dahil.
    type NameTable = Record<string, Record<string, string> | undefined>;
    const raw = font.names as unknown as Record<string, unknown>;
    const groups: NameTable[] = [
      raw.windows as NameTable,
      raw.macintosh as NameTable,
      raw as NameTable,
    ].filter(Boolean);

    const pick = (key: string): string => {
      for (const g of groups) {
        const entry = g?.[key];
        if (entry && typeof entry === "object") {
          const value = entry.en ?? Object.values(entry)[0];
          if (value) return String(value);
        }
      }
      return "";
    };

    // Ayrıştırma yetmiyor: font metni gerçekten çizebilmeli. Çizemeyen bir
    // fontu kabul etsek hata ancak sipariş anında ortaya çıkardı.
    if (!canRender(font)) return null;

    return {
      family: pick("fontFamily") || "Adsız",
      style: pick("fontSubfamily") || "Regular",
      glyphCount: font.numGlyphs,
    };
  } catch (err) {
    console.error("[text-render] font ayrıştırılamadı:", err);
    return null;
  }
}

/**
 * Fontun bu puntoda ürettiği gerçek metin genişliği.
 *
 * Ölçüm de çizim de fontun biçimlendirme tablolarını çalıştırıyor ve
 * opentype.js bazı tabloları desteklemiyor ("substitutionType 62 ... not yet
 * supported"). Bu, ayrıştırması sorunsuz geçen bir fontta bile OLABİLİR;
 * yakalanmazsa siparişin baskı üretimi tamamen düşüyor.
 */
export function measure(font: opentypeNs.Font, text: string, fontSize: number): number {
  try {
    return font.getAdvanceWidth(text, fontSize);
  } catch (err) {
    console.error("[text-render] metin ölçülemedi:", err);
    return 0;
  }
}

/** Font verilen metni gerçekten çizebiliyor mu — yükleme anında denenir */
export function canRender(font: opentypeNs.Font, text = "Deneme ĞÜŞİÖÇ 123"): boolean {
  try {
    const yollar = font.getPaths(text, 0, 0, 40).map((p) => commandsToPathData(p.commands));
    return yollar.some((d) => d.length > 2);
  } catch (err) {
    console.error("[text-render] font metni çizemedi:", err);
    return false;
  }
}

export interface LayoutOptions {
  text: string;
  font: opentypeNs.Font;
  fontSize: number;
  /** Metin kutusu */
  box: { x: number; y: number; width: number; height: number };
  align: "left" | "center" | "right";
  overflow: "shrink" | "clip";
  /** Puntonun inebileceği alt sınır; bundan küçüğü baskıda okunmuyor */
  minFontSize?: number;
}

/**
 * Metni kutuya yerleştirip yolunu üretir.
 *
 * Dikey hizalama fontun kendi ölçülerinden hesaplanıyor: ascender ve descender
 * ortalanıyor. `dominant-baseline` gibi yaklaşık bir kaçamak değil — küçük
 * puntolarda bir iki pikselin kaydığı yer burasıdır.
 */
export function layoutText(opts: LayoutOptions): TextLayout {
  const { font, box, align } = opts;
  const text = opts.text;
  if (!text) return { paths: [], fontSize: opts.fontSize, width: 0 };

  let fontSize = opts.fontSize;
  let width = measure(font, text, fontSize);

  if (opts.overflow === "shrink" && width > 0 && width > box.width) {
    const min = opts.minFontSize ?? 8;
    fontSize = Math.max(min, Math.floor(fontSize * (box.width / width)));
    width = measure(font, text, fontSize);
  }

  const scale = fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = font.descender * scale; // negatif
  // Görsel orta: harflerin üst ve alt sınırının ortası
  const baselineY = box.y + box.height / 2 + (ascender + descender) / 2;

  const x = align === "right" ? box.x + box.width - width
    : align === "center" ? box.x + (box.width - width) / 2
    : box.x;

  let paths: string[] = [];
  try {
    paths = font
      .getPaths(text, x, baselineY, fontSize)
      .map((p) => commandsToPathData(p.commands))
      .filter((d) => d.length > 2); // boşluk gibi çizimi olmayan glifler
  } catch (err) {
    // Çağıran boş yol listesini "bu fontla çizilemedi" olarak okuyup sistem
    // fontuna düşüyor; sipariş düşmüyor.
    console.error("[text-render] metin çizilemedi, sistem fontuna düşülecek:", err);
    paths = [];
  }
  return { paths, fontSize, width };
}

/** 300 dpi'da 0.1 piksel gözle görülmez; veri gereksiz büyümesin */
const PRECISION = 1;

function num(v: number): string {
  return Number(v.toFixed(PRECISION)).toString();
}

/**
 * Glif komutlarını SVG path verisine çevirir.
 *
 * opentype.js'in kendi `toPathData()` metodu kullanılmıyor: çıktısına `NaN`
 * karışıyor (ham komutlarda yokken). librsvg geçersiz sayıyı görünce yolun
 * geri kalanını çizmeden bırakıyor — sonuç, metnin ortadan itibaren kaybolması.
 * Kendi serileştirmemiz komutları olduğu gibi yazıyor ve sayı olmayan bir değer
 * gördüğünde o glifi tamamen atıyor: eksik bir harf, yarım basılmış bir
 * tasarımdan iyidir ve loga düşer.
 */
function commandsToPathData(commands: opentypeNs.PathCommand[]): string {
  const out: string[] = [];

  for (const cmd of commands) {
    switch (cmd.type) {
      case "M": out.push(`M${num(cmd.x)} ${num(cmd.y)}`); break;
      case "L": out.push(`L${num(cmd.x)} ${num(cmd.y)}`); break;
      case "Q": out.push(`Q${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x)} ${num(cmd.y)}`); break;
      case "C": out.push(`C${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x2)} ${num(cmd.y2)} ${num(cmd.x)} ${num(cmd.y)}`); break;
      case "Z": out.push("Z"); break;
      default: break;
    }
  }

  const d = out.join("");
  if (d.includes("NaN") || d.includes("Infinity")) {
    console.error("[text-render] glif geçersiz koordinat içeriyor, atlandı");
    return "";
  }
  return d;
}
