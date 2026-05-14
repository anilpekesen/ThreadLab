// Cart Transform Function — compiled with javy v3 (-d dynamic mode)
// Input: stdin JSON, Output: stdout JSON
//
// Properties expected on cart line items (set by App.tsx):
//   _surcharge_variant_gid   "gid://shopify/ProductVariant/..."
//   _surcharge_qty_front     "30"
//   _surcharge_qty_back      "0"

const input = JSON.parse(readInput());
writeOutput(JSON.stringify(run(input)));

function run(input) {
  const operations = [];

  for (const line of (input.cart?.lines ?? [])) {
    const attrs = line.attributes ?? [];
    const find = (key) => (attrs.find((a) => a.key === key) ?? {}).value ?? null;

    const surchargeGid = find('_surcharge_variant_gid');
    if (!surchargeGid) continue;

    const frontQty = Math.max(0, parseInt(find('_surcharge_qty_front') ?? '0') || 0);
    const backQty  = Math.max(0, parseInt(find('_surcharge_qty_back')  ?? '0') || 0);
    const totalQty = frontQty + backQty;
    if (totalQty === 0) continue;

    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          { merchandiseId: line.merchandise.id, quantity: line.quantity },
          { merchandiseId: surchargeGid, quantity: totalQty },
        ],
      },
    });
  }

  return { operations };
}
