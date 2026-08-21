import sharp from "sharp";
import { createHash } from "node:crypto";
import { generateStyledPhoto, AiProviderError } from "~/lib/ai-provider.server";
import { removeBackgroundFromBuffer } from "~/models/auto-bg-removal.server";
import { buildAiPrompt, type AiTemplateConfig } from "~/lib/ai-styles";
import { countFaces } from "~/lib/face-detect.server";
import type { TextFieldDef } from "~/models/personalizer.server";

/**
 * AI şablonunun kompoziti.
 *
 * Müşterinin fotoğrafı seçilen stille AI'a verilir, dönen görselin arka planı
 * (istenirse) silinir, üstüne isim/hikaye yazıları GERÇEK FONTLA basılır.
 * Yazıyı AI'a bırakmak "My Favorite Person" yerine "My Favorete Persom"
 * üretiyor; bu yüzden metin her zaman burada render edilir.
 *
 * Sonuç saydam zeminli tek PNG'dir ve tasarımcıya normal bir görsel olarak
 * verilir — taşıma, ölçekleme, baskı alanı ve fiyat akışı değişmez.
 */

export interface AiComposeOptions {
  photo: Buffer;
  /** WaveSpeed görseli adresten okur; Cloudflare için gerekmez */
  photoUrl: string;
  config: AiTemplateConfig;
  /** Uygulanacak stil kimliği (şablon varsayılanı ya da müşterinin seçimi) */
  styleId: string;
  textFields?: TextFieldDef[];
  textValues?: Record<string, string>;
  /** Arka plan silme için WaveSpeed anahtarı; yoksa adım atlanır */
  wavespeedKey?: string;
}

export interface AiComposeResult {
  buffer: Buffer;
  /** Fotoğrafta bulunan yüz sayısı; 0 = tespit edilemedi */
  faceCount: number;
  /** Kullanılan sağlayıcı/model — sipariş kaydına yazılır */
  usedModel: string;
  /** AI çıktısının ham piksel eni; kalite uyarısı bunu kullanır */
  generatedPx: number;
  /** Tasarımda kaplanan piksel eni */
  placedPx: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Yalnızca hikâye/not amaçlı alanlar görselin duygusunu etkiler. İsim ve diğer
 * baskı metinleri modele gönderilmez; aşağıdaki SVG katmanında gerçek fontla
 * basılır. Alan kimlikleri eski ve yeni şablonlarda farklı olabildiğinden hem
 * id hem etiket, aksanlardan arındırılmış kelimeler halinde değerlendirilir.
 */
export function extractAiStoryContext(
  fields: TextFieldDef[],
  values: Record<string, string>,
): string {
  const storyWords = new Set(["story", "hikaye", "memory", "ani", "message", "mesaj", "note", "not"]);
  const stories: string[] = [];

  for (const field of fields) {
    const words = `${field.id} ${field.label}`
      .normalize("NFKD")
      .toLocaleLowerCase("tr-TR")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/);
    if (!words.some((word) => storyWords.has(word))) continue;
    const value = String(values[field.id] ?? "").trim();
    if (value) stories.push(value);
  }

  return stories.join(". ");
}

/**
 * Metin katmanı. Uzun "hikaye" alanları tek satıra sığmadığı için kaba bir
 * sarma yapılır: Georgia'da karakter başına ~0.52 em (kalında ~0.63) yer
 * kaplıyor, satır yüksekliği 1.25 em.
 */
function buildTextOverlay(
  fields: TextFieldDef[],
  values: Record<string, string>,
  width: number,
  height: number,
): Buffer | null {
  const parts: string[] = [];

  for (const f of fields) {
    const raw = (values[f.id] ?? "").trim() || (f.default_value ?? "").trim();
    if (!raw) continue;
    const size = Number(f.font_size) || 0;
    if (size <= 0) continue;

    const emPerChar = f.bold ? 0.63 : 0.52;
    const maxChars = Math.max(8, Math.floor((width * 0.9) / (size * emPerChar)));
    const anchor = f.align === "left" ? "start" : f.align === "right" ? "end" : "middle";

    // Kelime bazlı sarma — kelime tek başına sığmıyorsa olduğu gibi bırakılır
    const lines: string[] = [];
    let line = "";
    for (const word of raw.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    lines.forEach((text, i) => {
      const y = Number(f.y) + i * size * 1.25;
      parts.push(
        `<text x="${Number(f.x)}" y="${y}" font-family="Georgia, serif" font-size="${size}"` +
        ` font-weight="${f.bold ? "bold" : "normal"}" fill="${f.color || "#000000"}"` +
        ` text-anchor="${anchor}">${escapeXml(text)}</text>`,
      );
    });
  }

  if (!parts.length) return null;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("\n")}</svg>`,
  );
}

/**
 * Üretilen görsel önbelleği.
 *
 * AI çağrısı hem yavaş hem ücretli. Müşteri aynı fotoğraf + aynı stil + aynı
 * modelle yazıyı değiştirip tekrar ürettiğinde model yeniden çağrılmamalı —
 * değişen tek şey metin katmanı, o da yerel.
 */
interface GenCacheEntry { image: Buffer; at: number }
const GEN_CACHE_MAX = 24;
const GEN_CACHE_TTL_MS = 30 * 60_000;
const genCache = new Map<string, GenCacheEntry>();

function readGenCache(key: string): Buffer | null {
  const hit = genCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > GEN_CACHE_TTL_MS) {
    genCache.delete(key);
    return null;
  }
  genCache.delete(key);
  genCache.set(key, hit);
  return hit.image;
}

function writeGenCache(key: string, image: Buffer): void {
  genCache.set(key, { image, at: Date.now() });
  while (genCache.size > GEN_CACHE_MAX) {
    const oldest = genCache.keys().next().value;
    if (oldest === undefined) break;
    genCache.delete(oldest);
  }
}

export async function composeAiDesign(opts: AiComposeOptions): Promise<AiComposeResult> {
  const { config, styleId } = opts;

  // Kişi sayısı prompt'a yazılır. Söylemezsek model iki kişiyi tek uydurma
  // yüzde birleştirebiliyor ya da olmayan kişi ekleyebiliyor. Vision anahtarı
  // yoksa 0 döner ve prompt sayısız (ama yine kimlik koruyan) hâle düşer.
  const faceCount = await countFaces(opts.photo).catch(() => 0);
  const storyContext = extractAiStoryContext(opts.textFields ?? [], opts.textValues ?? {});
  const prompt = buildAiPrompt(styleId, faceCount, storyContext);

  const cacheKey = createHash("sha256")
    .update(opts.photo)
    .update(`|${config.provider}|${config.model}|${styleId}|${config.canvasWidth}x${config.canvasHeight}|n${faceCount}|`)
    // Prompt değişince (hikâye veya stil kuralları dahil) eski görsel dönmesin.
    .update(prompt)
    .digest("hex");

  let generated = readGenCache(cacheKey);
  if (!generated) {
    generated = await generateStyledPhoto({
      config, prompt, photo: opts.photo, photoUrl: opts.photoUrl,
    });

    if (config.removeBackground && opts.wavespeedKey) {
      generated = await removeBackgroundFromBuffer(opts.wavespeedKey, generated, "ai-design")
        .catch((err) => {
          console.error("[ai-compose] arka plan kaldirilamadi, ham cikti kullaniliyor:", err);
          return generated!;
        });
    }
    writeGenCache(cacheKey, generated);
  }

  const genMeta = await sharp(generated).metadata();
  const generatedPx = genMeta.width ?? 0;

  // Üretilen görsel tuvalin içine oranını koruyarak yerleştirilir; yazı için
  // altta yer bırakılır ki metin alanları görselin üstüne binmesin.
  const hasText = (opts.textFields ?? []).some((f) => (
    (opts.textValues?.[f.id] ?? "").trim() || (f.default_value ?? "").trim()
  ));
  const artHeight = Math.round(config.canvasHeight * (hasText ? 0.78 : 1));
  const art = await sharp(generated)
    .resize(config.canvasWidth, artHeight, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const artMeta = await sharp(art).metadata();

  const composites: sharp.OverlayOptions[] = [{
    input: art,
    left: Math.round((config.canvasWidth - (artMeta.width ?? 0)) / 2),
    top: 0,
  }];

  const overlay = buildTextOverlay(
    opts.textFields ?? [], opts.textValues ?? {}, config.canvasWidth, config.canvasHeight,
  );
  if (overlay) composites.push({ input: overlay });

  const buffer = await sharp({
    create: {
      width: config.canvasWidth, height: config.canvasHeight,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites).png().toBuffer();

  return {
    buffer,
    faceCount,
    usedModel: `${config.provider}/${config.model}`,
    generatedPx,
    placedPx: artMeta.width ?? 0,
  };
}

export { AiProviderError };
