// Injected via ScriptTag (displayScope: ALL). Filters to /cart in JS.
export const loader = async () => {
  const script = `
(function () {
  var path = window.location.pathname;
  if (path.indexOf('/cart') === -1) return;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function inject(items) {
    var hasPreviews = items.some(function(item) {
      var p = item.properties || {};
      return p['_front_preview_url'] || p['_back_preview_url'];
    });
    if (!hasPreviews) return;

    var style = document.createElement('style');
    style.textContent = [
      '.dk-previews{font-family:inherit;margin:24px 0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;background:#fff}',
      '.dk-previews-title{background:#f9fafb;padding:12px 16px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;border-bottom:1px solid #e5e7eb}',
      '.dk-item{padding:16px;border-bottom:1px solid #f3f4f6}',
      '.dk-item:last-child{border-bottom:none}',
      '.dk-item-name{font-size:13px;font-weight:600;color:#111827;margin-bottom:10px}',
      '.dk-sides{display:flex;gap:12px;flex-wrap:wrap}',
      '.dk-side{text-align:center}',
      '.dk-side-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px}',
      '.dk-side-img{width:100px;height:100px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;display:block}',
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'dk-previews';
    wrap.innerHTML = '<div class="dk-previews-title">Tasarım Önizleme</div>';

    items.forEach(function(item) {
      var p = item.properties || {};
      var front = p['_front_preview_url'];
      var back  = p['_back_preview_url'];
      if (!front && !back) return;

      var sides = '';
      if (front) sides += '<div class="dk-side"><div class="dk-side-label">Ön Yüz</div><img class="dk-side-img" src="' + esc(front) + '" alt="Ön yüz" loading="lazy"/></div>';
      if (back)  sides += '<div class="dk-side"><div class="dk-side-label">Arka Yüz</div><img class="dk-side-img" src="' + esc(back) + '" alt="Arka yüz" loading="lazy"/></div>';

      var div = document.createElement('div');
      div.className = 'dk-item';
      div.innerHTML = '<div class="dk-item-name">' + esc(item.product_title || item.title) + '</div><div class="dk-sides">' + sides + '</div>';
      wrap.appendChild(div);
    });

    // Find best insertion point
    var target = (
      document.querySelector('[name="checkout"]') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('.cart__footer') ||
      document.querySelector('.cart-footer') ||
      document.querySelector('#cart-footer') ||
      document.querySelector('.cart__ctas')
    );

    if (target) {
      target.parentNode.insertBefore(wrap, target);
    } else {
      var form = document.querySelector('form[action="/cart"]') || document.querySelector('form[action*="cart"]');
      if (form) form.appendChild(wrap);
      else document.body.appendChild(wrap);
    }
  }

  function init() {
    fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .then(function(cart) { inject(cart.items || []); })
      .catch(function() {});
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
      "Cache-Control": "public, max-age=60",
    },
  });
};
