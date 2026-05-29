export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const surchargeGid = line.surchargeVariantGid?.value ?? null;
    if (!surchargeGid) continue;

    // Stored as per-unit TL amount (e.g. "40" = ₺40/shirt).
    const frontPerUnit = Math.max(0, parseFloat(line.surchargeQtyFront?.value ?? '0') || 0);
    const backPerUnit  = Math.max(0, parseFloat(line.surchargeQtyBack?.value  ?? '0') || 0);
    if (frontPerUnit === 0 && backPerUnit === 0) continue;

    const totalAmount = parseFloat(line.cost?.totalAmount?.amount ?? '0');
    const perUnitPrice = line.quantity > 0
      ? (totalAmount / line.quantity).toFixed(2)
      : totalAmount.toFixed(2);

    const expandedCartItems = [
      {
        merchandiseId: line.merchandise.id,
        quantity: line.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: perUnitPrice },
          },
        },
      },
    ];

    if (frontPerUnit > 0) {
      expandedCartItems.push({
        merchandiseId: surchargeGid,
        quantity: line.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: frontPerUnit.toFixed(2) },
          },
        },
      });
    }

    if (backPerUnit > 0) {
      expandedCartItems.push({
        merchandiseId: surchargeGid,
        quantity: line.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: backPerUnit.toFixed(2) },
          },
        },
      });
    }

    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems,
      },
    });
  }

  return { operations };
}
