import {
  alternatePath,
  blogIndexPath,
  blogPostPath,
  getPosts,
  SITE_ORIGIN,
  type BlogLang,
  type BlogPost,
} from "./blog-content.server";

const SHOPIFY_APP_URL = "https://apps.shopify.com/printlab?locale=tr";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(input: {
  lang: BlogLang;
  title: string;
  description: string;
  path: string;
  alternatePath: string;
  type: "website" | "article";
  jsonLd: string;
  body: string;
}) {
  const otherLang = input.lang === "tr" ? "en" : "tr";
  const blogLabel = input.lang === "tr" ? "Blog" : "Blog";
  const homeLabel = input.lang === "tr" ? "Ana Sayfa" : "Home";
  const appLabel = input.lang === "tr" ? "Shopify'a ekle" : "Add to Shopify";
  const tagline = input.lang === "tr"
    ? "Shopify mağazaları için product designer, product customizer ve baskıya hazır üretim akışı."
    : "Product designer, product customizer, and print-ready workflow for Shopify stores.";
  const canonical = `${SITE_ORIGIN}${input.path}`;
  const alternate = `${SITE_ORIGIN}${input.alternatePath}`;

  return `<!DOCTYPE html>
<html lang="${input.lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <meta name="description" content="${escapeHtml(input.description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" hreflang="${input.lang}" href="${canonical}" />
  <link rel="alternate" hreflang="${otherLang}" href="${alternate}" />
  <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/blog" />
  <meta property="og:type" content="${input.type}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(input.title)}" />
  <meta property="og:description" content="${escapeHtml(input.description)}" />
  <meta property="og:image" content="${SITE_ORIGIN}/logo.png" />
  <meta property="og:site_name" content="PrintLab" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(input.title)}" />
  <meta name="twitter:description" content="${escapeHtml(input.description)}" />
  <meta name="twitter:image" content="${SITE_ORIGIN}/logo.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <script type="application/ld+json">${input.jsonLd}</script>
  <style>
    :root{color-scheme:light;--ink:#111827;--muted:#5b6472;--line:#e5e7eb;--bg:#ffffff;--soft:#f6f7fb;--primary:#4f46e5;--primary-2:#312e81;--green:#059669;}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}
    a{color:inherit}
    .nav{border-bottom:1px solid var(--line);background:rgba(255,255,255,.92);backdrop-filter:blur(14px);position:sticky;top:0;z-index:20}
    .nav-inner{max-width:1120px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800}
    .logo img{height:34px;width:auto}
    .nav-links{display:flex;align-items:center;gap:18px;font-size:14px;font-weight:650}
    .nav-links a{text-decoration:none;color:#374151}
    .nav-actions{display:flex;align-items:center;gap:8px}
    .lang{display:flex;border:1px solid var(--line);border-radius:999px;padding:3px;background:#f9fafb}
    .lang a{font-size:12px;font-weight:800;text-decoration:none;padding:5px 10px;border-radius:999px;color:#6b7280}
    .lang a.active{background:var(--primary);color:#fff}
    .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:10px 16px;text-decoration:none;font-size:14px;font-weight:800;background:var(--primary);color:#fff;box-shadow:0 8px 18px rgba(79,70,229,.18)}
    .hero{background:linear-gradient(180deg,#f8fafc 0%,#fff 100%);border-bottom:1px solid var(--line)}
    .hero-inner{max-width:1120px;margin:0 auto;padding:70px 20px 54px}
    .eyebrow{color:var(--primary);font-weight:850;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    h1{font-size:clamp(38px,5vw,66px);line-height:1.02;letter-spacing:-.03em;margin:12px 0 18px;max-width:880px}
    .hero p{font-size:19px;color:var(--muted);max-width:760px;margin:0}
    .content{max-width:1120px;margin:0 auto;padding:42px 20px 74px}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
    .post-card{border:1px solid var(--line);border-radius:18px;padding:24px;text-decoration:none;background:#fff;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}
    .post-card:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(15,23,42,.08);border-color:#c7d2fe}
    .meta{font-size:13px;color:#6b7280;font-weight:650;margin-bottom:10px}
    .post-card h2{font-size:24px;line-height:1.18;letter-spacing:-.02em;margin:0 0 10px}
    .post-card p{color:var(--muted);margin:0 0 16px}
    .tags{display:flex;flex-wrap:wrap;gap:7px}
    .tag{font-size:12px;font-weight:750;color:#3730a3;background:#eef2ff;border-radius:999px;padding:5px 9px}
    .article{max-width:780px;margin:0 auto}
    .article-head{padding:58px 0 26px;border-bottom:1px solid var(--line)}
    .article h1{font-size:clamp(34px,4.8vw,58px)}
    .article-desc{font-size:19px;color:var(--muted);margin:0 0 18px}
    .article-body{padding:32px 0}
    .article-body h2{font-size:28px;line-height:1.2;letter-spacing:-.02em;margin:36px 0 12px}
    .article-body p{font-size:18px;color:#374151;margin:0 0 18px}
    .article-body ul{padding-left:22px;margin:0 0 22px;color:#374151;font-size:18px}
    .article-body li{margin:8px 0}
    .cta{margin-top:28px;border:1px solid #c7d2fe;border-radius:20px;background:#eef2ff;padding:24px}
    .cta h2{margin:0 0 8px;font-size:24px}
    .cta p{margin:0 0 18px;color:#374151}
    .related{margin-top:42px;border-top:1px solid var(--line);padding-top:28px}
    .related h2{font-size:22px;margin:0 0 14px}
    .footer{border-top:1px solid var(--line);background:#f9fafb}
    .footer-inner{max-width:1120px;margin:0 auto;padding:28px 20px;display:flex;justify-content:space-between;gap:18px;color:#6b7280;font-size:14px}
    @media(max-width:760px){.nav-links{display:none}.nav-inner{padding:12px 14px}.btn{padding:9px 12px}.hero-inner{padding:46px 16px 34px}.content{padding:28px 16px 52px}.grid{grid-template-columns:1fr}.post-card{padding:20px}.footer-inner{flex-direction:column}.article-body p,.article-body ul{font-size:17px}}
  </style>
</head>
<body>
  <header class="nav">
    <div class="nav-inner">
      <a class="logo" href="/home"><img src="/logo.png" alt="PrintLab" /><span>PrintLab</span></a>
      <nav class="nav-links" aria-label="Primary">
        <a href="/home">${homeLabel}</a>
        <a href="${blogIndexPath(input.lang)}">${blogLabel}</a>
      </nav>
      <div class="nav-actions">
        <div class="lang">
          <a class="${input.lang === "tr" ? "active" : ""}" href="${input.lang === "tr" ? input.path : input.alternatePath}">TR</a>
          <a class="${input.lang === "en" ? "active" : ""}" href="${input.lang === "en" ? input.path : input.alternatePath}">EN</a>
        </div>
        <a class="btn" href="${SHOPIFY_APP_URL}">${appLabel}</a>
      </div>
    </div>
  </header>
  ${input.body}
  <footer class="footer">
    <div class="footer-inner">
      <span>${tagline}</span>
      <span>© 2026 PrintLab</span>
    </div>
  </footer>
</body>
</html>`;
}

export function renderBlogIndex(lang: BlogLang) {
  const posts = getPosts(lang);
  const title = lang === "tr"
    ? "PrintLab Blog | Shopify Product Designer, Customizer ve Personalizer"
    : "PrintLab Blog | Shopify Product Designer, Customizer, and Personalizer";
  const description = lang === "tr"
    ? "Shopify product designer app, product customizer, product personalizer ve print on demand için pratik rehberler."
    : "Practical guides for Shopify product designer apps, product customizers, product personalizers, and print on demand workflows.";
  const path = blogIndexPath(lang);
  const cards = posts.map((post) => `
    <a class="post-card" href="${blogPostPath(post)}">
      <div class="meta">${post.date} · ${post.readingTime}</div>
      <h2>${escapeHtml(post.title)}</h2>
      <p>${escapeHtml(post.description)}</p>
      <div class="tags">${post.keywords.slice(0, 3).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
    </a>`).join("");
  const body = `
    <section class="hero">
      <div class="hero-inner">
        <div class="eyebrow">${lang === "tr" ? "SHOPIFY SEO REHBERLERI" : "SHOPIFY SEO GUIDES"}</div>
        <h1>${lang === "tr" ? "Shopify product designer, customizer ve print on demand rehberleri." : "Shopify product designer, customizer, and print on demand guides."}</h1>
        <p>${description}</p>
      </div>
    </section>
    <main class="content">
      <div class="grid">${cards}</div>
    </main>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: title,
    url: `${SITE_ORIGIN}${path}`,
    description,
    publisher: { "@type": "Organization", name: "PrintLab", url: SITE_ORIGIN },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_ORIGIN}${blogPostPath(post)}`,
      datePublished: post.date,
    })),
  });

  return layout({
    lang,
    title,
    description,
    path,
    alternatePath: blogIndexPath(lang === "tr" ? "en" : "tr"),
    type: "website",
    jsonLd,
    body,
  });
}

export function renderBlogPost(post: BlogPost) {
  const path = blogPostPath(post);
  const other = alternatePath(post);
  const relatedPosts = getPosts(post.lang).filter((item) => item.slug !== post.slug).slice(0, 2);
  const related = relatedPosts.map((item) => `
    <a class="post-card" href="${blogPostPath(item)}">
      <div class="meta">${item.readingTime}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.description)}</p>
    </a>`).join("");
  const ctaTitle = post.lang === "tr" ? "Shopify mağazanızda kişiselleştirme satmaya başlayın" : "Start selling personalized products on Shopify";
  const ctaBody = post.lang === "tr"
    ? "PrintLab ile müşteri ürün sayfasında tasarım yapar, siz siparişe bağlı baskıya hazır dosyayı alırsınız."
    : "With PrintLab, customers design on the product page and you receive print-ready files connected to the order.";
  const ctaButton = post.lang === "tr" ? "Shopify'a ekle" : "Add to Shopify";
  const body = `
    <main class="content">
      <article class="article">
        <header class="article-head">
          <div class="eyebrow">${post.keywords[0]}</div>
          <h1>${escapeHtml(post.title)}</h1>
          <p class="article-desc">${escapeHtml(post.description)}</p>
          <div class="meta">${post.date} · ${post.readingTime}</div>
          <div class="tags">${post.keywords.map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</div>
        </header>
        <div class="article-body">${post.body}</div>
        <section class="cta">
          <h2>${ctaTitle}</h2>
          <p>${ctaBody}</p>
          <a class="btn" href="${SHOPIFY_APP_URL}">${ctaButton}</a>
        </section>
        <section class="related">
          <h2>${post.lang === "tr" ? "İlgili yazılar" : "Related articles"}</h2>
          <div class="grid">${related}</div>
        </section>
      </article>
    </main>`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: post.lang,
    url: `${SITE_ORIGIN}${path}`,
    mainEntityOfPage: `${SITE_ORIGIN}${path}`,
    author: { "@type": "Organization", name: "PrintLab" },
    publisher: {
      "@type": "Organization",
      name: "PrintLab",
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo.png` },
    },
    keywords: post.keywords.join(", "),
  });

  return layout({
    lang: post.lang,
    title: `${post.title} | PrintLab`,
    description: post.description,
    path,
    alternatePath: other,
    type: "article",
    jsonLd,
    body,
  });
}
