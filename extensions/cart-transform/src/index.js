// The designer adds the print surcharge as a separate cart line (quantity 1)
// tagged with _design_role: pending_surcharge and _surcharge_total set to the
// combined TL amount for all sizes. We expand it into a single child whose
// unit price is that total. T-shirt lines are not touched, so checkout shows
// "Kısa Kollu Tişört × N" + "Tasarım Baskı Ücreti × 1".

export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    if (line.designRole?.value !== 'pending_surcharge') continue;

    const total = parseFloat(line.surchargeTotal?.value ?? '0');
    if (!Number.isFinite(total) || total <= 0) continue;

    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: total.toFixed(2) },
              },
            },
            attributes: [{ key: '_design_role', value: 'surcharge_child' }],
          },
        ],
      },
    });
  }

  return { operations };
}
