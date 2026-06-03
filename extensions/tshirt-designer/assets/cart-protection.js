// Cart protection — blocks removal of surcharge line items on the cart page.
// Covers both old-format separate items (_design_role: surcharge) and new-format
// cart-transform expanded items (_design_role: surcharge_child).
(function () {
  var _fetch = window.fetch;
  var _cartItems = [];
  var _cartAttributes = {};
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

  function previewUrlsForItem(item) {
    var props = item.properties || {};
    var front = firstValue(props, ['_front_preview_url', 'Ön önizleme', 'On onizleme', 'Front preview']);
    var back = firstValue(props, ['_back_preview_url', 'Arka önizleme', 'Arka onizleme', 'Back preview']);
    var token = firstValue(props, ['design_token']);
    var attrToken = firstValue(_cartAttributes, ['design_token']);

    if ((!front || !back) && token && attrToken && token === attrToken) {
      if (!front) front = firstValue(_cartAttributes, ['_front_preview_url']);
      if (!back) back = firstValue(_cartAttributes, ['_back_preview_url']);
    }

    return { front: front, back: back };
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

  function ensurePreviewStyles() {
    if (document.getElementById('printlab-cart-design-preview-style')) return;
    var style = document.createElement('style');
    style.id = 'printlab-cart-design-preview-style';
    style.textContent = [
      '.printlab-cart-design-preview{display:grid;gap:8px;margin-top:10px;max-width:156px}',
      '.printlab-cart-design-preview__item{display:grid;gap:4px}',
      '.printlab-cart-design-preview__label{font-size:11px;line-height:1.2;font-weight:700;color:rgba(17,24,39,.72)}',
      '.printlab-cart-design-preview__image{display:block;width:100%;max-width:156px;border:1px solid rgba(17,24,39,.10);border-radius:10px;background:#f8fafc;object-fit:contain;aspect-ratio:1/1;box-shadow:0 1px 2px rgba(15,23,42,.06)}',
      '@media (min-width:750px){.printlab-cart-design-preview{max-width:184px}.printlab-cart-design-preview__image{max-width:184px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderDesignPreviews() {
    ensurePreviewStyles();

    _cartItems.forEach(function (item, idx) {
      if (isSurcharge(item)) return;
      var urls = previewUrlsForItem(item);
      if (!urls.front && !urls.back) return;

      var row = rowForLine(item, idx + 1);
      if (!row) return;

      var mount = previewMountForRow(row);
      if (!mount || mount.querySelector('.printlab-cart-design-preview')) return;

      var wrap = document.createElement('div');
      wrap.className = 'printlab-cart-design-preview';
      wrap.setAttribute('aria-label', 'Tasarım önizlemesi');

      [
        { label: 'Ön tasarım', url: urls.front },
        { label: 'Arka tasarım', url: urls.back },
      ].forEach(function (preview) {
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

        itemEl.appendChild(label);
        itemEl.appendChild(img);
        wrap.appendChild(itemEl);
      });

      mount.appendChild(wrap);
    });
  }

  loadCart();
  document.addEventListener('cart:updated', loadCart);
  document.addEventListener('cart-update', loadCart);
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
