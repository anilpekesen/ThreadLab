import { sendEmail } from "~/lib/email.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp.server";
import { getShopSettings } from "~/models/shop-settings.server";

const APP_URL = process.env.SHOPIFY_APP_URL?.replace(/\/+$/, "") || "https://app.printlabapp.com";

/**
 * Müşterinin kendi tasarımını görüp indirebileceği public link (token = tek gizli bilgi).
 * lang=tr: müşteri e-postası Türkçe, açılan sayfa da Türkçe olsun (my-order aksi halde
 * mağaza adına göre karar veriyor ve çoğu mağazada İngilizce açılıyor).
 */
function customerDesignUrl(shop: string, designToken?: string): string | null {
  if (!designToken?.trim()) return null;
  return `${APP_URL}/apps/tshirt-designer/my-order?shop=${encodeURIComponent(shop)}&token=${encodeURIComponent(designToken.trim())}&lang=tr`;
}

/** Siparişteki tek bir ürün satırı — çok ürünlü siparişlerde müşteri maili bunları listeler */
export interface OrderNotificationItem {
  productName: string;
  variantTitle?: string;
  quantity: number;
  lineTotal?: string;
  currency?: string;
  designFrontUrl?: string;
  designBackUrl?: string;
  designToken?: string;
}

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
  designToken?: string;
  /** Siparişin tüm satırları. Doluysa müşteri maili hepsini ayrı ayrı listeler. */
  items?: OrderNotificationItem[];
  /** Siparişin toplam tutarı (çok ürünlüyse satır tutarlarının toplamı) */
  orderTotal?: string;
}

export async function notifyOrderPaid(payload: OrderNotificationPayload): Promise<void> {
  const settings = await getShopSettings(payload.shop).catch(() => null);
  if (!settings) return;

  const { notificationEmail, notificationWhatsapp, emailSenderName, shopDisplayName } = settings;
  const senderName = emailSenderName?.trim()
    || shopDisplayName?.trim()
    || payload.shop.replace(/\.myshopify\.com$/i, "");

  const promises: Promise<void>[] = [];

  // Merchant notification (e-posta + WhatsApp)
  if (notificationEmail?.trim()) {
    promises.push(sendMerchantEmail(notificationEmail.trim(), payload, senderName));
  }
  if (notificationWhatsapp?.trim()) {
    promises.push(sendOrderWhatsApp(notificationWhatsapp.trim(), payload));
  }

  // Customer notification — always send if customer e-posta available.
  // Yanıtlar PrintLab'e değil mağazaya düşsün diye reply-to = mağazanın bildirim adresi.
  if (payload.customerEmail?.trim()) {
    promises.push(sendCustomerEmail(
      payload.customerEmail.trim(),
      payload,
      notificationEmail?.trim() || undefined,
      senderName,
    ));
  } else {
    // Webhook payload'ında müşteri e-postası yoksa Shopify "protected customer data"
    // iznini vermemiş demektir — müşteriye mail atmak mümkün değil
    console.warn(`[notify] müşteri e-postası yok — ${payload.orderName} için müşteri maili atlandı`);
  }

  if (promises.length === 0) return;

  const channels: string[] = [];
  if (notificationEmail?.trim()) channels.push("merchant-email");
  if (notificationWhatsapp?.trim()) channels.push("whatsapp");
  if (payload.customerEmail?.trim()) channels.push("customer-email");

  await Promise.allSettled(promises).then((results) => {
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[notify] ${channels[i] ?? `kanal ${i}`} başarısız:`, r.reason);
      } else {
        console.log(`[notify] ${channels[i] ?? `kanal ${i}`} OK — sipariş ${payload.orderName}`);
      }
    });
  });
}

// ── Merchant e-postası (dosya linkleri + Shopify linki) ──────────────
async function sendMerchantEmail(
  to: string,
  p: OrderNotificationPayload,
  fromName?: string,
): Promise<void> {
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
    fromName,
  });
}

// ── Müşteri e-postası (her ürün için önizleme + tasarım linki) ───────
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Sadece https:// görselleri maile koy — boş data: URL'leri kırık görsel gösteriyor */
function safeImg(url?: string): string {
  return url && url.startsWith("https://") ? url : "";
}

function renderItemCard(p: OrderNotificationPayload, item: OrderNotificationItem, index: number, total: number): string {
  const front = safeImg(item.designFrontUrl);
  const back = safeImg(item.designBackUrl);
  const designUrl = customerDesignUrl(p.shop, item.designToken);

  const imgs = [
    front ? `
      <td style="padding:0 6px;text-align:center;vertical-align:top">
        <p style="margin:0 0 6px;font-size:11px;color:#6b7280;font-weight:600;letter-spacing:.04em">ÖN</p>
        <img src="${front}" alt="Ön Tasarım" style="max-width:180px;width:100%;border-radius:10px;border:1px solid #e5e7eb">
      </td>` : "",
    back ? `
      <td style="padding:0 6px;text-align:center;vertical-align:top">
        <p style="margin:0 0 6px;font-size:11px;color:#6b7280;font-weight:600;letter-spacing:.04em">ARKA</p>
        <img src="${back}" alt="Arka Tasarım" style="max-width:180px;width:100%;border-radius:10px;border:1px solid #e5e7eb">
      </td>` : "",
  ].filter(Boolean).join("");

  const meta = [
    item.variantTitle ? esc(item.variantTitle) : "",
    `${item.quantity} adet`,
    item.lineTotal ? `${esc(item.lineTotal)} ${esc(item.currency ?? "")}`.trim() : "",
  ].filter(Boolean).join(" · ");

  return `
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin-bottom:14px">
      ${total > 1 ? `<p style="margin:0 0 4px;font-size:11px;color:#9ca3af;font-weight:700;letter-spacing:.06em">ÜRÜN ${index + 1} / ${total}</p>` : ""}
      <p style="margin:0;font-size:15px;font-weight:700;color:#111827">${esc(item.productName)}</p>
      ${meta ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">${meta}</p>` : ""}

      ${imgs ? `
      <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>${imgs}</tr></table>` : ""}

      ${designUrl ? `
      <div style="margin-top:16px;text-align:center">
        <a href="${designUrl}" style="display:inline-block;background:#111827;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
          Tasarımını Gör ve İndir →
        </a>
      </div>` : ""}
    </div>`;
}

export function renderCustomerEmailHtml(p: OrderNotificationPayload): string {
  // items doluysa siparişin tüm satırları listelenir; yoksa tek satırlık eski davranış
  const items: OrderNotificationItem[] = p.items?.length
    ? p.items
    : [{
        productName: p.productName,
        variantTitle: p.variantTitle,
        quantity: p.quantity,
        lineTotal: p.totalPrice,
        currency: p.currency,
        designFrontUrl: p.designFrontUrl,
        designBackUrl: p.designBackUrl,
        designToken: p.designToken,
      }];

  const cards = items.map((it, i) => renderItemCard(p, it, i, items.length)).join("");
  const hasAnyLink = items.some((it) => customerDesignUrl(p.shop, it.designToken));
  const orderTotal = p.orderTotal ?? p.totalPrice;

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

  <div style="background:#111827;padding:24px 28px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">Siparişiniz Alındı ✓</h1>
    <p style="color:#9ca3af;margin:8px 0 0;font-size:14px">${esc(p.orderName)}</p>
  </div>

  <div style="padding:28px">
    <p style="font-size:16px;color:#111827;margin:0 0 24px">Merhaba <strong>${esc(p.customerName)}</strong>, siparişiniz başarıyla alındı!</p>

    ${cards}

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px">
      <tr style="background:#f9fafb">
        <td style="padding:12px 10px;color:#6b7280;font-weight:600">Toplam</td>
        <td style="padding:12px 10px;font-weight:700;color:#059669;text-align:right">${esc(orderTotal)} ${esc(p.currency)}</td>
      </tr>
    </table>

    ${hasAnyLink ? `
    <p style="margin:20px 0 0;font-size:12px;color:#6b7280;line-height:1.6;text-align:center">
      Tasarım linklerinizi saklayın — tasarımlarınızı istediğiniz zaman görüntüleyip yüksek kaliteli dosyalarını indirebilirsiniz.
    </p>` : ""}
  </div>
</div>
</body></html>`;

  return html;
}

async function sendCustomerEmail(
  to: string,
  p: OrderNotificationPayload,
  replyTo?: string,
  fromName?: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: `Siparişiniz alındı — ${p.orderName}`,
    html: renderCustomerEmailHtml(p),
    replyTo,
    fromName,
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
