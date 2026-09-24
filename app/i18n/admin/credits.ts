const tr = {
  invalidPack: "Geçersiz paket",
  packLabel: (n: number) => `${n} AI Kredisi`,
  refundWarning:
    "⚠️ AI kredi paketleri dijital ürün niteliğindedir. Satın alım onaylandıktan sonra iade veya iptal yapılamaz. Krediler 30 gün içinde kullanılmadığında sona erer.",
  dateHeading: "Tarih",
  dateLocale: "tr-TR",
  help: [
    {
      title: "AI kredisi neye harcanır?",
      body: "AI kredileri, müşterilerinizin tasarım aracında yazdıkları bir açıklamadan (prompt) yapay zeka ile görsel üretmesi için kullanılır. Müşterinin her görsel üretme isteği mağazanızın aylık kotasından 1 kredi düşer.\n\nAylık kota planınıza bağlıdır: Starter 50, Growth 150, Pro 450, Business 900. Sayaç her takvim ayının başında sıfırlanır. Arka plan kaldırma bu kredileri kullanmaz; onun planınızda ayrı bir aylık kotası vardır.",
    },
    {
      title: "Paket nasıl alınır?",
      body: "1. İhtiyacınıza göre paketi seçin: 100 kredi $9.99, 300 kredi $19.99, 500 kredi $39.99 (USD, tek seferlik).\n2. \"Satın Al\"a basın; Shopify'ın ödeme onay ekranı açılır.\n3. Onayladığınızda tutar Shopify faturanıza eklenir ve krediler hesabınıza tanımlanır.\n\nSatın alınan krediler 30 gün geçerlidir. Bu süre boyunca kredi miktarı aylık kotanızın üzerine eklenir; 30 gün dolunca kullanılmamış kısım düşer. Satın alma onaylandıktan sonra iade ya da iptal yapılamaz.",
    },
    {
      title: "Sayfadaki bilgiler",
      body: "• Bonus krediniz varsa mavi şerit gösterilir: \"satın alınan\" (süresi dolmamış paketler) + \"kalıcı\" (PrintLab'in hesabınıza tanımladığı süresiz ek kota) = toplam bonus. Bu bonus planınızın aylık kotasına eklenir. Bonus yoksa \"Aktif bonus krediniz yok.\" yazar.\n• \"Son Satın Alımlar\": son 5 paket; süresi dolanlar soluk görünür ve \"Süresi Doldu\" rozeti taşır.\n• Bu ay kaç görsel üretildiğini Abonelik sayfasındaki \"✦ Yapay Zeka Görseli (bu ay)\" satırında görebilirsiniz. Orada gösterilen sınır yalnızca plan kotasıdır; bonus kredileriniz bunun üzerine eklenir.",
    },
    {
      title: "Önemli kurallar",
      body: "• Ücretsiz deneme döneminde müşterileriniz yapay zeka ile görsel üretemez; kredi satın almak bunu açmaz. Görsel üretimi aktif (ücretli) abonelikte çalışır.\n• Kota dolduğunda müşteri tasarım aracında kotanın dolduğunu söyleyen bir mesaj görür; tasarım aracının diğer özellikleri çalışmaya devam eder.\n• Ayarlar'daki \"Yapay Zeka Görsel Limiti (Müşteri Başına)\", bir müşterinin sipariş vermeden kaç görsel üretebileceğini sınırlar (varsayılan 3). Tek bir ziyaretçinin kredilerinizi tüketmesini önlemek için bu limiti düşük tutun.",
    },
  ],
};

const en: typeof tr = {
  invalidPack: "Invalid pack",
  packLabel: (n) => `${n} AI credits`,
  refundWarning:
    "⚠️ AI credit packs are digital products. Purchases can't be refunded or canceled once approved. Credits expire if not used within 30 days.",
  dateHeading: "Date",
  dateLocale: "en-US",
  help: [
    {
      title: "What are AI credits used for?",
      body: "AI credits let your customers generate images with AI in the design tool, from a prompt they type. Every image a customer asks for uses 1 credit from your store's monthly quota.\n\nThe monthly quota depends on your plan: Starter 50, Growth 150, Pro 450, Business 900. The counter resets at the start of each calendar month. Background removal doesn't use these credits; it has its own monthly quota on your plan.",
    },
    {
      title: "How do I buy a pack?",
      body: "1. Pick the pack you need: 100 credits for $9.99, 300 for $19.99 or 500 for $39.99 (USD, one-time charge).\n2. Click \"Buy\" and Shopify's charge approval screen opens.\n3. Once you approve, the amount is added to your Shopify bill and the credits go into your account.\n\nPurchased credits are valid for 30 days. During that time they're added on top of your monthly quota; after 30 days, whatever is left expires. Purchases can't be refunded or canceled once approved.",
    },
    {
      title: "What's on this page",
      body: "• If you have bonus credits, a blue banner shows: \"purchased\" (packs that haven't expired) + \"permanent\" (open-ended extra quota PrintLab has added to your account) = your total bonus. The bonus is added to your plan's monthly quota. With no bonus, you see \"You have no active bonus credits.\"\n• \"Recent Purchases\": your last 5 packs; expired ones are faded and carry an \"Expired\" badge.\n• To see how many images were generated this month, check the \"✦ AI images (this month)\" line on the Billing page. The limit shown there is your plan quota only; your bonus credits come on top of it.",
    },
    {
      title: "Important rules",
      body: "• During the free trial, customers can't generate AI images, and buying credits doesn't change that. Image generation works on an active (paid) subscription.\n• When the quota runs out, customers see a message in the design tool saying the quota is used up; everything else in the design tool keeps working.\n• \"AI Image Generation Limit (Per Customer)\" in Settings caps how many images one customer can generate before placing an order (default 3). Keep it low so a single visitor can't burn through your credits.",
    },
  ],
};

export default { tr, en };
