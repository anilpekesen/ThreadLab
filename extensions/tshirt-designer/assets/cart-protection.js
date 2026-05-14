(function () {
  // Run on /cart page AND cart drawers (which can open on any page)

  var _cartItems = [];
  var _allowSurchargeRemoval = false;
  var _fetch = window.fetch;

  // ── Cart state ──────────────────────────────────────────────────────────────
  function refreshCart() {
    return _fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        _cartItems = cart.items || [];
        hideRemoveButtons();
        return cart;
      });
  }

  function isSurcharge(item) {
    return (item.properties || {})['_design_role'] === 'surcharge';
  }

  function surchargeLineNumbers() {
    var lines = new Set();
    _cartItems.forEach(function (item, idx) {
      if (isSurcharge(item)) lines.add(idx + 1);
    });
    return lines;
  }

  // ── Parse which line+quantity a request targets ─────────────────────────────
  function parseChangeRequest(url, opts) {
    var urlStr = String(url || '');
    if (!urlStr.includes('/cart/change')) return null;

    var line = null, quantity = null, id = null;

    // URL params (?line=1&quantity=0)
    var qs = urlStr.split('?')[1] || '';
    var params = new URLSearchParams(qs);
    if (params.has('line')) line = Number(params.get('line'));
    if (params.has('quantity')) quantity = Number(params.get('quantity'));
    if (params.has('id')) id = String(params.get('id'));

    // POST body
    if (opts && opts.body) {
      var body = typeof opts.body === 'string' ? opts.body : '';
      try {
        var parsed = JSON.parse(body);
        if (parsed.line != null) line = Number(parsed.line);
        if (parsed.quantity != null) quantity = Number(parsed.quantity);
        if (parsed.id != null) id = String(parsed.id);
      } catch (_) {
        var lm = body.match(/line=(\d+)/);
        var qm = body.match(/quantity=(\d+)/);
        var im = body.match(/id=([^&]+)/);
        if (lm) line = Number(lm[1]);
        if (qm) quantity = Number(qm[1]);
        if (im) id = decodeURIComponent(im[1]);
      }
    }

    // Resolve id → line if only id given
    if (line == null && id != null) {
      _cartItems.forEach(function (item, idx) {
        if (String(item.key) === id || String(item.variant_id) === id) {
          line = idx + 1;
        }
      });
    }

    return { line: line, quantity: quantity, id: id };
  }

  // ── Remove surcharge items linked to a design_token ─────────────────────────
  function removeLinkedSurcharges(designToken) {
    if (!designToken) return Promise.resolve();
    var toRemove = _cartItems.filter(function (item) {
      return isSurcharge(item) && (item.properties || {}).design_token === designToken;
    });
    if (!toRemove.length) return Promise.resolve();

    _allowSurchargeRemoval = true;
    var removals = toRemove.map(function (item) {
      return _fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.key, quantity: 0 }),
      });
    });
    return Promise.all(removals).finally(function () {
      _allowSurchargeRemoval = false;
    });
  }

  // ── Intercept fetch ─────────────────────────────────────────────────────────
  window.fetch = function (url, opts) {
    var req = parseChangeRequest(url, opts);

    if (req && req.quantity === 0 && req.line != null) {
      var targetItem = _cartItems[req.line - 1];

      // Block user-initiated surcharge deletion
      if (!_allowSurchargeRemoval && targetItem && isSurcharge(targetItem)) {
        return _fetch('/cart.js');
      }

      // When main product is deleted, also remove its linked surcharge
      if (targetItem && !isSurcharge(targetItem)) {
        var token = (targetItem.properties || {}).design_token;
        return _fetch.apply(this, [url, opts]).then(function (response) {
          return removeLinkedSurcharges(token).then(function () {
            refreshCart().then(function () {
              // Fire cart update events so drawer/section re-renders
              document.dispatchEvent(new CustomEvent('cart:updated'));
              document.dispatchEvent(new CustomEvent('cart-update'));
            });
            return response;
          });
        });
      }
    }

    return _fetch.apply(this, arguments);
  };

  // ── Intercept XHR ──────────────────────────────────────────────────────────
  var _xhrOpen = XMLHttpRequest.prototype.open;
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._dsgnUrl = url;
    return _xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var req = parseChangeRequest(this._dsgnUrl, { body: body });
    if (!_allowSurchargeRemoval && req && req.quantity === 0) {
      var line = req.line;
      if (line != null && surchargeLineNumbers().has(line)) return;
    }
    return _xhrSend.apply(this, arguments);
  };

  // ── Intercept link clicks ───────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('a[href*="/cart/change"]')
      : null;
    if (!el) return;
    var req = parseChangeRequest(el.getAttribute('href'), null);
    if (req && req.quantity === 0 && req.line != null) {
      if (!_allowSurchargeRemoval && surchargeLineNumbers().has(req.line)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
  }, true);

  // ── Intercept form submit ───────────────────────────────────────────────────
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !String(form.action || '').includes('/cart/change')) return;
    var data = new FormData(form);
    var qty = Number(data.get('quantity') || 1);
    var line = Number(data.get('line') || 0);
    if (qty === 0 && !_allowSurchargeRemoval && surchargeLineNumbers().has(line)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ── DOM: hide remove buttons for surcharge items ────────────────────────────
  function hideRemoveButtons() {
    _cartItems.forEach(function (item, idx) {
      if (!isSurcharge(item)) return;
      var line = idx + 1;
      var vid = String(item.variant_id);

      var btn = document.querySelector('cart-remove-button[data-index="' + line + '"]');
      if (btn) btn.style.setProperty('display', 'none', 'important');

      document.querySelectorAll('a[href*="/cart/change"]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        if (href.includes('line=' + line) && href.includes('quantity=0')) {
          el.style.setProperty('display', 'none', 'important');
        }
      });

      document.querySelectorAll('[data-variant-id="' + vid + '"]').forEach(function (row) {
        row.querySelectorAll(
          'cart-remove-button, .cart-item__remove, .remove-item, [aria-label*="emove"], button[name="remove"]'
        ).forEach(function (el) { el.style.setProperty('display', 'none', 'important'); });
      });
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  refreshCart();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshCart);
  }
  document.addEventListener('cart:updated', refreshCart);
  document.addEventListener('cart-update', refreshCart);

  var _domTimer;
  new MutationObserver(function () {
    clearTimeout(_domTimer);
    _domTimer = setTimeout(hideRemoveButtons, 150);
  }).observe(document.body, { childList: true, subtree: true });
})();
