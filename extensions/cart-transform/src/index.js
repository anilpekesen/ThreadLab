export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    // Fold base + print surcharge into the t-shirt's own unit price so only a
    // single cart line shows up — no separate surcharge child item.
    const unitTotalStr = line.unitPriceWithSurcharge?.value;
    if (!unitTotalStr) continue;

    const unitTotal = parseFloat(unitTotalStr);
    if (!Number.isFinite(unitTotal) || unitTotal <= 0) continue;

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: unitTotal.toFixed(2) },
          },
        },
      },
    });
  }

  return { operations };
}
