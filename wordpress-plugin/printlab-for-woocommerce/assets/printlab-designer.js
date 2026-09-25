/**
 * PrintLab tişört tasarımcısı ile WooCommerce sayfası arasındaki köprü.
 * Tasarımcı Shopify'daki tema bloğuyla aynı mesajları kullanır
 * (DESIGNER_INIT, DESIGNER_ADD_TO_CART...); sepet burada WooCommerce'e
 * sunucu tarafında eklenir. Mesajlar yalnız PrintLab alan adından kabul edilir.
 */
(function () {
  var D = window.PrintLabDesigner;
  var frame = document.getElementById('printlab-designer-frame');
  if (!D || !frame) return;

  function send(msg) {
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, D.appOrigin);
  }

  function sendConfig() {
    send({ type: 'DESIGNER_INIT', config: D.config });
  }

  // Tasarımcı "hazırım" mesajı göndermiyor; yapılandırma birkaç kez gönderilir.
  // Bu betik sayfanın sonunda yüklendiği için iframe ondan ÖNCE yüklenmiş
  // olabilir ve 'load' olayı kaçar (tasarımcı ürünsüz, varsayılan dil ve
  // ₺0 ile açılıyordu): hemen ve kısa aralıklarla da gönderilir.
  function sendBurst() {
    sendConfig();
    [80, 400, 1200, 2500].forEach(function (ms) { window.setTimeout(sendConfig, ms); });
  }
  frame.addEventListener('load', sendBurst);
  sendBurst();

  function scrollToDesigner(behavior) {
    var top = frame.getBoundingClientRect().top + window.pageYOffset - 8;
    try {
      window.scrollTo({ top: Math.max(0, top), left: 0, behavior: behavior === 'auto' ? 'auto' : 'smooth' });
    } catch (_) {
      window.scrollTo(0, Math.max(0, top));
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== D.appOrigin || e.source !== frame.contentWindow || !e.data || typeof e.data.type !== 'string') return;
    var d = e.data;

    if (d.type === 'DESIGNER_GO_TO_CART') { window.location.href = D.cartUrl; return; }
    if (d.type === 'DESIGNER_GO_TO_CHECKOUT') { window.location.href = D.checkoutUrl; return; }
    if (d.type === 'DESIGNER_SCROLL_TO_TOP') { scrollToDesigner(d.behavior); return; }
    if (d.type === 'DESIGNER_INACTIVE') {
      // Üründe PrintLab tasarımcı ayarı yok: kutuyu gizle, temanın formunu geri aç
      frame.parentNode.style.display = 'none';
      var style = document.createElement('style');
      style.textContent = '.single-product form.cart{display:block!important}';
      document.head.appendChild(style);
      return;
    }

    if (d.type === 'DESIGNER_ADD_TO_CART') {
      var items = Array.isArray(d.items) ? d.items : [];
      if (!items.length && d.variantId) items = [{ variantId: d.variantId, quantity: d.quantity || 1 }];
      var props = Object.assign({}, d.properties || {});
      if (d.designToken && !props._design_token) props._design_token = d.designToken;

      var body = new URLSearchParams();
      body.set('action', 'printlab_add_designer');
      body.set('nonce', D.nonce);
      body.set('product_id', String(D.productId));
      body.set('items', JSON.stringify(items.map(function (it) {
        return { variantId: it.variantId || it.id, quantity: it.quantity || 1, size: it.size || '', properties: it.properties || {} };
      })));
      body.set('properties', JSON.stringify(props));
      fetch(D.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.success) {
            // Sepet sayacını güncelleyen temalar için
            if (window.jQuery) window.jQuery(document.body).trigger('wc_fragment_refresh');
            send({ type: 'DESIGNER_CART_ADDED' });
          } else {
            send({ type: 'DESIGNER_CART_ERROR', message: D.error });
          }
        })
        .catch(function () { send({ type: 'DESIGNER_CART_ERROR', message: D.error }); });
    }
  });
})();
