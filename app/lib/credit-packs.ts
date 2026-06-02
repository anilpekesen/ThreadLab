export const CREDIT_PACKS = {
  pack100: { key: 'pack100', credits: 100, price: 9.99,  label: '100 AI Kredisi' },
  pack300: { key: 'pack300', credits: 300, price: 19.99, label: '300 AI Kredisi' },
  pack500: { key: 'pack500', credits: 500, price: 39.99, label: '500 AI Kredisi' },
} as const;

export type PackKey = keyof typeof CREDIT_PACKS;
export type CreditPack = typeof CREDIT_PACKS[PackKey];
