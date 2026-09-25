export type DowngradeReason =
  | { kind: "bg"; used: number; plan: string; limit: number }
  | { kind: "productTypes"; used: number; plan: string; limit: number }
  | { kind: "templates"; used: number; plan: string; limit: number };

const tr = {
  reason: (r: DowngradeReason) => {
    if (r.kind === "bg") return `Bu ay ${r.used} arka plan kaldırma kullandınız (${r.plan}: ${r.limit} limit)`;
    if (r.kind === "productTypes") return `${r.used} ürün kategoriniz var (${r.plan}: max ${r.limit})`;
    return `${r.used} şablonunuz var (${r.plan}: max ${r.limit === 0 ? "yok" : r.limit})`;
  },
  invalidPlan: "Geçersiz plan",
  downgradeBlocked: (plan: string, reasons: string[]) => `${plan} planına geçiş engellenmiştir:\n• ${reasons.join("\n• ")}`,
  unknownError: "Bilinmeyen hata",
  createFailed: (message: string) => `Shopify aboneliği oluşturulamadı: ${message}`,
  cancelFailed: (message: string) => `Shopify aboneliği iptal edilemedi: ${message}`,
  aiThisMonth: "✦ Yapay Zeka Görseli (bu ay)",
  restricted: "Kısıtlı",
  cannotSwitch: "Bu plana geçemezsiniz:",
  switchBlocked: "Geçiş Engellendi",
  aiPerMonth: "✦ Yapay Zeka Görseli/ay",
  products: "Kişiselleştirilebilir ürün",
  promoTitle: "Kampanya kodu",
  promoHelp: "Kodunuz varsa girin, sonra planı seçin. İndirim Shopify onay ekranında görünür.",
  promoApplied: (code: string) => `${code} kodu, planı seçtiğinizde uygulanacak.`,
  promoError: (e: string, plan: string, months: number) =>
    e === "expired" ? "Bu kampanya kodunun süresi doldu."
    : e === "full" ? "Bu kampanyanın kontenjanı doldu."
    : e === "wrongPlan" ? `Bu kod yalnızca ${plan} planında geçerli (ilk ${months} ay ücretsiz). Kodu ${plan} planını seçerek kullanın.`
    : e === "used" ? "Bu kampanyadan daha önce yararlandınız."
    : "Kampanya kodu geçersiz.",
  switchToFree: "Ücretsiz plana geç",
  freeCurrentNote: (used: number, limit: number) => `${used} / ${limit} ürün kullanılıyor.`,
  freeOverLimit: (used: number, limit: number) =>
    `Şu an ${used} ürününüz açık. Ücretsiz planda bunlar çalışmaya devam eder, ancak ${limit} ürünün üstünde yeni ürün ekleyemezsiniz.`,
};

const en: typeof tr = {
  reason: (r) => {
    if (r.kind === "bg") return `You've used ${r.used} background removals this month (${r.plan}: ${r.limit} limit)`;
    if (r.kind === "productTypes") return `You have ${r.used} product categories (${r.plan}: max ${r.limit})`;
    return `You have ${r.used} templates (${r.plan}: max ${r.limit === 0 ? "none" : r.limit})`;
  },
  invalidPlan: "Invalid plan",
  downgradeBlocked: (plan, reasons) => `Switching to the ${plan} plan is blocked:\n• ${reasons.join("\n• ")}`,
  unknownError: "Unknown error",
  createFailed: (message) => `Couldn't create the Shopify subscription: ${message}`,
  cancelFailed: (message) => `Couldn't cancel the Shopify subscription: ${message}`,
  aiThisMonth: "✦ AI images (this month)",
  restricted: "Restricted",
  cannotSwitch: "You can't switch to this plan:",
  switchBlocked: "Switch blocked",
  aiPerMonth: "✦ AI images/month",
  products: "Personalized products",
  promoTitle: "Promo code",
  promoHelp: "Have a code? Enter it, then choose the plan. The discount shows on Shopify's approval screen.",
  promoApplied: (code) => `The ${code} code will be applied when you choose the plan.`,
  promoError: (e, plan, months) =>
    e === "expired" ? "This promo code has expired."
    : e === "full" ? "This promotion is fully claimed."
    : e === "wrongPlan" ? `This code only works on the ${plan} plan (first ${months} months free). Choose ${plan} to use it.`
    : e === "used" ? "You've already used this promotion."
    : "Invalid promo code.",
  switchToFree: "Switch to Free",
  freeCurrentNote: (used, limit) => `${used} of ${limit} products in use.`,
  freeOverLimit: (used, limit) =>
    `You have ${used} products turned on. On the Free plan they keep working, but you can't add new products beyond ${limit}.`,
};

export default { tr, en };
