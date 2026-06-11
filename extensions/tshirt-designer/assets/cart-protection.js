// Cart protection — blocks removal of surcharge line items on the cart page.
// Covers both old-format separate items (_design_role: surcharge) and new-format
// cart-transform expanded items (_design_role: surcharge_child).
(function () {
  var _fetch = window.fetch;
  var _cartItems = [];
  var _cartAttributes = {};
  var _lightboxItems = [];
  var _lightboxIndex = 0;
  var _ready = false;

  function loadCart() {
    return _fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        _cartItems = cart.items || [];
        _cartAttributes = cart.attributes || {};
        _ready = true;
        hideRemoveButtons();
        renderDesignPreviews();
      });
  }

  function isSurcharge(item) {
    var role = (item.properties || {})['_design_role'];
    return role === 'surcharge' || role === 'surcharge_child';
  }

  function isLegacySurchargeRemoval(url, opts) {
    if (!_ready) return false;
    var urlStr = String(url || '');
    if (!urlStr.includes('/cart/change')) return false;

    var line = null, quantity = null;

    var qs = urlStr.split('?')[1] || '';
    var params = new URLSearchParams(qs);
    if (params.has('line')) line = Number(params.get('line'));
    if (params.has('quantity')) quantity = Number(params.get('quantity'));

    if (opts && opts.body) {
      var body = typeof opts.body === 'string' ? opts.body : '';
      try {
        var parsed = JSON.parse(body);
        if (parsed.line != null) line = Number(parsed.line);
        if (parsed.quantity != null) quantity = Number(parsed.quantity);
      } catch (_) {
        var lm = body.match(/line=(\d+)/); if (lm) line = Number(lm[1]);
        var qm = body.match(/quantity=(\d+)/); if (qm) quantity = Number(qm[1]);
      }
    }

    if (quantity !== 0 || line == null) return false;
    var item = _cartItems[line - 1];
    return item ? isSurcharge(item) : false;
  }

  // Intercept fetch
  window.fetch = function (url, opts) {
    if (isLegacySurchargeRemoval(url, opts)) return _fetch('/cart.js');
    return _fetch.apply(this, arguments);
  };

  // Intercept XHR
  var _xhrOpen = XMLHttpRequest.prototype.open;
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this._url = url; return _xhrOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (isLegacySurchargeRemoval(this._url, { body: body })) return;
    return _xhrSend.apply(this, arguments);
  };

  // Block remove link clicks
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('a[href*="/cart/change"]') : null;
    if (!el) return;
    if (isLegacySurchargeRemoval(el.getAttribute('href'), null)) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);

  // Hide the entire surcharge row on the cart page so customers see only the
  // base t-shirt line; checkout still renders both lines.
  function hideRemoveButtons() {
    _cartItems.forEach(function (item, idx) {
      if (!isSurcharge(item)) return;
      var line = idx + 1;
      var key = item.key;
      var selectors = [
        'tr[id="CartItem-' + line + '"]',
        'tr.cart-item[data-line="' + line + '"]',
        'cart-item[data-index="' + line + '"]',
        '.cart-item[data-line="' + line + '"]',
        '[data-cart-item-key="' + key + '"]',
        '[data-item-key="' + key + '"]',
        '[data-key="' + key + '"]',
      ];
      selectors.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) {
          el.style.setProperty('display', 'none', 'important');
        });
      });
      var btn = document.querySelector('cart-remove-button[data-index="' + line + '"]');
      if (btn) btn.style.setProperty('display', 'none', 'important');
      document.querySelectorAll('a[href*="/cart/change"]').forEach(function (el) {
        var h = el.getAttribute('href') || '';
        if (h.includes('line=' + line) && h.includes('quantity=0')) el.style.setProperty('display', 'none', 'important');
      });
    });
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function firstValue(props, keys) {
    props = props || {};
    for (var i = 0; i < keys.length; i++) {
      var value = props[keys[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function truthyDesignValue(value) {
    return /^(var|yes|true|1)$/i.test(String(value || '').trim());
  }

  function hasFrontDesign(props) {
    return Boolean(
      firstValue(props, ['_front_preview_url', '_front_print_url', 'Ön önizleme', 'On onizleme', 'Front preview']) ||
      truthyDesignValue(props['_Ön Tasarım'] ?? props['Ön Tasarım']) ||
      firstValue(props, ['Ön öğe sayısı', '_Ön ölçü', 'Ön ölçü', 'Ön alan', 'Ön alan fiyatı'])
    );
  }

  function hasBackDesign(props) {
    return Boolean(
      firstValue(props, ['_back_preview_url', '_back_print_url', 'Arka önizleme', 'Arka onizleme', 'Back preview']) ||
      truthyDesignValue(props['_Arka Tasarım'] ?? props['Arka Tasarım']) ||
      firstValue(props, ['Arka öğe sayısı', '_Arka ölçü', 'Arka ölçü', 'Arka alan', 'Arka alan fiyatı'])
    );
  }

  function previewUrlsForItem(item) {
    var props = item.properties || {};
    var front = firstValue(props, ['_front_preview_url', 'Ön önizleme', 'On onizleme', 'Front preview']);
    var back = firstValue(props, ['_back_preview_url', 'Arka önizleme', 'Arka onizleme', 'Back preview']);
    var token = firstValue(props, ['_design_token', 'design_token']);
    var attrToken = firstValue(_cartAttributes, ['_design_token', 'design_token']);

    if ((!front || !back) && token && attrToken && token === attrToken) {
      if (!front && hasFrontDesign(props)) front = firstValue(_cartAttributes, ['_front_preview_url']);
      if (!back && hasBackDesign(props)) back = firstValue(_cartAttributes, ['_back_preview_url']);
    }

    return { front: front, back: back };
  }

  function designDetailUrlForItem(item) {
    var props = item.properties || {};
    var url = firstValue(props, ['_design_detail_url', 'Tasarım Detayı', 'Müşteri Tasarım Linki']);
    if (url) return url;

    var token = firstValue(props, ['_design_token', 'design_token']);
    if (!token) return '';

    var shop = (window.Shopify && window.Shopify.shop) || window.location.hostname;
    if (!shop) return '';
    return 'https://app.printlabapp.com/apps/tshirt-designer/my-order?shop=' + encodeURIComponent(shop) + '&token=' + encodeURIComponent(token);
  }

  function rowForLine(item, line) {
    var key = item.key ? cssEscape(item.key) : '';
    var selectors = [
      'tr[id="CartItem-' + line + '"]',
      'tr.cart-item[data-line="' + line + '"]',
      'cart-item[data-index="' + line + '"]',
      '.cart-item[data-line="' + line + '"]',
      key ? '[data-cart-item-key="' + key + '"]' : '',
      key ? '[data-item-key="' + key + '"]' : '',
      key ? '[data-key="' + key + '"]' : '',
    ].filter(Boolean);

    for (var i = 0; i < selectors.length; i++) {
      var row = document.querySelector(selectors[i]);
      if (row) return row;
    }
    return null;
  }

  function previewMountForRow(row) {
    return row.querySelector(
      '.cart-item__details, .cart-item__information, .cart-item__content, .cart-item__info, td:nth-child(2)'
    ) || row;
  }

  function replaceMainImageForRow(row, previewUrl) {
    if (!row || !previewUrl) return;
    var img = row.querySelector(
      '.cart-item__media img, .cart-item__image, img.cart-item__image, img[src*="/products/"], img[src*="/files/"]'
    );
    if (!img || img.closest('.printlab-cart-design-preview')) return;
    if (img.dataset.printlabPreviewUrl === previewUrl) return;

    img.dataset.printlabOriginalSrc = img.dataset.printlabOriginalSrc || img.getAttribute('src') || '';
    img.dataset.printlabPreviewUrl = previewUrl;
    img.setAttribute('src', previewUrl);
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.style.objectFit = 'contain';
    img.style.background = '#f8fafc';
  }

  function ensurePreviewStyles() {
    if (document.getElementById('printlab-cart-design-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'printlab-cart-design-preview-style';
    style.textContent = [
      '.printlab-cart-design-preview{display:grid;gap:8px;margin-top:10px;max-width:156px}',
      '.printlab-cart-design-preview__link{display:inline-flex;align-items:center;justify-content:center;width:max-content;max-width:100%;padding:7px 10px;border:1px solid rgba(37,99,235,.20);border-radius:8px;background:rgba(37,99,235,.06);color:#1d4ed8!important;font-size:12px;line-height:1.2;font-weight:700;text-decoration:none!important}',
      '.printlab-cart-design-preview__link:hover{background:rgba(37,99,235,.10);border-color:rgba(37,99,235,.34);text-decoration:none!important}',
      '.printlab-cart-design-preview__item{display:grid;gap:4px}',
      '.printlab-cart-design-preview__label{font-size:11px;line-height:1.2;font-weight:700;color:rgba(17,24,39,.72)}',
      '.printlab-cart-design-preview__trigger{display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in;text-align:left}',
      '.printlab-cart-design-preview__image{display:block;width:100%;max-width:156px;border:1px solid rgba(17,24,39,.10);border-radius:10px;background:#f8fafc;object-fit:contain;aspect-ratio:1/1;box-shadow:0 1px 2px rgba(15,23,42,.06);transition:transform .16s ease,box-shadow .16s ease}',
      '.printlab-cart-design-preview__trigger:hover .printlab-cart-design-preview__image{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.14)}',
      '.printlab-cart-lightbox{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.78);padding:18px;backdrop-filter:blur(4px)}',
      '.printlab-cart-lightbox[hidden]{display:none!important}',
      '.printlab-cart-lightbox__dialog{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);gap:12px;width:min(92vw,760px);max-height:92vh;color:#111827}',
      '.printlab-cart-lightbox__head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff}',
      '.printlab-cart-lightbox__title{font-size:14px;font-weight:800;line-height:1.25}',
      '.printlab-cart-lightbox__close,.printlab-cart-lightbox__nav{display:flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:rgba(255,255,255,.92);color:#111827;box-shadow:0 10px 24px rgba(0,0,0,.18);cursor:pointer}',
      '.printlab-cart-lightbox__close{width:38px;height:38px;font-size:24px;line-height:1}',
      '.printlab-cart-lightbox__nav{position:absolute;top:50%;width:42px;height:42px;font-size:28px;transform:translateY(-50%)}',
      '.printlab-cart-lightbox__nav--prev{left:-8px}',
      '.printlab-cart-lightbox__nav--next{right:-8px}',
      '.printlab-cart-lightbox__nav[hidden]{display:none!important}',
      '.printlab-cart-lightbox__frame{display:flex;align-items:center;justify-content:center;min-height:220px;overflow:hidden;border-radius:16px;background:#f8fafc;box-shadow:0 24px 70px rgba(0,0,0,.32)}',
      '.printlab-cart-lightbox__image{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;object-fit:contain}',
      '@media (min-width:750px){.printlab-cart-design-preview{max-width:184px}.printlab-cart-design-preview__image{max-width:184px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function lightboxEl() {
    var existing = document.querySelector('.printlab-cart-lightbox');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.className = 'printlab-cart-lightbox';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<div class="printlab-cart-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Tasarım önizlemesi">',
      '  <div class="printlab-cart-lightbox__head">',
      '    <div class="printlab-cart-lightbox__title"></div>',
      '    <button type="button" class="printlab-cart-lightbox__close" aria-label="Kapat">×</button>',
      '  </div>',
      '  <button type="button" class="printlab-cart-lightbox__nav printlab-cart-lightbox__nav--prev" aria-label="Önceki">‹</button>',
      '  <div class="printlab-cart-lightbox__frame"><img class="printlab-cart-lightbox__image" alt=""></div>',
      '  <button type="button" class="printlab-cart-lightbox__nav printlab-cart-lightbox__nav--next" aria-label="Sonraki">›</button>',
      '</div>'
    ].join('');

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeLightbox();
    });
    overlay.querySelector('.printlab-cart-lightbox__close').addEventListener('click', closeLightbox);
    overlay.querySelector('.printlab-cart-lightbox__nav--prev').addEventListener('click', function () { moveLightbox(-1); });
    overlay.querySelector('.printlab-cart-lightbox__nav--next').addEventListener('click', function () { moveLightbox(1); });

    document.body.appendChild(overlay);
    return overlay;
  }

  function updateLightbox() {
    var overlay = lightboxEl();
    var item = _lightboxItems[_lightboxIndex];
    if (!item) return;

    var img = overlay.querySelector('.printlab-cart-lightbox__image');
    var title = overlay.querySelector('.printlab-cart-lightbox__title');
    var prev = overlay.querySelector('.printlab-cart-lightbox__nav--prev');
    var next = overlay.querySelector('.printlab-cart-lightbox__nav--next');

    img.src = item.url;
    img.alt = item.label;
    title.textContent = item.label + (_lightboxItems.length > 1 ? ' · ' + (_lightboxIndex + 1) + '/' + _lightboxItems.length : '');
    prev.hidden = _lightboxItems.length < 2;
    next.hidden = _lightboxItems.length < 2;
  }

  function openLightbox(items, index) {
    _lightboxItems = items || [];
    _lightboxIndex = index || 0;
    if (!_lightboxItems.length) return;
    var overlay = lightboxEl();
    updateLightbox();
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
  }

  function closeLightbox() {
    var overlay = document.querySelector('.printlab-cart-lightbox');
    if (overlay) overlay.hidden = true;
    document.documentElement.style.overflow = '';
  }

  function moveLightbox(direction) {
    if (_lightboxItems.length < 2) return;
    _lightboxIndex = (_lightboxIndex + direction + _lightboxItems.length) % _lightboxItems.length;
    updateLightbox();
  }

  function renderDesignPreviews() {
    ensurePreviewStyles();

    _cartItems.forEach(function (item, idx) {
      if (isSurcharge(item)) return;
      var urls = previewUrlsForItem(item);
      var designDetailUrl = designDetailUrlForItem(item);
      if (!urls.front && !urls.back && !designDetailUrl) return;

      var row = rowForLine(item, idx + 1);
      if (!row) return;

      replaceMainImageForRow(row, urls.front || urls.back);

      var mount = previewMountForRow(row);
      if (!mount || mount.querySelector('.printlab-cart-design-preview')) return;

      var wrap = document.createElement('div');
      wrap.className = 'printlab-cart-design-preview';
      wrap.setAttribute('aria-label', 'Tasarım önizlemesi');

      if (designDetailUrl) {
        var designLink = document.createElement('a');
        designLink.className = 'printlab-cart-design-preview__link';
        designLink.href = designDetailUrl;
        designLink.target = '_blank';
        designLink.rel = 'noopener';
        designLink.textContent = 'Müşteri Tasarım Linki';
        wrap.appendChild(designLink);
      }

      [
        { label: 'Ön tasarım', url: urls.front },
        { label: 'Arka tasarım', url: urls.back },
      ].filter(function (preview) {
        return !!preview.url;
      }).forEach(function (preview, previewIndex, previews) {
        if (!preview.url) return;
        var itemEl = document.createElement('div');
        itemEl.className = 'printlab-cart-design-preview__item';

        var label = document.createElement('span');
        label.className = 'printlab-cart-design-preview__label';
        label.textContent = preview.label;

        var img = document.createElement('img');
        img.className = 'printlab-cart-design-preview__image';
        img.src = preview.url;
        img.alt = preview.label;
        img.loading = 'lazy';

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'printlab-cart-design-preview__trigger';
        trigger.setAttribute('aria-label', preview.label + ' büyüt');
        trigger.addEventListener('click', function () {
          openLightbox(previews, previewIndex);
        });
        trigger.appendChild(img);

        itemEl.appendChild(label);
        itemEl.appendChild(trigger);
        wrap.appendChild(itemEl);
      });

      mount.appendChild(wrap);
    });
  }

  loadCart();
  document.addEventListener('cart:updated', loadCart);
  document.addEventListener('cart-update', loadCart);
  document.addEventListener('keydown', function (event) {
    var overlay = document.querySelector('.printlab-cart-lightbox');
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') moveLightbox(-1);
    if (event.key === 'ArrowRight') moveLightbox(1);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadCart);

  var _t;
  new MutationObserver(function () {
    clearTimeout(_t);
    _t = setTimeout(function () {
      hideRemoveButtons();
      renderDesignPreviews();
    }, 150);
  })
    .observe(document.body, { childList: true, subtree: true });
})();
