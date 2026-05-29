export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const unitTotalStr = line.unitPriceWithSurcharge?.value;
    if (!unitTotalStr) continue;

    const unitTotal = parseFloat(unitTotalStr);
    if (!Number.isFinite(unitTotal) || unitTotal <= 0) continue;

    // Idempotency without a marker: if our re-priced amount already matches the
    // line's current per-unit cost, the function ran on a previous pass — skip.
    const currentPerUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? '0');
    if (Math.abs(currentPerUnit - unitTotal) < 0.005) continue;

    // Omit `attributes` so the expanded child inherits the parent's properties
    // (Ön Tasarım, design_token, Beden, etc.) — Cart Transform replaces them
    // only when an explicit list is provided.
    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: line.quantity,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: unitTotal.toFixed(2) },
              },
            },
          },
        ],
      },
    });
  }

  return { operations };
}
