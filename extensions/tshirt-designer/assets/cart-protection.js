(function () {
  if (!window.location.pathname.startsWith('/cart')) return;

  var surchargeKeys = new Set();
  var surchargeVariantIds = new Set();
  var surchargeLines = new Set(); // 1-based

  // ── Load surcharge item info from cart ──────────────────────────────────────
  function loadCart() {
    return fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        surchargeKeys.clear();
        surchargeVariantIds.clear();
        surchargeLines.clear();
        (cart.items || []).forEach(function (item, idx) {
          if ((item.properties || {})['_design_role'] === 'surcharge') {
            surchargeKeys.add(String(item.key));
            surchargeVariantIds.add(String(item.variant_id));
            surchargeLines.add(idx + 1);
          }
        });
        hideRemoveButtons();
      });
  }

  // ── Detect if a request would remove a surcharge item ───────────────────────
  function isSurchargeRemoval(url, opts) {
    var urlStr = String(url || '');
    if (!urlStr.includes('/cart/change')) return false;

    // Check URL params (GET-style: /cart/change?line=1&quantity=0)
    if (urlStr.includes('quantity=0')) {
      surchargeLines.forEach(function (line) {
        if (urlStr.includes('line=' + line)) return (isSurchargeRemoval._hit = true);
      });
      surchargeKeys.forEach(function (key) {
        if (urlStr.includes(encodeURIComponent(key))) return (isSurchargeRemoval._hit = true);
      });
    }
    if (isSurchargeRemoval._hit) { isSurchargeRemoval._hit = false; return true; }

    // Check POST body
    if (opts && opts.body) {
      var bodyStr = typeof opts.body === 'string' ? opts.body : '';
      try {
        var parsed = JSON.parse(bodyStr);
        var qty = Number(parsed.quantity);
        if (qty === 0) {
          if (surchargeLines.has(Number(parsed.line))) return true;
          if (surchargeKeys.has(String(parsed.id))) return true;
          if (surchargeVariantIds.has(String(parsed.id))) return true;
        }
      } catch (_) {
        // URL-encoded body: quantity=0&line=1 or id=KEY&quantity=0
        if (bodyStr.includes('quantity=0')) {
          var lineMatch = bodyStr.match(/line=(\d+)/);
          if (lineMatch && surchargeLines.has(Number(lineMatch[1]))) return true;
          surchargeKeys.forEach(function (key) {
            if (bodyStr.includes(encodeURIComponent(key)) || bodyStr.includes(key)) {
              isSurchargeRemoval._hit = true;
            }
          });
          if (isSurchargeRemoval._hit) { isSurchargeRemoval._hit = false; return true; }
        }
      }
    }
    return false;
  }

  // ── Intercept fetch ─────────────────────────────────────────────────────────
  var _fetch = window.fetch;
  window.fetch = function (url, opts) {
    if (isSurchargeRemoval(url, opts)) {
      // Return current cart unchanged (no error, no UI glitch)
      return _fetch('/cart.js');
    }
    return _fetch.apply(this, arguments);
  };

  // ── Intercept XHR (some themes still use $.ajax / XMLHttpRequest) ───────────
  var _xhrOpen = XMLHttpRequest.prototype.open;
  var _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._dsgnUrl = url;
    return _xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (isSurchargeRemoval(this._dsgnUrl, { body: body })) {
      return; // silently drop
    }
    return _xhrSend.apply(this, arguments);
  };

  // ── Intercept link clicks (/cart/change?line=N&quantity=0) ──────────────────
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest('a[href*="/cart/change"]')
      : null;
    if (!el) return;
    if (isSurchargeRemoval(el.getAttribute('href'), null)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ── Intercept form submit ───────────────────────────────────────────────────
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !String(form.action || '').includes('/cart/change')) return;
    var data = new FormData(form);
    var qty = Number(data.get('quantity') || data.get('updates[]') || 1);
    var line = Number(data.get('line') || 0);
    if (qty === 0 && surchargeLines.has(line)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ── DOM: hide remove buttons visually ──────────────────────────────────────
  function hideRemoveButtons() {
    surchargeLines.forEach(function (line) {
      // Dawn & most themes
      var btn = document.querySelector('cart-remove-button[data-index="' + line + '"]');
      if (btn) btn.style.setProperty('display', 'none', 'important');

      document.querySelectorAll('a[href*="/cart/change"]').forEach(function (el) {
        var href = el.getAttribute('href') || '';
        if (href.includes('line=' + line) && href.includes('quantity=0')) {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    });

    surchargeVariantIds.forEach(function (vid) {
      document.querySelectorAll('[data-variant-id="' + vid + '"]').forEach(function (row) {
        row.querySelectorAll(
          'cart-remove-button, .cart-item__remove, .remove-item, [aria-label*="emove"], button[name="remove"]'
        ).forEach(function (el) {
          el.style.setProperty('display', 'none', 'important');
        });
      });
    });
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  loadCart();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCart);
  }
  document.addEventListener('cart:updated', loadCart);
  document.addEventListener('cart-update', loadCart);

  // Re-apply DOM protection after section/drawer re-renders
  var _domTimer;
  new MutationObserver(function () {
    clearTimeout(_domTimer);
    _domTimer = setTimeout(hideRemoveButtons, 150);
  }).observe(document.body, { childList: true, subtree: true });
})();
