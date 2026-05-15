// Public JS file injected via ScriptTag into Shopify's order status page.
// Reads Shopify.checkout global (available on order confirmation page) and
// posts design order data to our API — no protected customer data approval needed.
export const loader = async () => {
  const script = `
(function() {
  try {
    var c = window.Shopify && window.Shopify.checkout;
    if (!c) return;
    var attrs = {};
    (c.attributes || []).forEach(function(a) { attrs[a.key] = a.value; });
    var token = attrs['design_token'];
    if (!token) return;
    var tshirt = (c.line_items || []).find(function(li) {
      return li.requires_shipping !== false;
    });
    fetch('https://threadlab-production.up.railway.app/api/pixel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: String(c.order_id || ''),
        orderNumber: c.order_name || '',
        designToken: token,
        frontPreviewUrl: attrs['_front_preview_url'] || '',
        frontPrintUrl: attrs['_front_print_url'] || '',
        productName: tshirt ? tshirt.title : ''
      })
    }).catch(function(){});
  } catch(e) {}
})();
`.trim();

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
