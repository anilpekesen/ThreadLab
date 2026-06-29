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
var LABELS = {
  tr: {
    size: "Beden",
    frontDesign: "_\xD6n Tasar\u0131m",
    backDesign: "_Arka Tasar\u0131m",
    yes: "Var",
    no: "Yok",
    totalQuantity: "Toplam adet",
    productUnitPrice: "\xDCr\xFCn birim fiyat\u0131",
    productSubtotal: "\xDCr\xFCn ara toplam\u0131",
    totalPrice: "Toplam fiyat",
    frontSize: "_\xD6n \xF6l\xE7\xFC",
    frontPrintPrice: "\xD6n bask\u0131 fiyat\u0131",
    frontPriceBand: "_\xD6n fiyat band\u0131",
    backSize: "_Arka \xF6l\xE7\xFC",
    backPrintPrice: "Arka bask\u0131 fiyat\u0131",
    backPriceBand: "_Arka fiyat band\u0131",
    bulkDiscount: "Toplu al\u0131m indirimi",
    printDiscount: "Bask\u0131 indirimi"
  },
  en: {
    size: "Size",
    frontDesign: "_Front Design",
    backDesign: "_Back Design",
    yes: "Yes",
    no: "No",
    totalQuantity: "Total quantity",
    productUnitPrice: "Product unit price",
    productSubtotal: "Product subtotal",
    totalPrice: "Total price",
    frontSize: "_Front size",
    frontPrintPrice: "Front print price",
    frontPriceBand: "_Front price band",
    backSize: "_Back size",
    backPrintPrice: "Back print price",
    backPriceBand: "_Back price band",
    bulkDiscount: "Bulk discount",
    printDiscount: "Print discount"
  }
};
var FIELD_MAP = [
  ["size", "size"],
  ["totalQuantity", "totalQuantity"],
  ["productUnitPrice", "productUnitPrice"],
  ["productSubtotal", "productSubtotal"],
  ["totalPrice", "totalPrice"],
  ["frontSize", "frontSize"],
  ["frontPrintPrice", "frontPrintPrice"],
  ["frontPriceBand", "frontPriceBand"],
  ["backSize", "backSize"],
  ["backPrintPrice", "backPrintPrice"],
  ["backPriceBand", "backPriceBand"],
  ["bulkDiscount", "bulkDiscount"],
  ["printDiscount", "printDiscount"]
];
function attrValue(line, key) {
  return line[key]?.value ?? "";
}
function isTurkish(line) {
  return String(attrValue(line, "locale") || "tr").toLowerCase().startsWith("tr");
}
function designValue(value, labels) {
  return /^yes$/i.test(String(value || "")) ? labels.yes : labels.no;
}
function resolveDesignToken(line) {
  return attrValue(line, "designToken") || attrValue(line, "designTokenAlt");
}
function resolveFrontDesign(line) {
  const internal = attrValue(line, "frontDesign");
  if (internal) return internal;
  const label = attrValue(line, "frontDesignLabel");
  if (/^var$/i.test(label) || /^yes$/i.test(label)) return "yes";
  if (attrValue(line, "frontPrintUrl")) return "yes";
  return "";
}
function resolveBackDesign(line) {
  return attrValue(line, "backDesign");
}
function pushAttr(attrs, key, value) {
  if (value != null && value !== "") attrs.push({ key, value: String(value) });
}
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
    const labels = isTurkish(line) ? LABELS.tr : LABELS.en;
    const baseAttrs = [{ key: "_design_role", value: "base_expanded" }];
    pushAttr(baseAttrs, "_design_token", resolveDesignToken(line));
    pushAttr(baseAttrs, "_design_detail_url", attrValue(line, "designDetailUrl"));
    pushAttr(baseAttrs, labels.frontDesign, designValue(resolveFrontDesign(line), labels));
    const backDesign = resolveBackDesign(line);
    if (backDesign) pushAttr(baseAttrs, labels.backDesign, designValue(backDesign, labels));
    pushAttr(baseAttrs, "_front_print_url", attrValue(line, "frontPrintUrl"));
    for (const [field, labelKey] of FIELD_MAP) {
      pushAttr(baseAttrs, labels[labelKey], attrValue(line, field));
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
