(function () {
  if (!window.location.pathname.startsWith('/cart')) return;

  function lockSurchargeItems(cartData) {
    var items = cartData.items || [];
    var surchargeLines = []; // 1-based line numbers

    items.forEach(function (item, index) {
      var props = item.properties || {};
      if (props['_design_role'] === 'surcharge') {
        surchargeLines.push({ line: index + 1, key: item.key, variantId: String(item.variant_id) });
      }
    });

    if (!surchargeLines.length) return;

    surchargeLines.forEach(function (s) {
      // --- Strategy 1: Dawn theme — cart-remove-button[data-index] (1-based) ---
      var removeBtn = document.querySelector('cart-remove-button[data-index="' + s.line + '"]');
      if (removeBtn) removeBtn.style.display = 'none';

      // --- Strategy 2: Any <a> that links to change?line=N&quantity=0 ---
      document.querySelectorAll('a[href*="line=' + s.line + '"]').forEach(function (el) {
        if ((el.getAttribute('href') || '').includes('quantity=0')) el.style.display = 'none';
      });

      // --- Strategy 3: buttons/links with the item key in href or data ---
      document.querySelectorAll('[href*="' + s.key + '"], [data-key="' + s.key + '"]').forEach(function (el) {
        el.style.display = 'none';
      });

      // --- Strategy 4: quantity input by nth occurrence of updates[] ---
      var qtyInputs = document.querySelectorAll('input[name="updates[]"], input[name^="updates"]');
      var qtyInput = qtyInputs[s.line - 1];
      if (qtyInput) {
        qtyInput.readOnly = true;
        qtyInput.style.pointerEvents = 'none';
        qtyInput.style.opacity = '0.5';
        // Also hide +/- buttons around it
        var qtyParent = qtyInput.parentElement;
        if (qtyParent) {
          qtyParent.querySelectorAll('button').forEach(function (btn) {
            btn.style.display = 'none';
          });
        }
      }

      // --- Strategy 5: find any element containing variantId and hide its remove button ---
      document.querySelectorAll('[data-variant-id="' + s.variantId + '"]').forEach(function (el) {
        el.querySelectorAll(
          'cart-remove-button, .cart-item__remove, .remove-item, [aria-label*="emove"], button[name="remove"], a[href*="quantity=0"]'
        ).forEach(function (btn) { btn.style.display = 'none'; });
      });

      // --- Strategy 6: inject CSS as last-resort catch-all ---
      var styleId = 'dsgn-cart-lock-' + s.line;
      if (!document.getElementById(styleId)) {
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent =
          'cart-remove-button[data-index="' + s.line + '"] { display:none!important }' +
          'a[href*="line=' + s.line + '&quantity=0"] { display:none!important }' +
          'a[href*="quantity=0&line=' + s.line + '"] { display:none!important }';
        document.head.appendChild(style);
      }
    });
  }

  function run() {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(lockSurchargeItems)
      .catch(function () {});
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Re-run after AJAX cart updates (covers drawer carts, section renders)
  document.addEventListener('cart:updated', run);
  document.addEventListener('cart-update', run);

  // MutationObserver: re-run if new cart items appear in DOM
  var observer = new MutationObserver(function () { run(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
