import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData } from "@remix-run/react";
import { query } from "~/lib/db.server";
import { getAiPromptLogs, getAiPromptLogsCount, type AiPromptLog } from "~/models/ai-prompt-logs.server";
import { saveShopSettings, getShopSettings } from "~/models/shop-settings.server";
import React from "react";

const AUTH_COOKIE = "panel_auth";
const PAGE_SIZE = 100;

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

interface ShopRow {
  shop: string;
  plan_key: string;
  subscription_status: string;
  total_orders: number;
  orders_this_month: number;
  total_revenue: string;
  currency: string;
  ai_this_month: number;
  bg_this_month: number;
  drive_connected: boolean;
  last_order_at: string | null;
}

interface TicketRow {
  id: string;
  shop: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  admin_reply: string | null;
  created_at: string;
  replied_at: string | null;
}

async function getShopsData() {
  const month = new Date().toISOString().slice(0, 7);
  const result = await query<ShopRow>(`
    WITH shop_list AS (
      SELECT DISTINCT shop FROM shopify_sessions WHERE shop != ''
      UNION SELECT DISTINCT shop FROM orders WHERE shop != ''
      UNION SELECT DISTINCT shop FROM shop_subscriptions WHERE shop != ''
    )
    SELECT
      sl.shop,
      COALESCE(ss.plan_key, '-') as plan_key,
      COALESCE(ss.subscription_status, 'none') as subscription_status,
      COUNT(DISTINCT o.id)::int as total_orders,
      COUNT(DISTINCT CASE WHEN o.created_at >= date_trunc('month', now()) THEN o.id END)::int as orders_this_month,
      COALESCE(SUM(o.line_total_price), 0)::numeric as total_revenue,
      COALESCE(MAX(o.currency_code) FILTER (WHERE o.currency_code != ''), 'USD') as currency,
      COALESCE(ai.count, 0) as ai_this_month,
      COALESCE(bg.count, 0) as bg_this_month,
      (sgd.shop IS NOT NULL) as drive_connected,
      MAX(o.created_at) as last_order_at
    FROM shop_list sl
    LEFT JOIN shop_subscriptions ss ON ss.shop = sl.shop
    LEFT JOIN orders o ON o.shop = sl.shop
    LEFT JOIN ai_generation_usage ai ON ai.shop = sl.shop AND ai.month = $1
    LEFT JOIN bg_removal_usage bg ON bg.shop = sl.shop AND bg.month = $1
    LEFT JOIN shop_google_drive sgd ON sgd.shop = sl.shop
    GROUP BY sl.shop, ss.plan_key, ss.subscription_status, ai.count, bg.count, sgd.shop
    ORDER BY total_orders DESC, sl.shop
  `, [month]);
  return result.rows;
}

async function getGlobalStats() {
  const result = await query<{
    total_shops: string;
    total_orders: string;
    total_revenue: string;
    total_ai_gens: string;
    total_bg_removals: string;
    active_subs: string;
    open_tickets: string;
    active_bonus_credits: string;
    total_credit_sales: string;
  }>(`
    SELECT
      (SELECT COUNT(DISTINCT shop)::text FROM shopify_sessions WHERE shop != '') as total_shops,
      (SELECT COUNT(*)::text FROM orders) as total_orders,
      (SELECT COALESCE(SUM(line_total_price), 0)::text FROM orders) as total_revenue,
      (SELECT COALESCE(SUM(count), 0)::text FROM ai_generation_usage) as total_ai_gens,
      (SELECT COALESCE(SUM(count), 0)::text FROM bg_removal_usage) as total_bg_removals,
      (SELECT COUNT(*)::text FROM shop_subscriptions WHERE subscription_status = 'active') as active_subs,
      (SELECT COUNT(*)::text FROM support_tickets WHERE status = 'open') as open_tickets,
      (SELECT COALESCE(SUM(credits_added), 0)::text FROM ai_credit_purchases WHERE expires_at > now()) as active_bonus_credits,
      (SELECT COUNT(*)::text FROM ai_credit_purchases) as total_credit_sales
  `);
  const r = result.rows[0];
  return {
    totalShops: parseInt(r?.total_shops ?? "0", 10),
    totalOrders: parseInt(r?.total_orders ?? "0", 10),
    totalRevenue: parseFloat(r?.total_revenue ?? "0"),
    totalAiGens: parseInt(r?.total_ai_gens ?? "0", 10),
    totalBgRemovals: parseInt(r?.total_bg_removals ?? "0", 10),
    activeSubs: parseInt(r?.active_subs ?? "0", 10),
    openTickets: parseInt(r?.open_tickets ?? "0", 10),
    activeBonusCredits: parseInt(r?.active_bonus_credits ?? "0", 10),
    totalCreditSales: parseInt(r?.total_credit_sales ?? "0", 10),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthed(request)) {
    return json({
      authed: false, tab: "login",
      shops: [] as ShopRow[], globalStats: null,
      aiLogs: [] as AiPromptLog[], aiLogsCount: 0, aiLogsPage: 0, filterShop: "",
      tickets: [] as TicketRow[], openCount: 0,
    });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "shops";
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const filterShop = url.searchParams.get("shop") ?? "";

  if (tab === "ai-logs") {
    const [aiLogs, aiLogsCount, globalStats] = await Promise.all([
      getAiPromptLogs({ shop: filterShop || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
      getAiPromptLogsCount(filterShop || undefined),
      getGlobalStats(),
    ]);
    return json({ authed: true, tab, shops: [] as ShopRow[], globalStats, aiLogs, aiLogsCount, aiLogsPage: page, filterShop, tickets: [] as TicketRow[], openCount: 0 });
  }

  if (tab === "support") {
    const [ticketsResult, globalStats] = await Promise.all([
      query<TicketRow>(
        `SELECT id, shop, subject, message, status, priority, admin_reply, messages, created_at, replied_at
         FROM support_tickets ORDER BY created_at DESC LIMIT 100`,
      ),
      getGlobalStats(),
    ]);
    const tickets = ticketsResult.rows;
    const openCount = tickets.filter((t) => t.status === "open").length;
    return json({
      authed: true, tab, shops: [] as ShopRow[], globalStats,
      aiLogs: [] as AiPromptLog[], aiLogsCount: 0, aiLogsPage: 0, filterShop: "",
      tickets, openCount,
    });
  }

  const [shops, globalStats] = await Promise.all([getShopsData(), getGlobalStats()]);
  return json({ authed: true, tab: "shops", shops, globalStats, aiLogs: [] as AiPromptLog[], aiLogsCount: 0, aiLogsPage: 0, filterShop: "", tickets: [] as TicketRow[], openCount: 0 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "logout") {
    return redirect("/admin", {
      headers: { "Set-Cookie": `${AUTH_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly` },
    });
  }

  if (intent === "setBonus") {
    const shop = String(form.get("shop") ?? "");
    const aiBonus = Math.max(0, parseInt(String(form.get("aiQuotaBonus") ?? "0"), 10) || 0);
    const bgBonus = Math.max(0, parseInt(String(form.get("bgQuotaBonus") ?? "0"), 10) || 0);
    if (shop) {
      const current = await getShopSettings(shop);
      await saveShopSettings(shop, { ...current, aiQuotaBonus: aiBonus, bgQuotaBonus: bgBonus });
    }
    return redirect(`/admin?tab=shops`);
  }

  if (intent === "replyTicket") {
    if (isAuthed(request)) {
      const ticketId = form.get("ticketId") as string;
      const reply = form.get("reply") as string;
      if (ticketId && reply?.trim()) {
        const adminMsg = JSON.stringify([{ role: "admin", text: reply.trim(), at: new Date().toISOString() }]);
        await query(
          `UPDATE support_tickets
           SET admin_reply = $2, status = 'answered', replied_at = now(), updated_at = now(),
               messages = messages || $3::jsonb
           WHERE id = $1`,
          [ticketId, reply.trim(), adminMsg],
        );
      }
    }
    return redirect("/admin?tab=support");
  }

  if (intent === "closeTicket") {
    if (isAuthed(request)) {
      const ticketId = form.get("ticketId") as string;
      if (ticketId) {
        await query(
          `UPDATE support_tickets SET status = 'closed', updated_at = now() WHERE id = $1`,
          [ticketId],
        );
      }
    }
    return redirect("/admin?tab=support");
  }

  const password = String(form.get("password") ?? "");
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret || password !== secret) {
    return json({ error: "Hatalı şifre" });
  }
  return redirect("/admin", {
    headers: {
      "Set-Cookie": `${AUTH_COOKIE}=${encodeURIComponent(secret)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 8}`,
    },
  });
};

// ── Styles ────────────────────────────────────────────────────────────────────

const css = {
  page: { fontFamily: "system-ui,-apple-system,sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" } as React.CSSProperties,
  header: { background: "#1e293b", borderBottom: "1px solid #334155", padding: "0 28px", display: "flex", alignItems: "center", gap: 20, height: 54 } as React.CSSProperties,
  logo: { fontWeight: 700, fontSize: 17, color: "#f8fafc", letterSpacing: "-0.3px", whiteSpace: "nowrap" as const },
  navLink: (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: "none",
    color: active ? "#f8fafc" : "#94a3b8", background: active ? "#334155" : "transparent",
  }),
  main: { padding: "24px 28px", maxWidth: 1400, margin: "0 auto" } as React.CSSProperties,
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 14, marginBottom: 22 } as React.CSSProperties,
  statCard: { background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "14px 18px" } as React.CSSProperties,
  statLabel: { fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.8 },
  statValue: { fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginTop: 4 },
  card: { background: "#1e293b", border: "1px solid #334155", borderRadius: 10, overflow: "hidden" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { padding: "10px 14px", textAlign: "left" as const, background: "#162032", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5, borderBottom: "1px solid #334155" },
  td: { padding: "10px 14px", borderBottom: "1px solid #1a2840", color: "#cbd5e1", verticalAlign: "middle" as const },
  badge: (color: string): React.CSSProperties => ({ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + "22", color }),
  input: { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "6px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" } as React.CSSProperties,
  btn: { background: "#334155", border: "none", borderRadius: 6, padding: "6px 16px", color: "#e2e8f0", cursor: "pointer", fontSize: 13 } as React.CSSProperties,
};

const PLAN_COLOR: Record<string, string> = { Starter: "#6366f1", Growth: "#0ea5e9", Pro: "#8b5cf6", Business: "#f59e0b" };
const STATUS_COLOR: Record<string, string> = { active: "#10b981", trial: "#f59e0b", cancelled: "#ef4444", none: "#6b7280" };
const TICKET_STATUS_COLOR: Record<string, string> = { open: "#f59e0b", answered: "#10b981", closed: "#6b7280" };

// ── Components ────────────────────────────────────────────────────────────────

function LoginPage({ error }: { error?: string }) {
  return (
    <div style={{ ...css.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: "40px 44px", width: 340 }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 6 }}>🖥</div>
        <h1 style={{ margin: "0 0 24px", fontSize: 19, fontWeight: 700, color: "#f8fafc", textAlign: "center" }}>Admin Panel</h1>
        <form method="post" action="/admin">
          <input type="password" name="password" placeholder="Yönetici şifresi" required autoFocus
            style={{ ...css.input, width: "100%", boxSizing: "border-box", marginBottom: 12, fontSize: 14, padding: "10px 14px" }} />
          {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
          <button type="submit" style={{ width: "100%", background: "#6366f1", border: "none", borderRadius: 8, padding: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Giriş
          </button>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, isRevenue, critical }: { label: string; value: number; isRevenue?: boolean; critical?: boolean }) {
  const formatted = isRevenue
    ? `$${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : value.toLocaleString("tr-TR");
  return (
    <div style={{ ...css.statCard, ...(critical && value > 0 ? { borderColor: "#f59e0b" } : {}) }}>
      <div style={css.statLabel}>{label}</div>
      <div style={{ ...css.statValue, ...(critical && value > 0 ? { color: "#f59e0b" } : {}) }}>{formatted}</div>
    </div>
  );
}

function ShopsTab({ shops }: { shops: ShopRow[] }) {
  const [bonusShop, setBonusShop] = React.useState<string | null>(null);

  // Sort shops by ai_this_month desc to find top 3
  const sortedByAi = [...shops].sort((a, b) => b.ai_this_month - a.ai_this_month);
  const top3AiShops = new Set(sortedByAi.slice(0, 3).filter((s) => s.ai_this_month > 0).map((s) => s.shop));

  return (
    <div>
      <div style={css.card}>
        <table style={css.table}>
          <thead>
            <tr>
              {["Mağaza", "Plan", "Durum", "Top. Sipariş", "Bu Ay", "Gelir", "AI/Ay", "BG/Ay", "Drive", "Son Sipariş", "Bonus"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr><td colSpan={11} style={{ ...css.td, textAlign: "center", color: "#475569", padding: 32 }}>Kayıt bulunamadı</td></tr>
            )}
            {shops.map((s) => {
              const revenue = parseFloat(s.total_revenue ?? "0");
              const isTopAi = top3AiShops.has(s.shop);
              return (
                <React.Fragment key={s.shop}>
                  <tr
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#162032")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td style={css.td}>
                      <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{s.shop.replace(".myshopify.com", "")}</span>
                      <br /><span style={{ fontSize: 11, color: "#475569" }}>{s.shop}</span>
                    </td>
                    <td style={css.td}><span style={css.badge(PLAN_COLOR[s.plan_key] ?? "#6b7280")}>{s.plan_key}</span></td>
                    <td style={css.td}><span style={css.badge(STATUS_COLOR[s.subscription_status] ?? "#6b7280")}>{s.subscription_status}</span></td>
                    <td style={{ ...css.td, fontWeight: 700, color: "#f1f5f9" }}>{s.total_orders}</td>
                    <td style={css.td}>{s.orders_this_month}</td>
                    <td style={{ ...css.td, color: "#10b981", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                      {revenue.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s.currency}
                    </td>
                    <td style={css.td}>
                      {s.ai_this_month}
                      {isTopAi && (
                        <span style={{ marginLeft: 4, display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: "#f59e0b22", color: "#f59e0b" }}>
                          TOP
                        </span>
                      )}
                    </td>
                    <td style={css.td}>{s.bg_this_month}</td>
                    <td style={css.td}>
                      {s.drive_connected
                        ? <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>
                        : <span style={{ color: "#475569" }}>—</span>}
                    </td>
                    <td style={{ ...css.td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {s.last_order_at ? new Date(s.last_order_at).toLocaleDateString("tr-TR") : "—"}
                    </td>
                    <td style={css.td}>
                      <button
                        onClick={() => setBonusShop(bonusShop === s.shop ? null : s.shop)}
                        style={{ background: bonusShop === s.shop ? "#334155" : "transparent", border: "1px solid #334155", borderRadius: 6, padding: "3px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}
                      >
                        {bonusShop === s.shop ? "İptal" : "+ Bonus"}
                      </button>
                    </td>
                  </tr>

                  {bonusShop === s.shop && (
                    <tr style={{ background: "#162032" }}>
                      <td colSpan={11} style={{ padding: "12px 14px" }}>
                        <form method="post" action="/admin" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <input type="hidden" name="intent" value="setBonus" />
                          <input type="hidden" name="shop" value={s.shop} />
                          <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600 }}>{s.shop.replace(".myshopify.com", "")} — Ekstra Kota:</span>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#cbd5e1", fontSize: 13 }}>
                            AI Bonus
                            <input type="number" name="aiQuotaBonus" min="0" defaultValue="0" style={{ ...css.input, width: 80, padding: "4px 8px" }} />
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#cbd5e1", fontSize: 13 }}>
                            BG Bonus
                            <input type="number" name="bgQuotaBonus" min="0" defaultValue="0" style={{ ...css.input, width: 80, padding: "4px 8px" }} />
                          </label>
                          <button type="submit" style={{ background: "#6366f1", border: "none", borderRadius: 6, padding: "6px 16px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            Kaydet
                          </button>
                          <span style={{ color: "#64748b", fontSize: 12 }}>0 girmek mevcut bonusu sıfırlar</span>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiLogsTab({ logs, count, page, filterShop }: {
  logs: AiPromptLog[];
  count: number; page: number; filterShop: string;
}) {
  const totalPages = Math.ceil(count / PAGE_SIZE);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <Form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="hidden" name="tab" value="ai-logs" />
          <input type="text" name="shop" defaultValue={filterShop} placeholder="Mağazaya göre filtrele..."
            style={{ ...css.input, width: 260 }} />
          <button type="submit" style={css.btn}>Filtrele</button>
          {filterShop && <a href="/admin?tab=ai-logs" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>Temizle ✕</a>}
        </Form>
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>{count.toLocaleString("tr-TR")} kayıt</span>
      </div>

      <div style={css.card}>
        <table style={css.table}>
          <thead>
            <tr>
              {["Tarih", "Mağaza", "Kullanıcı Promptu", "Final Prompt", "Sonuç"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={5} style={{ ...css.td, textAlign: "center", color: "#475569", padding: 32 }}>Log kaydı yok</td></tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#162032")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td style={{ ...css.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                  {new Date(log.createdAt).toLocaleString("tr-TR")}
                </td>
                <td style={{ ...css.td, fontSize: 12 }}>
                  <a href={`/admin?tab=ai-logs&shop=${encodeURIComponent(log.shop)}`}
                    style={{ color: "#94a3b8", textDecoration: "none" }}>
                    {log.shop.replace(".myshopify.com", "")}
                  </a>
                </td>
                <td style={{ ...css.td, maxWidth: 240 }}>
                  <span title={log.userPrompt} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220, color: "#e2e8f0", fontWeight: 500 }}>
                    {log.userPrompt}
                  </span>
                </td>
                <td style={{ ...css.td, maxWidth: 320 }}>
                  <span title={log.finalPrompt} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300, color: "#64748b", fontSize: 12 }}>
                    {log.finalPrompt || "—"}
                  </span>
                </td>
                <td style={{ ...css.td, textAlign: "center" }}>
                  {log.success ? (
                    log.resultUrl
                      ? <a href={log.resultUrl} target="_blank" rel="noreferrer">
                          <img src={log.resultUrl} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: "1px solid #334155", display: "block" }} />
                        </a>
                      : <span style={{ color: "#10b981", fontSize: 18 }}>✓</span>
                  ) : (
                    <span title={log.errorMsg ?? ""} style={{ color: "#ef4444", fontSize: 18, cursor: "help" }}>✗</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", alignItems: "center" }}>
          {page > 0 && (
            <a href={`/admin?tab=ai-logs&page=${page - 1}${filterShop ? `&shop=${encodeURIComponent(filterShop)}` : ""}`}
              style={{ ...css.btn, textDecoration: "none", display: "inline-block" }}>← Önceki</a>
          )}
          <span style={{ fontSize: 13, color: "#64748b" }}>{page + 1} / {totalPages}</span>
          {page < totalPages - 1 && (
            <a href={`/admin?tab=ai-logs&page=${page + 1}${filterShop ? `&shop=${encodeURIComponent(filterShop)}` : ""}`}
              style={{ ...css.btn, textDecoration: "none", display: "inline-block" }}>Sonraki →</a>
          )}
        </div>
      )}
    </div>
  );
}

function SupportTab({ tickets }: { tickets: TicketRow[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div>
      <div style={css.card}>
        <table style={css.table}>
          <thead>
            <tr>
              {["ID", "Mağaza", "Konu", "Mesaj", "Durum", "Tarih", "İşlem"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", color: "#475569", padding: 32 }}>Destek talebi bulunamadı</td></tr>
            )}
            {tickets.map((t) => (
              <React.Fragment key={t.id}>
                <tr
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#162032")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = expanded === t.id ? "#162032" : "transparent")}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                >
                  <td style={{ ...css.td, fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
                    {t.id.slice(0, 12)}…
                  </td>
                  <td style={{ ...css.td, fontSize: 12 }}>
                    {t.shop.replace(".myshopify.com", "")}
                  </td>
                  <td style={{ ...css.td, fontWeight: 600, color: "#f1f5f9", maxWidth: 200 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.subject}
                    </span>
                  </td>
                  <td style={{ ...css.td, maxWidth: 240, color: "#94a3b8", fontSize: 12 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.message.length > 80 ? t.message.slice(0, 80) + "…" : t.message}
                    </span>
                  </td>
                  <td style={css.td}>
                    <span style={css.badge(TICKET_STATUS_COLOR[t.status] ?? "#6b7280")}>{t.status}</span>
                  </td>
                  <td style={{ ...css.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                    {new Date(t.created_at).toLocaleDateString("tr-TR")}
                  </td>
                  <td style={css.td}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{expanded === t.id ? "▲ Kapat" : "▼ Detay"}</span>
                  </td>
                </tr>

                {expanded === t.id && (
                  <tr style={{ background: "#162032" }}>
                    <td colSpan={7} style={{ padding: "16px 20px" }}>
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.8 }}>Mesaj</span>
                        <p style={{ margin: "6px 0 0", color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t.message}</p>
                      </div>

                      {t.admin_reply && (
                        <div style={{ marginBottom: 12, padding: "10px 14px", background: "#10b98110", border: "1px solid #10b98130", borderRadius: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.8 }}>Mevcut Yanıt</span>
                          <p style={{ margin: "6px 0 0", color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{t.admin_reply}</p>
                          {t.replied_at && (
                            <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>
                              {new Date(t.replied_at).toLocaleString("tr-TR")}
                            </span>
                          )}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
                        {t.status !== "closed" && (
                          <form method="post" action="/admin" style={{ flex: 1, minWidth: 300 }}>
                            <input type="hidden" name="intent" value="replyTicket" />
                            <input type="hidden" name="ticketId" value={t.id} />
                            <div style={{ marginBottom: 8 }}>
                              <label style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: 6 }}>Yanıt</label>
                              <textarea
                                name="reply"
                                rows={4}
                                placeholder="Yanıtınızı yazın..."
                                style={{ ...css.input, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
                              />
                            </div>
                            <button type="submit" style={{ background: "#6366f1", border: "none", borderRadius: 6, padding: "7px 18px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                              Yanıtla
                            </button>
                          </form>
                        )}

                        {t.status !== "closed" && (
                          <form method="post" action="/admin" style={{ display: "flex", alignItems: "flex-end" }}>
                            <input type="hidden" name="intent" value="closeTicket" />
                            <input type="hidden" name="ticketId" value={t.id} />
                            <button type="submit" style={{ background: "#1e293b", border: "1px solid #475569", borderRadius: 6, padding: "7px 18px", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>
                              Kapat
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Admin() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (!data.authed) {
    return <LoginPage error={(actionData as { error?: string } | undefined)?.error} />;
  }

  const gs = data.globalStats;
  const openCount = data.openCount ?? 0;

  return (
    <div style={css.page}>
      <header style={css.header}>
        <span style={css.logo}>Admin Panel</span>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          <a href="/admin?tab=shops" style={css.navLink(data.tab === "shops")}>Mağazalar</a>
          <a href="/admin?tab=ai-logs" style={css.navLink(data.tab === "ai-logs")}>AI Logları</a>
          <a href="/admin?tab=support" style={css.navLink(data.tab === "support")}>
            Destek{openCount > 0 && (
              <span style={{ marginLeft: 5, display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "#f59e0b", color: "#0f172a" }}>
                {openCount}
              </span>
            )}
          </a>
        </nav>
        <form method="post" action="/admin">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13 }}>
            Çıkış
          </button>
        </form>
      </header>

      <main style={css.main}>
        {gs && (
          <div style={css.statsGrid}>
            <StatCard label="Toplam Mağaza" value={gs.totalShops} />
            <StatCard label="Aktif Abonelik" value={gs.activeSubs} />
            <StatCard label="Toplam Gelir" value={gs.totalRevenue} isRevenue />
            <StatCard label="Toplam Sipariş" value={gs.totalOrders} />
            <StatCard label="AI Üretim" value={gs.totalAiGens} />
            <StatCard label="BG Kaldırma" value={gs.totalBgRemovals} />
            <StatCard label="Açık Talepler" value={gs.openTickets} critical />
            <StatCard label="Kredi Satışı" value={gs.totalCreditSales} />
          </div>
        )}

        {data.tab === "shops" && <ShopsTab shops={data.shops as ShopRow[]} />}
        {data.tab === "ai-logs" && (
          <AiLogsTab
            logs={data.aiLogs as AiPromptLog[]}
            count={data.aiLogsCount}
            page={data.aiLogsPage}
            filterShop={data.filterShop}
          />
        )}
        {data.tab === "support" && <SupportTab tickets={data.tickets as TicketRow[]} />}
      </main>
    </div>
  );
}
