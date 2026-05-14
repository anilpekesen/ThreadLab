// Cart Transform Function
// _surcharge_variant_gid, _surcharge_qty_front, _surcharge_qty_back
// properties set by App.tsx on each main product line item.

export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
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
