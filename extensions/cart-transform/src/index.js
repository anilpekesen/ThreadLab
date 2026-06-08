// Property aliases (must match run.graphql).
const PROP_KEYS = [
  ['a01', 'Beden'],
  ['a02', 'Renk'],
  ['a03', 'Ön Tasarım'],
  ['a04', 'Arka Tasarım'],
  ['a06', 'Toplam adet'],
  ['a07', 'Tişört birim fiyatı'],
  ['a08', 'Tişört ara toplamı'],
  ['a09', 'Toplam fiyat'],
  ['a10', 'Ön ölçü'],
  ['a12', 'Ön alan fiyatı'],
  ['a13', 'Ön fiyat bandı'],
  ['a14', 'Arka ölçü'],
  ['a16', 'Arka alan fiyatı'],
  ['a17', 'Arka fiyat bandı'],
  ['a18', 'Toplu alım indirimi'],
  ['a19', 'Baskı indirimi'],
  ['a20', 'Tasarım Detayı'],
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
    for (const [alias, key] of PROP_KEYS) {
      const v = line[alias]?.value;
      if (v != null && v !== '') baseAttrs.push({ key, value: v });
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
