export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const unitTotalStr = line.unitPriceWithSurcharge?.value;
    if (!unitTotalStr) continue;

    const unitTotal = parseFloat(unitTotalStr);
    if (!Number.isFinite(unitTotal) || unitTotal <= 0) continue;

    // Idempotency without a marker: if line.totalAmount already matches
    // unitTotal × quantity, the function ran on a previous pass — skip. Using
    // totalAmount avoids amountPerQuantity edge cases on expanded children.
    const currentTotal = parseFloat(line.cost?.totalAmount?.amount ?? '0');
    const expectedTotal = unitTotal * (line.quantity || 0);
    if (Math.abs(currentTotal - expectedTotal) < 0.005) continue;

    // Omit `attributes` so the expanded child inherits the parent's properties
    // (Ön Tasarım, design_token, Beden, etc.) — Cart Transform replaces them
    // only when an explicit list is provided.
    // ExpandedItem.quantity is per *single unit* of the parent line — Shopify
    // multiplies it by parent.quantity automatically. Always use 1 here, or
    // the final child quantity becomes parent.qty² and the line total blows up.
    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: 1,
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
