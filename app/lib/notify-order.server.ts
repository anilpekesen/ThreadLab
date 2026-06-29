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

  const { notificationEmail, notificationWebhookUrl, notificationWhatsapp } = settings;

  const promises: Promise<void>[] = [];

  if (notificationEmail?.trim()) {
    promises.push(sendOrderEmail(notificationEmail.trim(), payload));
  }

  if (notificationWebhookUrl?.trim()) {
    promises.push(sendWebhookPost(notificationWebhookUrl.trim(), payload));
  }

  if (notificationWhatsapp?.trim()) {
    promises.push(sendOrderWhatsApp(notificationWhatsapp.trim(), payload));
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

// ── E-posta ──────────────────────────────────────────────────────────
async function sendOrderEmail(to: string, p: OrderNotificationPayload): Promise<void> {
  const shopDomain = p.shop.replace(".myshopify.com", "");
  const adminUrl = `https://admin.shopify.com/store/${shopDomain}/orders/${p.shopifyOrderId}`;

  const designLinks = [
    p.printFrontUrl ? `<a href="${p.printFrontUrl}" style="color:#4f46e5">📄 Baskı Dosyası (Ön)</a>` : null,
    p.printBackUrl  ? `<a href="${p.printBackUrl}"  style="color:#4f46e5">📄 Baskı Dosyası (Arka)</a>` : null,
    p.designFrontUrl ? `<a href="${p.designFrontUrl}" style="color:#6b7280">🖼 Tasarım Görseli (Ön)</a>` : null,
    p.designBackUrl  ? `<a href="${p.designBackUrl}"  style="color:#6b7280">🖼 Tasarım Görseli (Arka)</a>` : null,
  ].filter(Boolean).join("<br>");

  const html = `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

    <div style="background:#4f46e5;padding:20px 28px">
      <h1 style="color:#fff;margin:0;font-size:20px">🛍 Yeni Sipariş — ${p.orderName}</h1>
    </div>

    <div style="padding:28px">
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr>
          <td style="padding:8px 0;color:#6b7280;width:140px">Müşteri</td>
          <td style="padding:8px 0;font-weight:600">${p.customerName}</td>
        </tr>
        <tr style="background:#f9fafb">
          <td style="padding:8px 6px;color:#6b7280">Ürün</td>
          <td style="padding:8px 6px;font-weight:600">${p.productName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280">Varyant</td>
          <td style="padding:8px 0">${p.variantTitle || "—"}</td>
        </tr>
        <tr style="background:#f9fafb">
          <td style="padding:8px 6px;color:#6b7280">Adet</td>
          <td style="padding:8px 6px">${p.quantity}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#6b7280">Tutar</td>
          <td style="padding:8px 0;font-weight:700;color:#059669">${p.totalPrice} ${p.currency}</td>
        </tr>
      </table>

      ${designLinks ? `
      <div style="margin-top:20px;padding:16px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
        <p style="margin:0 0 8px;font-weight:700;font-size:13px;color:#0369a1">DOSYALAR</p>
        <div style="line-height:2">${designLinks}</div>
      </div>` : ""}

      <div style="margin-top:20px;text-align:center">
        <a href="${adminUrl}"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
          Siparişi Shopify'da Gör →
        </a>
      </div>
    </div>

    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center">
      PrintLab tarafından gönderildi · ${p.shop}
    </div>
  </div>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `🛍 Yeni Sipariş: ${p.orderName} — ${p.customerName} (${p.totalPrice} ${p.currency})`,
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

  const message = lines.join("\n");
  await sendWhatsAppMessage(phone, message);
}

// ── Webhook (Zapier / Make / n8n) ────────────────────────────────────
async function sendWebhookPost(url: string, p: OrderNotificationPayload): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "order_paid",
      orderName: p.orderName,
      shopifyOrderId: p.shopifyOrderId,
      customerName: p.customerName,
      customerEmail: p.customerEmail ?? null,
      productName: p.productName,
      variantTitle: p.variantTitle,
      quantity: p.quantity,
      totalPrice: p.totalPrice,
      currency: p.currency,
      designFrontUrl: p.designFrontUrl ?? null,
      designBackUrl: p.designBackUrl ?? null,
      printFrontUrl: p.printFrontUrl ?? null,
      printBackUrl: p.printBackUrl ?? null,
      shop: p.shop,
    }),
  });

  if (!res.ok) {
    throw new Error(`Webhook ${url} yanıt kodu: ${res.status}`);
  }
}
