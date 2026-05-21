// Injected via ScriptTag (displayScope: ALL). Filters to /cart in JS.
export const loader = async () => {
  const script = `
(function () {
  if (window.location.pathname.indexOf('/cart') === -1) return;

  var WIDGET_ID = 'dk-cart-previews';
  var LIGHTBOX_ID = 'dk-lightbox';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function openLightbox(src, label) {
    var existing = document.getElementById(LIGHTBOX_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = LIGHTBOX_ID;
    overlay.innerHTML =
      '<div id="dk-lb-backdrop"></div>' +
      '<div id="dk-lb-box">' +
        '<button id="dk-lb-close" aria-label="Kapat">&times;</button>' +
        '<div id="dk-lb-label">' + esc(label) + '</div>' +
        '<img id="dk-lb-img" src="' + esc(src) + '" alt="' + esc(label) + '"/>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() { var el = document.getElementById(LIGHTBOX_ID); if (el) el.remove(); }
    document.getElementById('dk-lb-backdrop').addEventListener('click', close);
    document.getElementById('dk-lb-close').addEventListener('click', close);
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    });
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
        '#dk-cart-previews .dk-img{width:180px;height:180px;object-fit:contain;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;display:block;cursor:zoom-in;transition:transform .15s,box-shadow .15s}',
        '#dk-cart-previews .dk-img:hover{transform:scale(1.04);box-shadow:0 4px 16px rgba(0,0,0,.12)}',
        '#dk-lightbox{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center}',
        '#dk-lb-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px)}',
        '#dk-lb-box{position:relative;z-index:1;background:#fff;border-radius:16px;padding:24px;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 24px 64px rgba(0,0,0,.4)}',
        '#dk-lb-close{position:absolute;top:10px;right:14px;background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280;line-height:1;padding:4px 8px}',
        '#dk-lb-close:hover{color:#111}',
        '#dk-lb-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af}',
        '#dk-lb-img{max-width:80vw;max-height:75vh;object-fit:contain;border-radius:8px}',
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
      var sidesEl = document.createElement('div');
      sidesEl.className = 'dk-sides';

      [[front, 'Ön Yüz'], [back, 'Arka Yüz']].forEach(function(pair) {
        var url = pair[0]; var label = pair[1];
        if (!url) return;
        var sideDiv = document.createElement('div');
        sideDiv.className = 'dk-side';
        var labelDiv = document.createElement('div');
        labelDiv.className = 'dk-label';
        labelDiv.textContent = label;
        var img = document.createElement('img');
        img.className = 'dk-img';
        img.src = url;
        img.loading = 'lazy';
        img.alt = label;
        img.addEventListener('click', function() { openLightbox(url, label); });
        sideDiv.appendChild(labelDiv);
        sideDiv.appendChild(img);
        sidesEl.appendChild(sideDiv);
      });

      var div = document.createElement('div');
      div.className = 'dk-item';
      var nameDiv = document.createElement('div');
      nameDiv.className = 'dk-item-name';
      nameDiv.textContent = item.product_title || item.title || '';
      div.appendChild(nameDiv);
      div.appendChild(sidesEl);
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

    if (target.nextSibling) {
      target.parentNode.insertBefore(widget, target.nextSibling);
    } else {
      target.parentNode.appendChild(widget);
    }
  }

  function run() {
    fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .then(function(cart) {
        var widget = buildWidget(cart.items || []);
        if (!widget) return;
        insertWidget(widget);
      })
      .catch(function() {});
  }

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
