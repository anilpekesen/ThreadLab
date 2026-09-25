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
    frontPrintCount: 'Ön baskı parçası',
    frontPrintBreakdown: '_Ön baskı dökümü',
    backSize: '_Arka ölçü',
    backPrintPrice: 'Arka baskı fiyatı',
    backPriceBand: '_Arka fiyat bandı',
    backPrintCount: 'Arka baskı parçası',
    backPrintBreakdown: '_Arka baskı dökümü',
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
    frontPrintCount: 'Front print pieces',
    frontPrintBreakdown: '_Front print breakdown',
    backSize: '_Back size',
    backPrintPrice: 'Back print price',
    backPriceBand: '_Back price band',
    backPrintCount: 'Back print pieces',
    backPrintBreakdown: '_Back print breakdown',
    bulkDiscount: 'Bulk discount',
    printDiscount: 'Print discount',
  },
};

const FIELD_MAP = [
  ['productUnitPrice', 'productUnitPrice'],
  ['frontSize', 'frontSize'],
  ['frontPrintPrice', 'frontPrintPrice'],
  ['frontPriceBand', 'frontPriceBand'],
  ['frontPrintCount', 'frontPrintCount'],
  ['frontPrintBreakdown', 'frontPrintBreakdown'],
  ['backSize', 'backSize'],
  ['backPrintPrice', 'backPrintPrice'],
  ['backPriceBand', 'backPriceBand'],
  ['backPrintCount', 'backPrintCount'],
  ['backPrintBreakdown', 'backPrintBreakdown'],
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
  // Bags set "Ön Tasarım: Var" directly instead of _pl_front_design
  const label = attrValue(line, 'frontDesignLabel');
  if (/^var$/i.test(label) || /^yes$/i.test(label)) return 'yes';
  // Fall back to presence of a print URL as proxy for "has design"
  if (attrValue(line, 'frontPrintUrl')) return 'yes';
  return '';
}

function resolveBackDesign(line) {
  return attrValue(line, 'backDesign');
}

function pushAttr(attrs, key, value) {
  if (value != null && value !== '') attrs.push({ key, value: String(value) });
}

/**
 * Uygulamanın ürüne yazdığı fiyat kaydı: { v, s: ücret varyantı gid,
 * f/b: ön/arka en düşük bant ücreti, d: en yüksek toplu indirim yüzdesi }.
 * Kaydı olmayan ürün PrintLab ürünü değildir; dokunulmaz.
 */
function pricingRecord(line) {
  const raw = line.merchandise?.product?.pricing?.jsonValue;
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.s !== 'string' || !raw.s.startsWith('gid://shopify/ProductVariant/')) return null;
  const num = (x) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : 0);
  return { s: raw.s, f: num(raw.f), b: num(raw.b), d: Math.min(100, num(raw.d)), o: num(raw.o) };
}

/**
 * Baskı ücretinin alt sınırı. Sepetteki tutar müşteri tarafından
 * değiştirilebilir; en az, tasarımı olan her yüzün en ucuz bandı kadar
 * (toplu indirim düşülerek) olmalıdır. "Tasarım yok" beyanı da güvenilir
 * değil: genişletilmek istenen satırda en az bir yüz basılıyordur.
 */
function minimumSurcharge(record, hasFront, hasBack) {
  const factor = 1 - record.d / 100;
  let min = (hasFront ? record.f : 0) + (hasBack ? record.b : 0);
  if (!hasFront && !hasBack) {
    const sides = [record.f, record.b].filter((x) => x > 0);
    min = sides.length ? Math.min(...sides) : 0;
  }
  return Math.round(min * factor * 100) / 100;
}

/**
 * Kişiselleştirici satırı: ürün + seçeneğe göre ek ücret. Tutar sunucuda
 * hesaplanıp tasarım kaydına yazılıyor; burada yalnız müşterinin
 * kaçınamayacağı kısım (kayıttaki `o`) alt sınır olarak zorlanır, gerisi
 * siparişten sonra kayıtla karşılaştırılır. Orijinal satırın bütün alanları
 * (müşterinin yazıları, seçimleri, baskı dosyası) siparişte satır grubunda
 * kalır; burada yalnız eşleştirme için gerekenler kopyalanır.
 */
function expandOptions(line, record) {
  const baseUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? '0');
  if (!Number.isFinite(baseUnit) || baseUnit <= 0) return null;
  const claimed = parseFloat(line.surchargeUnit?.value ?? '0');
  const feeUnit = Math.round(Math.max(Number.isFinite(claimed) ? claimed : 0, record.o) * 100) / 100;
  if (!(feeUnit > 0)) return null;

  const baseAttrs = [{ key: '_design_role', value: 'base_expanded' }];
  pushAttr(baseAttrs, '_design_token', resolveDesignToken(line));
  pushAttr(baseAttrs, '_front_print_url', attrValue(line, 'frontPrintUrl'));
  if (feeUnit > claimed) pushAttr(baseAttrs, '_pl_surcharge_floor_applied', feeUnit.toFixed(2));

  return {
    expand: {
      cartLineId: line.id,
      expandedCartItems: [
        {
          merchandiseId: line.merchandise.id,
          quantity: 1,
          price: { adjustment: { fixedPricePerUnit: { amount: baseUnit.toFixed(2) } } },
          attributes: baseAttrs,
        },
        {
          merchandiseId: record.s,
          quantity: 1,
          price: { adjustment: { fixedPricePerUnit: { amount: feeUnit.toFixed(2) } } },
          attributes: [{ key: '_design_role', value: 'surcharge_child' }],
        },
      ],
    },
  };
}

export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const role = line.designRole?.value;
    if (role === 'base_expanded' || role === 'surcharge_child') continue;

    if (role === 'pending_options') {
      const record = pricingRecord(line);
      const op = record ? expandOptions(line, record) : null;
      if (op) operations.push(op);
      continue;
    }
    if (role !== 'pending_expand') continue;

    const record = pricingRecord(line);
    if (!record) continue;

    // Ürün fiyatı: Shopify'daki gerçek birim fiyat (sepet alanı değil)
    const baseUnit = parseFloat(line.cost?.amountPerQuantity?.amount ?? '0');
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) continue;

    const hasFront = /^yes$/i.test(resolveFrontDesign(line));
    const hasBack = /^yes$/i.test(resolveBackDesign(line));
    const claimed = parseFloat(line.surchargeUnit?.value ?? '0');
    const floor = minimumSurcharge(record, hasFront, hasBack);
    const surchargeUnit = Math.max(Number.isFinite(claimed) ? claimed : 0, floor);
    if (!(surchargeUnit > 0)) continue;

    const labels = isTurkish(line) ? LABELS.tr : LABELS.en;
    const baseAttrs = [{ key: '_design_role', value: 'base_expanded' }];

    pushAttr(baseAttrs, '_design_token', resolveDesignToken(line));
    pushAttr(baseAttrs, '_design_detail_url', attrValue(line, 'designDetailUrl'));
    pushAttr(baseAttrs, labels.frontDesign, designValue(resolveFrontDesign(line), labels));

    const backDesign = resolveBackDesign(line);
    if (backDesign) pushAttr(baseAttrs, labels.backDesign, designValue(backDesign, labels));

    // Copy _front_print_url so the webhook importer can detect designs on
    // products (e.g. bags) that store the URL directly on the line item.
    pushAttr(baseAttrs, '_front_print_url', attrValue(line, 'frontPrintUrl'));

    for (const [field, labelKey] of FIELD_MAP) {
      pushAttr(baseAttrs, labels[labelKey], attrValue(line, field));
    }
    // Ücret alt sınıra çekildiyse siparişte görünsün
    if (surchargeUnit > claimed) pushAttr(baseAttrs, '_pl_surcharge_floor_applied', surchargeUnit.toFixed(2));

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
            merchandiseId: record.s,
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
