import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Terms of Service / Kullanım Koşulları — PrintLab</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #0f766e; --bg: #f8fafc; --surface: #ffffff;
      --border: #e2e8f0; --text: #1e293b; --muted: #64748b; --radius: 12px;
    }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; min-height: 100vh; }
    header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
    .logo { text-decoration: none; display: flex; align-items: center; }
    nav a { margin-left: 16px; color: var(--muted); text-decoration: none; font-size: 14px; }
    nav a:hover { color: var(--brand); }
    .lang-btns { display: flex; gap: 6px; }
    .lang-btn { padding: 5px 14px; border-radius: 20px; border: 1.5px solid var(--border); background: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); transition: all .15s; }
    .lang-btn.active { background: var(--brand); border-color: var(--brand); color: #fff; }
    .container { max-width: 800px; margin: 0 auto; padding: 48px 24px 80px; }
    .badge { display: inline-block; padding: 4px 12px; background: #eff6ff; color: #1d4ed8; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
    h1 { font-size: clamp(26px, 5vw, 38px); font-weight: 800; color: var(--text); line-height: 1.2; margin-bottom: 8px; }
    .meta { color: var(--muted); font-size: 14px; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 36px 0 10px; }
    p { color: var(--muted); margin-bottom: 14px; }
    ul { color: var(--muted); padding-left: 20px; margin-bottom: 14px; }
    li { margin-bottom: 6px; }
    a { color: var(--brand); }
    .box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius); padding: 16px 20px; margin: 24px 0; }
    .box p { margin: 0; color: #1e40af; }
    .warning { background: #fff7ed; border: 1px solid #fed7aa; border-radius: var(--radius); padding: 16px 20px; margin: 24px 0; }
    .warning p { margin: 0; color: #9a3412; }
    footer { text-align: center; padding: 32px 24px; color: var(--muted); font-size: 13px; border-top: 1px solid var(--border); }
    [data-lang] { display: none; }
    [data-lang].visible { display: block; }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><img src="/logo.png" alt="PrintLabApp" height="36" /></a>
    <div style="display:flex;align-items:center;gap:20px">
      <nav>
        <a href="/terms-of-service" style="color:var(--brand);font-weight:600">Terms of Service</a>
        <a href="/privacy-policy">Privacy Policy</a>
      </nav>
      <div class="lang-btns">
        <button class="lang-btn active" onclick="setLang('tr')">TR</button>
        <button class="lang-btn" onclick="setLang('en')">EN</button>
      </div>
    </div>
  </header>

  <div class="container">

    <!-- TURKISH -->
    <div data-lang="tr" class="visible">
      <span class="badge">Yasal</span>
      <h1>Kullanım Koşulları</h1>
      <p class="meta">Son güncelleme: 15 Mayıs 2025 &nbsp;·&nbsp; Sürüm 1.0</p>

      <div class="box"><p>PrintLab'ı kullanarak bu koşulları kabul etmiş sayılırsınız. Lütfen dikkatlice okuyunuz.</p></div>

      <h2>1. Hizmet Tanımı</h2>
      <p>PrintLab, Shopify mağaza sahiplerine müşterilerinin ürünleri (t-shirt, sweatshirt, kupa vb.) özelleştirmesine olanak tanıyan bir tasarım aracıdır. Uygulama; interaktif bir tasarım editörü, baskı dosyası üretimi ve sipariş yönetim paneli sunar.</p>

      <h2>2. Kabul Koşulları</h2>
      <p>Bu uygulamayı yalnızca geçerli bir Shopify mağazasına sahip, yasal ehliyet yaşındaki işletmeciler kullanabilir. Uygulamayı yükleyerek bu koşulları kabul ettiğinizi beyan etmiş olursunuz.</p>

      <h2>3. Mağaza Sahibinin Yükümlülükleri</h2>
      <ul>
        <li>Shopify Partnerleri Programı kurallarına uymak</li>
        <li>Baskı üretimi için doğru teknik bilgileri (DPI, baskı alanı) girmek</li>
        <li>Telif hakkı ihlali içeren tasarım siparişlerini reddetmek</li>
        <li>Müşteri verilerini yürürlükteki KVKK/GDPR düzenlemelerine uygun işlemek</li>
        <li>Ücretlendirme ve teslimat konusunda müşterilerinizi doğru bilgilendirmek</li>
      </ul>

      <h2>4. Fikri Mülkiyet</h2>
      <p><strong>Müşteri tasarımları:</strong> Müşterilerinizin oluşturduğu tasarımlar mağaza müşterisine aittir. PrintLab bu tasarımlar üzerinde mülkiyet hakkı iddia etmez.</p>
      <p><strong>Uygulama yazılımı:</strong> PrintLab uygulamasının tüm kaynak kodu, arayüzü ve altyapısı PrintLab'a aittir. İzinsiz kopyalama, dağıtma veya tersine mühendislik yasaktır.</p>
      <p><strong>Ürün görselleri:</strong> Editörde kullanılan mockup görselleri mağaza sahibine ait Shopify ürün görselleridir.</p>

      <h2>5. Yasaklanan Kullanımlar</h2>
      <p>Aşağıdaki amaçlarla kullanım kesinlikle yasaktır:</p>
      <ul>
        <li>Ticari marka veya telif hakkı ihlali içeren tasarımlar üretmek</li>
        <li>Yasadışı, nefret söylemi veya müstehcen içerik içeren ürünler satmak</li>
        <li>Sistemi aşırı yükleyecek otomatik istekler (bot, scraper) çalıştırmak</li>
        <li>Uygulamanın güvenlik önlemlerini aşmaya çalışmak</li>
        <li>Üçüncü taraflara alt lisans vermek veya uygulamayı yeniden satmak</li>
      </ul>

      <h2>6. Ücretlendirme ve Ödeme</h2>
      <p>PrintLab'ın abonelik ve ek hizmet ücretleri Shopify üzerinden tahsil edilir. Baskı ek ücretleri (Tasarım Baskı Ücreti) sipariş anında müşteriden alınır. Fiyatlar önceden bildirim yapılarak değiştirilebilir.</p>

      <h2>7. Hizmet Sürekliliği ve Kesintiler</h2>
      <p>%99,5 uptime hedeflenmekle birlikte planlı bakım ve beklenmedik teknik sorunlardan kaynaklanan kesintiler için sorumluluk kabul edilmez. Kritik bakım çalışmaları en az 24 saat önceden duyurulur.</p>

      <h2>8. Sorumluluğun Sınırlandırılması</h2>
      <div class="warning"><p>PrintLab, tasarım hataları, baskı kalitesi sorunları veya müşterilerinizin kendi yükledikleri içerikler nedeniyle oluşabilecek zararlardan sorumlu tutulamaz. Uygulamanın sunduğu araçlar üretim kılavuzu niteliğindedir; nihai üretim kalitesi mağaza sahibinin tercih ettiği baskı firmasına bağlıdır.</p></div>

      <h2>9. Hesap Feshi</h2>
      <p>Bu koşulları ihlal eden mağazaların uygulama erişimi Shopify API aracılığıyla derhal iptal edilebilir. İptal halinde mevcut sipariş verileri 30 gün boyunca talep üzerine teslim edilebilir.</p>

      <h2>10. Değişiklikler</h2>
      <p>Bu koşullarda yapılan önemli değişiklikler en az 14 gün önceden bildirilir. Değişiklik sonrası uygulamayı kullanmaya devam etmek, yeni koşulların kabulü anlamına gelir.</p>

      <h2>11. Uygulanacak Hukuk</h2>
      <p>Bu sözleşme Türk Hukuku'na tabidir. Uyuşmazlıklarda İstanbul Mahkemeleri yetkilidir.</p>

      <h2>12. Yüklenen İçerikler ve Telif Hakkı</h2>
      <p>Müşterilerin tasarım editörüne yüklediği her görsel için aşağıdaki kurallar geçerlidir:</p>
      <ul>
        <li>Kullanıcı, yüklediği görselin <strong>kullanım ve baskı hakkına sahip olduğunu veya gerekli izinleri aldığını</strong> sisteme onay vererek beyan eder.</li>
        <li>Bu onay olmadan görsel yükleme işlemi tamamlanamaz.</li>
        <li>Telif hakkı, ticari marka veya lisans ihlali içerdiği bildirilen görseller kapsamındaki <strong>siparişler ve ürünler derhal durdurulabilir</strong>.</li>
        <li>PrintLab, meşru bir ihlal bildirimi (DMCA veya eşdeğeri) alması halinde ilgili tasarım dosyalarını ve sipariş kayıtlarını <strong>hak sahibine veya yetkili makamlara iletme hakkını</strong> saklı tutar.</li>
        <li>İhlal nedeniyle doğan hukuki sorumluluk, içeriği yükleyen kullanıcıya aittir; PrintLab aracı platform konumundadır.</li>
      </ul>
      <div class="warning"><p>⚠️ Fikri mülkiyet hakkı ihlali içeren sipariş/ürün tespitinde ya da yetkili bildirim alınmasında söz konusu sipariş veya ürün önceden bildirim yapılmaksızın durdurulabilir.</p></div>

      <h2>13. İletişim</h2>
      <p>Sorularınız için: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a> veya <a href="mailto:info@printlabapp.com">info@printlabapp.com</a></p>
      <p>Telif hakkı bildirimi için: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a> (Konu: DMCA / Telif Bildirimi)</p>
    </div>

    <!-- ENGLISH -->
    <div data-lang="en">
      <span class="badge">Legal</span>
      <h1>Terms of Service</h1>
      <p class="meta">Last updated: May 15, 2025 &nbsp;·&nbsp; Version 1.0</p>

      <div class="box"><p>By using PrintLab, you agree to these terms. Please read them carefully.</p></div>

      <h2>1. Service Description</h2>
      <p>PrintLab is a design tool for Shopify store owners that enables customers to customize products (t-shirts, sweatshirts, mugs, etc.). The application provides an interactive design editor, production file generation, and an order management panel.</p>

      <h2>2. Acceptance</h2>
      <p>This application may only be used by businesses of legal age with a valid Shopify store. By installing the application, you declare acceptance of these terms.</p>

      <h2>3. Merchant Obligations</h2>
      <ul>
        <li>Comply with Shopify Partners Program rules</li>
        <li>Enter accurate technical details (DPI, print area) for print production</li>
        <li>Reject orders containing copyright-infringing designs</li>
        <li>Process customer data in compliance with applicable KVKK/GDPR regulations</li>
        <li>Accurately inform customers about pricing and delivery</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p><strong>Customer designs:</strong> Designs created by your customers belong to the store customer. PrintLab claims no ownership over these designs.</p>
      <p><strong>Application software:</strong> All source code, interface, and infrastructure of the PrintLab application belongs to PrintLab. Unauthorized copying, distribution, or reverse engineering is prohibited.</p>
      <p><strong>Product images:</strong> Mockup images used in the editor are Shopify product images belonging to the store owner.</p>

      <h2>5. Prohibited Uses</h2>
      <p>The following uses are strictly prohibited:</p>
      <ul>
        <li>Producing designs containing trademark or copyright infringement</li>
        <li>Selling products containing illegal, hate speech, or obscene content</li>
        <li>Running automated requests (bots, scrapers) that overload the system</li>
        <li>Attempting to circumvent the application's security measures</li>
        <li>Sublicensing to third parties or reselling the application</li>
      </ul>

      <h2>6. Pricing and Payment</h2>
      <p>PrintLab subscription and additional service fees are collected through Shopify. Print surcharges (Design Print Fee) are collected from the customer at the time of order. Prices may be changed with prior notice.</p>

      <h2>7. Service Continuity and Interruptions</h2>
      <p>While 99.5% uptime is targeted, no liability is accepted for interruptions caused by planned maintenance or unexpected technical issues. Critical maintenance work is announced at least 24 hours in advance.</p>

      <h2>8. Limitation of Liability</h2>
      <div class="warning"><p>PrintLab cannot be held responsible for damages arising from design errors, print quality issues, or content uploaded by your customers. The tools provided by the application are a production guide; final production quality depends on the printing company chosen by the store owner.</p></div>

      <h2>9. Account Termination</h2>
      <p>Application access for stores that violate these terms may be immediately revoked via the Shopify API. Upon termination, existing order data may be delivered upon request for 30 days.</p>

      <h2>10. Changes</h2>
      <p>Material changes to these terms will be notified at least 14 days in advance. Continued use of the application after changes constitutes acceptance of the new terms.</p>

      <h2>11. Governing Law</h2>
      <p>This agreement is governed by Turkish Law. Istanbul Courts have jurisdiction over disputes.</p>

      <h2>12. User-Uploaded Content &amp; Copyright</h2>
      <p>The following rules apply to every image uploaded by customers in the design editor:</p>
      <ul>
        <li>By checking the consent box, the user <strong>declares that they own the usage and print rights to the uploaded image, or have obtained the necessary permissions</strong>.</li>
        <li>No image can be uploaded without this consent.</li>
        <li>Orders and products involving images reported as infringing on copyright, trademarks, or licenses <strong>may be suspended immediately</strong>.</li>
        <li>Upon receiving a legitimate infringement notice (DMCA or equivalent), PrintLab <strong>reserves the right to share relevant design files and order records with rights holders or competent authorities</strong>.</li>
        <li>Legal liability arising from infringement rests with the user who uploaded the content; PrintLab acts as an intermediary platform.</li>
      </ul>
      <div class="warning"><p>⚠️ If an order or product is found to contain intellectual property infringement, or upon receipt of an authorised notice, the relevant order or product may be suspended without prior notice.</p></div>

      <h2>13. Contact</h2>
      <p>For inquiries: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a> or <a href="mailto:info@printlabapp.com">info@printlabapp.com</a></p>
      <p>For copyright notices: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a> (Subject: DMCA / Copyright Notice)</p>
    </div>

  </div>

  <footer>
    <p>© 2025 PrintLab · <a href="/privacy-policy">Privacy Policy</a> · <a href="/terms-of-service">Terms of Service</a></p>
  </footer>

  <script>
    function setLang(lang) {
      document.querySelectorAll('[data-lang]').forEach(el => el.classList.toggle('visible', el.dataset.lang === lang));
      document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.textContent.toLowerCase() === lang));
      document.documentElement.lang = lang;
    }
  </script>
</body>
</html>`;
