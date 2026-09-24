const tr = {
  typeLabels: {
    apparel: "T-shirt / giyim",
    sweatshirt: "Sweatshirt / hoodie",
    bag: "Canta",
    mug: "Bardak / kupa",
    boxer: "Baksir / boxer",
    other: "Diger",
  } as Record<string, string>,
  search: "Ara",
  noMatches: "Eslesen urun bulunamadi.",
  active: "Aktif",
  inactive: "Pasif",
  productType: "Urun tipi",
  printSides: "Baski yuzleri",
  frontOnly: "Sadece on",
  frontAndBack: "On + arka",
  openSettings: "Ayarları aç",
};

const en: typeof tr = {
  typeLabels: {
    apparel: "T-shirt / apparel",
    sweatshirt: "Sweatshirt / hoodie",
    bag: "Bag",
    mug: "Mug / cup",
    boxer: "Boxer",
    other: "Other",
  },
  search: "Search",
  noMatches: "No matching products found.",
  active: "Active",
  inactive: "Inactive",
  productType: "Product type",
  printSides: "Print sides",
  frontOnly: "Front only",
  frontAndBack: "Front + back",
  openSettings: "Open settings",
};

export default { tr, en };
