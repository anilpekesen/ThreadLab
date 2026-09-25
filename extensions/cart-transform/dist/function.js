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
    frontPrintCount: "\xD6n bask\u0131 par\xE7as\u0131",
    frontPrintBreakdown: "_\xD6n bask\u0131 d\xF6k\xFCm\xFC",
    backSize: "_Arka \xF6l\xE7\xFC",
    backPrintPrice: "Arka bask\u0131 fiyat\u0131",
    backPriceBand: "_Arka fiyat band\u0131",
    backPrintCount: "Arka bask\u0131 par\xE7as\u0131",
    backPrintBreakdown: "_Arka bask\u0131 d\xF6k\xFCm\xFC",
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
    frontPrintCount: "Front print pieces",
    frontPrintBreakdown: "_Front print breakdown",
    backSize: "_Back size",
    backPrintPrice: "Back print price",
    backPriceBand: "_Back price band",
    backPrintCount: "Back print pieces",
    backPrintBreakdown: "_Back print breakdown",
    bulkDiscount: "Bulk discount",
    printDiscount: "Print discount"
  }
};
var FIELD_MAP = [
  ["productUnitPrice", "productUnitPrice"],
  ["frontSize", "frontSize"],
  ["frontPrintPrice", "frontPrintPrice"],
  ["frontPriceBand", "frontPriceBand"],
  ["frontPrintCount", "frontPrintCount"],
  ["frontPrintBreakdown", "frontPrintBreakdown"],
  ["backSize", "backSize"],
  ["backPrintPrice", "backPrintPrice"],
  ["backPriceBand", "backPriceBand"],
  ["backPrintCount", "backPrintCount"],
  ["backPrintBreakdown", "backPrintBreakdown"]
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
function pricingRecord(line) {
  const raw = line.merchandise?.product?.pricing?.jsonValue;
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.s !== "string" || !raw.s.startsWith("gid://shopify/ProductVariant/")) return null;
  const num = (x) => Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : 0;
  return { s: raw.s, f: num(raw.f), b: num(raw.b), d: Math.min(100, num(raw.d)), o: num(raw.o) };
}
function minimumSurcharge(record, hasFront, hasBack) {
  const factor = 1 - record.d / 100;
  let min = (hasFront ? record.f : 0) + (hasBack ? record.b : 0);
  if (!hasFront && !hasBack) {
    const sides = [record.f, record.b].filter((x) => x > 0);
    min = sides.length ? Math.min(...sides) : 0;
  }
  return Math.round(min * factor * 100) / 100;
}
function expandOptions(line, record) {
  const baseUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? "0");
  if (!Number.isFinite(baseUnit) || baseUnit <= 0) return null;
  const claimed = parseFloat(line.surchargeUnit?.value ?? "0");
  const feeUnit = Math.round(Math.max(Number.isFinite(claimed) ? claimed : 0, record.o) * 100) / 100;
  if (!(feeUnit > 0)) return null;
  const baseAttrs = [{ key: "_design_role", value: "base_expanded" }];
  pushAttr(baseAttrs, "_design_token", resolveDesignToken(line));
  pushAttr(baseAttrs, "_front_print_url", attrValue(line, "frontPrintUrl"));
  if (feeUnit > claimed) pushAttr(baseAttrs, "_pl_surcharge_floor_applied", feeUnit.toFixed(2));
  return {
    expand: {
      cartLineId: line.id,
      expandedCartItems: [
        {
          merchandiseId: line.merchandise.id,
          quantity: 1,
          price: { adjustment: { fixedPricePerUnit: { amount: baseUnit.toFixed(2) } } },
          attributes: baseAttrs
        },
        {
          merchandiseId: record.s,
          quantity: 1,
          price: { adjustment: { fixedPricePerUnit: { amount: feeUnit.toFixed(2) } } },
          attributes: [{ key: "_design_role", value: "surcharge_child" }]
        }
      ]
    }
  };
}
function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role === "base_expanded" || role === "surcharge_child") continue;
    if (role === "pending_options") {
      const record2 = pricingRecord(line);
      const op = record2 ? expandOptions(line, record2) : null;
      if (op) operations.push(op);
      continue;
    }
    if (role !== "pending_expand") continue;
    const record = pricingRecord(line);
    if (!record) continue;
    const baseUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? "0");
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) continue;
    const hasFront = /^yes$/i.test(resolveFrontDesign(line));
    const hasBack = /^yes$/i.test(resolveBackDesign(line));
    const claimed = parseFloat(line.surchargeUnit?.value ?? "0");
    const floor = minimumSurcharge(record, hasFront, hasBack);
    const surchargeUnit = Math.max(Number.isFinite(claimed) ? claimed : 0, floor);
    if (!(surchargeUnit > 0)) continue;
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
    if (surchargeUnit > claimed) pushAttr(baseAttrs, "_pl_surcharge_floor_applied", surchargeUnit.toFixed(2));
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
            merchandiseId: record.s,
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
