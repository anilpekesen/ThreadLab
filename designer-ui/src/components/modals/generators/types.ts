/** Üretici pencerelerinin ortak sözleşmesi (sunucu: app/lib/generators) */
export type GeneratorKind = 'song' | 'monogram' | 'starmap' | 'citymap' | 'birthflower';

export type GeneratorChoices = Record<string, string | number | boolean>;

export interface GeneratorDraft {
  fields: Record<string, string>;
  choices: GeneratorChoices;
}

export interface GeneratorModalProps<A = Record<string, unknown>> {
  /** template-assets yanıtı: modülün publicAssets çıktısı + templateName */
  assets: A & { templateName: string; generatorKind: GeneratorKind };
  isTurkish: boolean;
  /** Seçili tişört rengi; varsayılan mürekkep ve önizleme zemini buna göre */
  garment?: import('./garment').Garment | null;
  /** Pencere daha önce kullanıldıysa son girilenler */
  initial?: GeneratorDraft | null;
  /** Girdiyi sunucuya gönderip hazır tasarımın adresini alır */
  onRender: (fields: Record<string, string>, choices: GeneratorChoices, photo?: File | null) => Promise<{ url: string }>;
  onCancel: () => void;
  onConfirm: (url: string) => void;
}
