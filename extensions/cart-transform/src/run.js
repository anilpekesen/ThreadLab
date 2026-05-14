// Shopify Cart Transform Function
// Compiled to WASM by Shopify CLI (javy).
//
// Reads cart lines. Any line with "_surcharge_variant_gid" property is
// expanded into: [original line] + [surcharge child line].
// Child is linked to parent — customer cannot delete it independently.
//
// Properties expected on the main product line item (set by App.tsx):
//   _surcharge_variant_gid   "gid://shopify/ProductVariant/47803169898722"
//   _surcharge_qty_front     "30"   (number of ₺1 units for front print)
//   _surcharge_qty_back      "0"    (number of ₺1 units for back print)

const input = JSON.parse(readInput());
writeOutput(JSON.stringify(run(input)));

function run(input) {
  const operations = [];

  for (const line of input.cart?.lines ?? []) {
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
          // Parent: the original product line (keeps its price)
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
          },
          // Child: surcharge units (₺1 × totalQty = baskı ücreti)
          {
            merchandiseId: surchargeGid,
            quantity: totalQty,
          },
        ],
      },
    });
  }

  return { operations };
}
