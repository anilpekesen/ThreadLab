const LABELS = {
  tr: {
    size: 'Beden',
    frontDesign: '_Ön Tasarım',
    backDesign: '_Arka Tasarım',
    yes: 'Var',
    no: 'Yok',
    totalQuantity: 'Toplam adet',
    productUnitPrice: 'Ürün birim fiyatı',
    productSubtotal: 'Ürün ara toplamı',
    totalPrice: 'Toplam fiyat',
    frontSize: '_Ön ölçü',
    frontPrintPrice: 'Ön baskı fiyatı',
    frontPriceBand: '_Ön fiyat bandı',
    backSize: '_Arka ölçü',
    backPrintPrice: 'Arka baskı fiyatı',
    backPriceBand: '_Arka fiyat bandı',
    bulkDiscount: 'Toplu alım indirimi',
    printDiscount: 'Baskı indirimi',
  },
  en: {
    size: 'Size',
    frontDesign: '_Front Design',
    backDesign: '_Back Design',
    yes: 'Yes',
    no: 'No',
    totalQuantity: 'Total quantity',
    productUnitPrice: 'Product unit price',
    productSubtotal: 'Product subtotal',
    totalPrice: 'Total price',
    frontSize: '_Front size',
    frontPrintPrice: 'Front print price',
    frontPriceBand: '_Front price band',
    backSize: '_Back size',
    backPrintPrice: 'Back print price',
    backPriceBand: '_Back price band',
    bulkDiscount: 'Bulk discount',
    printDiscount: 'Print discount',
  },
};

const FIELD_MAP = [
  ['size', 'size'],
  ['totalQuantity', 'totalQuantity'],
  ['productUnitPrice', 'productUnitPrice'],
  ['productSubtotal', 'productSubtotal'],
  ['totalPrice', 'totalPrice'],
  ['frontSize', 'frontSize'],
  ['frontPrintPrice', 'frontPrintPrice'],
  ['frontPriceBand', 'frontPriceBand'],
  ['backSize', 'backSize'],
  ['backPrintPrice', 'backPrintPrice'],
  ['backPriceBand', 'backPriceBand'],
  ['bulkDiscount', 'bulkDiscount'],
  ['printDiscount', 'printDiscount'],
];

function attrValue(line, key) {
  return line[key]?.value ?? '';
}

function isTurkish(line) {
  return String(attrValue(line, 'locale') || 'tr').toLowerCase().startsWith('tr');
}

function designValue(value, labels) {
  return /^yes$/i.test(String(value || '')) ? labels.yes : labels.no;
}

// Some product types (e.g. bags) set "design_token" without underscore prefix
// and "Ön Tasarım: Var" / "Front Design: Yes" as human-readable labels instead
// of the internal _pl_* keys. These helpers normalise both conventions.
function resolveDesignToken(line) {
  return attrValue(line, 'designToken') || attrValue(line, 'designTokenAlt');
}

function resolveFrontDesign(line) {
  const internal = attrValue(line, 'frontDesign');
  if (internal) return internal;
  const label = attrValue(line, 'frontDesignLabel') || attrValue(line, 'frontDesignLabelEn');
  if (/^var$/i.test(label) || /^yes$/i.test(label)) return 'yes';
  // Fall back to presence of a print URL as proxy for "has design"
  if (attrValue(line, 'frontPrintUrl')) return 'yes';
  return '';
}

function resolveBackDesign(line) {
  const internal = attrValue(line, 'backDesign');
  if (internal) return internal;
  const label = attrValue(line, 'backDesignLabel') || attrValue(line, 'backDesignLabelEn');
  if (/^var$/i.test(label) || /^yes$/i.test(label)) return 'yes';
  if (attrValue(line, 'backPrintUrl')) return 'yes';
  return '';
}

function pushAttr(attrs, key, value) {
  if (value != null && value !== '') attrs.push({ key, value: String(value) });
}

export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role === 'base_expanded' || role === 'surcharge_child') continue;
    if (role !== 'pending_expand') continue;

    const baseUnit = parseFloat(line.baseUnit?.value ?? '0');
    const surchargeUnit = parseFloat(line.surchargeUnit?.value ?? '0');
    const surchargeGid = line.surchargeGid?.value;
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) continue;
    if (!Number.isFinite(surchargeUnit) || surchargeUnit <= 0) continue;
    if (!surchargeGid) continue;

    const labels = isTurkish(line) ? LABELS.tr : LABELS.en;
    const baseAttrs = [{ key: '_design_role', value: 'base_expanded' }];

    pushAttr(baseAttrs, '_design_token', resolveDesignToken(line));
    pushAttr(baseAttrs, '_design_detail_url', attrValue(line, 'designDetailUrl'));
    pushAttr(baseAttrs, labels.frontDesign, designValue(resolveFrontDesign(line), labels));

    const backDesign = resolveBackDesign(line);
    if (backDesign) pushAttr(baseAttrs, labels.backDesign, designValue(backDesign, labels));

    // Copy print/preview URLs so the webhook importer can find files even when
    // the storefront stores them directly on the line item instead of via designs table.
    pushAttr(baseAttrs, '_front_print_url', attrValue(line, 'frontPrintUrl'));
    pushAttr(baseAttrs, '_back_print_url', attrValue(line, 'backPrintUrl'));
    pushAttr(baseAttrs, '_front_preview_url', attrValue(line, 'frontPreviewUrl'));
    pushAttr(baseAttrs, '_back_preview_url', attrValue(line, 'backPreviewUrl'));

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
                fixedPricePerUnit: { amount: baseUnit.toFixed(2) },
              },
            },
            attributes: baseAttrs,
          },
          {
            merchandiseId: surchargeGid,
            quantity: 1,
            price: {
              adjustment: {
                fixedPricePerUnit: { amount: surchargeUnit.toFixed(2) },
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
