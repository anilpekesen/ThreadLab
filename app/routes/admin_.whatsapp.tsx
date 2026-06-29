import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";

const AUTH_COOKIE = "panel_auth";

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthed(request)) return redirect("/admin");
  return json({});
};

export default function AdminWhatsApp() {
  return (
    <html lang="tr">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>WhatsApp — PrintLab Admin</title>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:system-ui,sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center}
          .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;width:380px;text-align:center}
          h1{font-size:22px;font-weight:700;margin-bottom:4px}
          .sub{color:#6b7280;font-size:14px;margin-bottom:28px}
          .status-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
          .dot-green{background:#22c55e}
          .dot-yellow{background:#f59e0b;animation:pulse 1s ease-in-out infinite}
          .dot-red{background:#ef4444}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
          .status-row{display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:600;margin-bottom:24px}
          .qr-box{background:#f9fafb;border:2px dashed #d1d5db;border-radius:12px;padding:20px;margin-bottom:24px;min-height:240px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
          .qr-box img{width:240px;height:240px;border-radius:8px}
          .hint{font-size:13px;color:#6b7280;line-height:1.5}
          .btn{display:inline-block;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:background .2s}
          .btn-red{background:#fee2e2;color:#dc2626}
          .btn-red:hover{background:#fecaca}
          .btn-back{background:#e0e7ff;color:#4f46e5;text-decoration:none}
          .btn-back:hover{background:#c7d2fe}
          .actions{display:flex;gap:10px;justify-content:center;margin-top:16px}
          .connected-icon{font-size:64px;margin-bottom:8px}
        `}</style>
      </head>
      <body>
        <div className="card">
          <h1>📱 WhatsApp</h1>
          <p className="sub">PrintLab bildirim hattı</p>

          <div id="status-row" className="status-row">
            <span className="status-dot dot-yellow" id="status-dot" />
            <span id="status-label">Bağlanıyor...</span>
          </div>

          <div className="qr-box" id="qr-box">
            <div className="hint">QR kodu yükleniyor...</div>
          </div>

          <div className="hint" id="hint-text">
            WhatsApp uygulamasını açın → Bağlı cihazlar → Cihaz ekle → QR kodu okutun
          </div>

          <div className="actions">
            <a href="/admin" className="btn btn-back">← Admin</a>
            <button className="btn btn-red" id="logout-btn" style={{display:"none"}} onClick={() => (window as unknown as {handleLogout:()=>void}).handleLogout()}>
              Bağlantıyı Kes
            </button>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{__html:`
          let pollTimer = null;
          let currentStatus = "disconnected";

          async function fetchQROrStatus() {
            try {
              const isConnected = currentStatus === "connected";
              const url = isConnected
                ? "/api/whatsapp-qr?mode=status"
                : "/api/whatsapp-qr?mode=qr";

              const res = await fetch(url, { credentials: "include" });
              if (!res.ok) return;
              const data = await res.json();

              currentStatus = data.status;
              renderState(data);
            } catch(e) {
              renderState({ status: "disconnected", hasQr: false, qr: null });
            }
          }

          function renderState(data) {
            const dot = document.getElementById("status-dot");
            const label = document.getElementById("status-label");
            const qrBox = document.getElementById("qr-box");
            const hintText = document.getElementById("hint-text");
            const logoutBtn = document.getElementById("logout-btn");

            if (data.status === "connected") {
              dot.className = "status-dot dot-green";
              label.textContent = "Bağlandı ✓";
              qrBox.innerHTML = '<div class="connected-icon">✅</div><div style="font-weight:700;font-size:16px;color:#16a34a">WhatsApp aktif!</div><div class="hint" style="margin-top:8px">Siparişler otomatik bildirilecek.</div>';
              hintText.textContent = "";
              logoutBtn.style.display = "inline-block";

              // slow polling when connected
              clearInterval(pollTimer);
              pollTimer = setInterval(fetchQROrStatus, 15_000);

            } else if (data.status === "connecting" && data.qr) {
              dot.className = "status-dot dot-yellow";
              label.textContent = "QR Bekliyor...";
              qrBox.innerHTML = '<img src="' + data.qr + '" alt="WhatsApp QR" />';
              hintText.textContent = "WhatsApp uygulamasını açın → Bağlı cihazlar → Cihaz ekle → QR kodu okutun";
              logoutBtn.style.display = "none";

              // fast polling for QR
              clearInterval(pollTimer);
              pollTimer = setInterval(fetchQROrStatus, 3_000);

            } else {
              dot.className = "status-dot dot-red";
              label.textContent = "Bağlantı Yok";
              qrBox.innerHTML = '<div class="hint">WhatsApp servisi başlatılıyor...<br>Birkaç saniye içinde QR kodu görünecek.</div>';
              hintText.textContent = "";
              logoutBtn.style.display = "none";

              clearInterval(pollTimer);
              pollTimer = setInterval(fetchQROrStatus, 4_000);
            }
          }

          async function handleLogout() {
            if (!confirm("WhatsApp bağlantısını kesmek istediğinize emin misiniz?")) return;
            const form = new FormData();
            form.append("intent", "logout");
            await fetch("/api/whatsapp-qr", { method: "POST", body: form, credentials: "include" });
            currentStatus = "disconnected";
            renderState({ status: "disconnected", hasQr: false, qr: null });
          }

          // Expose for onclick handler
          window.handleLogout = handleLogout;

          // Start
          fetchQROrStatus();
          pollTimer = setInterval(fetchQROrStatus, 3_000);
        `}} />
      </body>
    </html>
  );
}
