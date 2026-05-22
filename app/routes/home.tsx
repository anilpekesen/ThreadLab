import { type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- Primary SEO -->
  <title>PrintLab — Shopify Print-on-Demand Design App</title>
  <meta name="description" content="PrintLab lets your customers design their own t-shirts, hoodies and more — directly on your Shopify store. Get print-ready files automatically with every order." />
  <meta name="keywords" content="shopify print on demand, shopify designer app, custom t-shirt designer, print ready files, shopify apparel app, printlab" />
  <link rel="canonical" href="https://printlabapp.com/" />

  <!-- Open Graph (Facebook, LinkedIn, WhatsApp) -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://printlabapp.com/" />
  <meta property="og:title" content="PrintLab — Let Customers Design Their Own Products" />
  <meta property="og:description" content="Add a custom print designer to your Shopify store. Customers design, you print. Print-ready files delivered automatically with every order." />
  <meta property="og:image" content="https://printlabapp.com/screenshots/ss-dashboard-en.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="PrintLab" />
  <meta property="og:locale" content="en_US" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@printlabapp" />
  <meta name="twitter:title" content="PrintLab — Let Customers Design Their Own Products" />
  <meta name="twitter:description" content="Add a custom print designer to your Shopify store. Customers design, you print. Print-ready files delivered automatically with every order." />
  <meta name="twitter:image" content="https://printlabapp.com/screenshots/ss-dashboard-en.png" />

  <!-- Structured Data (Google Rich Results) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "PrintLab",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Shopify",
    "url": "https://printlabapp.com",
    "description": "PrintLab lets your customers design their own t-shirts and apparel directly on your Shopify store. Print-ready files are generated automatically with every order.",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "19.99",
      "highPrice": "99.99",
      "priceCurrency": "USD"
    },
    "publisher": {
      "@type": "Organization",
      "name": "PrintLab",
      "url": "https://printlabapp.com"
    }
  }
  </script>

  <!-- Favicon (inline SVG) -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234f46e5'/><text y='22' x='5' font-size='18' font-family='system-ui' font-weight='900' fill='white'>P</text></svg>" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand: #4f46e5; --brand-dark: #3730a3; --brand-light: #ede9fe;
      --bg: #0a0a0f; --surface: #111118; --surface2: #1a1a26;
      --border: #1e1e2e; --text: #f1f5f9; --muted: #8b8ba7; --radius: 14px;
    }
    html { scroll-behavior: smooth; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; overflow-x: hidden; }

    /* NAV */
    nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 14px 40px; display: flex; align-items: center; justify-content: space-between; background: rgba(10,10,15,.9); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,.06); }
    .logo { font-size: 20px; font-weight: 900; color: #fff; letter-spacing: -0.5px; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .logo-icon { width: 32px; height: 32px; background: var(--brand); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
    .nav-links { display: flex; gap: 4px; align-items: center; }
    .nav-link { color: var(--muted); text-decoration: none; font-size: 14px; padding: 7px 14px; border-radius: 8px; transition: all .15s; }
    .nav-link:hover { color: #fff; background: rgba(255,255,255,.06); }
    .nav-cta { background: var(--brand); color: #fff; padding: 8px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all .15s; }
    .nav-cta:hover { background: var(--brand-dark); }

    /* HERO */
    .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 120px 24px 80px; position: relative; overflow: hidden; }
    .hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 50% at 50% -5%, rgba(79,70,229,.3) 0%, transparent 65%); pointer-events: none; }
    .hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(79,70,229,.12); border: 1px solid rgba(79,70,229,.35); color: #a5b4fc; padding: 7px 18px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 32px; }
    .hero-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #818cf8; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.3)} }
    h1 { font-size: clamp(38px, 7vw, 76px); font-weight: 900; line-height: 1.05; letter-spacing: -3px; max-width: 960px; margin-bottom: 24px; }
    h1 em { font-style: normal; background: linear-gradient(135deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero-sub { font-size: clamp(16px, 2.5vw, 20px); color: var(--muted); max-width: 580px; margin-bottom: 44px; line-height: 1.7; }
    .hero-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 72px; }
    .btn-primary { background: var(--brand); color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; transition: all .2s; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 0 30px rgba(79,70,229,.4); }
    .btn-primary:hover { background: var(--brand-dark); transform: translateY(-2px); box-shadow: 0 0 40px rgba(79,70,229,.55); }
    .btn-secondary { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #fff; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; text-decoration: none; transition: all .15s; }
    .btn-secondary:hover { background: rgba(255,255,255,.1); }

    /* SCREENSHOT HERO */
    .hero-screenshot { width: 100%; max-width: 980px; position: relative; }
    .browser-frame { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 40px 120px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.04); }
    .browser-bar { background: var(--surface2); height: 40px; display: flex; align-items: center; padding: 0 16px; gap: 8px; border-bottom: 1px solid var(--border); }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .dot-r { background: #ff5f57; } .dot-y { background: #ffbd2e; } .dot-g { background: #28c840; }
    .url-bar { flex: 1; background: rgba(255,255,255,.04); border-radius: 6px; height: 22px; display: flex; align-items: center; padding: 0 10px; margin: 0 12px; }
    .url-text { font-size: 11px; color: var(--muted); }
    .browser-frame img { width: 100%; display: block; }

    /* TRUSTED */
    .trusted { padding: 32px 24px; text-align: center; border-top: 1px solid var(--border); }
    .trusted p { font-size: 13px; color: var(--muted); margin-bottom: 20px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
    .trusted-logos { display: flex; align-items: center; justify-content: center; gap: 32px; flex-wrap: wrap; }
    .shopify-badge { display: inline-flex; align-items: center; gap: 8px; color: #96bf48; font-size: 14px; font-weight: 700; background: rgba(150,191,72,.08); border: 1px solid rgba(150,191,72,.2); padding: 8px 18px; border-radius: 8px; }

    /* FEATURE SCREENSHOTS */
    .section { padding: 100px 24px; max-width: 1140px; margin: 0 auto; }
    .section-label { font-size: 12px; color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    .section-label::before { content: ''; width: 16px; height: 2px; background: var(--brand); border-radius: 2px; }
    .section-title { font-size: clamp(28px, 4vw, 46px); font-weight: 800; letter-spacing: -1.5px; margin-bottom: 16px; line-height: 1.1; }
    .section-sub { color: var(--muted); font-size: 18px; max-width: 520px; line-height: 1.7; }

    /* Feature rows */
    .feature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; padding: 80px 24px; max-width: 1140px; margin: 0 auto; }
    .feature-row.reverse { direction: rtl; }
    .feature-row.reverse > * { direction: ltr; }
    .feature-text { }
    .feature-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    .chip { background: rgba(79,70,229,.1); border: 1px solid rgba(79,70,229,.25); color: #a5b4fc; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
    .feature-title { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 14px; line-height: 1.2; }
    .feature-desc { color: var(--muted); font-size: 16px; line-height: 1.7; margin-bottom: 24px; }
    .feature-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
    .feature-list li { display: flex; align-items: flex-start; gap: 10px; color: var(--muted); font-size: 14px; }
    .feature-list li::before { content: '✓'; color: #818cf8; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
    .feature-img { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 20px 60px rgba(0,0,0,.6); }
    .feature-img img { width: 100%; display: block; }

    /* PRICING */
    .pricing { padding: 100px 24px; background: var(--surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .pricing-inner { max-width: 1140px; margin: 0 auto; }
    .pricing-header { text-align: center; margin-bottom: 56px; }
    .plans { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .plan-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; display: flex; flex-direction: column; gap: 20px; transition: border-color .2s; }
    .plan-card:hover { border-color: rgba(79,70,229,.4); }
    .plan-card.featured { border-color: var(--brand); background: rgba(79,70,229,.05); position: relative; }
    .plan-featured-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--brand); color: #fff; font-size: 11px; font-weight: 700; padding: 3px 14px; border-radius: 20px; white-space: nowrap; }
    .plan-name { font-size: 16px; font-weight: 700; }
    .plan-price { display: flex; align-items: baseline; gap: 4px; }
    .plan-price-num { font-size: 36px; font-weight: 900; letter-spacing: -1px; }
    .plan-price-per { font-size: 13px; color: var(--muted); }
    .plan-trial { font-size: 12px; color: #818cf8; background: rgba(79,70,229,.1); padding: 3px 10px; border-radius: 10px; display: inline-block; }
    .plan-features { list-style: none; display: flex; flex-direction: column; gap: 9px; flex: 1; }
    .plan-features li { font-size: 13px; color: var(--muted); display: flex; align-items: flex-start; gap: 8px; }
    .plan-features li::before { content: '✓'; color: #818cf8; font-weight: 700; flex-shrink: 0; }
    .plan-btn { display: block; text-align: center; padding: 10px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; transition: all .15s; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: #fff; }
    .plan-card.featured .plan-btn { background: var(--brand); border-color: var(--brand); }
    .plan-btn:hover { opacity: .85; }

    /* STEPS */
    .steps { padding: 100px 24px; max-width: 1140px; margin: 0 auto; }
    .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; margin-top: 56px; }
    .step { text-align: center; }
    .step-num { width: 52px; height: 52px; background: linear-gradient(135deg, var(--brand), #7c3aed); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; margin: 0 auto 20px; }
    .step-title { font-weight: 700; font-size: 16px; margin-bottom: 10px; }
    .step-desc { color: var(--muted); font-size: 14px; line-height: 1.6; }
    .step-connector { display: none; }

    /* CTA */
    .cta-section { padding: 100px 24px; text-align: center; position: relative; overflow: hidden; }
    .cta-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 80% at 50% 100%, rgba(79,70,229,.2) 0%, transparent 70%); pointer-events: none; }
    .cta-box { max-width: 640px; margin: 0 auto; position: relative; }
    .cta-title { font-size: clamp(32px, 5vw, 52px); font-weight: 900; letter-spacing: -2px; margin-bottom: 16px; line-height: 1.1; }
    .cta-sub { color: var(--muted); font-size: 18px; margin-bottom: 40px; }

    /* FOOTER */
    .footer-wrap { border-top: 1px solid var(--border); }
    footer { padding: 36px 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; max-width: 1140px; margin: 0 auto; }
    .footer-left { display: flex; flex-direction: column; gap: 6px; }
    .footer-links { display: flex; gap: 24px; flex-wrap: wrap; }
    .footer-links a { color: var(--muted); text-decoration: none; font-size: 13px; transition: color .15s; }
    .footer-links a:hover { color: #fff; }
    .footer-copy { color: var(--muted); font-size: 13px; }

    @media (max-width: 900px) {
      .feature-row { grid-template-columns: 1fr; gap: 40px; }
      .feature-row.reverse { direction: ltr; }
      .plans { grid-template-columns: 1fr 1fr; }
      .steps-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 640px) {
      nav { padding: 12px 16px; }
      .nav-links .nav-link { display: none; }
      .plans { grid-template-columns: 1fr; }
      .steps-grid { grid-template-columns: 1fr; }
      footer { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>

  <nav>
    <a href="/" class="logo">
      <div class="logo-icon">🎨</div>
      PrintLab
    </a>
    <div class="nav-links">
      <a href="#features" class="nav-link">Features</a>
      <a href="#pricing" class="nav-link">Pricing</a>
      <a href="/privacy-policy" class="nav-link">Privacy</a>
      <a href="/terms-of-service" class="nav-link">Terms</a>
      <a href="https://apps.shopify.com/designkit-print" class="nav-cta" target="_blank">Add to Shopify →</a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-badge">
      <span class="hero-badge-dot"></span>
      Shopify Embedded App · Print-on-Demand
    </div>
    <h1>Let your customers<br/><em>design their own</em><br/>products</h1>
    <p class="hero-sub">
      PrintLab adds an interactive print designer to your Shopify product pages.
      Customers customize, you get print-ready files. Automatically.
    </p>
    <div class="hero-btns">
      <a href="https://apps.shopify.com/designkit-print" class="btn-primary" target="_blank">
        Start Free Trial
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
      <a href="#features" class="btn-secondary">See how it works</a>
    </div>

    <div class="hero-screenshot">
      <div class="browser-frame">
        <div class="browser-bar">
          <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
          <div class="url-bar">
            <span class="url-text">🔒 app.printlabapp.com/app</span>
          </div>
          <div style="display:flex;gap:6px;">
            <div style="background:rgba(255,255,255,.06);border-radius:4px;padding:3px 10px;font-size:11px;color:#818cf8;font-weight:600;">TR</div>
            <div style="background:rgba(79,70,229,.2);border-radius:4px;padding:3px 10px;font-size:11px;color:#a5b4fc;font-weight:600;">EN</div>
          </div>
        </div>
        <img src="/screenshots/ss-dashboard-en.png" alt="PrintLab Dashboard" loading="eager" />
      </div>
    </div>
  </section>

  <!-- TRUSTED -->
  <div class="trusted">
    <p>Built for</p>
    <div class="trusted-logos">
      <div class="shopify-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.337 23.979l4.842-1.047s-1.738-11.76-1.752-11.857a.2.2 0 00-.197-.173c-.085 0-1.62-.031-1.62-.031s-1.074-1.039-1.194-1.153v14.261zM12.35 7.228s-.72-.196-1.576-.196c-2.575 0-3.813 1.625-3.813 3.23 0 1.793 1.107 2.693 2.137 3.463.957.715 1.282 1.19 1.282 1.84 0 .735-.586 1.156-1.534 1.156-1.05 0-2.073-.358-2.073-.358L6.4 17.65s.952.414 2.501.414c2.294 0 3.924-1.137 3.924-3.27 0-1.728-1.14-2.761-2.215-3.549-.93-.676-1.312-1.124-1.312-1.852 0-.609.427-1.157 1.457-1.157.888 0 1.706.25 1.706.25l.89-1.258zm5.94-.804c-.043-.267-.247-.398-.496-.386-.244.013-1.518.028-1.518.028s-1.021-1.024-1.13-1.128c-.109-.104-.32-.075-.402-.051l-.554.172S13.693 3.3 13.34 3.06C12.844 2.719 12.22 2.72 11.826 2.72c-.088 0-.166.004-.236.012L10.81 0S9.974.172 9.64.264C9.32.353 6.92 1.017 6.92 1.017s-2.23 5.858-2.444 6.535c.614-.176 1.83-.515 1.83-.515s.53-1.47.659-1.825c.127-.356.458-.51.71-.51.26 0 .513.143.613.5.133.476.372 2.105.372 2.105s1.065-.31 1.65-.468c-.163-.894-.535-2.926-.648-3.43-.113-.505.04-.743.33-.9.28-.15.69-.19.99-.19.268 0 .656.056.656.056l.233-1.073s.585-.124.85.226c.355.466.682 1.995.682 1.995s1.014-.287 1.636-.46c-.03-.16-.053-.301-.053-.301zM4.474 23.979L.02 22.932S0 11.15 0 11.065C0 10.98.087 10.9.197 10.9c.11 0 2.046-.031 2.046-.031s1.066-1.039 1.186-1.153l.045 14.263z"/></svg>
        Shopify Embedded App
      </div>
      <div style="color:var(--muted);font-size:13px;display:flex;align-items:center;gap:6px;">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        GDPR Compliant
      </div>
      <div style="color:var(--muted);font-size:13px;display:flex;align-items:center;gap:6px;">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        7-day free trial
      </div>
    </div>
  </div>

  <!-- FEATURE: ORDERS -->
  <div class="feature-row">
    <div class="feature-text">
      <div class="section-label">Order Management</div>
      <h2 class="feature-title">Track every print order<br/>in one place</h2>
      <p class="feature-desc">All orders with customer designs flow into a single dashboard. Advance production status with one click and sync automatically with Shopify.</p>
      <ul class="feature-list">
        <li>Real-time sync from Shopify Admin API</li>
        <li>One-click status: Pending → Preparing → Printed → Ready → Shipped</li>
        <li>Auto-update to "Shipped" when Shopify fulfills the order</li>
        <li>Front + back design previews per order</li>
        <li>Direct link to Shopify order</li>
      </ul>
    </div>
    <div class="feature-img">
      <img src="/screenshots/ss-orders.png" alt="Order management dashboard" loading="lazy" />
    </div>
  </div>

  <!-- FEATURE: PRODUCT TYPES -->
  <div class="feature-row reverse">
    <div class="feature-text">
      <div class="section-label">Product Setup</div>
      <h2 class="feature-title">Configure print areas<br/>per product type</h2>
      <p class="feature-desc">Define your product categories — t-shirt, hoodie, mug, bag — and set exact print boundaries for each. Assign Shopify products and you're ready.</p>
      <ul class="feature-list">
        <li>Front-only or front + back surface modes</li>
        <li>Visual print area editor with mockup preview</li>
        <li>Width, height, position constraints per area</li>
        <li>Assign multiple Shopify products to one type</li>
        <li>Per-product surcharge pricing</li>
      </ul>
    </div>
    <div class="feature-img">
      <img src="/screenshots/ss-print-area.png" alt="Print area editor" loading="lazy" />
    </div>
  </div>

  <!-- FEATURE: TEMPLATES -->
  <div class="feature-row">
    <div class="feature-text">
      <div class="section-label">Store Templates</div>
      <h2 class="feature-title">Give customers<br/>a head start</h2>
      <p class="feature-desc">Upload ready-made designs customers can pick as a starting point. Organize by category — Cartoon, Sports, Nature, and more.</p>
      <ul class="feature-list">
        <li>PNG, JPG, WebP, SVG support up to 8 MB</li>
        <li>Category tags for easy browsing</li>
        <li>Template quota scales with your plan</li>
        <li>Customers can edit templates in the designer</li>
      </ul>
    </div>
    <div class="feature-img">
      <img src="/screenshots/ss-templates.png" alt="Store templates" loading="lazy" />
    </div>
  </div>

  <!-- FEATURE: SETTINGS / BILLING -->
  <div class="feature-row reverse">
    <div class="feature-text">
      <div class="section-label">Automatic Pricing</div>
      <h2 class="feature-title">Print surcharge<br/>added automatically</h2>
      <p class="feature-desc">PrintLab uses Shopify Cart Transform to calculate print cost and add it to the cart — no manual work needed. Configure once, runs forever.</p>
      <ul class="feature-list">
        <li>Shopify Cart Transform Function (no redirect)</li>
        <li>Surcharge based on design size and print area</li>
        <li>AI background removal via WaveSpeed API</li>
        <li>App Embed activation guide built-in</li>
      </ul>
    </div>
    <div class="feature-img">
      <img src="/screenshots/ss-settings.png" alt="Settings and surcharge setup" loading="lazy" />
    </div>
  </div>

  <!-- PRICING -->
  <section class="pricing" id="pricing">
    <div class="pricing-inner">
      <div class="pricing-header">
        <div class="section-label" style="justify-content:center">Pricing</div>
        <h2 class="section-title">Simple, transparent plans</h2>
        <p style="color:var(--muted);font-size:17px;margin-top:12px;">All plans include a 7-day free trial. No credit card required to start.</p>
      </div>

      <div class="plans">
        <div class="plan-card">
          <div>
            <div class="plan-name">Starter</div>
            <div class="plan-price"><span class="plan-price-num">$19.99</span><span class="plan-price-per">/mo</span></div>
            <div class="plan-trial">7-day free trial</div>
          </div>
          <ul class="plan-features">
            <li>1 product category</li>
            <li>100 orders / month</li>
            <li>Front + back surface print</li>
            <li>100 background removals / mo</li>
          </ul>
          <a href="https://apps.shopify.com/designkit-print" class="plan-btn" target="_blank">Start free trial</a>
        </div>

        <div class="plan-card featured">
          <div class="plan-featured-badge">Most popular</div>
          <div>
            <div class="plan-name">Growth</div>
            <div class="plan-price"><span class="plan-price-num">$29.99</span><span class="plan-price-per">/mo</span></div>
            <div class="plan-trial">7-day free trial</div>
          </div>
          <ul class="plan-features">
            <li>2 product categories</li>
            <li>500 orders / month</li>
            <li>Front + back surface print</li>
            <li>500 background removals / mo</li>
            <li>10 custom templates</li>
          </ul>
          <a href="https://apps.shopify.com/designkit-print" class="plan-btn" target="_blank">Start free trial</a>
        </div>

        <div class="plan-card">
          <div>
            <div class="plan-name">Pro</div>
            <div class="plan-price"><span class="plan-price-num">$49.99</span><span class="plan-price-per">/mo</span></div>
            <div class="plan-trial">7-day free trial</div>
          </div>
          <ul class="plan-features">
            <li>4 product categories</li>
            <li>2,000 orders / month</li>
            <li>Front + back surface print</li>
            <li>1,500 background removals / mo</li>
            <li>20 custom templates</li>
            <li>Priority support</li>
          </ul>
          <a href="https://apps.shopify.com/designkit-print" class="plan-btn" target="_blank">Start free trial</a>
        </div>

        <div class="plan-card">
          <div>
            <div class="plan-name">Business</div>
            <div class="plan-price"><span class="plan-price-num">$99.99</span><span class="plan-price-per">/mo</span></div>
            <div class="plan-trial">7-day free trial</div>
          </div>
          <ul class="plan-features">
            <li>Unlimited product categories</li>
            <li>Unlimited orders</li>
            <li>Front + back surface print</li>
            <li>4,000 background removals / mo</li>
            <li>Unlimited custom templates</li>
            <li>Custom onboarding & support</li>
          </ul>
          <a href="https://apps.shopify.com/designkit-print" class="plan-btn" target="_blank">Start free trial</a>
        </div>
      </div>

      <!-- Screenshot of billing page -->
      <div style="margin-top:56px;">
        <div class="browser-frame">
          <div class="browser-bar">
            <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
            <div class="url-bar"><span class="url-text">🔒 app.printlabapp.com/app/billing</span></div>
          </div>
          <img src="/screenshots/ss-billing.png" alt="PrintLab billing & plans" loading="lazy" style="width:100%;display:block;" />
        </div>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section class="steps" id="how">
    <div class="section-label" style="justify-content:center">How it works</div>
    <h2 class="section-title" style="text-align:center;margin-bottom:0">Set up in minutes,<br/>run on autopilot</h2>
    <div class="steps-grid">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-title">Install & Configure</div>
        <div class="step-desc">Add the app from Shopify App Store. Set up your product types and print areas. Enable the theme App Embed with one click.</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-title">Customer Designs</div>
        <div class="step-desc">The interactive designer appears on your product page. Customers upload images, add text, and build their custom design.</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-title">Order Arrives</div>
        <div class="step-desc">Print surcharge is added automatically. Design files land in your dashboard. No manual work — just review and print.</div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-title">Print & Ship</div>
        <div class="step-desc">Download the 300 DPI print-ready file, produce the order, and update the status. Customer gets notified automatically.</div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <div class="cta-box">
      <h2 class="cta-title">Ready to add custom<br/>printing to your store?</h2>
      <p class="cta-sub">Join Shopify merchants using PrintLab. 7-day free trial on all plans.</p>
      <a href="https://apps.shopify.com/designkit-print" class="btn-primary" style="font-size:17px;padding:16px 40px;margin:0 auto;" target="_blank">
        Add to Shopify — Free Trial
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </a>
    </div>
  </section>

  <div class="footer-wrap">
    <footer>
      <div class="footer-left">
        <div class="logo" style="font-size:17px;">
          <div class="logo-icon" style="width:26px;height:26px;font-size:13px;">🎨</div>
          PrintLab
        </div>
        <div class="footer-copy">© 2026 PrintLab. All rights reserved.</div>
      </div>
      <div class="footer-links">
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/terms-of-service">Terms of Service</a>
        <a href="mailto:anpekesen@gmail.com">Contact</a>
      </div>
    </footer>
  </div>

</body>
</html>`;
