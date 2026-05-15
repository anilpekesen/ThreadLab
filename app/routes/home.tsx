import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="PrintLab — Shopify mağazanıza özelleştirilmiş baskı tasarım aracı. Müşterileriniz kendi tasarımlarını oluşturup sipariş verebilir." />
  <title>PrintLab — Shopify Baskı Tasarım Uygulaması</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #0f766e; --brand-dark: #0d5f58; --brand-light: #ccfbf1;
      --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
      --border: #334155; --text: #f1f5f9; --muted: #94a3b8; --radius: 14px;
    }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; overflow-x: hidden; }

    /* NAV */
    nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; background: rgba(15,23,42,.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,.06); }
    .logo { font-size: 22px; font-weight: 900; color: #fff; letter-spacing: -1px; }
    .logo span { color: var(--brand); }
    .nav-links { display: flex; gap: 8px; align-items: center; }
    .nav-link { color: var(--muted); text-decoration: none; font-size: 14px; padding: 6px 14px; border-radius: 8px; transition: all .15s; }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.06); }
    .nav-cta { background: var(--brand); color: #fff; padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; transition: background .15s; }
    .nav-cta:hover { background: var(--brand-dark); }

    /* HERO */
    .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 120px 24px 80px; position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(15,118,110,.35) 0%, transparent 70%); pointer-events: none; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(15,118,110,.15); border: 1px solid rgba(15,118,110,.4); color: #5eead4; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 28px; }
    .hero-badge::before { content: '●'; color: #10b981; font-size: 8px; }
    h1 { font-size: clamp(36px, 7vw, 72px); font-weight: 900; line-height: 1.1; letter-spacing: -2px; max-width: 900px; margin-bottom: 24px; }
    h1 em { font-style: normal; color: var(--brand); background: linear-gradient(135deg, #0f766e, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero-sub { font-size: clamp(16px, 2.5vw, 20px); color: var(--muted); max-width: 600px; margin-bottom: 40px; }
    .hero-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 64px; }
    .btn-primary { background: var(--brand); color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; transition: all .15s; display: inline-flex; align-items: center; gap: 8px; }
    .btn-primary:hover { background: var(--brand-dark); transform: translateY(-1px); }
    .btn-secondary { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; text-decoration: none; transition: all .15s; }
    .btn-secondary:hover { background: rgba(255,255,255,.1); }

    /* MOCKUP */
    .mockup { width: 100%; max-width: 860px; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); background: var(--surface); box-shadow: 0 40px 100px rgba(0,0,0,.6); }
    .mockup-bar { background: var(--surface2); height: 36px; display: flex; align-items: center; padding: 0 16px; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-r { background: #ff5f57; } .dot-y { background: #ffbd2e; } .dot-g { background: #28c840; }
    .mockup-inner { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-height: 240px; }
    .mockup-panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 10px; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .mockup-panel svg { opacity: .5; }
    .mockup-label { font-size: 11px; color: var(--muted); text-align: center; margin-top: 8px; }

    /* FEATURES */
    .section { padding: 80px 24px; max-width: 1100px; margin: 0 auto; }
    .section-label { font-size: 13px; color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 12px; }
    .section-title { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -1px; margin-bottom: 16px; }
    .section-sub { color: var(--muted); font-size: 18px; max-width: 560px; margin-bottom: 56px; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
    .feature-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; transition: border-color .2s; }
    .feature-card:hover { border-color: rgba(15,118,110,.5); }
    .feature-icon { width: 44px; height: 44px; background: rgba(15,118,110,.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; margin-bottom: 16px; }
    .feature-title { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
    .feature-desc { color: var(--muted); font-size: 14px; line-height: 1.6; }

    /* STEPS */
    .steps { padding: 80px 24px; background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .steps-inner { max-width: 1100px; margin: 0 auto; }
    .steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 32px; margin-top: 48px; }
    .step { text-align: center; }
    .step-num { width: 48px; height: 48px; background: var(--brand); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; margin: 0 auto 16px; }
    .step-title { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
    .step-desc { color: var(--muted); font-size: 14px; }

    /* CTA */
    .cta-section { padding: 80px 24px; text-align: center; position: relative; overflow: hidden; }
    .cta-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 80% at 50% 100%, rgba(15,118,110,.2) 0%, transparent 70%); pointer-events: none; }
    .cta-box { max-width: 640px; margin: 0 auto; position: relative; }
    .cta-title { font-size: clamp(28px, 4vw, 44px); font-weight: 900; letter-spacing: -1px; margin-bottom: 16px; }
    .cta-sub { color: var(--muted); font-size: 18px; margin-bottom: 36px; }

    /* FOOTER */
    footer { border-top: 1px solid var(--border); padding: 32px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; max-width: 1100px; margin: 0 auto; }
    .footer-links { display: flex; gap: 24px; }
    .footer-links a { color: var(--muted); text-decoration: none; font-size: 13px; transition: color .15s; }
    .footer-links a:hover { color: #fff; }
    .footer-copy { color: var(--muted); font-size: 13px; }

    @media (max-width: 640px) {
      nav { padding: 12px 16px; }
      .nav-links .nav-link { display: none; }
      footer { flex-direction: column; text-align: center; }
    }
  </style>
</head>
<body>

  <nav>
    <span class="logo">Print<span>Lab</span></span>
    <div class="nav-links">
      <a href="#features" class="nav-link">Özellikler</a>
      <a href="#how" class="nav-link">Nasıl Çalışır</a>
      <a href="/privacy-policy" class="nav-link">Gizlilik</a>
      <a href="/terms-of-service" class="nav-link">Koşullar</a>
      <a href="https://apps.shopify.com" class="nav-cta" target="_blank">Shopify'a Ekle →</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-badge">Shopify Embedded App · Remix.js</div>
    <h1>Müşterileriniz<br/><em>kendi tasarımlarını</em><br/>yapsın</h1>
    <p class="hero-sub">
      PrintLab, Shopify mağazanıza entegre edilebilen interaktif bir baskı tasarım aracıdır.
      Müşteriler ürünleri özelleştirir, siz baskıya hazır dosyaları alırsınız.
    </p>
    <div class="hero-btns">
      <a href="https://apps.shopify.com" class="btn-primary" target="_blank">
        Şimdi Başla
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <a href="#features" class="btn-secondary">Özellikleri İncele</a>
    </div>

    <!-- Browser Mockup -->
    <div class="mockup">
      <div class="mockup-bar">
        <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
        <div style="flex:1;background:rgba(255,255,255,.05);border-radius:4px;height:20px;margin:0 12px;display:flex;align-items:center;padding:0 10px;">
          <span style="font-size:11px;color:var(--muted)">app.printlabapp.com</span>
        </div>
      </div>
      <div class="mockup-inner">
        <div>
          <div class="mockup-panel" style="height:180px;flex-direction:column;gap:12px;background:linear-gradient(135deg,rgba(15,118,110,.08),rgba(16,185,129,.04));">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <div style="font-size:11px;color:var(--muted);font-weight:600;">Tasarım Editörü</div>
          </div>
          <div class="mockup-label">Ön Yüz · Arka Yüz</div>
        </div>
        <div>
          <div class="mockup-panel" style="height:180px;flex-direction:column;gap:8px;">
            <div style="width:100%;background:rgba(255,255,255,.04);border-radius:6px;padding:10px;font-size:12px;color:var(--muted);">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>#1028</span><span style="color:#10b981;font-size:10px;background:rgba(16,185,129,.1);padding:2px 8px;border-radius:10px;">Bekliyor</span></div>
              <div style="height:6px;background:rgba(255,255,255,.05);border-radius:3px;margin-bottom:4px;"></div>
              <div style="height:6px;background:rgba(255,255,255,.05);border-radius:3px;width:70%;"></div>
            </div>
            <div style="width:100%;background:rgba(255,255,255,.04);border-radius:6px;padding:10px;font-size:12px;color:var(--muted);">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>#1027</span><span style="color:#f59e0b;font-size:10px;background:rgba(245,158,11,.1);padding:2px 8px;border-radius:10px;">Basıldı</span></div>
              <div style="height:6px;background:rgba(255,255,255,.05);border-radius:3px;margin-bottom:4px;"></div>
              <div style="height:6px;background:rgba(255,255,255,.05);border-radius:3px;width:85%;"></div>
            </div>
          </div>
          <div class="mockup-label">Sipariş Yönetim Paneli</div>
        </div>
      </div>
    </div>
  </section>

  <!-- FEATURES -->
  <section class="section" id="features">
    <div class="section-label">Özellikler</div>
    <h2 class="section-title">Baskı işini <em style="font-style:normal;color:#10b981">kolaylaştırır</em></h2>
    <p class="section-sub">Tasarımdan baskıya tüm süreç tek platformda yönetilir.</p>

    <div class="features">
      <div class="feature-card">
        <div class="feature-icon">🎨</div>
        <div class="feature-title">İnteraktif Tasarım Editörü</div>
        <div class="feature-desc">Müşteriler Fabric.js tabanlı editörde görseller yükler, yazı ekler, döndürür ve boyutlandırır. Ön ve arka yüz desteği.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🖨️</div>
        <div class="feature-title">Baskıya Hazır Dosyalar</div>
        <div class="feature-desc">Her sipariş için 300 DPI PNG üretilir. Cloudflare R2'de güvenli depolanır, doğrudan indirilebilir.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📦</div>
        <div class="feature-title">Sipariş Yönetim Paneli</div>
        <div class="feature-desc">Bekliyor → Hazırlanıyor → Basıldı → Hazır → Gönderildi. Shopify siparişleri otomatik senkronize edilir.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">💳</div>
        <div class="feature-title">Dinamik Baskı Ücretleri</div>
        <div class="feature-desc">Tasarım boyutuna göre otomatik ek ücret hesaplama. Fiyat bantları özelleştirilebilir.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">✂️</div>
        <div class="feature-title">Arka Plan Kaldırma</div>
        <div class="feature-desc">Photoroom API entegrasyonu ile müşteri yüklediğinde tek tıkla arka plan temizleme.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔗</div>
        <div class="feature-title">Müşteri Tasarım Linki</div>
        <div class="feature-desc">Sipariş sonrası müşteriye gönderilebilir link. Kendi tasarımını görür ve indirir.</div>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <div class="steps" id="how">
    <div class="steps-inner">
      <div class="section-label" style="text-align:center">Nasıl Çalışır</div>
      <h2 class="section-title" style="text-align:center">4 adımda baskı iş akışı</h2>
      <div class="steps-grid">
        <div class="step">
          <div class="step-num">1</div>
          <div class="step-title">Uygulamayı Kur</div>
          <div class="step-desc">Shopify Partner Dashboard üzerinden mağazana kur, baskı alanlarını ayarla.</div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-title">Müşteri Tasarlar</div>
          <div class="step-desc">Ürün sayfasında editör açılır, müşteri tasarımını oluşturur ve sepete ekler.</div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-title">Sipariş Gelir</div>
          <div class="step-desc">Ödeme tamamlanır, sipariş ve baskı dosyaları otomatik panele düşer.</div>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <div class="step-title">Baskı & Kargo</div>
          <div class="step-desc">Yüksek kaliteli PNG dosyasını indir, bas ve gönder. Durum panelden takip et.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- CTA -->
  <section class="cta-section">
    <div class="cta-box">
      <h2 class="cta-title">Mağazana hemen ekle</h2>
      <p class="cta-sub">Shopify mağaza sahiplerine özel. Kurulum 5 dakika.</p>
      <a href="https://apps.shopify.com" class="btn-primary" style="font-size:18px;padding:16px 40px;" target="_blank">
        Shopify App Store'dan Al →
      </a>
    </div>
  </section>

  <footer>
    <div class="footer-copy">© 2025 PrintLab. Tüm hakları saklıdır.</div>
    <div class="footer-links">
      <a href="/privacy-policy">Gizlilik Politikası</a>
      <a href="/terms-of-service">Kullanım Koşulları</a>
      <a href="mailto:anpekesen@gmail.com">İletişim</a>
    </div>
  </footer>

</body>
</html>`;
