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
var PROP_KEYS = [
  ["a01", "Beden"],
  ["a02", "Renk"],
  ["a03", "\xD6n Tasar\u0131m"],
  ["a04", "Arka Tasar\u0131m"],
  ["a05", "design_token"],
  ["a06", "Toplam adet"],
  ["a07", "Ti\u015F\xF6rt birim fiyat\u0131"],
  ["a08", "Ti\u015F\xF6rt ara toplam\u0131"],
  ["a09", "Toplam fiyat"],
  ["a10", "\xD6n \xF6l\xE7\xFC"],
  ["a11", "\xD6n alan"],
  ["a12", "\xD6n alan fiyat\u0131"],
  ["a13", "\xD6n fiyat band\u0131"],
  ["a14", "Arka \xF6l\xE7\xFC"],
  ["a15", "Arka alan"],
  ["a16", "Arka alan fiyat\u0131"],
  ["a17", "Arka fiyat band\u0131"],
  ["a18", "Toplu al\u0131m indirimi"],
  ["a19", "Bask\u0131 indirimi"]
];
function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role === "base_expanded" || role === "surcharge_child") continue;
    if (role !== "pending_expand") continue;
    const baseUnit = parseFloat(line.baseUnit?.value ?? "0");
    const surchargeUnit = parseFloat(line.surchargeUnit?.value ?? "0");
    const surchargeGid = line.surchargeGid?.value;
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) continue;
    if (!Number.isFinite(surchargeUnit) || surchargeUnit <= 0) continue;
    if (!surchargeGid) continue;
    const baseAttrs = [{ key: "_design_role", value: "base_expanded" }];
    for (const [alias, key] of PROP_KEYS) {
      const v = line[alias]?.value;
      if (v != null && v !== "") baseAttrs.push({ key, value: v });
    }
    operations.push({
      expand: {
        cartLineId: line.id,
        expandedCartItems: [
          {
            merchandiseId: line.merchandise.id,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: baseUnit.toFixed(2) }
              }
            },
            attributes: baseAttrs
          },
          {
            merchandiseId: surchargeGid,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: surchargeUnit.toFixed(2) }
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
