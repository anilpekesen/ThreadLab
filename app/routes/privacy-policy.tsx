import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy / Gizlilik Politikası — PrintLab</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #0f766e; --brand-dark: #0d5f58; --bg: #f8fafc;
      --surface: #ffffff; --border: #e2e8f0; --text: #1e293b;
      --muted: #64748b; --radius: 12px;
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
    .badge { display: inline-block; padding: 4px 12px; background: #ecfdf5; color: var(--brand); border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
    h1 { font-size: clamp(26px, 5vw, 38px); font-weight: 800; color: var(--text); line-height: 1.2; margin-bottom: 8px; }
    .meta { color: var(--muted); font-size: 14px; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    h2 { font-size: 18px; font-weight: 700; color: var(--text); margin: 36px 0 10px; }
    p { color: var(--muted); margin-bottom: 14px; }
    ul { color: var(--muted); padding-left: 20px; margin-bottom: 14px; }
    li { margin-bottom: 6px; }
    a { color: var(--brand); }
    .box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius); padding: 16px 20px; margin: 24px 0; }
    .box p { margin: 0; color: #166534; }
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
        <a href="/terms-of-service">Terms of Service</a>
        <a href="/privacy-policy" style="color:var(--brand);font-weight:600">Privacy Policy</a>
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
      <span class="badge">Gizlilik</span>
      <h1>Gizlilik Politikası</h1>
      <p class="meta">Son güncelleme: 15 Mayıs 2025 &nbsp;·&nbsp; Sürüm 1.0</p>

      <div class="box"><p>Bu politika, PrintLab uygulamasının Shopify mağazanıza yüklenmesiyle toplanan ve işlenen verileri açıklar.</p></div>

      <h2>1. Topladığımız Veriler</h2>
      <p>PrintLab uygulaması aşağıdaki verileri toplar:</p>
      <ul>
        <li><strong>Mağaza bilgileri:</strong> Shopify mağaza alan adı, erişim token'ları</li>
        <li><strong>Müşteri tasarım verileri:</strong> Fabric.js canvas JSON, yüklenen görseller, yazılar, font seçimleri</li>
        <li><strong>Sipariş bilgileri:</strong> Shopify sipariş kimliği, sipariş numarası, ürün adı, tasarım token'ı</li>
        <li><strong>Üretim dosyaları:</strong> Baskıya uygun yüksek çözünürlüklü PNG dosyaları ve önizleme görselleri</li>
        <li><strong>Müşteri iletişim bilgileri:</strong> Shopify'dan senkronize edilen ad, e-posta (yalnızca sipariş yönetimi için)</li>
      </ul>

      <h2>2. Verilerin Kullanımı</h2>
      <p>Toplanan veriler yalnızca şu amaçlarla kullanılır:</p>
      <ul>
        <li>Özelleştirilmiş ürün tasarımını mağaza müşterilerinize sunmak</li>
        <li>Baskı üretim süreçlerini yönetmek ve takip etmek</li>
        <li>Ödeme ve ücretlendirme doğrulaması yapmak</li>
        <li>Teknik destek sağlamak</li>
      </ul>

      <h2>3. Veri Saklama</h2>
      <p>Tasarım verileri ve baskı dosyaları, siparişin tamamlandığı tarihten itibaren <strong>90 gün</strong> boyunca saklanır. Sipariş kayıtları Shopify'ın standart saklama politikasına tabidir.</p>

      <h2>4. Üçüncü Taraf Hizmetler</h2>
      <p>Uygulama aşağıdaki üçüncü taraf hizmetlerini kullanmaktadır:</p>
      <ul>
        <li><strong>Shopify:</strong> E-ticaret altyapısı — <a href="https://www.shopify.com/legal/privacy" target="_blank">Shopify Gizlilik Politikası</a></li>
        <li><strong>Cloudflare R2:</strong> Tasarım görselleri ve baskı dosyalarının depolanması — <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">Cloudflare Gizlilik Politikası</a></li>
        <li><strong>Photoroom (isteğe bağlı):</strong> Arka plan kaldırma özelliği — <a href="https://www.photoroom.com/privacy" target="_blank">Photoroom Gizlilik Politikası</a></li>
      </ul>

      <h2>5. Veri Güvenliği</h2>
      <p>Veriler şifreli HTTPS bağlantısı üzerinden iletilir. Depolama sunucuları güvenlik duvarı ve erişim kontrolü ile korunmaktadır. Üretim dosyaları rastgele oluşturulan benzersiz URL'ler aracılığıyla erişilebilir durumdadır.</p>

      <h2>6. Veri Transferi</h2>
      <p>Verileriniz Türkiye'de barındırılan sunucularda ve Cloudflare'in küresel ağında işlenmektedir. Cloudflare, GDPR uyumlu veri işleme anlaşmalarına sahiptir.</p>

      <h2>7. Haklarınız</h2>
      <p>Aşağıdaki haklara sahipsiniz:</p>
      <ul>
        <li>Hakkınızdaki verilere erişim talep etme</li>
        <li>Yanlış verilerin düzeltilmesini isteme</li>
        <li>Verilerinizin silinmesini talep etme</li>
        <li>Veri işlemeye itiraz etme</li>
      </ul>

      <h2>8. Çerezler</h2>
      <p>Uygulama, oturum yönetimi için Shopify'ın standart kimlik doğrulama mekanizmasını kullanır. Tasarım editörü, çalışma durumunu korumak için yerel depolama (localStorage) kullanabilir; bu veriler sunucuya gönderilmez.</p>

      <h2>9. Değişiklikler</h2>
      <p>Bu politikada yapılan önemli değişiklikler, uygulama içi bildirim veya e-posta yoluyla duyurulacaktır.</p>

      <h2>10. İletişim</h2>
      <p>Gizlilik ile ilgili sorularınız için: <a href="mailto:anpekesen@gmail.com">anpekesen@gmail.com</a></p>
    </div>

    <!-- ENGLISH -->
    <div data-lang="en">
      <span class="badge">Privacy</span>
      <h1>Privacy Policy</h1>
      <p class="meta">Last updated: May 15, 2025 &nbsp;·&nbsp; Version 1.0</p>

      <div class="box"><p>This policy explains the data collected and processed when the PrintLab application is installed on your Shopify store.</p></div>

      <h2>1. Data We Collect</h2>
      <p>The PrintLab application collects the following data:</p>
      <ul>
        <li><strong>Store information:</strong> Shopify store domain, access tokens</li>
        <li><strong>Customer design data:</strong> Fabric.js canvas JSON, uploaded images, text, font selections</li>
        <li><strong>Order information:</strong> Shopify order ID, order number, product name, design token</li>
        <li><strong>Production files:</strong> Print-ready high-resolution PNG files and preview images</li>
        <li><strong>Customer contact details:</strong> Name and email synchronized from Shopify (for order management only)</li>
      </ul>

      <h2>2. How We Use Data</h2>
      <p>Collected data is used exclusively for:</p>
      <ul>
        <li>Providing customized product design capabilities to your store customers</li>
        <li>Managing and tracking print production workflows</li>
        <li>Payment and pricing validation</li>
        <li>Technical support</li>
      </ul>

      <h2>3. Data Retention</h2>
      <p>Design data and production files are retained for <strong>90 days</strong> after order completion. Order records follow Shopify's standard retention policy.</p>

      <h2>4. Third-Party Services</h2>
      <p>The application uses the following third-party services:</p>
      <ul>
        <li><strong>Shopify:</strong> E-commerce infrastructure — <a href="https://www.shopify.com/legal/privacy" target="_blank">Shopify Privacy Policy</a></li>
        <li><strong>Cloudflare R2:</strong> Storage for design images and production files — <a href="https://www.cloudflare.com/privacypolicy/" target="_blank">Cloudflare Privacy Policy</a></li>
        <li><strong>Photoroom (optional):</strong> Background removal feature — <a href="https://www.photoroom.com/privacy" target="_blank">Photoroom Privacy Policy</a></li>
      </ul>

      <h2>5. Data Security</h2>
      <p>Data is transmitted over encrypted HTTPS connections. Storage servers are protected by firewalls and access controls. Production files are accessible via randomly generated unique URLs.</p>

      <h2>6. Data Transfers</h2>
      <p>Your data is processed on servers hosted in Turkey and on Cloudflare's global network. Cloudflare maintains GDPR-compliant data processing agreements.</p>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Request access to data held about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Object to data processing</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>The application uses Shopify's standard authentication mechanism for session management. The design editor may use localStorage to preserve working state; this data is not sent to our servers.</p>

      <h2>9. Changes</h2>
      <p>Material changes to this policy will be communicated via in-app notification or email.</p>

      <h2>10. Contact</h2>
      <p>For privacy-related inquiries: <a href="mailto:anpekesen@gmail.com">anpekesen@gmail.com</a></p>
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
