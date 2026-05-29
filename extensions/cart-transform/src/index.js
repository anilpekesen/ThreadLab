export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    if (line.designRole?.value !== 'surcharge') continue;

    const total = Math.max(0, parseFloat(line.surchargeTotal?.value ?? '0') || 0);
    if (total === 0) continue;

    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: total.toFixed(2) },
          },
        },
      },
    });
  }

  return { operations };
}
