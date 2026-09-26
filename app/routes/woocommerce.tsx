import { type LoaderFunctionArgs } from "@remix-run/node";
import { PLANS, type PlanKey } from "~/lib/plans";
import { CREDIT_PACKS } from "~/lib/credit-packs";

/**
 * PrintLab for WooCommerce tanıtım ve fiyat sayfası. Paddle'ın alan adı
 * incelemesi, bu alan adında ne satıldığını ve fiyatlarını görmek istiyor;
 * fiyatlar ve özellikler plans.ts / credit-packs.ts'ten gelir.
 */
const ORDER: PlanKey[] = ["Free", "Starter", "Growth", "Pro", "Business"];
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function planCards(lang: "tr" | "en") {
  return ORDER.map((k) => {
    const p = PLANS[k] as { price: number; trialDays?: number; features?: { tr?: string[]; en?: string[] } };
    const price = p.price === 0 ? (lang === "tr" ? "Ücretsiz" : "Free") : `$${p.price}<small>/${lang === "tr" ? "ay" : "month"}</small>`;
    const trial = p.trialDays ? `<p class="trial">${lang === "tr" ? `${p.trialDays} gün ücretsiz deneme` : `${p.trialDays}-day free trial`}</p>` : "";
    const feats = (p.features?.[lang] ?? []).map((f) => `<li>${esc(f)}</li>`).join("");
    return `<div class="plan"><h3>${k}</h3><p class="price">${price}</p>${trial}<ul>${feats}</ul></div>`;
  }).join("");
}

function creditRows(lang: "tr" | "en") {
  return Object.values(CREDIT_PACKS).map((c) =>
    `<li>${c.credits} ${lang === "tr" ? "AI kredisi" : "AI credits"} — $${c.price}</li>`).join("");
}

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(html(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
};

const html = () => `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PrintLab for WooCommerce — Product personalizer and t-shirt designer</title>
  <meta name="description" content="Product personalizer and t-shirt designer for WooCommerce. Customers design the product; you get a print-ready file with every order." />
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
      .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 18px 0 8px; }
    .plan { background: var(--surface); border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .plan h3 { font-size: 16px; margin-bottom: 6px; }
    .plan .price { font-size: 22px; font-weight: 700; color: var(--brand); }
    .plan .price small { font-size: 13px; color: #64748b; font-weight: 500; }
    .plan .trial { font-size: 12px; color: #64748b; margin: 2px 0 8px; }
    .plan ul { padding-left: 18px; font-size: 13px; line-height: 1.7; }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo"><img src="/logo-full.png" alt="PrintLabApp" height="40" /></a>
    <div style="display:flex;align-items:center;gap:20px">
      <nav>
        <a href="/terms-of-service" style="color:var(--brand);font-weight:600">PrintLab for WooCommerce</a>
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
      <span class="badge">WooCommerce</span>
      <h1>PrintLab for WooCommerce</h1>
      <p class="meta">WooCommerce için ürün kişiselleştirici ve tişört tasarımcısı</p>
      <div class="box"><p>Müşterileriniz ürünü kendileri tasarlar, sonucu görür ve sepete ekler; her siparişle baskıya hazır dosya gelir. PrintLab, WordPress eklentisi olarak kurulur ve abonelikle çalışan bir yazılım hizmetidir (SaaS).</p></div>

      <h2>Neler var?</h2>
      <ul>
        <li><strong>Tişört tasarımcısı:</strong> ön ve arka yüz, görsel, yazı, hazır tasarımlar; birden çok beden tek adımda; baskı ölçüsüne göre fiyat</li>
        <li><strong>Fotoğraf şablonları:</strong> çerçeve, kanvas, polaroid kart, takvim; şekilli fotoğraf alanları ve yazı alanları</li>
        <li><strong>Hazır üreticiler:</strong> şarkı kartı, yıldız haritası, şehir haritası, monogram, doğum çiçeği, QR kod ve daha fazlası</li>
        <li><strong>Üretim:</strong> baskı dosyaları, üretim ekranı, gang sheet, baskı kuyruğu, kargo takip numarası</li>
        <li>Ek ücretler sunucuda hesaplanır; WooCommerce blok sepeti ve HPOS ile uyumludur</li>
      </ul>

      <h2>Planlar ve fiyatlar</h2>
      <div class="plans">${planCards("tr")}</div>
      <p>Fiyatlar ABD doları cinsindendir; vergiler ödeme sırasında ülkenize göre eklenir. Abonelikler aylık yenilenir ve istediğiniz zaman iptal edilebilir.</p>

      <h2>AI kredi paketleri</h2>
      <ul>${creditRows("tr")}</ul>
      <p>Krediler satın alındıktan sonra 30 gün geçerlidir.</p>

      <h2>Ödeme</h2>
      <p>Siparişlerimiz çevrim içi satıcımız <strong>Paddle.com</strong> tarafından yürütülür; Paddle.com tüm siparişlerimizde satıcıdır (Merchant of Record). İlk ödemeden sonraki 14 gün içinde koşulsuz iade: <a href="/refund-policy">İade Politikası</a>.</p>

      <h2>Nasıl başlanır?</h2>
      <ol>
        <li>WordPress'te <em>PrintLab for WooCommerce</em> eklentisini kurun ve etkinleştirin.</li>
        <li>WooCommerce &gt; PrintLab sayfasında <em>Connect to PrintLab</em>'e basın.</li>
        <li><em>Open PrintLab</em> ile baskı alanlarını, fiyatları ve şablonları ayarlayın; ücretsiz planla başlayın.</li>
      </ol>
      <p>Sorularınız için: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a></p>
    </div>

    <!-- ENGLISH -->
    <div data-lang="en">
      <span class="badge">WooCommerce</span>
      <h1>PrintLab for WooCommerce</h1>
      <p class="meta">Product personalizer and t-shirt designer for WooCommerce</p>
      <div class="box"><p>Your customers design the product themselves, see the result and add it to the cart; every order arrives with a print-ready file. PrintLab installs as a WordPress plugin and is a subscription software service (SaaS).</p></div>

      <h2>What's included</h2>
      <ul>
        <li><strong>T-shirt designer:</strong> front and back, images, text, ready-made designs; several sizes in one step; print price by print size</li>
        <li><strong>Photo templates:</strong> frames, canvases, polaroid cards, calendars; shaped photo areas and text fields</li>
        <li><strong>Generators:</strong> song cards, star maps, city maps, monograms, birth flowers, QR codes and more</li>
        <li><strong>Production:</strong> print files, production screen, gang sheets, print queue, tracking numbers</li>
        <li>Extra charges are priced on the server; works with the WooCommerce block cart and HPOS</li>
      </ul>

      <h2>Plans and pricing</h2>
      <div class="plans">${planCards("en")}</div>
      <p>Prices are in US dollars; taxes are added at checkout based on your country. Subscriptions renew monthly and can be canceled at any time.</p>

      <h2>AI credit packs</h2>
      <ul>${creditRows("en")}</ul>
      <p>Credits are valid for 30 days after purchase.</p>

      <h2>Payment</h2>
      <p>Our order process is conducted by our online reseller <strong>Paddle.com</strong>. Paddle.com is the Merchant of Record for all our orders. 14-day money-back guarantee on the first payment: <a href="/refund-policy">Refund Policy</a>.</p>

      <h2>Getting started</h2>
      <ol>
        <li>Install and activate the <em>PrintLab for WooCommerce</em> plugin in WordPress.</li>
        <li>Go to WooCommerce &gt; PrintLab and click <em>Connect to PrintLab</em>.</li>
        <li>Click <em>Open PrintLab</em> to set up print areas, prices and templates; start on the free plan.</li>
      </ol>
      <p>Questions: <a href="mailto:support@printlabapp.com">support@printlabapp.com</a></p>
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
