// Ana sayfadaki "kurulum durumu" kartı (Built for Shopify 4.2.3: ana sayfa
// uygulamanın kurulu ve çalışır olup olmadığını açıkça göstermeli)
const tr = {
  title: "Kurulum durumu",
  allDone: "PrintLab kurulu ve çalışıyor.",
  steps: (done: number, total: number) => `${done}/${total} adım tamamlandı`,
  productTitle: "Bir ürünü kişiselleştirmeye açın",
  productDone: (n: number) => `${n} ürün kişiselleştirmeye açık.`,
  productTodo: "Ürün seçip baskı alanını ve fiyatı ayarlayın ya da bir kişileştirici şablonu bağlayın.",
  productAction: "Ürün ayarla",
  storeTitle: "Tasarımcıyı mağazanıza ekleyin",
  storeDone: (when: string) => `Tasarımcı mağazanızda çalışıyor (son açılış: ${when}).`,
  storeTodo: "Tema düzenleyicide ürün sayfanıza PrintLab bloğunu ekleyip kaydedin. Ekledikten sonra ürün sayfanızı bir kez açın.",
  storeAction: "Tema düzenleyicide aç",
  orderTitle: "İlk kişiselleştirilmiş siparişi alın",
  orderDone: (n: number) => `${n} kişiselleştirilmiş sipariş alındı.`,
  orderTodo: "Müşteriniz tasarlayıp sipariş verdiğinde baskı dosyası burada ve Siparişler sayfasında görünür.",
  orderAction: "Siparişler",
  help: "Takıldınız mı? Kurulumu birlikte yapalım",
};

const en: typeof tr = {
  title: "Setup status",
  allDone: "PrintLab is set up and working.",
  steps: (done, total) => `${done} of ${total} steps done`,
  productTitle: "Turn on personalization for a product",
  productDone: (n) => `${n} product${n === 1 ? "" : "s"} with personalization on.`,
  productTodo: "Pick a product and set its print area and price, or link a personalizer template.",
  productAction: "Set up a product",
  storeTitle: "Add the designer to your store",
  storeDone: (when) => `The designer is working in your store (last opened: ${when}).`,
  storeTodo: "In the theme editor, add the PrintLab block to your product page and save. Then open a product page once.",
  storeAction: "Open theme editor",
  orderTitle: "Get your first personalized order",
  orderDone: (n) => `${n} personalized order${n === 1 ? "" : "s"} received.`,
  orderTodo: "When a customer designs and orders, the print file shows up here and on the Orders page.",
  orderAction: "Orders",
  help: "Stuck? Let's set it up together",
};

export default { tr, en };
