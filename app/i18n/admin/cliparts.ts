const tr = {
  defaultName: "Klipart",
  noFile: "Dosya seçilmedi",
  tooLarge: "Dosya 5 MB sınırını aşıyor",
  genericError: "Hata",
  unknownAction: "Bilinmeyen işlem",
  help: [
    {
      title: "Bu sayfa ne işe yarar?",
      body: "Klipart Kütüphanesi, müşterinin ürün tasarım aracında kullanabileceği hazır grafikleri yönetir. Müşteri bunları tasarım aracının \"İlham al\" sekmesinde, \"Grafik Kütüphanesi\" başlığı altında görür. Bir klipartı tıkladığında klipart baskı alanının ortasına eklenir; müşteri onu taşıyıp boyutlandırabilir.",
    },
    {
      title: "Adım adım klipart ekleme",
      body: "1. \"Görsel seçmek için tıkla\" ile dosyayı seçin (en fazla 5 MB). Önizleme kutuda görünür.\n2. \"Klipart Adı\": dosya adından otomatik dolar; müşteri imleci klipartın üzerine getirince bu adı görür.\n3. \"Kategori\" seçin.\n4. \"Kaydet\"e basın. Klipart \"Mevcut Klipartlar\" listesine Aktif olarak eklenir ve tasarım aracında hemen görünür.",
    },
    {
      title: "Hangi format kullanılmalı?",
      body: "Klipartları SVG olarak yükleyin. Tasarım aracı klipartları vektör (SVG) olarak yükler; sayfa PNG, JPG ve WebP dosyalarını da kabul etse de bu dosyalar müşterinin tasarımına eklenmez. SVG ayrıca her boyutta net basılır. Yeni bir klipart ekledikten sonra mağazanızda bir ürünün tasarım aracını açıp klipartı tuvale ekleyerek deneyin.",
    },
    {
      title: "Aktif, Pasif ve Sil",
      body: "• \"Pasif Et\": klipartı müşterilerden gizler ama silmez; \"Aktif Et\" ile geri açarsınız. Mevsimlik grafikler için idealdir.\n• \"Sil\": klipartı listeden kalıcı olarak kaldırır.\n• Müşteri yalnızca Aktif klipartları görür. Birden fazla kategoride aktif klipart varsa müşteri kategoriye göre filtreleyebilir.",
    },
  ],
};

const en: typeof tr = {
  defaultName: "Clipart",
  noFile: "No file selected",
  tooLarge: "File exceeds the 5 MB limit",
  genericError: "Error",
  unknownAction: "Unknown action",
  help: [
    {
      title: "What is this page for?",
      body: "The clipart library holds ready-made graphics customers can use in the product design tool. Customers find them in the design tool's \"Inspiration\" tab, under \"Graphic Library\". Clicking a clipart drops it in the middle of the print area, where the customer can move and resize it.",
    },
    {
      title: "Adding a clipart, step by step",
      body: "1. Choose a file with \"Click to select an image\" (5 MB max). A preview appears in the box.\n2. \"Clipart Name\" fills in from the file name; customers see it when they hover over the clipart.\n3. Pick a \"Category\".\n4. Click \"Save\". The clipart is added to \"Existing Cliparts\" as Active and shows up in the design tool right away.",
    },
    {
      title: "Which format should I use?",
      body: "Upload cliparts as SVG. The design tool loads cliparts as vector (SVG) graphics; this page also accepts PNG, JPG and WebP files, but those aren't added to the customer's design. SVG also prints sharp at any size. After adding a new clipart, open the design tool on one of your products and add it to the canvas to check.",
    },
    {
      title: "Active, inactive and delete",
      body: "• \"Deactivate\": hides the clipart from customers without deleting it; bring it back with \"Activate\". Handy for seasonal graphics.\n• \"Delete\": permanently removes the clipart from the list.\n• Customers only see Active cliparts. If active cliparts span more than one category, customers can filter by category.",
    },
  ],
};

export default { tr, en };
