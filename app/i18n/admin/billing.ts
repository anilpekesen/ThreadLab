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
};

export default { tr, en };
