// node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/cart-transform/src/index.js
function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const surchargeGid = line.surchargeVariantGid?.value ?? null;
    if (!surchargeGid) continue;
    const frontTotal = Math.max(0, parseInt(line.surchargeQtyFront?.value ?? "0") || 0);
    const backTotal  = Math.max(0, parseInt(line.surchargeQtyBack?.value  ?? "0") || 0);
    if (frontTotal === 0 && backTotal === 0) continue;
    const totalAmount = parseFloat(line.cost?.totalAmount?.amount ?? "0");
    const perUnitPrice = line.quantity > 0 ? (totalAmount / line.quantity).toFixed(2) : totalAmount.toFixed(2);
    const expandedCartItems = [
      {
        merchandiseId: line.merchandise.id,
        quantity: line.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: perUnitPrice }
          }
        }
      }
    ];
    if (frontTotal > 0) {
      expandedCartItems.push({
        merchandiseId: surchargeGid,
        quantity: 1,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: frontTotal.toFixed(2) }
          }
        }
      });
    }
    if (backTotal > 0) {
      expandedCartItems.push({
        merchandiseId: surchargeGid,
        quantity: 1,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: backTotal.toFixed(2) }
          }
        }
      });
    }
    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems
      }
    });
  }
  return { operations };
}

// <stdin>
function run2() {
  return run_default(run);
}
export {
  run2 as run
};
