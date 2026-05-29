export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const unitPriceStr = line.unitPriceWithSurcharge?.value;
    if (!unitPriceStr) continue;

    const unitPrice = Math.max(0, parseFloat(unitPriceStr) || 0);
    if (unitPrice === 0) continue;

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: unitPrice.toFixed(2) },
          },
        },
      },
    });
  }

  return { operations };
}
