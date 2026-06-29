import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useEffect, useRef, useState } from "react";

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

type WAStatus = "disconnected" | "connecting" | "connected";

const css = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .wa-card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.1);padding:40px;width:380px;text-align:center}
  .wa-card h1{font-size:22px;font-weight:700;margin-bottom:4px}
  .wa-sub{color:#6b7280;font-size:14px;margin-bottom:28px}
  .wa-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
  .wa-dot-green{background:#22c55e}
  .wa-dot-yellow{background:#f59e0b;animation:wapulse 1s ease-in-out infinite}
  .wa-dot-red{background:#ef4444}
  @keyframes wapulse{0%,100%{opacity:1}50%{opacity:.4}}
  .wa-status-row{display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:600;margin-bottom:24px}
  .wa-qr-box{background:#f9fafb;border:2px dashed #d1d5db;border-radius:12px;padding:20px;margin-bottom:24px;min-height:240px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
  .wa-qr-box img{width:240px;height:240px;border-radius:8px}
  .wa-hint{font-size:13px;color:#6b7280;line-height:1.5}
  .wa-btn{display:inline-block;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:background .2s}
  .wa-btn-red{background:#fee2e2;color:#dc2626}
  .wa-btn-red:hover{background:#fecaca}
  .wa-btn-back{background:#e0e7ff;color:#4f46e5;text-decoration:none}
  .wa-btn-back:hover{background:#c7d2fe}
  .wa-actions{display:flex;gap:10px;justify-content:center;margin-top:16px}
`;

export default function AdminWhatsApp() {
  const [status, setStatus] = useState<WAStatus>("disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const statusRef = useRef<WAStatus>("disconnected");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      if (!alive) return;
      try {
        const mode = statusRef.current === "connected" ? "status" : "qr";
        const res = await fetch(`/admin/whatsapp-qr?mode=${mode}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json() as { status: WAStatus; qr?: string | null };
          statusRef.current = data.status;
          setStatus(data.status);
          setQr(data.qr ?? null);
        }
      } catch { /* network error, retry */ }
      const delay = statusRef.current === "connected" ? 15_000 : 3_000;
      timerRef.current = setTimeout(tick, delay);
    }

    tick();
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleLogout() {
    if (!confirm("WhatsApp bağlantısını kesmek istediğinize emin misiniz?")) return;
    const form = new FormData();
    form.append("intent", "logout");
    await fetch("/admin/whatsapp-qr", { method: "POST", body: form, credentials: "include" });
    statusRef.current = "disconnected";
    setStatus("disconnected");
    setQr(null);
  }

  const dotClass = `wa-dot ${
    status === "connected" ? "wa-dot-green" : status === "connecting" ? "wa-dot-yellow" : "wa-dot-red"
  }`;
  const statusLabel =
    status === "connected" ? "Bağlandı ✓" : status === "connecting" ? "QR Bekliyor..." : "Bağlantı Yok";

  return (
    <>
      <style>{css}</style>
      <div className="wa-card">
        <h1>📱 WhatsApp</h1>
        <p className="wa-sub">PrintLab bildirim hattı</p>

        <div className="wa-status-row">
          <span className={dotClass} />
          <span>{statusLabel}</span>
        </div>

        <div className="wa-qr-box">
          {status === "connected" ? (
            <>
              <div style={{ fontSize: 64 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#16a34a" }}>WhatsApp aktif!</div>
              <div className="wa-hint" style={{ marginTop: 8 }}>Siparişler otomatik bildirilecek.</div>
            </>
          ) : qr ? (
            <img src={qr} alt="WhatsApp QR" />
          ) : (
            <div className="wa-hint">
              {status === "connecting" ? "QR yükleniyor..." : "WhatsApp servisi başlatılıyor..."}
            </div>
          )}
        </div>

        {qr && status === "connecting" && (
          <p className="wa-hint" style={{ marginBottom: 8 }}>
            WhatsApp uygulamasını açın → Bağlı cihazlar → Cihaz ekle → QR okutun
          </p>
        )}

        <div className="wa-actions">
          <a href="/admin" className="wa-btn wa-btn-back">← Admin</a>
          {status === "connected" && (
            <button className="wa-btn wa-btn-red" onClick={handleLogout}>
              Bağlantıyı Kes
            </button>
          )}
        </div>
      </div>
    </>
  );
}
