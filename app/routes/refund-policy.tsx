import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Refund Policy / İade Politikası — PrintLab</title>
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
    <a href="/" class="logo"><img src="/logo-full.png" alt="PrintLabApp" height="40" /></a>
    <div style="display:flex;align-items:center;gap:20px">
      <nav>
        <a href="/terms-of-service">Terms of Service</a>
        <a href="/refund-policy" style="color:var(--brand);font-weight:600">Refund Policy</a>
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
      <h1>İade Politikası</h1>
      <p class="meta">Son güncelleme: 26 Eylül 2026 &nbsp;·&nbsp; Sürüm 1.0</p>

      <div class="box"><p>Siparişlerimiz çevrim içi satıcımız <strong>Paddle.com</strong> tarafından yürütülür. Paddle.com, tüm siparişlerimizde satıcıdır (Merchant of Record); müşteri hizmetleri sorularını ve iadeleri de Paddle yürütür.</p></div>

      <h2>1. Kapsam</h2>
      <p>Bu politika, PrintLab'in WooCommerce mağazalarına Paddle üzerinden sattığı abonelik planları ve AI kredi paketleri için geçerlidir. Shopify App Store üzerinden kurulan uygulamanın ücretleri Shopify tarafından tahsil edilir ve Shopify'ın faturalandırma ve iade kurallarına tabidir.</p>

      <h2>2. 14 gün içinde koşulsuz iade</h2>
      <p>Bir aboneliğin <strong>ilk ödemesinden itibaren 14 gün içinde</strong>, gerekçe göstermeden tam iade isteyebilirsiniz. Deneme süresi olan planlarda bu 14 gün, ilk ücretli ödemenin yapıldığı günden başlar. İade yapıldığında abonelik iptal edilir.</p>

      <h2>3. Yenileme ödemeleri ve iptal</h2>
      <p>Abonelikler iptal edilene kadar her ay yenilenir. Aboneliğinizi istediğiniz zaman PrintLab panelindeki <em>Abonelik</em> sayfasından iptal edebilirsiniz; iptal, ödenmiş dönemin sonunda geçerli olur ve o güne kadar hizmeti kullanmaya devam edersiniz. İlk ödeme dışındaki yenileme ödemeleri için iade yapılmaz.</p>

      <h2>4. AI kredileri</h2>
      <p>AI kredi paketleri satın alındıktan sonra 30 gün geçerlidir. Satın alma tarihinden itibaren 14 gün içinde, <strong>kullanılmamış kredilerin</strong> karşılığı için iade isteyebilirsiniz; kullanılmış kredilerin karşılığı iade edilmez.</p>

      <h2>5. İade nasıl istenir</h2>
      <p><a href="mailto:support@printlabapp.com">support@printlabapp.com</a> adresine, ödemede kullandığınız e-posta adresi ve mağaza adresinizle yazın ya da Paddle'ın gönderdiği makbuzdaki bağlantıyı kullanın. Onaylanan iadeler Paddle tarafından ödemenin yapıldığı yönteme gönderilir; bankanıza bağlı olarak hesabınıza geçmesi 5–10 iş günü sürebilir.</p>

      <h2>6. Teslimat</h2>
      <p>PrintLab bir yazılım hizmetidir; fiziksel teslimat yoktur. Plan ya da kredi, ödeme onaylandıktan hemen sonra PrintLab hesabınızda etkinleşir.</p>

      <h2>Hizmet Sağlayıcı</h2>
      <div class="box"><p><strong>Satıcı:</strong> Anıl Pekesen<br><strong>Kayıtlı adres:</strong> Tulumtaş, 2358. Sk. No:6, Ferce Tulumtaş A1 Blok Daire 28, 06830 Gölbaşı/Ankara, Türkiye<br><strong>Telefon:</strong> +90 507 464 16 99<br><strong>E-posta:</strong> <a href="mailto:support@printlabapp.com">support@printlabapp.com</a><br><strong>Uygulanacak hukuk:</strong> Türkiye Cumhuriyeti hukuku</p></div>
    </div>

    <!-- ENGLISH -->
    <div data-lang="en">
      <span class="badge">Legal</span>
      <h1>Refund Policy</h1>
      <p class="meta">Last updated: September 26, 2026 &nbsp;·&nbsp; Version 1.0</p>

      <div class="box"><p>Our order process is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns.</p></div>

      <h2>1. Scope</h2>
      <p>This policy applies to the subscription plans and AI credit packs PrintLab sells to WooCommerce stores through Paddle. Charges for the app installed from the Shopify App Store are collected by Shopify and follow Shopify's billing and refund rules.</p>

      <h2>2. 14-day money-back guarantee</h2>
      <p>You can request a full refund, without giving a reason, <strong>within 14 days of the first payment</strong> of a subscription. For plans with a free trial, the 14 days start on the day of the first paid charge. When a refund is issued, the subscription is canceled.</p>

      <h2>3. Renewals and cancellation</h2>
      <p>Subscriptions renew every month until canceled. You can cancel at any time from the <em>Billing</em> page in PrintLab; cancellation takes effect at the end of the paid period and you keep access until then. Renewal payments other than the first payment are not refunded.</p>

      <h2>4. AI credits</h2>
      <p>AI credit packs are valid for 30 days after purchase. Within 14 days of purchase you can request a refund for <strong>unused credits</strong>; used credits are not refunded.</p>

      <h2>5. How to request a refund</h2>
      <p>Email <a href="mailto:support@printlabapp.com">support@printlabapp.com</a> with the email address used for the payment and your store address, or use the link in the receipt Paddle sent you. Approved refunds are sent by Paddle to the original payment method; depending on your bank it can take 5–10 business days to arrive.</p>

      <h2>6. Delivery</h2>
      <p>PrintLab is a software service; there is no physical delivery. A plan or credit pack becomes active in your PrintLab account right after the payment is approved.</p>

      <h2>Service Provider</h2>
      <div class="box"><p><strong>Seller:</strong> Anıl Pekesen<br><strong>Registered address:</strong> Tulumtaş, 2358. Sk. No:6, Ferce Tulumtaş A1 Blok Daire 28, 06830 Gölbaşı/Ankara, Türkiye<br><strong>Telephone:</strong> +90 507 464 16 99<br><strong>Email:</strong> <a href="mailto:support@printlabapp.com">support@printlabapp.com</a><br><strong>Governing law:</strong> Laws of the Republic of Türkiye</p></div>
    </div>

  </div>

  <footer>
    <p>© 2026 PrintLab · <a href="/privacy-policy">Privacy Policy</a> · <a href="/terms-of-service">Terms of Service</a> · <a href="/refund-policy">Refund Policy</a></p>
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
