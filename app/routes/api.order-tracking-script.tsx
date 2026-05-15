// Injected via ScriptTag into Shopify's order status (thank-you) page.
// Shopify.checkout.attributes is a plain object {key: value}, NOT an array.
export const loader = async () => {
  const script = `
(function() {
  try {
    var c = window.Shopify && window.Shopify.checkout;
    if (!c) return;

    // attributes is a plain object: { design_token: "d_...", _front_preview_url: "..." }
    var attrs = c.attributes || {};
    var token = attrs['design_token'] || attrs['_design_token'];
    if (!token) return;

    // Avoid double-firing on page refresh
    var storageKey = 'dk_order_sent_' + (c.order_id || '');
    if (window.sessionStorage && sessionStorage.getItem(storageKey)) return;
    if (window.sessionStorage) sessionStorage.setItem(storageKey, '1');

    var lines = c.line_items || [];
    var tshirt = lines.find(function(li) { return li.requires_shipping !== false; }) || lines[0] || {};

    fetch('https://app.printlabapp.com/api/pixel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: String(c.order_id || ''),
        orderNumber: c.order_name || '',
        designToken: token,
        frontPreviewUrl: attrs['_front_preview_url'] || '',
        frontPrintUrl: attrs['_front_print_url'] || '',
        productName: tshirt.title || ''
      })
    }).catch(function(){});
  } catch(e) {}
})();
`.trim();

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
    },
  });
};
