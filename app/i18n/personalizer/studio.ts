const tr = {
  notFound: "Şablon bulunamadı",
  defaultPieceName: "Tasarım",
  invalidRequest: "Geçersiz istek",
  sizeRequired: "Genişlik ve yükseklik gerekli",
  unknownIntent: "Bilinmeyen işlem",
  nothingToSave: "Kaydedilecek tasarım yok",
  unknownError: "bilinmeyen hata",
  metafieldPartial: (errors: string) =>
    `Tasarım kaydedildi ama bağlı ürünlerin bir kısmı güncellenemedi: ${errors}. Şablon listesinde "Bağlantıları denetle"ye basın.`,
};

const en: typeof tr = {
  notFound: "Template not found",
  defaultPieceName: "Design",
  invalidRequest: "Invalid request",
  sizeRequired: "Width and height are required",
  unknownIntent: "Unknown action",
  nothingToSave: "There's no design to save",
  unknownError: "unknown error",
  metafieldPartial: (errors) =>
    `Design saved, but some linked products couldn't be updated: ${errors}. Click "Check links" in the template list.`,
};

export default { tr, en };
