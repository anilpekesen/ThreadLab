import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { listPromoRedemptions, PROMO_CAMPAIGNS } from "~/models/promo.server";

const AUTH_COOKIE = "panel_auth";

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

/** Kampanya kodu kullanımları: kurucu mağaza programını takip etmek için */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthed(request)) return redirect("/admin");
  const rows = await listPromoRedemptions();
  const campaigns = PROMO_CAMPAIGNS.map((c) => ({
    id: c.id,
    codes: c.codes.join(", "),
    plan: c.plan,
    freeMonths: c.freeMonths,
    maxShops: c.maxShops,
    expiresAt: c.expiresAt,
    active: rows.filter((r) => r.campaign === c.id && r.status === "active").length,
    pending: rows.filter((r) => r.campaign === c.id && r.status === "pending").length,
  }));
  return json({ rows, campaigns }, { headers: { "Cache-Control": "no-store" } });
};

const css = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f3f4f6;color:#111827;padding:32px}
  .wrap{max-width:960px;margin:0 auto}
  h1{font-size:22px;margin-bottom:6px}
  .sub{color:#6b7280;font-size:14px;margin-bottom:24px}
  .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.06);padding:20px;margin-bottom:20px}
  .stat{display:inline-block;margin-right:28px}
  .stat b{font-size:24px;display:block}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #f1f1f1}
  th{color:#6b7280;font-weight:600}
  .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600}
  .active{background:#dcfce7;color:#166534}.pending{background:#fef9c3;color:#854d0e}
  a{color:#4f46e5;text-decoration:none}
`;

export default function AdminFounders() {
  const { rows, campaigns } = useLoaderData<typeof loader>();
  return (
    <div className="wrap">
      <style>{css}</style>
      <p style={{ marginBottom: 16 }}><a href="/admin">← Admin paneli</a></p>
      <h1>Kurucu mağaza programı</h1>
      <p className="sub">Kampanya kodu kullanımları. "Bekliyor": merchant Shopify onay ekranına gitti ama henüz onaylamadı.</p>
      {campaigns.map((c) => (
        <div className="card" key={c.id}>
          <p style={{ marginBottom: 12 }}><b>{c.codes}</b> · {c.plan}, ilk {c.freeMonths} ay ücretsiz · son gün {c.expiresAt}</p>
          <span className="stat"><b>{c.active}/{c.maxShops}</b>aktif</span>
          <span className="stat"><b>{c.pending}</b>bekliyor</span>
        </div>
      ))}
      <div className="card">
        {rows.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Henüz kod kullanılmadı.</p>
        ) : (
          <table>
            <thead><tr><th>Mağaza</th><th>Kod</th><th>Plan</th><th>Durum</th><th>İlk kullanım</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.campaign}-${r.shop}`}>
                  <td><a href={`https://${r.shop}`} target="_blank" rel="noreferrer">{r.shop.replace(".myshopify.com", "")}</a></td>
                  <td>{r.code}</td>
                  <td>{r.plan_key}</td>
                  <td><span className={`badge ${r.status}`}>{r.status === "active" ? "Aktif" : "Bekliyor"}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString("tr-TR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
