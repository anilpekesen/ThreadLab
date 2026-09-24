const tr = {
  orderNotFound: "Sipariş bulunamadı",
  noDesignFileToUpload: "Yüklenecek tasarım dosyası bulunamadı",
  underlineYes: "var",
  openBadge: "Açık",
  downloadAll: (n: number) => `Hepsini indir (${n} dosya)`,
  printFileN: (n: number) => `${n}. baskı dosyası`,
};

const en: typeof tr = {
  orderNotFound: "Order not found",
  noDesignFileToUpload: "No design files found to upload",
  underlineYes: "yes",
  openBadge: "Open",
  downloadAll: (n) => `Download all (${n} files)`,
  printFileN: (n) => `Print file ${n}`,
};

export default { tr, en };
