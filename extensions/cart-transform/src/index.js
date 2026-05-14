export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const surchargeGid = line.surchargeVariantGid?.value ?? null;
    if (!surchargeGid) continue;

    const frontQty = Math.max(0, parseInt(line.surchargeQtyFront?.value ?? '0') || 0);
    const backQty  = Math.max(0, parseInt(line.surchargeQtyBack?.value  ?? '0') || 0);
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
