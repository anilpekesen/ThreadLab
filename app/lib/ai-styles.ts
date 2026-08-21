/**
 * AI şablonlarının stil ve sağlayıcı kataloğu.
 *
 * Model kimlikleri eskiden çağrı yapan dosyaların içine gömülüydü; WaveSpeed
 * bir model adını değiştirdiğinde üretim 400 "Model not found" almıştı. Katalog
 * burada durur, şablon hangi sağlayıcı/modeli kullanacağını kendi kaydında
 * tutar, kod hiçbir yere model adı gömmez.
 *
 * Bu dosya istemciye de gidebilir (yalnızca veri, sır yok) — admin ekranı ve
 * müşteri penceresi etiketleri buradan okur.
 */

export interface AiStyleDef {
  /** Türkçe etiket — müşteri penceresinde görünür */
  label: string;
  labelEn: string;
  /**
   * Yalnızca ÇİZİM STİLİNİ anlatan yönerge. Kimin çizileceğini söylemez —
   * onu buildAiPrompt'taki ortak "konu" cümlesi belirler. Müşteri metni
   * buraya asla girmez.
   */
  style: string;
}

export const AI_STYLES: Record<string, AiStyleDef> = {
  caricature: {
    label: "Karikatür",
    labelEn: "Caricature",
    style:
      "Redraw them as a clean cartoon illustration for apparel printing: bold clean outlines, "
      + "flat vibrant colours, simple shading, plain solid white background, no scenery.",
  },
  watercolor: {
    label: "Suluboya",
    labelEn: "Watercolor",
    style:
      "Redraw them as a watercolour painting: soft blended washes, visible brush strokes, "
      + "gentle colour bleeds, plain white background, no scenery.",
  },
  sketch: {
    label: "Karakalem",
    labelEn: "Pencil sketch",
    style:
      "Redraw them as a detailed pencil sketch: hatching and cross-hatching shading, clean confident lines, "
      + "strong contrast, black and white on a plain solid white background.",
  },
  pop_art: {
    label: "Pop Art",
    labelEn: "Pop art",
    style:
      "Redraw them as a bold pop art illustration: Ben-Day dots, flat bright colours, heavy black outlines, "
      + "high contrast, plain solid white background.",
  },
  line_art: {
    label: "Tek Çizgi",
    labelEn: "Line art",
    style:
      "Redraw them as a minimal single-weight black line art illustration: clean continuous black lines "
      + "on a plain solid white background, no shading, no gradients, high contrast.",
  },
};

/**
 * Konu cümlesi — çizim stilinden bağımsız, kimin çizileceğini söyler.
 *
 * Eski promptlar "Transform THIS PERSON... exaggerate facial features" diyordu.
 * Ölçümde iki kişilik bir fotoğraftan tek bir uydurma kişi çıkıyordu: tekil
 * hitap modele birleştirme izni veriyor, "abart" talimatı da benzerliği
 * bozuyordu. Kişi sayısını açıkça söylemek ve kimliği kalem kalem saymak
 * ikisini de düzeltti (21 Ağustos 2026 ölçümü, gerçek çift fotoğrafı).
 */
export function buildAiSubject(faceCount: number): string {
  if (faceCount >= 2) {
    return `This photo contains exactly ${faceCount} people. `
      + `Your output must contain exactly ${faceCount} people — the same ${faceCount} people, once each. `
      + "Do not remove anyone, do not add anyone, do not duplicate anyone, do not merge two people into one. "
      + "Keep their relative positions and poses as in the photo. "
      + "Preserve each person's identity precisely: face shape, eye colour, eyebrows, nose, mouth, "
      + "hairstyle and hair colour, facial hair, skin tone and glasses if present, "
      + "so each person stays clearly recognisable. ";
  }
  // Sayı bilinmiyorsa (Vision anahtarı yok/hata) tekil ama kimliği koruyan hâl
  return "Keep every person who appears in the photo, once each, in the same pose. "
    + "Preserve their identity precisely: face shape, eye colour, eyebrows, nose, mouth, "
    + "hairstyle and hair colour, facial hair, skin tone and glasses if present, "
    + "so they stay clearly recognisable. ";
}

export function isKnownAiStyle(id: string): boolean {
  return id in AI_STYLES;
}

/** Konu + stil + ortak kurallardan modele gidecek son prompt */
export function buildAiPrompt(styleId: string, faceCount: number): string {
  const style = (AI_STYLES[styleId] ?? AI_STYLES.caricature).style;
  return buildAiSubject(faceCount) + style
    + " Do not add any text, lettering or watermark.";
}

// ── Sağlayıcılar ────────────────────────────────────────────────────────────

export type AiProvider = "wavespeed" | "cloudflare";

export interface AiModelDef {
  id: string;
  label: string;
  /** Yönetici model seçerken görmesi gereken ölçülmüş davranış */
  note: string;
}

export interface AiProviderDef {
  label: string;
  models: AiModelDef[];
}

/**
 * Notlar 21 Ağustos 2026'da aynı fotoğraf ve aynı promptla yapılan ölçüme
 * dayanır (bkz. docs/ai-tasarim-sistemi-analizi.md).
 */
export const AI_PROVIDERS: Record<AiProvider, AiProviderDef> = {
  wavespeed: {
    label: "WaveSpeed",
    models: [
      {
        id: "flux-kontext-pro",
        label: "FLUX Kontext Pro",
        note: "En iyi baskı kalitesi: güçlü kontrast, temiz beyaz zemin, göz/saç rengini korur. ~11-15 sn, ~$0.04. İçerik filtresi katı — bazı fotoğrafları reddeder.",
      },
    ],
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    models: [
      {
        id: "flux-2-klein-9b",
        label: "FLUX.2 Klein 9B",
        note: "3 kat hızlı (~3 sn), ~$0.017. Girdi 512px'e düşürülür, çizgiler daha soluk, göz rengini değiştirebilir. Önizleme için uygun.",
      },
      {
        id: "flux-2-klein-4b",
        label: "FLUX.2 Klein 4B",
        note: "En ucuz ve toleranslı ama en düşük kalite; zemini temiz bırakmaz.",
      },
    ],
  },
};

export interface AiTemplateConfig {
  provider: AiProvider;
  /** AI_PROVIDERS içindeki model kimliği */
  model: string;
  /** Üretilecek tasarımın piksel tuvali */
  canvasWidth: number;
  canvasHeight: number;
  /** AI çıktısının arka planı silinip saydam PNG üretilsin mi */
  removeBackground: boolean;
}

export const DEFAULT_AI_CONFIG: AiTemplateConfig = {
  provider: "wavespeed",
  model: "flux-kontext-pro",
  canvasWidth: 2400,
  canvasHeight: 3000,
  removeBackground: true,
};

export function normalizeAiConfig(raw: unknown): AiTemplateConfig {
  const c = (raw ?? {}) as Partial<AiTemplateConfig>;
  const provider: AiProvider = c.provider === "cloudflare" ? "cloudflare" : "wavespeed";
  const known = AI_PROVIDERS[provider].models.some((m) => m.id === c.model);
  const clamp = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(6000, Math.max(600, Math.round(n))) : fallback;
  };
  return {
    provider,
    // Şablona elle yazılmış tanınmayan bir model üretimde 400 döndürürdü;
    // sağlayıcının ilk modeline düşülür.
    model: known ? String(c.model) : AI_PROVIDERS[provider].models[0].id,
    canvasWidth: clamp(c.canvasWidth, DEFAULT_AI_CONFIG.canvasWidth),
    canvasHeight: clamp(c.canvasHeight, DEFAULT_AI_CONFIG.canvasHeight),
    removeBackground: c.removeBackground !== false,
  };
}
