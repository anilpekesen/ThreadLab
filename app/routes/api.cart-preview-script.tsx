// Injected via ScriptTag (displayScope: ALL). Filters to /cart in JS.
export const loader = async () => {
  const script = `
(function () {
  console.log('[dk-cart] script loaded, path:', window.location.pathname);
  if (window.location.pathname.indexOf('/cart') === -1) {
    console.log('[dk-cart] not a cart page, exiting');
    return;
  }

  var WIDGET_ID = 'dk-cart-previews';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function buildWidget(items) {
    var filtered = items.filter(function(item) {
      var p = item.properties || {};
      return p['_front_preview_url'] || p['_back_preview_url'];
    });
    if (!filtered.length) return null;

    var style = document.getElementById('dk-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dk-style';
      style.textContent = [
        '#dk-cart-previews{font-family:inherit;margin:24px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff}',
        '#dk-cart-previews .dk-title{background:#f9fafb;padding:12px 16px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb}',
        '#dk-cart-previews .dk-item{padding:16px;border-bottom:1px solid #f3f4f6}',
        '#dk-cart-previews .dk-item:last-child{border-bottom:none}',
        '#dk-cart-previews .dk-item-name{font-size:13px;font-weight:600;color:#111827;margin-bottom:10px}',
        '#dk-cart-previews .dk-sides{display:flex;gap:12px;flex-wrap:wrap}',
        '#dk-cart-previews .dk-side{text-align:center}',
        '#dk-cart-previews .dk-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px}',
        '#dk-cart-previews .dk-img{width:110px;height:110px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;display:block}',
      ].join('');
      document.head.appendChild(style);
    }

    var wrap = document.createElement('div');
    wrap.id = WIDGET_ID;
    wrap.innerHTML = '<div class="dk-title">Tasarım Önizleme</div>';

    filtered.forEach(function(item) {
      var p = item.properties || {};
      var front = p['_front_preview_url'];
      var back  = p['_back_preview_url'];
      var sides = '';
      if (front) sides += '<div class="dk-side"><div class="dk-label">Ön Yüz</div><img class="dk-img" src="' + esc(front) + '" loading="lazy"/></div>';
      if (back)  sides += '<div class="dk-side"><div class="dk-label">Arka Yüz</div><img class="dk-img" src="' + esc(back) + '" loading="lazy"/></div>';
      var div = document.createElement('div');
      div.className = 'dk-item';
      div.innerHTML = '<div class="dk-item-name">' + esc(item.product_title || item.title) + '</div><div class="dk-sides">' + sides + '</div>';
      wrap.appendChild(div);
    });

    return wrap;
  }

  function findInsertTarget() {
    // Avoid [name="checkout"] — it matches notification/drawer buttons at top of page
    return (
      document.querySelector('cart-items') ||
      document.querySelector('.cart__items') ||
      document.querySelector('.cart-items') ||
      document.querySelector('cart-footer') ||
      document.querySelector('.cart__footer') ||
      document.querySelector('.cart-footer') ||
      document.querySelector('form[action="/cart"]') ||
      document.querySelector('form[action*="cart"]') ||
      document.querySelector('main') ||
      document.body
    );
  }

  function insertWidget(widget) {
    var existing = document.getElementById(WIDGET_ID);
    if (existing) existing.remove();

    var target = findInsertTarget();
    if (!target) { document.body.appendChild(widget); return; }

    // Insert after the target element
    if (target.nextSibling) {
      target.parentNode.insertBefore(widget, target.nextSibling);
    } else {
      target.parentNode.appendChild(widget);
    }
  }

  function run() {
    console.log('[dk-cart] run() called');
    fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .then(function(cart) {
        console.log('[dk-cart] cart items:', (cart.items || []).length);
        var widget = buildWidget(cart.items || []);
        if (!widget) { console.log('[dk-cart] no items with preview URLs'); return; }
        insertWidget(widget);
        console.log('[dk-cart] widget inserted');
      })
      .catch(function(e) { console.error('[dk-cart] fetch error:', e); });
  }

  // Run on load + retry after short delay (for themes that modify DOM after load)
  function init() {
    run();
    setTimeout(run, 800);
    setTimeout(run, 2000);
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
      "Cache-Control": "no-cache",
    },
  });
};
