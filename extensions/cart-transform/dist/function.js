// ../../node_modules/@shopify/shopify_function/run.ts
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

// src/index.js
function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role !== "pending_surcharge" && role !== "surcharge") continue;
    const total = parseFloat(line.surchargeTotal?.value ?? "0");
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
                fixedPricePerUnit: { amount: total.toFixed(2) }
              }
            },
            attributes: [{ key: "_design_role", value: "surcharge_child" }]
          }
        ]
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
