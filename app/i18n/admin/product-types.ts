// Öneri çipleri ürün tipi adını doldurur; ad normalizeProductType ile
// sweatshirt/bag/mug/boxer/other/apparel tipine eşlenir. İngilizce karşılıklar
// aynı tipe düşecek şekilde seçildi ("Şort" → boxer, bu yüzden "Boxer shorts").
const tr = {
  typeSuggestions: ["Tişört", "Sweatshirt", "Hoodie", "Polo", "Bez Çanta", "Kupa", "Boxer", "Şort", "Diğer"],
  planLimitReached: "Plan limitine ulaştınız",
  defaultTypeName: "Yeni Ürün Tipi",
  notFound: "Ürün tipi bulunamadı",
};

const en: typeof tr = {
  typeSuggestions: ["T-shirt", "Sweatshirt", "Hoodie", "Polo", "Tote bag", "Mug", "Boxer", "Boxer shorts", "Other"],
  planLimitReached: "You've reached your plan limit",
  defaultTypeName: "New product type",
  notFound: "Product type not found",
};

export default { tr, en };
