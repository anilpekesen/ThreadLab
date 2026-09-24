// Kart tabakası formu (app/components/studio/CardGridForm.tsx)
const tr = {
  title: "Kart tabakası",
  intro: "Kartlar tabakaya dizilir, basılır ve tek tek kesilir. Her kart için bir fotoğraf alanı, istenirse altında bir yazı alanı açılır.",
  cardWidth: "Kart eni",
  cardHeight: "Kart boyu",
  photoMargin: "Fotoğraf kenarı",
  cardGap: "Kartlar arası",
  withCaption: "Kartın altında yazı alanı olsun",
  withCaptionHelp: "Müşteri her kart için kısa bir yazı girer.",
  captionSpace: "Yazı payı",
  cardLimit: "Bu tabakadaki kart sayısı",
  fits: (cols: number, rows: number, count: number, make: number, photoW: number, photoH: number) =>
    `Tabakaya ${cols} × ${rows} = ${count} kart sığıyor; ${make} kart oluşturulacak. Fotoğraf alanı ${photoW} × ${photoH} mm. (0 yazarsanız sığan kadar.)`,
  noFit: "Bu ölçüdeki kart tabakaya sığmıyor; kartı küçültün ya da daha büyük bir ölçü seçin.",
  replace: "Mevcut alanların yerine koy",
  create: "Kartları oluştur",
  cancel: "Vazgeç",
};

const en: typeof tr = {
  title: "Card sheet",
  intro: "Cards are laid out on a sheet, printed and cut one by one. Each card gets a photo slot and, if you like, a text slot below it.",
  cardWidth: "Card width",
  cardHeight: "Card height",
  photoMargin: "Photo border",
  cardGap: "Space between cards",
  withCaption: "Add a text slot below each card",
  withCaptionHelp: "The customer enters a short caption for each card.",
  captionSpace: "Caption space",
  cardLimit: "Cards on this sheet",
  fits: (cols, rows, count, make, photoW, photoH) =>
    `${cols} × ${rows} = ${count} cards fit on the sheet; ${make} will be created. Photo slot ${photoW} × ${photoH} mm. (Enter 0 to fill the sheet.)`,
  noFit: "A card this size doesn't fit on the sheet; make the card smaller or choose a larger size.",
  replace: "Replace existing slots",
  create: "Create cards",
  cancel: "Cancel",
};

export default { tr, en };
