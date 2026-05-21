// Injected via ScriptTag into all storefront pages.
// Runs only on /cart — shows front/back design preview for each designed item.
export const loader = async () => {
  const script = `
(function () {
  if (!/^\\/cart(\\/|\\?|$)/.test(window.location.pathname)) return;

  function run(cart) {
    var items = (cart.items || []).filter(function (item) {
      var p = item.properties || {};
      return p['_front_preview_url'] || p['_back_preview_url'];
    });
    if (!items.length) return;

    var style = document.createElement('style');
    style.textContent = [
      '.dk-previews{font-family:inherit;margin:24px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}',
      '.dk-previews-title{background:#f9fafb;padding:12px 16px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb}',
      '.dk-item{padding:16px;display:flex;gap:16px;align-items:flex-start;border-bottom:1px solid #f3f4f6}',
      '.dk-item:last-child{border-bottom:none}',
      '.dk-item-name{font-size:13px;font-weight:600;color:#111827;margin-bottom:10px}',
      '.dk-sides{display:flex;gap:8px;flex-wrap:wrap}',
      '.dk-side{text-align:center}',
      '.dk-side-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px}',
      '.dk-side-img{width:90px;height:90px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;display:block}',
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'dk-previews';
    wrap.innerHTML = '<div class="dk-previews-title">Tasarım Önizleme</div>';

    items.forEach(function (item) {
      var p = item.properties || {};
      var front = p['_front_preview_url'];
      var back  = p['_back_preview_url'];
      var div = document.createElement('div');
      div.className = 'dk-item';
      var sides = '';
      if (front) sides += '<div class="dk-side"><div class="dk-side-label">Ön Yüz</div><img class="dk-side-img" src="' + front + '" alt="Ön yüz" loading="lazy"/></div>';
      if (back)  sides += '<div class="dk-side"><div class="dk-side-label">Arka Yüz</div><img class="dk-side-img" src="' + back + '" alt="Arka yüz" loading="lazy"/></div>';
      div.innerHTML = '<div><div class="dk-item-name">' + (item.product_title || item.title || '') + '</div><div class="dk-sides">' + sides + '</div></div>';
      wrap.appendChild(div);
    });

    // Try to insert before the checkout button area; fall back to end of cart form
    var inserted = false;
    var selectors = [
      '[name="checkout"]',
      'button[type="submit"]',
      '.cart__footer',
      '.cart-footer',
      '#cart-footer',
      '.cart__ctas',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector('form[action="/cart"] ' + selectors[i])
           || document.querySelector(selectors[i]);
      if (el) {
        el.closest('form[action="/cart"]')
          ? el.closest('form[action="/cart"]').insertBefore(wrap, el.parentNode === el.closest('form[action="/cart"]') ? el : null)
          : el.parentNode.insertBefore(wrap, el);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      var form = document.querySelector('form[action="/cart"]');
      if (form) form.appendChild(wrap);
      else document.body.appendChild(wrap);
    }
  }

  function init() {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(run)
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`.trim();

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
    },
  });
};
