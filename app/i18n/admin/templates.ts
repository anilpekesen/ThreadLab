const tr = {
  uploadFailed: "Dosya yüklenemedi. PNG, JPG, WebP veya SVG formatında en fazla 20 MB görsel yükleyin.",
  defaultName: "Şablon",
  defaultCategory: "Genel",
  noImage: "Görsel seçilmedi",
  tooLarge: "Görsel 20 MB sınırını aşıyor",
  badType: "PNG, JPG, WebP veya SVG formatında görsel yükleyin",
  quotaReached: (count: number, quota: number) =>
    `Planınızın şablon limiti doldu (${count}/${quota}). Plan yükseltmek için Abonelik sayfasını ziyaret edin.`,
  saveFailed: "Yükleme başarısız",
  unknownAction: "Bilinmeyen işlem",
  quotaTitle: "Şablon Kotası",
  previewAlt: "Önizleme",
  namePlaceholder: "örn. Spider-Man, Bugs Bunny, Çiçek Logo",
};

const en: typeof tr = {
  uploadFailed: "Couldn't upload the file. Upload a PNG, JPG, WebP or SVG image up to 20 MB.",
  defaultName: "Template",
  defaultCategory: "General",
  noImage: "No image selected",
  tooLarge: "Image exceeds the 20 MB limit",
  badType: "Upload a PNG, JPG, WebP or SVG image",
  quotaReached: (count, quota) =>
    `Your plan's template limit is reached (${count}/${quota}). Visit the Billing page to upgrade your plan.`,
  saveFailed: "Upload failed",
  unknownAction: "Unknown action",
  quotaTitle: "Template quota",
  previewAlt: "Preview",
  namePlaceholder: "e.g. Spider-Man, Bugs Bunny, Flower logo",
};

export default { tr, en };
