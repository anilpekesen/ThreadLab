(function () {
  if (!window.location.pathname.startsWith('/cart')) return;

  function lockSurchargeItems(cartData) {
    var items = cartData.items || [];
    var surchargeKeys = [];

    items.forEach(function (item, index) {
      var props = item.properties || {};
      if (props['_design_role'] === 'surcharge') {
        surchargeKeys.push({ key: item.key, line: index + 1, variantId: item.variant_id });
      }
    });

    if (!surchargeKeys.length) return;

    // Inject hide styles
    var style = document.createElement('style');
    style.id = 'dsgn-cart-protection';
    surchargeKeys.forEach(function (s) {
      // Dawn and most themes: target by variant id in href or data, or by line number
      style.textContent += [
        // Hide remove buttons that link to this variant (change?line=N&quantity=0)
        'a[href*="line=' + s.line + '&quantity=0"]',
        'a[href*="quantity=0&line=' + s.line + '"]',
        // cart-remove-button web component by line index
        'cart-remove-button[data-index="' + (s.line - 1) + '"]',
        'cart-remove-button[line-item-index="' + s.line + '"]',
        // Generic remove buttons inside a row that contains this variant id
        '[data-variant-id="' + s.variantId + '"] cart-remove-button',
        '[data-variant-id="' + s.variantId + '"] .cart-item__remove',
        '[data-variant-id="' + s.variantId + '"] .remove',
      ].join(', ') + ' { display: none !important; }\n';

      // Lock quantity inputs for this line
      style.textContent += [
        '[data-variant-id="' + s.variantId + '"] quantity-input',
        '[data-variant-id="' + s.variantId + '"] .quantity',
        '[data-variant-id="' + s.variantId + '"] input[name="updates[]"]',
      ].join(', ') + ' { pointer-events: none !important; opacity: 0.4 !important; }\n';
    });
    document.head.appendChild(style);

    // Also patch form-based remove links (quantity=0 submits)
    surchargeKeys.forEach(function (s) {
      var removeLinks = document.querySelectorAll(
        'a[href*="line=' + s.line + '"], a[href*="/cart/change"]'
      );
      removeLinks.forEach(function (link) {
        var href = link.getAttribute('href') || '';
        if (href.includes('quantity=0')) {
          link.style.display = 'none';
        }
      });

      // Disable quantity inputs by name="updates[]" (nth occurrence = line number)
      var allQtyInputs = document.querySelectorAll('input[name="updates[]"]');
      var targetInput = allQtyInputs[s.line - 1];
      if (targetInput) {
        targetInput.readOnly = true;
        targetInput.style.opacity = '0.4';
        targetInput.style.pointerEvents = 'none';
      }
    });
  }

  function init() {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) { lockSurchargeItems(cart); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run after Shopify cart section renders (AJAX themes)
  document.addEventListener('cart:updated', init);
  document.addEventListener('cart-update', init);
})();
