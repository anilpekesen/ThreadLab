/**
 * Kalın parçalar içeren paragraflar dizi olarak tutulur: tek sıradaki
 * (1, 3, 5...) öğeler kalın yazılır.
 */
type Rich = string[];
type TypeRow = { title: string; example: string; setup: string; where: string };

const tr = {
  pageTitle: "Kişiselleştirici nasıl kurulur?",
  pageSubtitle: "Kod bilgisi gerekmez. Bir şablon birkaç dakikada müşteriye açılır.",
  back: "Şablonlar",
  newTemplate: "Yeni şablon",
  stepsTitle: "Kurulum adımları",
  stepsIntro: "Şablon, müşterinin fotoğrafının ürüne nasıl yerleşeceğini tarif eder. Şablonu bir ürüne bağladığınızda o ürünün sayfasında müşteriye açılır.",
  step1Title: "Ürün türünü seçip şablon oluşturun",
  step1Body: ["", "Yeni şablon", "'a basın, satacağınız ürüne uyan türü seçin ve bir ad verin. Ad yalnızca sizin listenizde görünür."] as Rich,
  step2Title: "Tasarımı kurun ve kaydedin",
  step2Body: ["Açılan sayfada yalnızca seçtiğiniz türe ait ayarlar görünür. En üstteki ", "Kurulum durumu", " listesi neyin eksik olduğunu gösterir; eksik satırdaki düğme sizi ilgili bölüme götürür. İşiniz bitince ", "Kaydet", "'e basın."] as Rich,
  step2Note: ["Çerçeve şablonları ", "Çerçeve Stüdyosu", "'nda kurulur: ölçüyü seçer ya da tanımlarsınız, hazır bir düzen seçip alanları sürükleyerek ayarlarsınız."] as Rich,
  step3Title: "Şablonu Shopify ürününe bağlayın",
  step3Body: ["Aynı sayfanın altındaki ", "Ürüne bağla", " bölümünden ürünü seçip bağlayın. Ürün listede yoksa adıyla arayın. Çoğu ürün için \"Tüm varyantlar\" doğru seçimdir."] as Rich,
  step3Note: "Shopify'da metafield oluşturmanıza veya ID kopyalamanıza gerek yok — uygulama bunu kendisi yapar.",
  step4Title: "Ürün sayfasına bloğu bir kez ekleyin",
  step4Body: ["Tema kodunu düzenlemeyin. Aşağıdaki düğme tema düzenleyicisini blok eklenmiş hâlde açar; sağ üstten ", "Kaydet", "'e basmanız yeterli. Bu adım mağaza başına bir kez yapılır."] as Rich,
  personalizerBlock: "Çerçeve şablonları için: Kişiselleştirici bloğu",
  designerBlock: "Tişört, boxer, AI için: DesignKit bloğu",
  step5Title: "Şablonu aktifleştirip mağazada deneyin",
  step5Body: ["Şablon sayfasındaki ", "Şablonu aktifleştir", " düğmesine basın. Ardından bağlı ürünün sayfasını mağazada açıp bir fotoğrafla deneyin."] as Rich,
  whichTitle: "Hangi türü seçmeliyim?",
  colType: "Tür",
  colExample: "Örnek",
  colSetup: "Ne ayarlarsınız",
  colWhere: "Müşteri nerede görür",
  types: [
    {
      title: "Tişört ve giyim",
      example: "Kalpli tasarımın içine müşterinin fotoğrafı",
      setup: "Tasarım PNG'sini yükleyin, fotoğrafın gireceği boşluğa tıklayın.",
      where: "DesignKit tasarımcısının içinde \"Fotoğrafını ekle\"",
    },
    {
      title: "Fotoğraflı çerçeve",
      example: "6 fotoğraflı 30×40 çerçeve, 3'lü set",
      setup: "Stüdyoda ölçüyü seçin, hazır düzenle başlayıp alanları sürükleyerek ayarlayın.",
      where: "Ürün sayfasında ayrı \"PrintLab Kişiselleştirici\" kutusu",
    },
    {
      title: "Boxer ve tekrarlı desen",
      example: "Yüzlerin ve kalplerin dağıldığı boxer",
      setup: "Yüz ve süsleme sayısını ayarlayın, süsleme görselini yükleyin.",
      where: "DesignKit tasarımcısının içinde",
    },
    {
      title: "AI portre",
      example: "Fotoğraftan karikatür + isim",
      setup: "Stili seçin; müşteriye açılacak stilleri işaretleyin.",
      where: "DesignKit tasarımcısının içinde",
    },
  ] as TypeRow[],
  incompleteTitle: "Tamamlanmamış şablonlar",
  incompleteBody: "Bu şablonlar şu an hiçbir müşteriye görünmüyor.",
  badgeInactive: "Pasif",
  badgeNotLinked: "Ürüne bağlı değil",
  complete: "Tamamla",
  troubleTitle: "Ürün sayfasında görünmüyorsa",
  trouble1: ["", "Şablon aktif mi?", " Pasif şablonlar açılmaz."] as Rich,
  trouble2: ["", "Ürün bağlı mı?", " Şablon sayfasındaki \"Bağlı ürünler\" listesinde ürünü görmelisiniz."] as Rich,
  trouble3: ["", "Blok temada var mı?", " 4. adımdaki düğmeyle tema düzenleyicisini açıp kontrol edin. Birden fazla ürün şablonu kullanıyorsanız ürünün kullandığı tema şablonuna eklenmiş olmalı."] as Rich,
  trouble4: ["", "Çerçeve şablonunda fotoğraf alanı kaydedildi mi?", " Alan eklenip kaydedilmeden ürün bağlandıysa, kaydedip ürünü yeniden bağlayın ya da şablon listesinde ", "Bağlantıları denetle", "'ye basın."] as Rich,
  printFileInfo: "Siparişte baskı dosyası otomatik hazırlanır; sipariş ayrıntısındaki özelliklerde görünür.",
};

const en: typeof tr = {
  pageTitle: "How to set up the personalizer",
  pageSubtitle: "No coding needed. A template can be live for customers in a few minutes.",
  back: "Templates",
  newTemplate: "New template",
  stepsTitle: "Setup steps",
  stepsIntro: "A template describes how the customer's photo is placed on the product. Once you link a template to a product, customers can use it on that product's page.",
  step1Title: "Choose a product type and create a template",
  step1Body: ["Click ", "New template", ", choose the type that fits the product you sell and give it a name. The name only appears in your own list."],
  step2Title: "Set up the design and save",
  step2Body: ["The page that opens only shows settings for the type you chose. The ", "Setup status", " list at the top shows what's missing; the button on a missing row takes you to that section. When you're done, click ", "Save", "."],
  step2Note: ["Frame templates are set up in ", "Frame Studio", ": choose or define a size, pick a preset layout and drag the slots into place."],
  step3Title: "Link the template to a Shopify product",
  step3Body: ["Choose and link a product in the ", "Link product", " section at the bottom of the same page. If the product isn't in the list, search for it by name. For most products, \"All variants\" is the right choice."],
  step3Note: "You don't need to create a metafield or copy an ID in Shopify — the app does this for you.",
  step4Title: "Add the block to the product page once",
  step4Body: ["Don't edit your theme code. The button below opens the theme editor with the block already added; just click ", "Save", " in the top right. You only need to do this once per store."],
  personalizerBlock: "For frame templates: Personalizer block",
  designerBlock: "For t-shirts, boxers and AI: DesignKit block",
  step5Title: "Activate the template and test it in your store",
  step5Body: ["Click the ", "Activate template", " button on the template page. Then open the linked product's page in your store and try it with a photo."],
  whichTitle: "Which type should I choose?",
  colType: "Type",
  colExample: "Example",
  colSetup: "What you set up",
  colWhere: "Where customers see it",
  types: [
    {
      title: "T-shirts and apparel",
      example: "The customer's photo inside a heart design",
      setup: "Upload the design PNG and click the empty area where the photo goes.",
      where: "Inside the DesignKit designer, under \"Add your photo\"",
    },
    {
      title: "Photo frames",
      example: "A 6-photo 30×40 frame, a set of 3",
      setup: "Choose the size in the studio, start from a preset layout and drag the slots into place.",
      where: "A separate \"PrintLab Personalizer\" box on the product page",
    },
    {
      title: "Boxers and repeat patterns",
      example: "A boxer covered with faces and hearts",
      setup: "Set the number of faces and decorations, and upload the decoration image.",
      where: "Inside the DesignKit designer",
    },
    {
      title: "AI portrait",
      example: "A caricature from a photo + a name",
      setup: "Choose the style and select the styles customers can pick.",
      where: "Inside the DesignKit designer",
    },
  ],
  incompleteTitle: "Incomplete templates",
  incompleteBody: "These templates aren't visible to any customers right now.",
  badgeInactive: "Inactive",
  badgeNotLinked: "Not linked to a product",
  complete: "Complete",
  troubleTitle: "If it doesn't appear on the product page",
  trouble1: ["", "Is the template active?", " Inactive templates don't open."],
  trouble2: ["", "Is the product linked?", " You should see the product in the \"Linked products\" list on the template page."],
  trouble3: ["", "Is the block in your theme?", " Open the theme editor with the button in step 4 and check. If you use more than one product template, the block must be added to the theme template the product uses."],
  trouble4: ["", "Was the photo slot saved in the frame template?", " If the product was linked before the slot was added and saved, save and link the product again, or click ", "Check links", " in the template list."],
  printFileInfo: "The print file is prepared automatically with each order and appears in the order details' properties.",
};

/** WooCommerce yönetiminde anlamı değişen metinler (bkz. useDict) */
const woo = {
  tr: {
    step3Note: "WordPress'te ürüne ayrıca bir şey yazmanız gerekmez; bağladığınız şablon ürünün PrintLab kutusunda seçili görünür. İsterseniz bağlamayı oradan da yapabilirsiniz.",
    step4Title: "Ürün sayfasında kontrol edin",
    step4Body: ["Tema kodu ya da blok gerekmez: PrintLab eklentisi kutuyu ürün sayfasına kendisi ekler. Tişört gibi ürünlerde WordPress'te ürünü açıp PrintLab kutusunda ", "PrintLab tasarımcısını göster", " seçeneğini işaretleyin."] as Rich,
  },
  en: {
    step3Note: "You don't need to change anything on the product in WordPress; the linked template shows as selected in the product's PrintLab box. You can also link it from there.",
    step4Title: "Check the product page",
    step4Body: ["No theme code or block is needed: the PrintLab plugin adds the box to the product page. For apparel, open the product in WordPress and turn on ", "Show the PrintLab designer", " in the PrintLab box."] as Rich,
  },
};

export default { tr, en, woo };
