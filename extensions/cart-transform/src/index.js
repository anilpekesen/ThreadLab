export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const surchargeGid = line.surchargeVariantGid?.value ?? null;
    if (!surchargeGid) continue;

    const frontQty = Math.max(0, parseInt(line.surchargeQtyFront?.value ?? '0') || 0);
    const backQty  = Math.max(0, parseInt(line.surchargeQtyBack?.value  ?? '0') || 0);
    const totalQty = frontQty + backQty;
    if (totalQty === 0) continue;

    const totalAmount = parseFloat(line.cost?.totalAmount?.amount ?? '0');
    const perUnitPrice = line.quantity > 0
      ? (totalAmount / line.quantity).toFixed(2)
      : totalAmount.toFixed(2);

    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: perUnitPrice },
              },
            },
          },
          {
            merchandiseId: surchargeGid,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: totalQty.toFixed(2) },
              },
            },
          },
        ],
      },
    });
  }

  return { operations };
}
