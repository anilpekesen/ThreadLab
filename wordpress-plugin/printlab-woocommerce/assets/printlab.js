/**
 * PrintLab kişiselleştirme kutusu ile WooCommerce sayfası arasındaki köprü.
 * iframe yalnız PrintLab alan adından gelen mesajlar için dinlenir.
 */
(function () {
  var D = window.PrintLabData;
  var frame = document.getElementById('printlab-frame');
  if (!D || !frame) return;

  function send(msg) {
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, D.appOrigin);
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== D.appOrigin || !e.data || typeof e.data !== 'object') return;
    var d = e.data;

    if (d.type === 'PERSONALIZER_READY') {
      send({ type: 'PERSONALIZER_PRODUCT', options: D.options, variants: D.variants, currency: D.currency });
      return;
    }

    if (d.type === 'PERSONALIZER_RESIZE' && d.height) {
      var h = Math.max(240, Math.round(d.height));
      if (Math.abs(h - (parseInt(frame.style.height, 10) || 0)) >= 4) frame.style.height = h + 'px';
      return;
    }

    if (d.type === 'PERSONALIZER_ADD_TO_CART') {
      var body = new URLSearchParams();
      body.set('action', 'printlab_add_to_cart');
      body.set('nonce', D.nonce);
      body.set('product_id', String(D.productId));
      body.set('variation_id', String(d.variantId || ''));
      body.set('quantity', String(d.quantity || 1));
      body.set('properties', JSON.stringify(d.properties || {}));
      fetch(D.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.success) {
            window.location.href = (res.data && res.data.cartUrl) || D.cartUrl;
          } else {
            window.alert(D.error);
          }
        })
        .catch(function () { window.alert(D.error); });
    }
  });
})();
