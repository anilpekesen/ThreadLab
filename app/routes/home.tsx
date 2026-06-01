import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const langMatch = cookieHeader.match(/(?:^|; )dk_lang=([^;]*)/);
  const lang = langMatch?.[1] === "en" ? "en" : "tr";
  return new Response(buildHtml(lang), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

const SHOPIFY_APP_URL = "https://apps.shopify.com/printlab?locale=tr";
const DEMO_CONTACT_URL = "mailto:info@printlabapp.com?subject=PrintLab%20Demo";

const T = {
  tr: {
    htmlLang: "tr",
    nav: {
      features: "Özellikler", how: "Nasıl çalışır", pricing: "Fiyatlandırma",
      faq: "SSS", login: "Giriş yap", cta: "Shopify'a ekle",
    },
    hero: {
      eyebrow: "SHOPIFY ÜRÜN KİŞİSELLEŞTİRME UYGULAMASI",
      title: `Müşterileriniz <span class="title-accent">kendi tasarımını</span> yapsın, siz baskıya yollayın.`,
      sub: "PrintLab, Shopify mağazaları için ürün kişiselleştirme ve baskı tasarım aracıdır. T-shirt, sweatshirt, kupa, tote bag ve benzeri ürünlerde müşteri ürün sayfasında tasarım yapar, siz baskıya hazır siparişi alırsınız.",
      cta1: "14 gün ücretsiz başla", cta2: "2 dakikalık demo izle",
      b1: "Kurulum 5 dakika", b2: "Kredi kartı gerekmiyor", b3: "Türkçe destek",
      trustLabel: "Shopify mağazaları için kişiselleştirme ve baskı yönetimi",
    },
    how: {
      eyebrow: "NASIL ÇALIŞIR",
      title: "Üç adımda, kurulumdan kargoya.",
      sub: "Müşteri tasarlar. PrintLab baskıya hazır PDF üretir. Siz siparişi karşılarsınız.",
      s1t: "Ürününüzü kurun",
      s1p: "Shopify ürün sayfanıza PrintLab'i ekleyin, baskı alanını sürükle-bırakla çizin. Ölçüler, güvenli alan, beyaz/koyu mockup — hepsi tek ekran.",
      s2t: "Müşteri tasarlar",
      s2p: "Görsel yükler, yazı ekler, şablonlardan seçer. AI arka planı temizler, fontlar canlı önizlenir. Tasarım baskı alanını taşıyorsa otomatik uyarı.",
      s3t: "Sipariş gelir, basarsınız",
      s3p: "Sepete eklenen her ürün için 300DPI baskıya hazır PDF. Admin'den durum güncelleyin: <em>Bekliyor → Hazırlanıyor → Basıldı → Gönderildi</em>.",
    },
    features: {
      eyebrow: "ÖZELLİKLER",
      title: "Bir tasarım aracından beklediğiniz<br/>her şey, üstüne biraz daha.",
      sub: "Shopify ürün tasarım aracı olarak çalışır. Mobil için optimize edildi, Shopify ile yerel entegre olur, baskı üretim akışını bozmadan ilerler.",
      f: [
        { t: "AI ile arka plan kaldırma", p: "Müşteri görsel yükler, \"Arka planı temizleyelim mi?\" diye sorarız. 1.5 sn'de çıktı." },
        { t: "24+ tasarım fontu", p: "Anton, Bebas, Pacifico, Permanent Marker, kendi yüklediğiniz TTF'ler. Canlı önizleme." },
        { t: "Baskı alanı uyarısı", p: "Tasarım sınırı taşarsa anında işaret. Müşteri kötü baskı almasın, siz iade almayın." },
        { t: "Shopify yerel entegrasyon", p: "App Proxy ile mağaza sayfanıza yerleşir. Sepet ve checkout doğrudan Shopify'da." },
        { t: "Çoklu ürün şablonları", p: "T-shirt, kupa, totebag, telefon kılıfı. Mockup ve baskı alanı her ürün için ayrı." },
        { t: "300 DPI baskı PDF", p: "Her sipariş için baskıya hazır PDF + JPG önizleme. CDN üzerinden anında erişim." },
        { t: "Google Drive yedekleme", p: "Sipariş başına baskı PNG'leri, mockup ve design.json kendi Drive klasörünüze yüklenir. Drive'ınızdaki diğer dosyalar gizli kalır (drive.file scope)." },
      ],
    },
    showcase: {
      eyebrow: "MÜŞTERİ DENEYİMİ",
      title: "Mobilde tasarım, gerçekten kolay.",
      sub: "PrintLab'in tasarımcısı %78 mobil kullanılır. Her piksel buna göre optimize edildi: dokunma hedefleri 44px, alt levha rahat ulaşılır, baskı alanı her zaman görünür.",
      l: [
        { n: "01", t: "Tek el kullanım", p: "Tüm kritik aksiyonlar baş parmak menzilinde." },
        { n: "02", t: "Hafif önyükleme", p: "İlk anlamlı boyama 1.2 sn (4G, orta seviye Android)." },
        { n: "03", t: "Sıfır taşma", p: "iOS Safari'de bottom sheet ve klavye etkileşimi cilalı." },
      ],
    },
    pricing: {
      eyebrow: "FİYATLANDIRMA",
      title: "Mağazanız büyüdükçe ödeyin.",
      sub: "Tüm planlar 14 gün ücretsiz. İstediğiniz zaman iptal.",
      per: "/ay",
      plans: [
        { name: "Starter", amt: "9.99", cur: "$", desc: "Başlamak için ideal.", feat: ["100 sipariş/ay", "1 ürün kategorisi", "Ön + arka yüz baskı", "100 arka plan kaldırma/ay", "✦ 70 yapay zeka görseli/ay"], cta: "14 gün ücretsiz başla", featured: false },
        { name: "Growth", amt: "19.99", cur: "$", desc: "Büyüyen mağazalar için.", feat: ["500 sipariş/ay", "2 ürün kategorisi", "Ön + arka yüz baskı", "500 arka plan kaldırma/ay", "✦ 200 yapay zeka görseli/ay", "10 özel şablon"], cta: "14 gün ücretsiz başla", featured: true, badge: "EN POPÜLER" },
        { name: "Pro", amt: "49.99", cur: "$", desc: "Yüksek hacimli mağazalar için.", feat: ["2.000 sipariş/ay", "4 ürün kategorisi", "1.500 arka plan kaldırma/ay", "✦ 600 yapay zeka görseli/ay", "20 özel şablon", "Üretim & Gang Sheet", "Öncelikli destek"], cta: "14 gün ücretsiz başla", featured: false },
        { name: "Business", amt: "99.99", cur: "$", desc: "Daha büyük ekipler için.", feat: ["Sınırsız sipariş", "Sınırsız ürün kategorisi", "4.000 arka plan kaldırma/ay", "✦ 1.500 yapay zeka görseli/ay", "Sınırsız özel şablon", "Üretim & Gang Sheet", "Özel onboarding & destek"], cta: "14 gün ücretsiz başla", featured: false },
      ],
    },
    faq: {
      eyebrow: "SIKÇA SORULAN",
      title: "Önce buralara bakın.",
      items: [
        { q: "PrintLab Shopify'da nasıl çalışıyor?", a: "PrintLab, Shopify App Proxy üzerinden mağazanızın <code>/apps/tshirt-designer</code> yoluna gömülen bir Shopify kişiselleştirme uygulamasıdır. Müşteri ürün sayfasından doğrudan tasarımcıya erişir, tasarımını yapar ve sepete eklediğinde varyant otomatik oluşturulur." },
        { q: "Baskıya hazır dosyaları nasıl alıyorum?", a: "Her sipariş tamamlandığında 300 DPI çözünürlükte PDF ve önizleme JPG'si otomatik oluşur, CDN üzerinde saklanır. Admin panelinden tek tıkla indirebilirsiniz." },
        { q: "Kendi mockup'larımı yükleyebilir miyim?", a: "Growth ve üzeri planlarında evet. Mockup PNG'sini yükler, baskı alanını sürükle-bırakla çizer, güvenli alan ve ölçü etiketini ayarlarsınız." },
        { q: "Türkçe dışında dil desteği var mı?", a: "Şu anda Türkçe ve İngilizce. Admin paneli her iki dili destekler; müşteri tasarımcısı da Türkçe/İngilizce." },
        { q: "14 günlük deneme bittikten sonra ne olur?", a: "Deneme süresi bittikten sonra Shopify üzerinden ödeme başlar. İstediğiniz zaman planı değiştirebilir veya iptal edebilirsiniz." },
      ],
    },
    cta: {
      title: "Bugün kurun, bu hafta ilk kişiselleştirilmiş siparişinizi alın.",
      sub: "14 gün ücretsiz. Kredi kartı gerekmiyor. Kurulum 5 dakika.",
      btn1: "Shopify'a ekle", btn2: "Demo talep et",
    },
    footer: {
      tagline: "Shopify mağazaları için kişiselleştirme tasarımcısı. İstanbul'dan, sevgiyle.",
      product: "Ürün", company: "Şirket", legal: "Yasal",
      features: "Özellikler", pricing: "Fiyatlandırma", demo: "Demo", roadmap: "Yol haritası",
      about: "Hakkımızda", blog: "Blog", contact: "İletişim",
      privacy: "Gizlilik", terms: "Kullanım Koşulları", kvkk: "KVKK",
      copy: "© 2026 PrintLab Yazılım A.Ş.",
    },
    switchLang: "EN",
  },
  en: {
    htmlLang: "en",
    nav: {
      features: "Features", how: "How it works", pricing: "Pricing",
      faq: "FAQ", login: "Sign in", cta: "Add to Shopify",
    },
    hero: {
      eyebrow: "SHOPIFY PRODUCT PERSONALIZATION APP",
      title: `Let your customers <span class="title-accent">create their own design</span> — you send it to print.`,
      sub: "PrintLab is a Shopify product personalization and print designer app embedded directly on your product pages. For t-shirts, sweatshirts, mugs, tote bags, and more, customers personalize the product and you receive a print-ready order.",
      cta1: "Start free for 14 days", cta2: "Watch 2-min demo",
      b1: "5-minute setup", b2: "No credit card required", b3: "English support",
      trustLabel: "Product personalization and print workflow for Shopify stores",
    },
    how: {
      eyebrow: "HOW IT WORKS",
      title: "From setup to shipment in three steps.",
      sub: "Customer designs. PrintLab generates a print-ready PDF. You fulfill the order.",
      s1t: "Set up your product",
      s1p: "Add PrintLab to your Shopify product page and draw the print area with drag & drop. Dimensions, safe zone, light/dark mockup — all in one screen.",
      s2t: "Customer designs",
      s2p: "They upload images, add text, pick templates. AI removes backgrounds, fonts live-preview. Automatic warning if design overflows the print area.",
      s3t: "Order comes in, you print",
      s3p: "300 DPI print-ready PDF for every item in the cart. Update status from your admin: <em>Pending → Preparing → Printed → Shipped</em>.",
    },
    features: {
      eyebrow: "FEATURES",
      title: "Everything you'd expect from a design tool,<br/>and then some.",
      sub: "Built as a Shopify product customizer with mobile-first UX, native Shopify integration, and structured output for print production teams.",
      f: [
        { t: "AI background removal", p: "Customer uploads an image, we ask \"Remove the background?\" Result in 1.5 seconds." },
        { t: "24+ design fonts", p: "Anton, Bebas, Pacifico, Permanent Marker, your own uploaded TTF files. Live preview." },
        { t: "Print area warning", p: "Instant indicator when the design overflows. No bad prints, no returns." },
        { t: "Native Shopify integration", p: "Embedded via App Proxy. Cart and checkout stay inside Shopify." },
        { t: "Multi-product templates", p: "T-shirts, mugs, tote bags, phone cases. Separate mockup and print area per product." },
        { t: "300 DPI print PDF", p: "Print-ready PDF + JPG preview for every order. Instant access via CDN." },
        { t: "Google Drive backup", p: "One-click export of per-order print PNGs, mockup and design.json into your own Drive folder. Other files in your Drive stay private (drive.file scope)." },
      ],
    },
    showcase: {
      eyebrow: "CUSTOMER EXPERIENCE",
      title: "Mobile design, actually easy.",
      sub: "78% of PrintLab sessions are on mobile. Every pixel is optimized for it: 44px touch targets, bottom sheet always reachable, print area always visible.",
      l: [
        { n: "01", t: "One-hand use", p: "All critical actions within thumb reach." },
        { n: "02", t: "Fast first paint", p: "First meaningful paint in 1.2 s (4G, mid-range Android)." },
        { n: "03", t: "Zero overflow", p: "Bottom sheet and keyboard interaction polished on iOS Safari." },
      ],
    },
    pricing: {
      eyebrow: "PRICING",
      title: "Pay as your store grows.",
      sub: "All plans include a 14-day free trial. Cancel any time.",
      per: "/mo",
      plans: [
        { name: "Starter", amt: "9.99", cur: "$", desc: "Great to get started.", feat: ["100 orders/month", "1 product category", "Front + back surface print", "100 background removals/month", "✦ 70 AI images/month"], cta: "Start free for 14 days", featured: false },
        { name: "Growth", amt: "19.99", cur: "$", desc: "For stores that are scaling.", feat: ["500 orders/month", "2 product categories", "Front + back surface print", "500 background removals/month", "✦ 200 AI images/month", "10 custom templates"], cta: "Start free for 14 days", featured: true, badge: "MOST POPULAR" },
        { name: "Pro", amt: "49.99", cur: "$", desc: "For higher-volume stores.", feat: ["2,000 orders/month", "4 product categories", "1,500 background removals/month", "✦ 600 AI images/month", "20 custom templates", "Production & Gang Sheet", "Priority support"], cta: "Start free for 14 days", featured: false },
        { name: "Business", amt: "99.99", cur: "$", desc: "For larger teams.", feat: ["Unlimited orders", "Unlimited product categories", "4,000 background removals/month", "✦ 1,500 AI images/month", "Unlimited custom templates", "Production & Gang Sheet", "Custom onboarding & support"], cta: "Start free for 14 days", featured: false },
      ],
    },
    faq: {
      eyebrow: "FAQ",
      title: "Check here first.",
      items: [
        { q: "How does PrintLab work on Shopify?", a: "PrintLab is a Shopify product personalization app embedded into your store via Shopify App Proxy at <code>/apps/tshirt-designer</code>. Customers access the designer directly from the product page, personalize the item, and a variant is created automatically when they add to cart." },
        { q: "How do I get print-ready files?", a: "A 300 DPI PDF and a preview JPG are generated automatically for every completed order and stored on CDN. Download with one click from your admin panel." },
        { q: "Can I upload my own mockups?", a: "Yes, on Growth and above. Upload your PNG mockup, draw the print area with drag & drop, and set the safe zone and dimension labels." },
        { q: "What languages does PrintLab support?", a: "Turkish and English are fully supported right now. The admin panel and the customer designer both have TR/EN language switching." },
        { q: "What happens after the 14-day trial?", a: "After the trial ends, billing starts through Shopify. You can change your plan or cancel at any time from your Shopify admin." },
      ],
    },
    cta: {
      title: "Install today, get your first personalized order this week.",
      sub: "14-day free trial. No credit card required. 5-minute setup.",
      btn1: "Add to Shopify", btn2: "Request a demo",
    },
    footer: {
      tagline: "Customization designer for Shopify stores. Made with love in Istanbul.",
      product: "Product", company: "Company", legal: "Legal",
      features: "Features", pricing: "Pricing", demo: "Demo", roadmap: "Roadmap",
      about: "About us", blog: "Blog", contact: "Contact",
      privacy: "Privacy", terms: "Terms of Service", kvkk: "GDPR / KVKK",
      copy: "© 2026 PrintLab Software Inc.",
    },
    switchLang: "TR",
  },
} as const;

type Lang = "tr" | "en";

function buildHtml(lang: Lang): string {
  const t = T[lang];
  const other = lang === "tr" ? "en" : "tr";
  const pageTitle = lang === "tr"
    ? "PrintLab | Shopify Kişiselleştirme Tasarım Aracı"
    : "PrintLab | Shopify Product Personalization Designer";
  const metaDescription = lang === "tr"
    ? "PrintLab, Shopify mağazaları için ürün kişiselleştirme ve baskı tasarım uygulamasıdır. T-shirt, sweatshirt, kupa ve tote bag ürünlerinde müşteri tasarlar, siz baskıya hazır siparişi alırsınız."
    : "PrintLab is a Shopify product personalization and print designer app. Let customers customize t-shirts, sweatshirts, mugs, and tote bags directly on your product pages.";
  const metaKeywords = lang === "tr"
    ? "shopify kişiselleştirme uygulaması, shopify ürün tasarım aracı, shopify tişört tasarım uygulaması, shopify baskı tasarım aracı, print on demand shopify"
    : "shopify product personalization app, shopify product customizer, shopify t-shirt designer app, shopify print designer, print on demand personalization";

  const featureIcons = [
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9" stroke-dasharray="2 2"/><line x1="9" y1="3" x2="9" y2="21" stroke-dasharray="2 2"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z" opacity="0"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.71 3.5l-5 8.66 2.79 4.84h10L20.29 12.34 15.29 3.5z"/><path d="M2.71 12.16h13.29M7.71 3.5l5 8.66"/></svg>`,
  ];
  const featureColors = [
    "--fi-bg:var(--violet-50,#f5f3ff);--fi-fg:var(--accent-bg-removal)",
    "--fi-bg:var(--primary-50);--fi-fg:var(--primary-600)",
    "--fi-bg:#fef3c7;--fi-fg:#b45309",
    "--fi-bg:#ecfdf5;--fi-fg:#059669",
    "--fi-bg:#eef2ff;--fi-fg:var(--brand-indigo-600)",
    "--fi-bg:#fff7ed;--fi-fg:#c2410c",
    "--fi-bg:#dbeafe;--fi-fg:#1d4ed8",
  ];

  const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const arrowIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`;

  const planCards = t.pricing.plans.map((p) => {
    const badge = "badge" in p ? `<div class="plan-badge">${p.badge}</div>` : "";
    const feats = p.feat.map((f) => `<li>${f}</li>`).join("");
    return `
    <div class="plan${p.featured ? " plan-featured" : ""}">
      ${badge}
      <div class="plan-name">${p.name}</div>
      <div class="plan-price"><span class="pp-cur">${p.cur}</span><span class="pp-amt">${p.amt}</span><span class="pp-per">${t.pricing.per}</span></div>
      <div class="plan-desc">${p.desc}</div>
      <ul class="plan-feats">${feats}</ul>
      <a class="btn ${p.featured ? "btn-primary" : "btn-ghost"} btn-block" href="${SHOPIFY_APP_URL}">${p.cta}</a>
    </div>`;
  }).join("");

  const faqItems = t.faq.items.map((item, i) => `
    <details class="faq-item"${i === 0 ? " open" : ""}>
      <summary>${item.q}<span class="faq-toggle"></span></summary>
      <div class="faq-body">${item.a}</div>
    </details>`).join("");

  const featureCards = t.features.f.map((f, i) => `
    <article class="feature">
      <div class="feature-icon" style="${featureColors[i]}">${featureIcons[i]}</div>
      <h3>${f.t}</h3>
      <p>${f.p}</p>
    </article>`).join("");

  const showcaseList = t.showcase.l.map((l) => `
    <li><span class="sl-num">${l.n}</span><div><h4>${l.t}</h4><p>${l.p}</p></div></li>`).join("");

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <meta name="description" content="${metaDescription}" />
  <meta name="keywords" content="${metaKeywords}" />
  <link rel="canonical" href="https://printlabapp.com/home" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://printlabapp.com/home" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${metaDescription}" />
  <meta property="og:image" content="https://printlabapp.com/logo.png" />
  <meta property="og:site_name" content="PrintLab" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${metaDescription}" />
  <meta name="twitter:image" content="https://printlabapp.com/logo.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"SoftwareApplication","name":"PrintLab","applicationCategory":"BusinessApplication","operatingSystem":"Shopify","url":"https://printlabapp.com/home","description":"${metaDescription}","sameAs":["${SHOPIFY_APP_URL}"],"offers":{"@type":"AggregateOffer","lowPrice":"9.99","highPrice":"99.99","priceCurrency":"USD"},"publisher":{"@type":"Organization","name":"PrintLab","url":"https://printlabapp.com","logo":"https://printlabapp.com/logo.png"}}
  </script>
  <link rel="stylesheet" href="/landing-tokens.css" />
  <link rel="stylesheet" href="/landing.css" />
  <style>
    .pp-cur{font-size:22px;font-weight:700;margin-right:2px;}
    .nav-lang{display:flex;gap:3px;background:#f3f4f6;border-radius:99px;padding:3px;}
    .nav-lang a{padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;color:#6b7280;text-decoration:none;transition:all 0.15s;letter-spacing:0.04em;}
    .nav-lang a.active{background:#4f46e5;color:#fff;}
  </style>
</head>
<body>

<!-- ===== Nav ===== -->
<header class="nav">
  <div class="nav-inner">
    <a class="nav-logo" href="/" aria-label="PrintLab">
      <img src="/logo.png" alt="PrintLab" height="36" />
    </a>
    <nav class="nav-links" aria-label="Primary">
      <a href="#ozellikler">${t.nav.features}</a>
      <a href="#nasil">${t.nav.how}</a>
      <a href="#fiyatlandirma">${t.nav.pricing}</a>
      <a href="#sss">${t.nav.faq}</a>
    </nav>
    <div class="nav-cta">
      <div class="nav-lang">
        <a href="/" class="${lang === "tr" ? "active" : ""}" onclick="document.cookie='dk_lang=tr;path=/;max-age=31536000';">TR</a>
        <a href="/" class="${lang === "en" ? "active" : ""}" onclick="document.cookie='dk_lang=en;path=/;max-age=31536000';">EN</a>
      </div>
      <a class="link-muted" href="/app">${t.nav.login}</a>
      <a class="btn btn-primary btn-sm" href="${SHOPIFY_APP_URL}">
        ${t.nav.cta} ${arrowIcon}
      </a>
    </div>
  </div>
</header>

<!-- ===== Hero ===== -->
<section class="hero">
  <div class="hero-grid">
    <div class="hero-text">
      <div class="eyebrow eyebrow-indigo">
        <span class="eyebrow-dot"></span>
        ${t.hero.eyebrow}
      </div>
      <h1 class="hero-title">${t.hero.title}</h1>
      <p class="hero-sub">${t.hero.sub}</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="${SHOPIFY_APP_URL}">
          ${t.hero.cta1} ${arrowIcon}
        </a>
        <a class="btn btn-ghost btn-lg" href="#nasil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
          ${t.hero.cta2}
        </a>
      </div>
      <ul class="hero-bullets">
        <li>${checkIcon} ${t.hero.b1}</li>
        <li>${checkIcon} ${t.hero.b2}</li>
        <li>${checkIcon} ${t.hero.b3}</li>
      </ul>
    </div>

    <!-- Phone mockup -->
    <div class="hero-visual">
      <div class="hero-blob"></div>
      <div class="phone">
        <div class="phone-notch"></div>
        <div class="phone-screen">
          <div class="ph-topbar">
            <div class="ph-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></div>
            <div class="ph-shop">mystore.myshopify.com</div>
            <div class="ph-cart">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              <span class="ph-cart-dot">1</span>
            </div>
          </div>
          <div class="ph-product">
            <div class="ph-product-title">Oversize Tişört — Beyaz</div>
            <div class="ph-product-price">450<span>₺</span></div>
          </div>
          <div class="ph-canvas-card">
            <div class="ph-size-pill">28 × 45 CM</div>
            <div class="ph-canvas">
              <svg viewBox="0 0 220 240" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                <path d="M30 50 L80 25 Q90 45 110 45 Q130 45 140 25 L190 50 L175 95 L155 88 L155 220 L65 220 L65 88 L45 95 Z" fill="#ffffff" stroke="#e5e7eb" stroke-width="1.2"/>
                <path d="M65 88 L155 88 L155 220 L65 220 Z" fill="url(#shade)" opacity="0.6"/>
                <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient></defs>
                <rect x="78" y="105" width="64" height="86" fill="none" stroke="#fbbf24" stroke-width="1"/>
                <rect x="82" y="109" width="56" height="78" fill="none" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 3"/>
                <g class="design-layer">
                  <text x="110" y="145" text-anchor="middle" font-family="Impact,sans-serif" font-size="22" font-weight="700" fill="#0f172a" letter-spacing="0.04em">İSTANBUL</text>
                  <text x="110" y="162" text-anchor="middle" font-family="Georgia,serif" font-size="11" fill="#4f46e5">forever</text>
                  <circle cx="110" cy="178" r="8" fill="none" stroke="#0f172a" stroke-width="1.5"/>
                  <path d="M105 178 L110 173 L115 178 L110 183 Z" fill="#fbbf24"/>
                </g>
                <rect x="84" y="128" width="52" height="60" fill="none" stroke="#3b82f6" stroke-width="1.4" stroke-dasharray="4 4"/>
              </svg>
              <span class="handle handle-tl"></span>
              <span class="handle handle-tr"></span>
              <span class="handle handle-bl"></span>
              <span class="handle handle-br"></span>
            </div>
            <div class="ph-toolbar">
              <button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 11 12 6 17 11"/><polyline points="7 17 12 12 17 17"/></svg></button>
              <button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
              <button><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg></button>
              <button class="tb-danger"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
            </div>
          </div>
          <div class="ph-tabs">
            <button class="ph-tab is-active"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>${lang === "tr" ? "Görsel" : "Image"}</span></button>
            <button class="ph-tab"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg><span>${lang === "tr" ? "Metin" : "Text"}</span></button>
            <button class="ph-tab"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>${lang === "tr" ? "Şablon" : "Template"}</span></button>
            <button class="ph-tab"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg><span>${lang === "tr" ? "Katman" : "Layers"}</span></button>
          </div>
          <div class="ph-addbar">
            <button class="ph-add">${lang === "tr" ? "Sepete Ekle" : "Add to Cart"}<span class="ph-add-price">450₺</span></button>
          </div>
        </div>
      </div>

      <div class="float-card float-card-a">
        <div class="fc-icon fc-icon-violet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/></svg></div>
        <div>
          <div class="fc-title">${lang === "tr" ? "Arka plan kaldırıldı" : "Background removed"}</div>
          <div class="fc-sub">AI · 1.4s</div>
        </div>
      </div>
      <div class="float-card float-card-b">
        <div class="fc-icon fc-icon-blue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div>
          <div class="fc-title">${lang === "tr" ? "Yeni sipariş" : "New order"}</div>
          <div class="fc-sub">#3204 · ${lang === "tr" ? "Hazırlanıyor" : "Preparing"}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="trustbar">
    <div class="trustbar-label">${t.hero.trustLabel}</div>
  </div>
</section>

<!-- ===== How it works ===== -->
<section class="section" id="nasil">
  <div class="section-inner">
    <div class="section-head">
      <div class="eyebrow eyebrow-indigo">${t.how.eyebrow}</div>
      <h2 class="section-title">${t.how.title}</h2>
      <p class="section-sub">${t.how.sub}</p>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">01</div>
        <div class="step-body">
          <h3>${t.how.s1t}</h3>
          <p>${t.how.s1p}</p>
          <div class="step-visual sv-setup">
            <div class="mini-tshirt"><div class="mini-print-area"></div><div class="mini-safe-area"></div></div>
            <div class="mini-toolbar"><span>28×45 cm</span><span class="kbd">↵</span></div>
          </div>
        </div>
      </div>
      <div class="step">
        <div class="step-num">02</div>
        <div class="step-body">
          <h3>${t.how.s2t}</h3>
          <p>${t.how.s2p}</p>
          <div class="step-visual sv-design">
            <div class="chip chip-violet"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/></svg> AI</div>
            <div class="chip chip-blue"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> ${lang === "tr" ? "Yazı" : "Text"}</div>
            <div class="chip chip-amber"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ${lang === "tr" ? "Şablon" : "Template"}</div>
            <div class="chip"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="12 2 2 7 12 12 22 7 12 2"/></svg> ${lang === "tr" ? "Katman" : "Layers"}</div>
          </div>
        </div>
      </div>
      <div class="step">
        <div class="step-num">03</div>
        <div class="step-body">
          <h3>${t.how.s3t}</h3>
          <p>${t.how.s3p}</p>
          <div class="step-visual sv-order">
            <div class="order-row"><span class="dot-blue"></span><span class="o-id">#3204</span><span class="o-name">Mert K. — Oversize</span><span class="status status-pending">${lang === "tr" ? "Hazırlanıyor" : "Preparing"}</span></div>
            <div class="order-row"><span class="dot-green"></span><span class="o-id">#3203</span><span class="o-name">Selin A. — Kupa</span><span class="status status-done">${lang === "tr" ? "Basıldı" : "Printed"}</span></div>
            <div class="order-row"><span class="dot-gray"></span><span class="o-id">#3202</span><span class="o-name">Burak Y. — Totebag</span><span class="status status-ship">${lang === "tr" ? "Gönderildi" : "Shipped"}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== Features ===== -->
<section class="section section-tint" id="ozellikler">
  <div class="section-inner">
    <div class="section-head">
      <div class="eyebrow eyebrow-violet">${t.features.eyebrow}</div>
      <h2 class="section-title">${t.features.title}</h2>
      <p class="section-sub">${t.features.sub}</p>
    </div>
    <div class="features">${featureCards}</div>
  </div>
</section>

<!-- ===== Showcase ===== -->
<section class="showcase">
  <div class="section-inner">
    <div class="showcase-grid">
      <div class="showcase-text">
        <div class="eyebrow eyebrow-blue">${t.showcase.eyebrow}</div>
        <h2 class="section-title">${t.showcase.title}</h2>
        <p class="section-sub">${t.showcase.sub}</p>
        <ul class="showcase-list">${showcaseList}</ul>
      </div>
      <div class="showcase-visual">
        <div class="sc-phone sc-phone-1">
          <div class="sc-screen">
            <div class="sc-header"><div class="sc-tabs">
              <button>${lang === "tr" ? "Görsel" : "Image"}</button>
              <button class="is-active" style="background:#ede9fe;color:#7c3aed">${lang === "tr" ? "Metin" : "Text"}</button>
              <button>${lang === "tr" ? "Şablon" : "Template"}</button>
              <button>${lang === "tr" ? "Katman" : "Layers"}</button>
            </div></div>
            <div class="sc-text-input">${lang === "tr" ? "Yazınızı girin..." : "Enter your text..."}</div>
            <div class="sc-font-grid">
              <div class="sc-font" style="font-family:'Anton',sans-serif">Aa</div>
              <div class="sc-font" style="font-family:'Bebas Neue',sans-serif">Aa</div>
              <div class="sc-font is-selected" style="font-family:'Pacifico',cursive">Aa</div>
              <div class="sc-font" style="font-family:'Permanent Marker',cursive">Aa</div>
              <div class="sc-font" style="font-family:'Playfair Display',serif">Aa</div>
              <div class="sc-font" style="font-family:Georgia,serif;font-size:9px">Aa</div>
              <div class="sc-font" style="font-family:Impact,sans-serif;font-size:11px">Aa</div>
              <div class="sc-font" style="font-family:'Montserrat',sans-serif">Aa</div>
            </div>
            <div class="sc-color-row">
              <span class="sw" style="background:#0f172a"></span>
              <span class="sw sw-active" style="background:#4f46e5"></span>
              <span class="sw" style="background:#ef4444"></span>
              <span class="sw" style="background:#10b981"></span>
              <span class="sw" style="background:#f59e0b"></span>
              <span class="sw" style="background:#ec4899"></span>
              <span class="sw" style="background:#ffffff;border:1px solid #e5e7eb"></span>
            </div>
            <button class="sc-add">+ ${lang === "tr" ? "Yazı Ekle" : "Add Text"}</button>
          </div>
        </div>
        <div class="sc-phone sc-phone-2">
          <div class="sc-screen">
            <div class="sc-bg-removal">
              <div class="sc-bgr-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/></svg></div>
              <div class="sc-bgr-title">${lang === "tr" ? "Arka planı temizleyelim mi?" : "Remove the background?"}</div>
              <div class="sc-bgr-sub">${lang === "tr" ? "AI ile saniyeler içinde." : "AI-powered, done in seconds."}</div>
              <div class="sc-bgr-thumbs">
                <div class="sc-thumb sc-thumb-before"></div>
                <div class="sc-arrow">→</div>
                <div class="sc-thumb sc-thumb-after"></div>
              </div>
              <div class="sc-bgr-actions">
                <button class="sc-btn sc-btn-ghost">${lang === "tr" ? "Olduğu gibi ekle" : "Add as-is"}</button>
                <button class="sc-btn sc-btn-violet">${lang === "tr" ? "Evet, temizle" : "Yes, remove"}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ===== Pricing ===== -->
<section class="section" id="fiyatlandirma">
  <div class="section-inner">
    <div class="section-head">
      <div class="eyebrow eyebrow-indigo">${t.pricing.eyebrow}</div>
      <h2 class="section-title">${t.pricing.title}</h2>
      <p class="section-sub">${t.pricing.sub}</p>
    </div>
    <div class="pricing">${planCards}</div>
  </div>
</section>

<!-- ===== FAQ ===== -->
<section class="section section-tint" id="sss">
  <div class="section-inner section-narrow">
    <div class="section-head">
      <div class="eyebrow eyebrow-indigo">${t.faq.eyebrow}</div>
      <h2 class="section-title">${t.faq.title}</h2>
    </div>
    <div class="faq">${faqItems}</div>
  </div>
</section>

<!-- ===== Final CTA ===== -->
<section class="cta" id="cta">
  <div class="cta-card">
    <div class="cta-spark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.9 4.6 5 .4-3.8 3.3 1.2 4.9L12 13.8 7.7 16.2l1.2-4.9L5.1 8l5-.4z"/></svg></div>
    <h2>${t.cta.title}</h2>
    <p>${t.cta.sub}</p>
    <div class="cta-actions">
      <a class="btn btn-primary btn-lg" href="${SHOPIFY_APP_URL}">${t.cta.btn1} ${arrowIcon}</a>
      <a class="btn btn-ghost-light btn-lg" href="${DEMO_CONTACT_URL}">${t.cta.btn2}</a>
    </div>
  </div>
</section>

<!-- ===== Footer ===== -->
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <img src="/logo.png" alt="PrintLab" height="36" />
      <p>${t.footer.tagline}</p>
    </div>
    <div class="footer-cols">
      <div>
        <h5>${t.footer.product}</h5>
        <a href="#ozellikler">${t.footer.features}</a>
        <a href="#fiyatlandirma">${t.footer.pricing}</a>
        <a href="#nasil">${t.footer.demo}</a>
        <a href="#cta">${t.footer.roadmap}</a>
      </div>
      <div>
        <h5>${t.footer.company}</h5>
        <a href="#nasil">${t.footer.about}</a>
        <a href="#ozellikler">${t.footer.blog}</a>
        <a href="${DEMO_CONTACT_URL}">${t.footer.contact}</a>
      </div>
      <div>
        <h5>${t.footer.legal}</h5>
        <a href="/privacy-policy">${t.footer.privacy}</a>
        <a href="/terms-of-service">${t.footer.terms}</a>
        <a href="/privacy-policy">${t.footer.kvkk}</a>
      </div>
    </div>
  </div>
  <div class="footer-base">
    <span>${t.footer.copy}</span>
    <span>printlabapp.com</span>
  </div>
</footer>

</body>
</html>`;
}
