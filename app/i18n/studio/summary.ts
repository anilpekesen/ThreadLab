// Şablon sayfasındaki stüdyo özeti (app/components/studio/StudioSummary.tsx)
const tr = {
  layoutAria: (name: string) => `${name} düzeni`,
  noSize: "Ölçü seçilmedi",
  slotCounts: (images: number, texts: number) => `${images} fotoğraf alanı · ${texts} yazı alanı`,
  pieceSet: (n: number) => `${n} parçalı set`,
  mockupCount: (n: number) => `${n} ürün görseli`,
  noMockups: "Ürün görseli yok",
};

const en: typeof tr = {
  layoutAria: (name) => `${name} layout`,
  noSize: "No size selected",
  slotCounts: (images, texts) => `${images} photo ${images === 1 ? "slot" : "slots"} · ${texts} text ${texts === 1 ? "slot" : "slots"}`,
  pieceSet: (n) => `${n}-piece set`,
  mockupCount: (n) => `${n} product ${n === 1 ? "image" : "images"}`,
  noMockups: "No product images",
};

export default { tr, en };
