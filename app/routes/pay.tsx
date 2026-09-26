import type { LoaderFunctionArgs } from "@remix-run/node";
import { query } from "~/lib/db.server";
import { paddleClientConfig } from "~/lib/paddle.server";

/**
 * Paddle ödeme sayfası (printlabapp.com/pay). Ödeme penceresi yalnız Paddle'ın
 * onayladığı alan adında açılır; uygulama alt alan adı yerine burada açılır.
 *
 *   ?txn=<id>&back=billing|credits&lang=  → panelden gelen, sunucunun açtığı işlem
 *   ?_ptxn=<id>                           → Paddle'ın e-postalarındaki bağlantılar
 *                                           (kart güncelleme, yenileme); Paddle.js
 *                                           bu parametreyi görünce kendisi açar.
 * Bu sayfa Paddle'da "varsayılan ödeme bağlantısı" olarak tanımlıdır.
 */
const TXN = /^txn_[a-z0-9]{10,40}$/;
const APP_URL = (process.env.SHOPIFY_APP_URL || "https://app.printlabapp.com").replace(/\/$/, "");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const tr = url.searchParams.get("lang") === "tr";
  const back = url.searchParams.get("back") === "credits" ? "credits" : "billing";
  const client = paddleClientConfig();
  let txn = url.searchParams.get("txn") ?? "";
  const ptxn = url.searchParams.get("_ptxn") ?? "";
  let customerId: string | null = null;

  if (txn) {
    // Yalnız bizim açtığımız, henüz tamamlanmamış işlem
    const row = (await query<{ shop: string }>(
      "SELECT shop FROM paddle_checkouts WHERE transaction_id = $1 AND completed_at IS NULL", [txn])).rows[0];
    if (!TXN.test(txn) || !row) txn = "";
    else {
      customerId = (await query<{ customer_id: string }>(
        "SELECT customer_id FROM paddle_subscriptions WHERE shop = $1 AND customer_id LIKE 'ctm_%' ORDER BY updated_at DESC LIMIT 1",
        [row.shop])).rows[0]?.customer_id ?? null;
    }
  }
  const valid = Boolean(client && (txn || TXN.test(ptxn)));
  const backUrl = `${APP_URL}/app/${back}`;

  const T = tr
    ? { title: "Güvenli ödeme", lead: "Ödeme penceresi açılıyor…", invalid: "Bu ödeme bağlantısı geçersiz ya da süresi dolmuş. Lütfen PrintLab panelinden yeniden deneyin.", done: "Ödemeniz alındı, teşekkürler. PrintLab paneline yönlendiriliyorsunuz…", back: "PrintLab paneline dön", by: "Ödemeler Paddle.com tarafından işlenir. Paddle bu siparişlerde satıcıdır (Merchant of Record)." , terms: "Kullanım Koşulları", privacy: "Gizlilik", refund: "İade Politikası" }
    : { title: "Secure checkout", lead: "Opening the checkout…", invalid: "This payment link is invalid or has expired. Please start again from your PrintLab dashboard.", done: "Payment received, thank you. Taking you back to PrintLab…", back: "Back to PrintLab", by: "Payments are processed by Paddle.com, our Merchant of Record for these orders.", terms: "Terms of Service", privacy: "Privacy Policy", refund: "Refund Policy" };

  const init = valid && client ? `
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
<script>
  (function () {
    var back = ${JSON.stringify(backUrl)};
    var fromApp = ${JSON.stringify(Boolean(txn))};
    var msg = document.getElementById("msg");
    ${client.environment === "sandbox" ? 'Paddle.Environment.set("sandbox");' : ""}
    Paddle.Initialize({
      token: ${JSON.stringify(client.token)},
      ${customerId ? `pwCustomer: { id: ${JSON.stringify(customerId)} },` : ""}
      checkout: { settings: { displayMode: "overlay", locale: ${JSON.stringify(tr ? "tr" : "en")} } },
      eventCallback: function (e) {
        if (e.name === "checkout.completed") {
          msg.textContent = ${JSON.stringify(T.done)};
          if (fromApp) setTimeout(function () { location.href = back + "?paddle=done"; }, 2500);
        }
        if (e.name === "checkout.closed" && fromApp) location.href = back;
      }
    });
    if (fromApp) Paddle.Checkout.open({ transactionId: ${JSON.stringify(txn)} });
  })();
</script>` : "";

  const html = `<!doctype html>
<html lang="${tr ? "tr" : "en"}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>PrintLab | ${esc(T.title)}</title>
<link rel="icon" href="/logo-mark.png">
<style>
  :root{--bg:#f8fafc;--fg:#0f172a;--muted:#64748b;--card:#fff;--line:#e2e8f0;--accent:#4f46e5}
  @media (prefers-color-scheme:dark){:root{--bg:#0b1020;--fg:#e2e8f0;--muted:#94a3b8;--card:#111827;--line:#1f2937;--accent:#818cf8}}
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
  .card{max-width:480px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px;text-align:center}
  img{height:40px}h1{font-size:20px;margin:16px 0 8px}p{margin:8px 0;color:var(--muted)}
  a{color:var(--accent)}.btn{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
  .legal{margin-top:24px;font-size:13px}.legal a{margin:0 6px}
</style></head><body>
<main class="card">
  <img src="/logo-full.png" alt="PrintLab">
  <h1>${esc(T.title)}</h1>
  <p id="msg">${esc(valid ? T.lead : T.invalid)}</p>
  <a class="btn" href="${esc(backUrl)}">${esc(T.back)}</a>
  <p class="legal">${esc(T.by)}<br>
    <a href="/terms-of-service">${esc(T.terms)}</a>·<a href="/privacy-policy">${esc(T.privacy)}</a>·<a href="/refund-policy">${esc(T.refund)}</a>·<a href="mailto:support@printlabapp.com">support@printlabapp.com</a></p>
</main>${init}
</body></html>`;
  return new Response(html, {
    status: valid ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
};
