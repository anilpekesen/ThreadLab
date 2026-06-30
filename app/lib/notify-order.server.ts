import { sendEmail } from "~/lib/email.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp.server";
import { getShopSettings } from "~/models/shop-settings.server";

export interface OrderNotificationPayload {
  shop: string;
  orderName: string;         // "#1042"
  shopifyOrderId: string;
  customerName: string;
  customerEmail?: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  totalPrice: string;
  currency: string;
  designFrontUrl?: string;
  designBackUrl?: string;
  printFrontUrl?: string;
  printBackUrl?: string;
}

export async function notifyOrderPaid(payload: OrderNotificationPayload): Promise<void> {
  const settings = await getShopSettings(payload.shop).catch(() => null);
  if (!settings) return;

  const { notificationEmail, notificationWhatsapp } = settings;

  const promises: Promise<void>[] = [];

  // Merchant notification (e-posta + WhatsApp)
  if (notificationEmail?.trim()) {
    promises.push(sendMerchantEmail(notificationEmail.trim(), payload));
  }
  if (notificationWhatsapp?.trim()) {
    promises.push(sendOrderWhatsApp(notificationWhatsapp.trim(), payload));
  }

  // Customer notification — always send if customer e-posta available
  if (payload.customerEmail?.trim()) {
    promises.push(sendCustomerEmail(payload.customerEmail.trim(), payload));
  }

  if (promises.length === 0) return;

  await Promise.allSettled(promises).then((results) => {
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[notify] kanal ${i} başarısız:`, r.reason);
      }
    });
  });
}

// ── Merchant e-postası (dosya linkleri + Shopify linki) ──────────────
async function sendMerchantEmail(to: string, p: OrderNotificationPayload): Promise<void> {
  const shopDomain = p.shop.replace(".myshopify.com", "");
  const adminUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${p.shopifyOrderId}`;

  const previewImgs = [
    p.designFrontUrl ? `<img src="${p.designFrontUrl}" alt="Ön Tasarım" style="max-width:240px;border-radius:8px;margin:4px">` : null,
    p.designBackUrl  ? `<img src="${p.designBackUrl}"  alt="Arka Tasarım" style="max-width:240px;border-radius:8px;margin:4px">` : null,
  ].filter(Boolean).join("");

  const fileLinks = [
    p.printFrontUrl ? `<a href="${p.printFrontUrl}" style="color:#4f46e5">📄 Baskı Dosyası (Ön)</a>` : null,
    p.printBackUrl  ? `<a href="${p.printBackUrl}"  style="color:#4f46e5">📄 Baskı Dosyası (Arka)</a>` : null,
  ].filter(Boolean).join("<br>");

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

  <div style="background:#4f46e5;padding:20px 28px">
    <h1 style="color:#fff;margin:0;font-size:20px">🛍 Yeni Sipariş — ${p.orderName}</h1>
  </div>

  <div style="padding:28px">
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr><td style="padding:8px 0;color:#6b7280;width:140px">Müşteri</td><td style="padding:8px 0;font-weight:600">${p.customerName}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">E-posta</td><td style="padding:8px 6px">${p.customerEmail || "—"}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Ürün</td><td style="padding:8px 0;font-weight:600">${p.productName}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Varyant</td><td style="padding:8px 6px">${p.variantTitle || "—"}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Adet</td><td style="padding:8px 0">${p.quantity}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Tutar</td><td style="padding:8px 6px;font-weight:700;color:#059669">${p.totalPrice} ${p.currency}</td></tr>
    </table>

    ${previewImgs ? `<div style="margin-top:20px;text-align:center">${previewImgs}</div>` : ""}

    ${fileLinks ? `
    <div style="margin-top:20px;padding:16px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
      <p style="margin:0 0 8px;font-weight:700;font-size:13px;color:#0369a1">BASKIYA GÖNDER</p>
      <div style="line-height:2">${fileLinks}</div>
    </div>` : ""}

    <div style="margin-top:20px;text-align:center">
      <a href="${adminUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
        Siparişi Shopify'da Gör →
      </a>
    </div>
  </div>
</div>
</body></html>`;

  await sendEmail({
    to,
    subject: `🛍 Yeni Sipariş: ${p.orderName} — ${p.customerName} (${p.totalPrice} ${p.currency})`,
    html,
  });
}

// ── Müşteri e-postası (tasarım önizleme görseller + sipariş özeti) ───
async function sendCustomerEmail(to: string, p: OrderNotificationPayload): Promise<void> {
  const previewImgs = [
    p.designFrontUrl ? `
    <div style="text-align:center;margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600">ÖN TASARIM</p>
      <img src="${p.designFrontUrl}" alt="Ön Tasarım" style="max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb">
    </div>` : null,
    p.designBackUrl ? `
    <div style="text-align:center;margin-bottom:16px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600">ARKA TASARIM</p>
      <img src="${p.designBackUrl}" alt="Arka Tasarım" style="max-width:280px;width:100%;border-radius:12px;border:1px solid #e5e7eb">
    </div>` : null,
  ].filter(Boolean).join("");

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

  <div style="background:#111827;padding:24px 28px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">Siparişiniz Alındı ✓</h1>
    <p style="color:#9ca3af;margin:8px 0 0;font-size:14px">${p.orderName}</p>
  </div>

  <div style="padding:28px">
    <p style="font-size:16px;color:#111827;margin:0 0 24px">Merhaba <strong>${p.customerName}</strong>, siparişiniz başarıyla alındı!</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px">Ürün</td><td style="padding:8px 0;font-weight:600">${p.productName}</td></tr>
      ${p.variantTitle ? `<tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Seçenek</td><td style="padding:8px 6px">${p.variantTitle}</td></tr>` : ""}
      <tr ${p.variantTitle ? "" : 'style="background:#f9fafb"'}><td style="padding:8px ${p.variantTitle ? "0" : "6px"};color:#6b7280">Adet</td><td style="padding:8px ${p.variantTitle ? "0" : "6px"}">${p.quantity}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 6px;color:#6b7280">Tutar</td><td style="padding:8px 6px;font-weight:700;color:#059669">${p.totalPrice} ${p.currency}</td></tr>
    </table>

    ${previewImgs ? `
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:8px">
      <p style="margin:0 0 16px;font-weight:700;font-size:14px;color:#111827;text-align:center">Tasarımınız</p>
      ${previewImgs}
    </div>` : ""}
  </div>
</div>
</body></html>`;

  await sendEmail({
    to,
    subject: `Siparişiniz alındı — ${p.orderName}`,
    html,
  });
}

// ── WhatsApp ──────────────────────────────────────────────────────────
async function sendOrderWhatsApp(phone: string, p: OrderNotificationPayload): Promise<void> {
  const shopDomain = p.shop.replace(".myshopify.com", "");
  const adminUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${p.shopifyOrderId}`;

  const lines: string[] = [
    `🛍 *Yeni Sipariş: ${p.orderName}*`,
    ``,
    `👤 Müşteri: ${p.customerName}`,
    `👕 Ürün: ${p.productName}${p.variantTitle ? ` (${p.variantTitle})` : ""}`,
    `📦 Adet: ${p.quantity}`,
    `💰 Tutar: ${p.totalPrice} ${p.currency}`,
  ];

  if (p.printFrontUrl) lines.push(``, `🖨 Baskı (Ön): ${p.printFrontUrl}`);
  if (p.printBackUrl)  lines.push(`🖨 Baskı (Arka): ${p.printBackUrl}`);
  if (p.designFrontUrl && !p.printFrontUrl) lines.push(``, `🖼 Tasarım: ${p.designFrontUrl}`);

  lines.push(``, `🔗 Shopify: ${adminUrl}`);

  await sendWhatsAppMessage(phone, lines.join("\n"));
}
