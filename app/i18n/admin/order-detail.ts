const tr = {
  orderNotFound: "Sipariş bulunamadı",
  noDesignFileToUpload: "Yüklenecek tasarım dosyası bulunamadı",
  underlineYes: "var",
  openBadge: "Açık",
  downloadAll: (n: number) => `Hepsini indir (${n} dosya)`,
  printFileN: (n: number) => `${n}. baskı dosyası`,
  help: [
    {
      title: "Bu sayfa ne işe yarar?",
      body: "Tasarımlı bir sipariş satırının (tek bir beden/varyant) üretim için gereken her şeyi burada: ön ve arka önizleme, yüksek çözünürlüklü baskı dosyaları, tasarımdaki her yazı ve görsel katmanı, müşterinin yüklediği orijinal görseller, Google Drive yedeği ve müşteriye gönderilecek tasarım linki. \"Sipariş No\" bağlantısı siparişi Shopify'da açar.",
    },
    {
      title: "Hangi dosyayı indirmeliyim?",
      body: "• \"⬇ Baskı Dosyası (Yüksek Kalite)\": basılacak dosya budur. Ön Yüz ve Arka Yüz kartlarında ayrı ayrı bulunur.\n• \"⬇ Önizlemeyi İndir\": tasarımın ürün üzerindeki görünümü; kontrol etmek ya da müşteriye göstermek içindir, baskı için değil.\n• Set ürünlerinde her parça için \"N. baskı dosyası\" düğmesi ve hepsini tek ZIP'te veren \"Hepsini indir (N dosya)\" görünür.\n• Çerçeve/kolaj şablonlarında \"Kesim çizgili PDF\" (setlerde parçanın yanındaki \"PDF\"), baskı ebadındaki ölçü ve taşma payıyla kesim işaretli dosya üretir.\n• Katman kartlarındaki \"Görseli İndir\" tasarımdaki tek bir görseli, \"Müşterinin yüklediği orijinal görseller\" bölümü arka plan kaldırılmadan önceki ham dosyaları verir.\n• Yazı katmanlarında font, boyut ve renk kodu yazar; tasarımı elle yeniden kurmanız gerekirse bunları kullanın.",
    },
    {
      title: "Durum nasıl ilerletilir?",
      body: "Sağ üstteki \"→ <sonraki durum>\" düğmesi siparişi bir adım ilerletir: Bekliyor → Hazırlanıyor → Basıldı → Hazır → Gönderildi.\n\nDİKKAT: Gönderildi dışındaki adımlar yalnızca açık olan bu satırı (bu bedeni) değiştirir. Aynı siparişin diğer bedenlerine \"Bu tasarımın diğer bedenleri\" çiplerinden geçin ya da Siparişler sayfasında toplu ilerletin. Gönderildi ise Shopify siparişindeki tüm satırları birlikte Gönderildi yapar, siparişi Shopify'da gönderildi (fulfilled) olarak işaretler ve müşteriye kargo bildirimi gider.",
    },
    {
      title: "Sayfadaki uyarılar ne anlama geliyor?",
      body: "• \"Baskı dosyası eksik\": müşteri, dosya yüklenmeden sayfadan ayrıldı; indirme çalışmaz. Müşteriden tasarımı yeniden sepete eklemesini isteyin.\n• \"Renk uyuşmazlığı\": siparişteki varyant, müşterinin tasarım aracında seçtiği renkle aynı değil. Basmadan önce müşteriyle teyit edin.\n• \"Önizleme görseli sorunlu olabilir\": önizleme, ürün görseli tam yüklenmeden alınmış olabilir. Baskı dosyasını kontrol edin, gerekirse müşteriyle teyit edin.\n• \"Tasarım katman verisi bulunamadı\": önizleme ve baskı dosyaları duruyor, yalnızca düzenlenebilir katmanlar yok; indirmeyi etkilemez.",
    },
    {
      title: "Birden fazla tasarım, Drive ve müşteri linki",
      body: "• \"Siparişteki tasarımlar\": aynı Shopify siparişinde birden fazla farklı tasarım varsa her biri ayrı kart olarak görünür; \"Bu tasarımı aç\" ile geçersiniz.\n• \"Google Drive'a Yedekle\": Drive bağlıysa \"Drive'a Aktar\" bu siparişteki tüm tasarımların dosyalarını ve sipariş özetini sipariş numaralı bir klasöre yükler; \"Drive'da Aç\" klasörü açar, \"Tekrar Yükle\" yeniden gönderir. Bağlı değilse \"Drive Bağla\" sizi Ayarlar'a götürür.\n• \"Müşteri Tasarım Linki\": müşterinin kendi tasarımını görüp indirebileceği sayfa. \"Linki Kopyala\" ile e-postaya ya da mesaja ekleyebilirsiniz.",
    },
  ],
};

const en: typeof tr = {
  orderNotFound: "Order not found",
  noDesignFileToUpload: "No design files found to upload",
  underlineYes: "yes",
  openBadge: "Open",
  downloadAll: (n) => `Download all (${n} files)`,
  printFileN: (n) => `Print file ${n}`,
  help: [
    {
      title: "What is this page for?",
      body: "Everything you need to produce one design order line (a single size/variant): front and back previews, high-resolution print files, every text and image layer in the design, the customer's original uploads, a Google Drive backup and a design link you can send to the customer. The \"Order No\" link opens the order in Shopify.",
    },
    {
      title: "Which file should I download?",
      body: "• \"⬇ Print File (High Quality)\": this is the file you print. The Front and Back cards each have their own.\n• \"⬇ Download Preview\": how the design looks on the product. Use it to check the design or show the customer, not for printing.\n• Set products show a \"Print file N\" button for every piece, plus \"Download all (N files)\" to get them all in one ZIP.\n• Frame and collage templates add \"PDF with crop marks\" (or \"PDF\" next to each set piece), which builds a PDF with crop marks using the print size's dimensions and bleed.\n• \"Download Image\" on a layer card gives you a single image from the design; the \"Customer's original uploads\" section has the raw files from before background removal.\n• Text layers list the font, size and color code, in case you need to rebuild the design by hand.",
    },
    {
      title: "How do I move the status forward?",
      body: "The \"→ <next status>\" button at the top right moves the order one step: Pending → Preparing → Printed → Ready → Shipped.\n\nHEADS UP: every step except Shipped only changes the line that's open (this size). Switch to the other sizes of the same order with the \"Other sizes of this design\" chips, or move them in bulk from the Orders page. Shipped, on the other hand, marks every line of the Shopify order as Shipped, marks the order as fulfilled in Shopify and sends the customer their shipping notification.",
    },
    {
      title: "What do the warnings mean?",
      body: "• \"Print file missing\": the customer left before the file finished uploading, so the download won't work. Ask them to add the design to the cart again.\n• \"Color mismatch\": the variant on the order doesn't match the color the customer picked in the design tool. Confirm with the customer before printing.\n• \"Preview image may be incorrect\": the preview may have been captured before the product image fully loaded. Check the print file and confirm with the customer if needed.\n• \"Design layer data not found\": the preview and print files are there, only the editable layers are missing. Downloads still work.",
    },
    {
      title: "Multiple designs, Drive and the customer link",
      body: "• \"Designs in order\": when one Shopify order contains several different designs, each gets its own card; switch with \"Open this design\".\n• \"Back up to Google Drive\": when Drive is connected, \"Export to Drive\" uploads the files of every design in this order plus an order summary to a folder named after the order number. \"Open in Drive\" opens the folder and \"Re-upload\" sends everything again. If Drive isn't connected, \"Connect Drive\" takes you to Settings.\n• \"Customer Design Link\": a page where the customer can view and download their own design. Use \"Copy Link\" to paste it into an email or message.",
    },
  ],
};

export default { tr, en };
