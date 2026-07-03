import { type LoaderFunctionArgs } from "@remix-run/node";

const ALLOWED_SHOPS = (process.env.OWNER_SHOPS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop     = url.searchParams.get("shop") ?? "";
  const handle   = url.searchParams.get("handle") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const locale   = url.searchParams.get("locale") ?? "tr";

  if (!shop || !ALLOWED_SHOPS.includes(shop)) {
    return new Response("Bu mağaza için embed yetkisi yok.", { status: 403 });
  }

  const appUrl = process.env.SHOPIFY_APP_URL ?? url.origin;
  const params = new URLSearchParams({ shop, locale });
  if (handle)    params.set("handle", handle);
  if (productId) params.set("productId", productId);

  const designerSrc = `${appUrl}/designer-app/?${params.toString()}`;
  const appOrigin   = new URL(appUrl).origin;

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Tasarım Aracı</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;overflow:hidden;background:#f3f4f6}
    iframe{display:block;width:100%;height:100vh;border:0;background:#f3f4f6}
  </style>
</head>
<body>
<iframe
  id="designer-frame"
  src="${designerSrc.replace(/&/g, "&amp;")}"
  allow="camera; microphone; clipboard-write"
></iframe>
<script>
(function () {
  var frame = document.getElementById('designer-frame');
  var shop = ${JSON.stringify(shop)};
  var appOrigin = ${JSON.stringify(appOrigin)};
  var apiBase = ${JSON.stringify(appUrl)};

  function sendShopInit() {
    try { frame.contentWindow.postMessage({ type: 'SHOP_INIT', shop: shop }, appOrigin); } catch(e) {}
  }

  frame.addEventListener('load', function () {
    sendShopInit();
    setTimeout(sendShopInit, 800);
  });
  setTimeout(sendShopInit, 1500);

  // DESIGNER_ADD_TO_CART → Draft Order → checkout yönlendirme
  function handleAddToCart(data) {
    var items = data.items || [];
    var firstItem = items[0] || {};
    var variantId = firstItem.variantId || firstItem.id || '';
    var quantity = firstItem.quantity || 1;

    // Parent (tisorts.com) dinliyorsa ona ilet, değilse kendi halledelim
    var hasParent = window.parent !== window;
    if (hasParent) {
      window.parent.postMessage(data, '*');
      return;
    }

    // Standalone mod: direkt checkout
    if (!variantId) {
      frame.contentWindow.postMessage({ type: 'DESIGNER_CART_ERROR' }, appOrigin);
      return;
    }

    fetch(apiBase + '/api/embed/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shop,
        variantId: String(variantId),
        quantity: Number(quantity),
        designToken: data.designToken || '',
        properties: data.properties || {},
      }),
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.checkoutUrl) {
        frame.contentWindow.postMessage({ type: 'DESIGNER_CART_ADDED' }, appOrigin);
        setTimeout(function() { window.location.href = res.checkoutUrl; }, 400);
      } else {
        frame.contentWindow.postMessage({ type: 'DESIGNER_CART_ERROR' }, appOrigin);
      }
    })
    .catch(function() {
      frame.contentWindow.postMessage({ type: 'DESIGNER_CART_ERROR' }, appOrigin);
    });
  }

  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    var type = e.data.type;

    if (type === 'DESIGNER_ADD_TO_CART') {
      handleAddToCart(e.data);
      return;
    }

    if (type === 'DESIGNER_SCROLL_TO_TOP') {
      window.parent.postMessage(e.data, '*');
      return;
    }

    if (type === 'DESIGNER_INACTIVE') {
      window.parent.postMessage(e.data, '*');
      return;
    }

    // Parent → Designer yönlendirme
    if (
      type === 'DESIGNER_CART_ADDED' ||
      type === 'DESIGNER_CART_ERROR' ||
      type === 'DESIGNER_GO_TO_CART' ||
      type === 'DESIGNER_GO_TO_CHECKOUT'
    ) {
      try { frame.contentWindow.postMessage(e.data, appOrigin); } catch(err) {}
      return;
    }
  });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
};
