const tr = {
  defaultName: "Klipart",
  noFile: "Dosya seçilmedi",
  tooLarge: "Dosya 5 MB sınırını aşıyor",
  genericError: "Hata",
  unknownAction: "Bilinmeyen işlem",
  libraryTitle: "PrintLab kütüphanesi",
  libraryNote: "Bu grafikler PrintLab tarafından bütün mağazalara sunulur; müşterileriniz tasarım aracında bunları sizin klipartlarınızla birlikte görür. Bu listeyi değiştiremezsiniz.",
  help: [
    {
      title: "Bu sayfa ne işe yarar?",
      body: "Klipart Kütüphanesi, müşterinin ürün tasarım aracında kullanabileceği hazır grafikleri yönetir. Müşteri bunları tasarım aracının \"İlham al\" sekmesinde, \"Grafik Kütüphanesi\" başlığı altında görür. Bir klipartı tıkladığında klipart baskı alanının ortasına eklenir; müşteri onu taşıyıp boyutlandırabilir.\n\nBu sayfada eklediğiniz klipartlar yalnızca sizin mağazanızda görünür. Sayfanın altındaki \"PrintLab kütüphanesi\" ise bütün mağazalara sunulan ortak grafiklerdir; müşterileriniz ikisini birlikte görür.",
    },
    {
      title: "Adım adım klipart ekleme",
      body: "1. \"Görsel seçmek için tıkla\" ile dosyayı seçin (en fazla 5 MB). Önizleme kutuda görünür.\n2. \"Klipart Adı\": dosya adından otomatik dolar; müşteri imleci klipartın üzerine getirince bu adı görür.\n3. \"Kategori\" seçin.\n4. \"Kaydet\"e basın. Klipart \"Mevcut Klipartlar\" listesine Aktif olarak eklenir ve tasarım aracında hemen görünür.",
    },
    {
      title: "Hangi format kullanılmalı?",
      body: "SVG önerilir: vektör olduğu için her boyutta net basılır. PNG (şeffaf zeminli), JPG ve WebP de çalışır; bunlar tasarıma görsel olarak eklenir ve büyütüldükçe netliğini kaybedebilir — en az 1000 px genişlikte yükleyin. Yeni bir klipart ekledikten sonra mağazanızda bir ürünün tasarım aracını açıp klipartı tuvale ekleyerek deneyin.",
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
  libraryTitle: "PrintLab library",
  libraryNote: "These graphics are provided by PrintLab to every store; your customers see them in the design tool together with your own cliparts. You can't change this list.",
  help: [
    {
      title: "What is this page for?",
      body: "The clipart library holds ready-made graphics customers can use in the product design tool. Customers find them in the design tool's \"Inspiration\" tab, under \"Graphic Library\". Clicking a clipart drops it in the middle of the print area, where the customer can move and resize it.\n\nCliparts you add here appear only in your store. The \"PrintLab library\" at the bottom of the page is a shared set offered to every store; your customers see both together.",
    },
    {
      title: "Adding a clipart, step by step",
      body: "1. Choose a file with \"Click to select an image\" (5 MB max). A preview appears in the box.\n2. \"Clipart Name\" fills in from the file name; customers see it when they hover over the clipart.\n3. Pick a \"Category\".\n4. Click \"Save\". The clipart is added to \"Existing Cliparts\" as Active and shows up in the design tool right away.",
    },
    {
      title: "Which format should I use?",
      body: "SVG is recommended: it's vector, so it prints sharp at any size. PNG (with a transparent background), JPG and WebP also work; they're added to the design as images and can lose sharpness when enlarged — upload them at least 1000 px wide. After adding a new clipart, open the design tool on one of your products and add it to the canvas to check.",
    },
    {
      title: "Active, inactive and delete",
      body: "• \"Deactivate\": hides the clipart from customers without deleting it; bring it back with \"Activate\". Handy for seasonal graphics.\n• \"Delete\": permanently removes the clipart from the list.\n• Customers only see Active cliparts. If active cliparts span more than one category, customers can filter by category.",
    },
  ],
};

export default { tr, en };
