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
  /** Modele gönderilen İngilizce yönerge; müşteri metni buraya asla girmez */
  prompt: string;
}

export const AI_STYLES: Record<string, AiStyleDef> = {
  caricature: {
    label: "Karikatür",
    labelEn: "Caricature",
    prompt:
      "Transform this person into a cartoon caricature illustration. Exaggerate facial features in a fun way. Vibrant colors, clean bold outlines, comic book style, white background. Keep the person's likeness recognizable.",
  },
  watercolor: {
    label: "Suluboya",
    labelEn: "Watercolor",
    prompt:
      "Transform this portrait into a beautiful watercolor painting style. Soft blended colors, artistic brush strokes, slightly abstract, painterly texture, white background. Keep the person recognizable.",
  },
  sketch: {
    label: "Karakalem",
    labelEn: "Pencil sketch",
    prompt:
      "Transform this portrait into a detailed pencil sketch illustration. Hatching, cross-hatching shading, clean lines, strong contrast, black and white on a plain white background, professional artistic sketch style.",
  },
  pop_art: {
    label: "Pop Art",
    labelEn: "Pop art",
    prompt:
      "Transform this portrait into a bold pop art illustration. Ben-Day dots, flat bright colors, bold black outlines, Andy Warhol comic book style, high contrast, white background.",
  },
  line_art: {
    label: "Tek Çizgi",
    labelEn: "Line art",
    prompt:
      "Transform this portrait into a minimal single-weight line art illustration. Clean continuous black lines on a plain white background, no shading, no gradients, high contrast, suitable for apparel printing.",
  },
};

export function isKnownAiStyle(id: string): boolean {
  return id in AI_STYLES;
}

export function aiStylePrompt(id: string): string {
  return (AI_STYLES[id] ?? AI_STYLES.caricature).prompt;
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
