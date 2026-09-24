const tr = {
  notFound: "Şablon bulunamadı",
  defaultPieceName: "Tasarım",
  invalidRequest: "Geçersiz istek",
  sizeRequired: "Genişlik ve yükseklik gerekli",
  unknownIntent: "Bilinmeyen işlem",
  nothingToSave: "Kaydedilecek tasarım yok",
  unknownError: "bilinmeyen hata",
  metafieldPartial: (errors: string) =>
    `Tasarım kaydedildi ama bağlı ürünlerin bir kısmı güncellenemedi: ${errors}. Şablon listesinde "Bağlantıları denetle"ye basın.`,
  // yardım (PageHelper)
  help: [
    {
      title: "Bu ekran ne işe yarar?",
      body: "Çerçeve Stüdyosu, fotoğraflı çerçeve şablonunun tasarım kısmını kurduğunuz yer: baskı ölçüsü, fotoğraf ve yazı alanları, arka plan ve üst katman görselleri, set parçaları ve ürün görselleri. Şablonun adı, türü, aktif olup olmadığı ve bağlı ürünleri stüdyoda değil, \"← Şablon\" ile döndüğünüz şablon sayfasında ayarlanır.",
    },
    {
      title: "Adım adım",
      body: "1. Soldan \"Baskı ölçüsü\" seçin ya da \"+ Yeni ölçü tanımla\" ile kendi ölçünüzü (ör. 30×40 cm) ekleyin. Alanlar bu gerçek ölçüde çizilir; ölçü seçilene kadar tuvalde \"Önce baskı ölçüsünü seçin\" uyarısı görünür.\n2. \"Hazır düzenler\"den birini uygulayın; gerekirse \"Kenar ve aralık boşlukları\"nı ayarlayın. Beğenmezseniz \"Geri al\" ile dönebilirsiniz.\n3. \"Ekle\" ile tek tek \"Fotoğraf alanı\", \"Yazı alanı\", \"Harf şekilli fotoğraflar (LOVE…)\" ya da \"Kart tabakası (pola kart…)\" ekleyin; alanları tuvalde sürükleyip boyutlandırın. Seçili alanın ayarları sağ panelde açılır.\n4. Hazır bir çerçeve tasarımınız varsa \"Tasarım görselleri\"nden yükleyin: \"Arka plan\" fotoğrafların altında, \"Üst katman\" (şeffaf PNG) fotoğrafların üstünde durur. Tasarımda şeffaf delikler varsa \"Şeffaf deliklerden alan bul\" onları fotoğraf alanına çevirir.\n5. \"Kaydet\"e, ardından \"Deneme baskısı\"na basın.",
    },
    {
      title: "Set parçaları ve ürün görselleri",
      body: "• Varsayılan \"Tek parça: sipariş başına bir baskı dosyası\"dır. 3'lü çerçeve gibi setler için \"Set yap (ör. 3'lü çerçeve)\" ya da \"+ Parça ekle\" kullanın; her parçanın kendi ölçüsü ve alanları olur.\n• \"Ürün görselleri\" sekmesi isteğe bağlıdır. Eklerseniz müşteri fotoğrafını seçtiği varyantın ürün görselinde (ör. ceviz çerçeve) görür; eklemezseniz yalnızca baskı tuvalini görür. \"Seçenek değeri\" Shopify'daki varyant değeriyle birebir aynı olmalı.",
    },
    {
      title: "Deneme baskısı",
      body: "Şablonu dikey, yatay ve kare örnek fotoğraflarla doldurup baskı çıktısını sağ panelde gösterir. Böylece kırpmayı, alan sırasını ve yazıları müşteriden önce siz görürsünüz; bulunan sorunlar uyarı olarak listelenir. Deneme kayıtlı şablona bakar; bu yüzden kaydedilmemiş değişiklik varken ya da ölçüsü seçilmemiş bir parça varken düğme pasiftir.",
    },
    {
      title: "Sık sorunlar ve ipuçları",
      body: "• Taşma payı kesimde gider; yazıları güvenli alanın içinde tutun. \"Kesim ve güvenli alan çizgileri\" ile çizgileri gösterebilirsiniz.\n• Ölçüyü farklı en-boy oranında bir ölçüyle değiştirirseniz alanlar esneyebilir; hazır düzeni yeniden uygulayın ya da alanları kontrol edin.\n• Stüdyoyu açmadan önce şablon sayfasındaki değişiklikleri kaydedin; iki ekran kendi kaydını ayrı yapar.\n• Kaydettiğinizde şablon fotoğraf alanı kazandıysa ya da kaybettiyse bağlı ürünler otomatik güncellenir. Güncellenemeyen ürün olursa üstte uyarı çıkar; şablon listesinde \"Bağlantıları denetle\"ye basın.\n• Fotoğraf alanı olmayan şablon ürün sayfasında kutu açmaz. Şablon ancak bir ürüne bağlanıp aktifleştirilince müşteriye görünür. Genel kurulum için şablon listesindeki \"Nasıl kurulur?\" rehberine bakın.",
    },
  ],
};

const en: typeof tr = {
  notFound: "Template not found",
  defaultPieceName: "Design",
  invalidRequest: "Invalid request",
  sizeRequired: "Width and height are required",
  unknownIntent: "Unknown action",
  nothingToSave: "There's no design to save",
  unknownError: "unknown error",
  metafieldPartial: (errors) =>
    `Design saved, but some linked products couldn't be updated: ${errors}. Click "Check links" in the template list.`,
  help: [
    {
      title: "What is this screen for?",
      body: "Frame Studio is where you build the design side of a photo frame template: the print size, photo and text slots, background and overlay images, set pieces and product images. The template's name, type, active status and linked products aren't set here; they live on the template page you return to with \"← Template\".",
    },
    {
      title: "Step by step",
      body: "1. On the left, choose a \"Print size\" or use \"+ Define new size\" to add your own (e.g. 30×40 cm). Slots are drawn at this real size; until you choose one, the canvas shows \"Choose a print size first\".\n2. Apply one of the \"Preset layouts\" and adjust \"Margins and spacing\" if needed. If you don't like it, use \"Undo\".\n3. Use \"Add\" for a single \"Photo slot\", \"Text slot\", \"Letter-shaped photos (LOVE…)\" or a \"Card sheet (polaroid cards…)\", then drag and resize slots on the canvas. The selected slot's settings open in the right panel.\n4. If you have a finished frame design, upload it under \"Design images\": the \"Background\" sits below the photos, the \"Overlay\" (transparent PNG) sits above them. If the design has transparent holes, \"Find slots from transparent holes\" turns them into photo slots.\n5. Click \"Save\", then \"Test print\".",
    },
    {
      title: "Set pieces and product images",
      body: "• The default is \"Single piece: one print file per order\". For sets such as a 3-frame set, use \"Make a set (e.g. 3-frame set)\" or \"+ Add piece\"; each piece gets its own size and slots.\n• The \"Product images\" tab is optional. If you add images, customers see their photo on the product image of the variant they picked (e.g. a walnut frame); without them, they only see the print canvas. The \"Option value\" must exactly match the variant value in Shopify.",
    },
    {
      title: "Test print",
      body: "Fills the template with portrait, landscape and square sample photos and shows the print output in the right panel. You get to check cropping, slot order and text before any customer does, and any problems found are listed as warnings. The test uses the saved template, so the button is disabled while you have unsaved changes or a piece has no size.",
    },
    {
      title: "Common problems and tips",
      body: "• Bleed is trimmed off when cutting, so keep text inside the safe area. Turn on \"Trim and safe area lines\" to see the guides.\n• If you switch to a size with a different aspect ratio, slots may stretch; reapply a preset layout or check the slots.\n• Save your changes on the template page before opening the studio; each screen saves its own work separately.\n• If saving adds the first photo slots or removes all of them, linked products are updated automatically. If a product can't be updated, a warning appears at the top; click \"Check links\" in the template list.\n• A template with no photo slots doesn't open a box on the product page. The template only becomes visible to customers once it's linked to a product and activated. For the full setup, see the \"How to set up\" guide in the template list.",
    },
  ],
};

export default { tr, en };
