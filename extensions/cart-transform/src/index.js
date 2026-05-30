// The designer adds print surcharge as a separate cart line with quantity 1.
// This function fixes that line's unit price to the precomputed total, so
// checkout shows one "Tasarım Baskı Ücreti" line while totals stay correct.
export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role !== 'pending_surcharge' && role !== 'surcharge') continue;

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
