const tr = {
  invalidPack: "Geçersiz paket",
  packLabel: (n: number) => `${n} AI Kredisi`,
  refundWarning:
    "⚠️ AI kredi paketleri dijital ürün niteliğindedir. Satın alım onaylandıktan sonra iade veya iptal yapılamaz. Krediler 30 gün içinde kullanılmadığında sona erer.",
  dateHeading: "Tarih",
  dateLocale: "tr-TR",
};

const en: typeof tr = {
  invalidPack: "Invalid pack",
  packLabel: (n) => `${n} AI credits`,
  refundWarning:
    "⚠️ AI credit packs are digital products. Purchases can't be refunded or cancelled once approved. Credits expire if not used within 30 days.",
  dateHeading: "Date",
  dateLocale: "en-US",
};

export default { tr, en };
