analytics.subscribe('checkout_completed', async (event) => {
  const checkout = event.data.checkout;
  const attrs = checkout.attributes ?? [];

  const get = (key) => attrs.find((a) => a.key === key)?.value ?? '';
  const designToken = get('design_token');
  if (!designToken) return;

  // Find the t-shirt line item (the one that requires shipping)
  // The surcharge (Baskı Ücreti) has requiresShipping = false
  const tshirtItem = (checkout.lineItems ?? []).find(
    (li) => li.variant?.requiresShipping !== false
  );

  try {
    await fetch('https://threadlab-production.up.railway.app/api/pixel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: String(checkout.order?.id ?? ''),
        orderNumber: checkout.order?.name ?? '',
        designToken,
        frontPreviewUrl: get('_front_preview_url'),
        frontPrintUrl: get('_front_print_url'),
        productName: tshirtItem?.title ?? '',
        variantId: String(tshirtItem?.variant?.id ?? ''),
        productId: String(tshirtItem?.variant?.product?.id ?? ''),
      }),
    });
  } catch (_) {}
});
