// Öneri çipleri ürün tipi adını doldurur; ad normalizeProductType ile
// sweatshirt/bag/mug/boxer/other/apparel tipine eşlenir. İngilizce karşılıklar
// aynı tipe düşecek şekilde seçildi ("Şort" → boxer, bu yüzden "Boxer shorts").
const tr = {
  typeSuggestions: ["Tişört", "Sweatshirt", "Hoodie", "Polo", "Bez Çanta", "Kupa", "Boxer", "Şort", "Diğer"],
  planLimitReached: "Plan limitine ulaştınız",
  defaultTypeName: "Yeni Ürün Tipi",
  notFound: "Ürün tipi bulunamadı",
  // Ürün tipi düzenleme sayfasının yardımı (liste sayfasının yardımı ortak sözlükte)
  detailHelp: [
    {
      title: "Bu sayfa ne işe yarar?",
      body: "Bir ürün tipinin adını, baskı yüzünü ve bağlı olduğu Shopify ürününü buradan yönetirsiniz. Her ürün tipine tek bir Shopify ürünü atanır. Baskı alanı, fiyatlandırma bantları ve tasarım ücreti gibi asıl ayarlar ise atanan ürünün sayfasında yapılır; oraya \"Baskı Alanı & Tasarım Ücreti →\" düğmesiyle geçersiniz.",
    },
    {
      title: "Adım adım",
      body: "1. \"Ürün Tipi Adı\"nı yazın ya da alttaki önerilerden birine tıklayın, \"Baskı Yüzü\"nü seçin (\"Ön + Arka\" ya da \"Sadece Ön\") ve \"Kaydet\"e basın.\n2. \"Ürün Seç\"e basın, ürünü adıyla ya da handle'ıyla arayın ve \"Seç\"e tıklayın. Ürün tasarım aracında etkinleşir ve seçili baskı yüzüyle açılır.\n3. \"Baskı Alanı & Tasarım Ücreti →\" ile ürün sayfasına geçip baskı alanını ve fiyatları ayarlayın.",
    },
    {
      title: "Ad neden önemli?",
      body: "Ad yalnızca bir etiket değildir: içindeki kelimeye göre ürünün türü belirlenir. \"sweat\", \"hoodie\" → sweatshirt; \"çanta\", \"bez\" → çanta; \"kupa\", \"bardak\" → kupa; \"boxer\", \"şort\" → boxer; \"diğer\", \"poster\" → diğer; geri kalan her şey → giyim. Ürün sayfasında baskı alanı kaydedilene kadar bu türün varsayılan baskı alanı kullanılır. Öneri çipleri doğru türe düşecek şekilde seçilmiştir.",
    },
    {
      title: "Dikkat edilmesi gerekenler",
      body: "• Baskı yüzü ürüne yalnızca \"Seç\" anında aktarılır. Ürün atandıktan sonra burada baskı yüzünü değiştirip kaydetmek tasarım aracını değiştirmez; ürün sayfasındaki \"Yüz modu\" ayarını kullanın.\n• \"Seç\", ürünün tasarım ayarlarını baştan yazar. Ürünü daha sonra yeniden seçerseniz ürün sayfasında yaptığınız fiyat bantları, varyant görselleri ve beden tablosu gibi ayarlar varsayılana döner. Ürünü bir kez seçin, ayarları sonra yapın.\n• \"Ürünü Kaldır\" bu ürün tipi ile ürün arasındaki bağı kaldırır.\n• Aradığınız ürün listede yoksa adını ya da handle'ını yazıp \"Ara\"ya basın.",
    },
  ],
};

const en: typeof tr = {
  typeSuggestions: ["T-shirt", "Sweatshirt", "Hoodie", "Polo", "Tote bag", "Mug", "Boxer", "Boxer shorts", "Other"],
  planLimitReached: "You've reached your plan limit",
  defaultTypeName: "New product type",
  notFound: "Product type not found",
  detailHelp: [
    {
      title: "What is this page for?",
      body: "Here you manage a product type's name, print surface and the Shopify product it's linked to. Each product type gets exactly one Shopify product. The main settings, such as print area, pricing bands and design fee, live on that product's page; get there with the \"Print Area & Design Fee →\" button.",
    },
    {
      title: "Step by step",
      body: "1. Type a \"Product Type Name\" or click one of the suggestions below it, choose the \"Print Surface\" (\"Front + Back\" or \"Front Only\") and click \"Save\".\n2. Click \"Select Product\", search for the product by title or handle and click \"Select\". The product is switched on in the design tool with the print surface you chose.\n3. Use \"Print Area & Design Fee →\" to open the product page and set up the print area and prices.",
    },
    {
      title: "Why does the name matter?",
      body: "The name isn't just a label: the words in it decide the product kind. \"sweat\" or \"hoodie\" → sweatshirt; \"bag\" → bag; \"mug\" or \"cup\" → mug; \"boxer\" → boxer; \"other\" or \"poster\" → other; anything else → apparel. Until you save a print area on the product page, that kind's default print area is used. The suggestion chips are picked so they land on the right kind.",
    },
    {
      title: "Things to watch out for",
      body: "• The print surface is copied to the product only when you click \"Select\". Changing it here and saving after the product is assigned doesn't change the design tool; use the \"Sides\" setting on the product page instead.\n• \"Select\" rewrites the product's design settings from scratch. If you select the product again later, the pricing bands, variant images, size chart and other settings you made on the product page go back to their defaults. Select the product once, then configure it.\n• \"Remove Product\" removes the link between this product type and the product.\n• If the product you want isn't listed, type its title or handle and click \"Search\".",
    },
  ],
};

export default { tr, en };
