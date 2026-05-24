// Cart protection — blocks removal of surcharge line items on the cart page.
// Covers both old-format separate items (_design_role: surcharge) and new-format
// cart-transform expanded items (_design_role: surcharge_child).
(function () {
  var _fetch = window.fetch;
  var _cartItems = [];
  var _ready = false;

  function loadCart() {
    return _fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        _cartItems = cart.items || [];
        _ready = true;
        hideRemoveButtons();
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

  // Hide remove buttons for legacy surcharge items
  function hideRemoveButtons() {
    _cartItems.forEach(function (item, idx) {
      if (!isSurcharge(item)) return;
      var line = idx + 1;
      var btn = document.querySelector('cart-remove-button[data-index="' + line + '"]');
      if (btn) btn.style.setProperty('display', 'none', 'important');
      document.querySelectorAll('a[href*="/cart/change"]').forEach(function (el) {
        var h = el.getAttribute('href') || '';
        if (h.includes('line=' + line) && h.includes('quantity=0')) el.style.setProperty('display', 'none', 'important');
      });
    });
  }

  loadCart();
  document.addEventListener('cart:updated', loadCart);
  document.addEventListener('cart-update', loadCart);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadCart);

  var _t;
  new MutationObserver(function () { clearTimeout(_t); _t = setTimeout(hideRemoveButtons, 150); })
    .observe(document.body, { childList: true, subtree: true });
})();
