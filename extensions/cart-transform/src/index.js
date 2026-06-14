// Property aliases (must match run.graphql). First non-empty value wins.
const PROP_KEYS = [
  [['a01', 'Beden'], ['a01En', 'Size']],
  [['a02', 'Renk'], ['a02En', 'Color']],
  [['a03', 'Ön Tasarım'], ['a03Hidden', '_Ön Tasarım'], ['a03En', 'Front Design'], ['a03EnHidden', '_Front Design']],
  [['a04', 'Arka Tasarım'], ['a04Hidden', '_Arka Tasarım'], ['a04En', 'Back Design'], ['a04EnHidden', '_Back Design']],
  [['a06', 'Toplam adet'], ['a06En', 'Total quantity']],
  [['a07', 'Tişört birim fiyatı'], ['a07Alt', 'Ürün birim fiyatı'], ['a07En', 'Product unit price']],
  [['a08', 'Tişört ara toplamı'], ['a08Alt', 'Ürün ara toplamı'], ['a08En', 'Product subtotal']],
  [['a09', 'Toplam fiyat'], ['a09En', 'Total price']],
  [['a10', 'Ön ölçü'], ['a10Hidden', '_Ön ölçü'], ['a10En', 'Front size'], ['a10EnHidden', '_Front size']],
  [['a12', 'Ön alan fiyatı'], ['a12Alt', 'Ön baskı fiyatı'], ['a12En', 'Front print price']],
  [['a13', 'Ön fiyat bandı'], ['a13Hidden', '_Ön fiyat bandı'], ['a13En', 'Front price band'], ['a13EnHidden', '_Front price band']],
  [['a14', 'Arka ölçü'], ['a14Hidden', '_Arka ölçü'], ['a14En', 'Back size'], ['a14EnHidden', '_Back size']],
  [['a16', 'Arka alan fiyatı'], ['a16Alt', 'Arka baskı fiyatı'], ['a16En', 'Back print price']],
  [['a17', 'Arka fiyat bandı'], ['a17Hidden', '_Arka fiyat bandı'], ['a17En', 'Back price band'], ['a17EnHidden', '_Back price band']],
  [['a18', 'Toplu alım indirimi'], ['a18En', 'Bulk discount']],
  [['a19', 'Baskı indirimi'], ['a19En', 'Print discount']],
];

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

    const baseAttrs = [{ key: '_design_role', value: 'base_expanded' }];
    const designToken = line.a05Hidden?.value ?? line.a05?.value;
    if (designToken) baseAttrs.push({ key: '_design_token', value: designToken });
    const designDetailUrl = line.a20Hidden?.value ?? line.a20?.value ?? line.a20En?.value ?? line.a20EnAlt?.value;
    if (designDetailUrl) baseAttrs.push({ key: '_design_detail_url', value: designDetailUrl });
    for (const options of PROP_KEYS) {
      for (const [alias, key] of options) {
        const v = line[alias]?.value;
        if (v != null && v !== '') {
          baseAttrs.push({ key, value: v });
          break;
        }
      }
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
