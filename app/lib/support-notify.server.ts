import { sendEmail } from "~/lib/email.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp.server";

const APP_URL = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") || "https://app.printlabapp.com";

/**
 * Merchant'ın yazabileceği destek WhatsApp numarası (yalnız rakam, ülke
 * koduyla: 905xxxxxxxxx). Tanımlı değilse uygulamada WhatsApp düğmesi çıkmaz.
 */
export function supportWhatsAppNumber(): string {
  return (process.env.SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
}

/**
 * Yeni destek talebi ya da yanıtı geldiğinde sahibine anında haber verir.
 * Rakiplerin yorumlarının çoğu destek hızından bahsediyor; talep panelde
 * beklemesin. Bildirim hatası talebi engellemez.
 */
export async function notifySupportTicket(p: {
  shop: string;
  subject: string;
  message: string;
  category: string;
  kind: "new" | "reply" | "onboarding";
}): Promise<void> {
  const shopName = p.shop.replace(".myshopify.com", "");
  const title =
    p.kind === "onboarding" ? "🤝 Kurulum desteği istendi"
    : p.kind === "reply" ? "💬 Destek talebine yanıt"
    : "🆘 Yeni destek talebi";
  const panelUrl = `${APP_URL}/admin?tab=support`;
  const body = p.message.length > 600 ? `${p.message.slice(0, 600)}…` : p.message;

  const tasks: Promise<unknown>[] = [];

  const phone = (process.env.SUPPORT_NOTIFY_WHATSAPP ?? process.env.SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");
  if (phone) {
    tasks.push(sendWhatsAppMessage(phone, [
      `*${title}*`,
      ``,
      `🏪 Mağaza: ${shopName}`,
      `📂 Konu: ${p.subject} (${p.category})`,
      ``,
      body,
      ``,
      `🔗 ${panelUrl}`,
    ].join("\n")));
  }

  const email = process.env.SUPPORT_NOTIFY_EMAIL ?? "";
  if (email) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    tasks.push(sendEmail({
      to: email,
      subject: `${title}: ${shopName} — ${p.subject}`,
      html: `<p><b>${esc(title)}</b></p><p>Mağaza: ${esc(shopName)}<br>Konu: ${esc(p.subject)} (${esc(p.category)})</p><p style="white-space:pre-line">${esc(body)}</p><p><a href="${panelUrl}">Panelde aç</a></p>`,
    }));
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "rejected") console.error("[support-notify] bildirim gönderilemedi:", r.reason);
  }
}
