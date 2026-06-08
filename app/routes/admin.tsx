import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useActionData } from "@remix-run/react";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "~/lib/db.server";
import { PLANS } from "~/lib/plans";
import { getAiPromptLogs, getAiPromptLogsCount, type AiPromptLog } from "~/models/ai-prompt-logs.server";
import { saveShopSettings, getShopSettings } from "~/models/shop-settings.server";
import React from "react";

const AUTH_COOKIE = "panel_auth";
const PARTNER_COOKIE = "partner_auth";
const PAGE_SIZE = 100;
const DEFAULT_COMMISSION_RATE = 20;

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

function getCookieValue(request: Request, name: string): string {
  const cookie = request.headers.get("Cookie") ?? "";
  const prefix = `${name}=`;
  const pair = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : "";
}

function clearAuthHeaders() {
  const headers = new Headers();
  headers.append("Set-Cookie", `${AUTH_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly`);
  headers.append("Set-Cookie", `${PARTNER_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly`);
  return headers;
}

let partnerSchemaReady = false;

async function ensurePartnerSchema() {
  if (partnerSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      commission_rate NUMERIC NOT NULL DEFAULT 20,
      password_hash TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`);
  await query(`
    CREATE TABLE IF NOT EXISTS partner_shop_assignments (
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (partner_id, shop)
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_shop_assignments_shop_unique
      ON partner_shop_assignments (shop)
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS partner_assignment_requests (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      shop TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_assignment_requests_pending_unique
      ON partner_assignment_requests (partner_id, shop)
      WHERE status = 'pending'
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS partner_assignment_requests_status_idx
      ON partner_assignment_requests (status, created_at DESC)
  `);
  partnerSchemaReady = true;
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function normalizeShopInput(value: string) {
  let shop = value.trim().toLowerCase();
  shop = shop.replace(/^https?:\/\//, "").split("/")[0].split("?")[0];
  if (shop && !shop.includes(".")) shop = `${shop}.myshopify.com`;
  return shop;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(hash, "hex");
  const expected = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface ShopRow {
  shop: string;
  plan_key: string;
  subscription_status: string;
  total_orders: number;
  orders_this_month: number;
  today_design_users: number;
  today_bg_removed_users: number;
  today_cart_add_users: number;
  today_cart_abandoned_users: number;
  today_purchased_users: number;
  today_purchased_orders: number;
  total_revenue: string;
  currency: string;
  ai_this_month: number;
  bg_this_month: number;
  drive_connected: boolean;
  last_order_at: string | null;
}

interface PartnerRow {
  id: string;
  email: string;
  name: string;
  commission_rate: string;
  password_hash: string;
  is_active: boolean;
  assigned_shops: number;
  active_assigned_shops: number;
  monthly_plan_revenue: string;
  monthly_commission: string;
  created_at: string;
  updated_at: string;
}

interface PartnerAssignment {
  shop: string;
  partner_id: string;
  partner_email: string;
  partner_name: string;
  commission_rate: string;
}

interface PartnerAssignmentRequest {
  id: string;
  partner_id: string;
  partner_email: string;
  partner_name: string;
  shop: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

interface PartnerCommissionSummary {
  assignedShops: number;
  activeAssignedShops: number;
  monthlyPlanRevenue: number;
  monthlyCommission: number;
}

type PartnerView = Omit<PartnerRow, "password_hash">;

function publicPartner(partner: PartnerRow) {
  const { password_hash, ...safePartner } = partner;
  return safePartner;
}

interface TicketRow {
  id: string;
  shop: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category: string;
  admin_reply: string | null;
  messages: { role: "merchant" | "admin"; text: string; at: string }[];
  created_at: string;
  updated_at: string;
  replied_at: string | null;
}

async function getShopsData() {
  const month = new Date().toISOString().slice(0, 7);
  const result = await query<ShopRow>(`
    WITH shop_list AS (
      SELECT DISTINCT shop FROM shopify_sessions WHERE shop != ''
      UNION SELECT DISTINCT shop FROM orders WHERE shop != ''
      UNION SELECT DISTINCT shop FROM analytics_events WHERE shop != ''
      UNION SELECT DISTINCT shop FROM shop_subscriptions WHERE shop != ''
    ),
    bounds AS (
      SELECT
        (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS day_start,
        ((date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') + interval '1 day') AT TIME ZONE 'Europe/Istanbul') AS day_end
    ),
    today_design AS (
      SELECT shop, COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), design_token, id))::int AS count
      FROM analytics_events, bounds
      WHERE event_type = 'design_activity'
        AND created_at >= bounds.day_start AND created_at < bounds.day_end
      GROUP BY shop
    ),
    today_bg AS (
      SELECT shop, COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id))::int AS count
      FROM analytics_events, bounds
      WHERE event_type = 'background_removed'
        AND created_at >= bounds.day_start AND created_at < bounds.day_end
      GROUP BY shop
    ),
    today_cart AS (
      SELECT shop, COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), design_token, id))::int AS count
      FROM analytics_events, bounds
      WHERE event_type = 'cart_add'
        AND created_at >= bounds.day_start AND created_at < bounds.day_end
      GROUP BY shop
    ),
    today_cart_abandoned AS (
      SELECT e.shop, COUNT(DISTINCT COALESCE(NULLIF(e.session_id, ''), e.design_token, e.id))::int AS count
      FROM analytics_events e, bounds
      WHERE e.event_type = 'cart_add'
        AND e.created_at >= bounds.day_start AND e.created_at < bounds.day_end
        AND NOT EXISTS (
          SELECT 1 FROM orders o
          WHERE o.shop = e.shop
            AND o.design_token = e.design_token
            AND o.design_token != ''
            AND o.production_status != 'cancelled'
        )
      GROUP BY e.shop
    ),
    today_purchases AS (
      SELECT
        o.shop,
        COUNT(DISTINCT COALESCE(NULLIF(d.session_id, ''), NULLIF(o.customer_email, ''), o.shopify_order_id))::int AS users,
        COUNT(DISTINCT o.shopify_order_id)::int AS orders
      FROM orders o
      LEFT JOIN designs d ON d.shop = o.shop AND d.token = o.design_token
      CROSS JOIN bounds
      WHERE o.design_token != '' AND o.production_status != 'cancelled'
        AND o.created_at >= bounds.day_start AND o.created_at < bounds.day_end
      GROUP BY o.shop
    )
    SELECT
      sl.shop,
      COALESCE(ss.plan_key, '-') as plan_key,
      COALESCE(ss.subscription_status, 'none') as subscription_status,
      COUNT(DISTINCT o.shopify_order_id)::int as total_orders,
      COUNT(DISTINCT CASE WHEN o.created_at >= date_trunc('month', now()) THEN o.shopify_order_id END)::int as orders_this_month,
      COALESCE(td.count, 0) as today_design_users,
      COALESCE(tbg.count, 0) as today_bg_removed_users,
      COALESCE(tc.count, 0) as today_cart_add_users,
      COALESCE(tca.count, 0) as today_cart_abandoned_users,
      COALESCE(tp.users, 0) as today_purchased_users,
      COALESCE(tp.orders, 0) as today_purchased_orders,
      COALESCE(SUM(CASE WHEN o.design_token != '' AND o.production_status != 'cancelled' THEN o.line_total_price ELSE 0 END), 0)::numeric as total_revenue,
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
    LEFT JOIN today_design td ON td.shop = sl.shop
    LEFT JOIN today_bg tbg ON tbg.shop = sl.shop
    LEFT JOIN today_cart tc ON tc.shop = sl.shop
    LEFT JOIN today_cart_abandoned tca ON tca.shop = sl.shop
    LEFT JOIN today_purchases tp ON tp.shop = sl.shop
    GROUP BY sl.shop, ss.plan_key, ss.subscription_status, ai.count, bg.count, sgd.shop,
      td.count, tbg.count, tc.count, tca.count, tp.users, tp.orders
    ORDER BY total_orders DESC, sl.shop
  `, [month]);
  return result.rows;
}

function planMonthlyPrice(planKey: string): number {
  const plan = PLANS[planKey as keyof typeof PLANS];
  return typeof plan?.price === "number" ? plan.price : 0;
}

function isCommissionableShop(shop: ShopRow): boolean {
  return shop.subscription_status === "active" && planMonthlyPrice(shop.plan_key) > 0;
}

function commissionSummary(shops: ShopRow[], rate: number): PartnerCommissionSummary {
  const monthlyPlanRevenue = shops.reduce((sum, shop) => sum + (isCommissionableShop(shop) ? planMonthlyPrice(shop.plan_key) : 0), 0);
  return {
    assignedShops: shops.length,
    activeAssignedShops: shops.filter(isCommissionableShop).length,
    monthlyPlanRevenue,
    monthlyCommission: monthlyPlanRevenue * (rate / 100),
  };
}

async function getPartnerFromRequest(request: Request): Promise<PartnerRow | null> {
  const id = getCookieValue(request, PARTNER_COOKIE);
  if (!id) return null;
  await ensurePartnerSchema();
  const result = await query<PartnerRow>(
    `SELECT
       p.id, p.email, p.name, p.commission_rate::text, p.password_hash, p.is_active,
       0::int as assigned_shops,
       0::int as active_assigned_shops,
       '0'::text as monthly_plan_revenue,
       '0'::text as monthly_commission,
       p.created_at, p.updated_at
     FROM partners p
     WHERE p.id = $1 AND p.is_active = TRUE
     LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function getPartnerAssignments(partnerId?: string) {
  await ensurePartnerSchema();
  const params: string[] = [];
  const where = partnerId ? "WHERE psa.partner_id = $1" : "";
  if (partnerId) params.push(partnerId);
  const result = await query<PartnerAssignment>(
    `SELECT
       psa.shop,
       p.id as partner_id,
       p.email as partner_email,
       p.name as partner_name,
       p.commission_rate::text
     FROM partner_shop_assignments psa
     JOIN partners p ON p.id = psa.partner_id
     ${where}
     ORDER BY psa.created_at DESC`,
    params,
  );
  return result.rows;
}

async function getPartnerAssignmentRequests(partnerId?: string) {
  await ensurePartnerSchema();
  const params: string[] = [];
  const where = partnerId ? "WHERE par.partner_id = $1" : "";
  if (partnerId) params.push(partnerId);
  const result = await query<PartnerAssignmentRequest>(
    `SELECT
       par.id,
       par.partner_id,
       p.email as partner_email,
       p.name as partner_name,
       par.shop,
       par.message,
       par.status,
       par.created_at,
       par.updated_at,
       par.reviewed_at
     FROM partner_assignment_requests par
     JOIN partners p ON p.id = par.partner_id
     ${where}
     ORDER BY
       CASE par.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       par.created_at DESC
     LIMIT 200`,
    params,
  );
  return result.rows;
}

async function getPartnersData(shops: ShopRow[]) {
  await ensurePartnerSchema();
  const [partnersResult, assignments] = await Promise.all([
    query<PartnerRow>(
      `SELECT
         p.id, p.email, p.name, p.commission_rate::text, p.password_hash, p.is_active,
         COUNT(psa.shop)::int as assigned_shops,
         0::int as active_assigned_shops,
         '0'::text as monthly_plan_revenue,
         '0'::text as monthly_commission,
         p.created_at, p.updated_at
       FROM partners p
       LEFT JOIN partner_shop_assignments psa ON psa.partner_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
    ),
    getPartnerAssignments(),
  ]);
  const shopsByPartner = new Map<string, ShopRow[]>();
  for (const assignment of assignments) {
    const shop = shops.find((s) => s.shop === assignment.shop);
    if (!shop) continue;
    const list = shopsByPartner.get(assignment.partner_id) ?? [];
    list.push(shop);
    shopsByPartner.set(assignment.partner_id, list);
  }
  return {
    partners: partnersResult.rows.map((partner) => {
      const rate = num(partner.commission_rate);
      const summary = commissionSummary(shopsByPartner.get(partner.id) ?? [], rate);
      return {
        ...partner,
        assigned_shops: summary.assignedShops,
        active_assigned_shops: summary.activeAssignedShops,
        monthly_plan_revenue: summary.monthlyPlanRevenue.toFixed(2),
        monthly_commission: summary.monthlyCommission.toFixed(2),
      };
    }),
    assignments,
  };
}

async function getGlobalStats() {
  const result = await query<{
    total_shops: string;
    total_orders: string;
    total_revenue: string;
    total_ai_gens: string;
    total_bg_removals: string;
    today_design_users: string;
    today_bg_removed_users: string;
    today_cart_add_users: string;
    today_cart_abandoned_users: string;
    today_purchased_users: string;
    today_purchased_orders: string;
    active_subs: string;
    open_tickets: string;
    active_bonus_credits: string;
    total_credit_sales: string;
  }>(`
    WITH bounds AS (
      SELECT
        (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS day_start,
        ((date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') + interval '1 day') AT TIME ZONE 'Europe/Istanbul') AS day_end
    )
    SELECT
      (SELECT COUNT(DISTINCT shop)::text FROM shopify_sessions WHERE shop != '') as total_shops,
      (SELECT COUNT(*)::text FROM orders) as total_orders,
      (SELECT COALESCE(SUM(line_total_price), 0)::text FROM orders WHERE design_token != '' AND production_status != 'cancelled') as total_revenue,
      (SELECT COALESCE(SUM(count), 0)::text FROM ai_generation_usage) as total_ai_gens,
      (SELECT COALESCE(SUM(count), 0)::text FROM bg_removal_usage) as total_bg_removals,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), design_token, id))::text
       FROM analytics_events, bounds
       WHERE event_type = 'design_activity' AND created_at >= bounds.day_start AND created_at < bounds.day_end) as today_design_users,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id))::text
       FROM analytics_events, bounds
       WHERE event_type = 'background_removed' AND created_at >= bounds.day_start AND created_at < bounds.day_end) as today_bg_removed_users,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), design_token, id))::text
       FROM analytics_events, bounds
       WHERE event_type = 'cart_add' AND created_at >= bounds.day_start AND created_at < bounds.day_end) as today_cart_add_users,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(e.session_id, ''), e.design_token, e.id))::text
       FROM analytics_events e, bounds
       WHERE e.event_type = 'cart_add' AND e.created_at >= bounds.day_start AND e.created_at < bounds.day_end
         AND NOT EXISTS (
           SELECT 1 FROM orders o
           WHERE o.shop = e.shop AND o.design_token = e.design_token AND o.design_token != '' AND o.production_status != 'cancelled'
         )) as today_cart_abandoned_users,
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(d.session_id, ''), NULLIF(o.customer_email, ''), o.shopify_order_id))::text
       FROM orders o
       LEFT JOIN designs d ON d.shop = o.shop AND d.token = o.design_token
       CROSS JOIN bounds
       WHERE o.design_token != '' AND o.production_status != 'cancelled'
         AND o.created_at >= bounds.day_start AND o.created_at < bounds.day_end) as today_purchased_users,
      (SELECT COUNT(DISTINCT o.shopify_order_id)::text
       FROM orders o, bounds
       WHERE o.design_token != '' AND o.production_status != 'cancelled'
         AND o.created_at >= bounds.day_start AND o.created_at < bounds.day_end) as today_purchased_orders,
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
    todayDesignUsers: parseInt(r?.today_design_users ?? "0", 10),
    todayBgRemovedUsers: parseInt(r?.today_bg_removed_users ?? "0", 10),
    todayCartAddUsers: parseInt(r?.today_cart_add_users ?? "0", 10),
    todayCartAbandonedUsers: parseInt(r?.today_cart_abandoned_users ?? "0", 10),
    todayPurchasedUsers: parseInt(r?.today_purchased_users ?? "0", 10),
    todayPurchasedOrders: parseInt(r?.today_purchased_orders ?? "0", 10),
    activeSubs: parseInt(r?.active_subs ?? "0", 10),
    openTickets: parseInt(r?.open_tickets ?? "0", 10),
    activeBonusCredits: parseInt(r?.active_bonus_credits ?? "0", 10),
    totalCreditSales: parseInt(r?.total_credit_sales ?? "0", 10),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const adminAuthed = isAuthed(request);
  const partner = adminAuthed ? null : await getPartnerFromRequest(request);

  if (!adminAuthed && !partner) {
    return json({
      authed: false, role: "guest" as const, tab: "login",
      shops: [] as ShopRow[], globalStats: null,
      aiLogs: [] as AiPromptLog[], aiLogsCount: 0, aiLogsPage: 0, filterShop: "",
      tickets: [] as TicketRow[], openCount: 0, supportStatus: "all", supportSearch: "",
      partners: [], assignments: [], partnerRequests: [], currentPartner: null, partnerSummary: null,
    });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "shops";
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const filterShop = url.searchParams.get("shop") ?? "";

  if (partner) {
    const [allShops, assignments, partnerRequests] = await Promise.all([
      getShopsData(),
      getPartnerAssignments(partner.id),
      getPartnerAssignmentRequests(partner.id),
    ]);
    const assigned = new Set(assignments.map((a) => a.shop));
    const shops = allShops.filter((shop) => assigned.has(shop.shop));
    return json({
      authed: true,
      role: "partner" as const,
      tab: "shops",
      shops,
      globalStats: null,
      aiLogs: [] as AiPromptLog[],
      aiLogsCount: 0,
      aiLogsPage: 0,
      filterShop: "",
      tickets: [] as TicketRow[],
      openCount: 0,
      supportStatus: "all",
      supportSearch: "",
      partners: [],
      assignments,
      partnerRequests,
      currentPartner: publicPartner(partner),
      partnerSummary: commissionSummary(shops, num(partner.commission_rate)),
    });
  }

  if (tab === "ai-logs") {
    const [aiLogs, aiLogsCount, globalStats] = await Promise.all([
      getAiPromptLogs({ shop: filterShop || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
      getAiPromptLogsCount(filterShop || undefined),
      getGlobalStats(),
    ]);
    return json({
      authed: true, role: "admin" as const, tab, shops: [] as ShopRow[], globalStats, aiLogs, aiLogsCount, aiLogsPage: page, filterShop,
      tickets: [] as TicketRow[], openCount: 0, supportStatus: "all", supportSearch: "",
      partners: [], assignments: [], partnerRequests: [], currentPartner: null, partnerSummary: null,
    });
  }

  if (tab === "support") {
    const supportStatus = url.searchParams.get("status") ?? "all";
    const supportSearch = (url.searchParams.get("q") ?? "").trim();
    const where: string[] = [];
    const params: string[] = [];
    if (["open", "answered", "closed"].includes(supportStatus)) {
      params.push(supportStatus);
      where.push(`status = $${params.length}`);
    }
    if (supportSearch) {
      params.push(`%${supportSearch}%`);
      where.push(`(shop ILIKE $${params.length} OR subject ILIKE $${params.length} OR message ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [ticketsResult, globalStats] = await Promise.all([
      query<TicketRow>(
        `SELECT id, shop, subject, message, status, priority, category, admin_reply, messages, created_at, updated_at, replied_at
         FROM support_tickets ${whereSql} ORDER BY updated_at DESC LIMIT 100`,
        params,
      ),
      getGlobalStats(),
    ]);
    const tickets = ticketsResult.rows;
    const openCount = tickets.filter((t) => t.status === "open").length;
    return json({
      authed: true, role: "admin" as const, tab, shops: [] as ShopRow[], globalStats,
      aiLogs: [] as AiPromptLog[], aiLogsCount: 0, aiLogsPage: 0, filterShop: "",
      tickets, openCount, supportStatus, supportSearch,
      partners: [], assignments: [], partnerRequests: [], currentPartner: null, partnerSummary: null,
    });
  }

  const [shops, globalStats] = await Promise.all([getShopsData(), getGlobalStats()]);
  const { partners, assignments } = await getPartnersData(shops);
  const partnerRequests = await getPartnerAssignmentRequests();
  return json({
    authed: true,
    role: "admin" as const,
    tab: tab === "partners" ? "partners" : "shops",
    shops,
    globalStats,
    aiLogs: [] as AiPromptLog[],
    aiLogsCount: 0,
    aiLogsPage: 0,
    filterShop: "",
    tickets: [] as TicketRow[],
    openCount: 0,
    supportStatus: "all",
    supportSearch: "",
    partners: partners.map(publicPartner),
    assignments,
    partnerRequests,
    currentPartner: null,
    partnerSummary: null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "logout") {
    return redirect("/admin", {
      headers: clearAuthHeaders(),
    });
  }

  if (intent === "partnerLogin") {
    await ensurePartnerSchema();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("partnerPassword") ?? "");
    const result = await query<PartnerRow>(
      `SELECT
         p.id, p.email, p.name, p.commission_rate::text, p.password_hash, p.is_active,
         0::int as assigned_shops,
         0::int as active_assigned_shops,
         '0'::text as monthly_plan_revenue,
         '0'::text as monthly_commission,
         p.created_at, p.updated_at
       FROM partners p
       WHERE p.email = $1 AND p.is_active = TRUE
       LIMIT 1`,
      [email],
    );
    const partner = result.rows[0];
    if (!partner || !verifyPassword(password, partner.password_hash)) {
      return json({ error: "Hatalı e-posta veya şifre" });
    }
    return redirect("/admin", {
      headers: {
        "Set-Cookie": `${PARTNER_COOKIE}=${encodeURIComponent(partner.id)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 8}`,
      },
    });
  }

  if (intent === "savePartner") {
    if (!isAuthed(request)) return redirect("/admin");
    await ensurePartnerSchema();
    const id = String(form.get("partnerId") ?? "");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("partnerPassword") ?? "");
    const commissionRate = Math.max(0, Math.min(100, num(String(form.get("commissionRate") ?? DEFAULT_COMMISSION_RATE))));
    const isActive = form.get("isActive") === "on";

    if (email) {
      if (id) {
        if (password) {
          await query(
            `UPDATE partners
             SET email = $2, name = $3, commission_rate = $4, password_hash = $5, is_active = $6, updated_at = now()
             WHERE id = $1`,
            [id, email, name, commissionRate, hashPassword(password), isActive],
          );
        } else {
          await query(
            `UPDATE partners
             SET email = $2, name = $3, commission_rate = $4, is_active = $5, updated_at = now()
             WHERE id = $1`,
            [id, email, name, commissionRate, isActive],
          );
        }
      } else if (password) {
        await query(
          `INSERT INTO partners (id, email, name, commission_rate, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name,
             commission_rate = EXCLUDED.commission_rate,
             password_hash = EXCLUDED.password_hash,
             is_active = TRUE,
             updated_at = now()`,
          [newId("partner"), email, name, commissionRate, hashPassword(password)],
        );
      }
    }
    return redirect("/admin?tab=partners");
  }

  if (intent === "assignPartner") {
    if (!isAuthed(request)) return redirect("/admin");
    await ensurePartnerSchema();
    const shop = String(form.get("shop") ?? "").trim();
    const partnerId = String(form.get("partnerId") ?? "").trim();
    if (shop) {
      await query(`DELETE FROM partner_shop_assignments WHERE shop = $1`, [shop]);
      if (partnerId) {
        await query(
          `INSERT INTO partner_shop_assignments (partner_id, shop)
           VALUES ($1, $2)
           ON CONFLICT (partner_id, shop) DO NOTHING`,
          [partnerId, shop],
        );
      }
    }
    return redirect("/admin?tab=partners");
  }

  if (intent === "requestAssignment") {
    const partner = await getPartnerFromRequest(request);
    if (!partner) return redirect("/admin");
    await ensurePartnerSchema();
    const shop = normalizeShopInput(String(form.get("shop") ?? ""));
    const message = String(form.get("message") ?? "").trim().slice(0, 500);
    if (shop) {
      const existingAssignment = await query(
        `SELECT 1 FROM partner_shop_assignments WHERE partner_id = $1 AND shop = $2 LIMIT 1`,
        [partner.id, shop],
      );
      if (existingAssignment.rowCount === 0) {
        await query(
          `INSERT INTO partner_assignment_requests (id, partner_id, shop, message)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (partner_id, shop) WHERE status = 'pending'
           DO UPDATE SET message = EXCLUDED.message, updated_at = now()`,
          [newId("partner_req"), partner.id, shop, message],
        );
      }
    }
    return redirect("/admin?tab=shops");
  }

  if (intent === "reviewAssignmentRequest") {
    if (!isAuthed(request)) return redirect("/admin");
    await ensurePartnerSchema();
    const requestId = String(form.get("requestId") ?? "");
    const decision = String(form.get("decision") ?? "");
    const result = await query<PartnerAssignmentRequest>(
      `SELECT
         par.id,
         par.partner_id,
         p.email as partner_email,
         p.name as partner_name,
         par.shop,
         par.message,
         par.status,
         par.created_at,
         par.updated_at,
         par.reviewed_at
       FROM partner_assignment_requests par
       JOIN partners p ON p.id = par.partner_id
       WHERE par.id = $1 AND par.status = 'pending'
       LIMIT 1`,
      [requestId],
    );
    const pendingRequest = result.rows[0];
    if (pendingRequest) {
      if (decision === "approve") {
        await query(`DELETE FROM partner_shop_assignments WHERE shop = $1`, [pendingRequest.shop]);
        await query(
          `INSERT INTO partner_shop_assignments (partner_id, shop)
           VALUES ($1, $2)
           ON CONFLICT (partner_id, shop) DO NOTHING`,
          [pendingRequest.partner_id, pendingRequest.shop],
        );
        await query(
          `UPDATE partner_assignment_requests
           SET status = 'approved', reviewed_at = now(), updated_at = now()
           WHERE id = $1`,
          [pendingRequest.id],
        );
      } else if (decision === "reject") {
        await query(
          `UPDATE partner_assignment_requests
           SET status = 'rejected', reviewed_at = now(), updated_at = now()
           WHERE id = $1`,
          [pendingRequest.id],
        );
      }
    }
    return redirect("/admin?tab=partners");
  }

  if (intent === "setBonus") {
    if (!isAuthed(request)) return redirect("/admin");
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
           SET admin_reply = $2,
               status = 'answered',
               replied_at = now(),
               updated_at = now(),
               last_admin_reply_at = now(),
               messages = messages || $3::jsonb
           WHERE id = $1`,
          [ticketId, reply.trim(), adminMsg],
        );
      }
    }
    return redirect("/admin?tab=support");
  }

  if (intent === "reopenTicket") {
    if (isAuthed(request)) {
      const ticketId = form.get("ticketId") as string;
      if (ticketId) {
        await query(
          `UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1`,
          [ticketId],
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
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, padding: "34px 38px", width: 380 }}>
        <div style={{ fontSize: 13, textAlign: "center", marginBottom: 6, color: "#818cf8", fontWeight: 800, letterSpacing: 1 }}>PRINTLAB</div>
        <h1 style={{ margin: "0 0 24px", fontSize: 19, fontWeight: 700, color: "#f8fafc", textAlign: "center" }}>Admin Panel</h1>
        <form method="post" action="/admin">
          <input type="password" name="password" placeholder="Yönetici şifresi" required autoFocus
            style={{ ...css.input, width: "100%", boxSizing: "border-box", marginBottom: 12, fontSize: 14, padding: "10px 14px" }} />
          {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
          <button type="submit" style={{ width: "100%", background: "#6366f1", border: "none", borderRadius: 8, padding: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Giriş
          </button>
        </form>
        <div style={{ height: 1, background: "#334155", margin: "22px 0" }} />
        <form method="post" action="/admin" style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="intent" value="partnerLogin" />
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Partner girişi</div>
          <input type="email" name="email" placeholder="Partner e-posta" required
            style={{ ...css.input, width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 14px" }} />
          <input type="password" name="partnerPassword" placeholder="Partner şifre" required
            style={{ ...css.input, width: "100%", boxSizing: "border-box", fontSize: 14, padding: "10px 14px" }} />
          <button type="submit" style={{ width: "100%", background: "#0ea5e9", border: "none", borderRadius: 8, padding: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Partner olarak giriş
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

function TinyMetric({ value, tone }: { value: number; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "#10b981" : tone === "warn" && value > 0 ? "#f59e0b" : "#cbd5e1";
  return (
    <span style={{ fontWeight: 700, color }}>
      {Number(value ?? 0).toLocaleString("tr-TR")}
    </span>
  );
}

function num(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function shopHandle(shop: string): string {
  return shop.replace(".myshopify.com", "");
}

function shopPerformanceScore(shop: ShopRow): number {
  const cartRate = pct(shop.today_cart_add_users, shop.today_design_users);
  const purchaseRate = pct(shop.today_purchased_users, shop.today_cart_add_users);
  return Math.round(
    shop.today_purchased_users * 100 +
    shop.today_cart_add_users * 25 +
    shop.today_design_users * 10 +
    purchaseRate * 2 +
    cartRate -
    shop.today_cart_abandoned_users * 15
  );
}

function scoreTone(score: number): string {
  if (score >= 250) return "#10b981";
  if (score >= 75) return "#0ea5e9";
  if (score > 0) return "#f59e0b";
  return "#64748b";
}

function FunnelBar({ shop }: { shop: ShopRow }) {
  const max = Math.max(shop.today_design_users, shop.today_cart_add_users, shop.today_purchased_users, 1);
  const steps = [
    { label: "Tasarım", value: shop.today_design_users, color: "#818cf8" },
    { label: "Sepet", value: shop.today_cart_add_users, color: "#38bdf8" },
    { label: "Satın", value: shop.today_purchased_users, color: "#10b981" },
  ];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {steps.map((step) => (
        <div key={step.label} style={{ display: "grid", gridTemplateColumns: "76px 1fr 38px", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{step.label}</span>
          <div style={{ height: 8, background: "#0f172a", borderRadius: 999, overflow: "hidden", border: "1px solid #334155" }}>
            <div style={{ width: `${Math.max(3, Math.round((step.value / max) * 100))}%`, height: "100%", background: step.color }} />
          </div>
          <span style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 700, textAlign: "right" }}>{step.value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailMetric({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "#10b981" : tone === "warn" ? "#f59e0b" : "#f1f5f9";
  return (
    <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 800, marginTop: 5 }}>{value}</div>
      {sub && <div style={{ color: "#64748b", fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function moneyUsd(value: number | string) {
  return `$${num(value).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function requestStatusLabel(status: string) {
  return ({ pending: "Bekliyor", approved: "Onaylandı", rejected: "Reddedildi" } as Record<string, string>)[status] ?? status;
}

function requestStatusColor(status: string) {
  return ({ pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444" } as Record<string, string>)[status] ?? "#6b7280";
}

function ShopsTab({
  shops,
  readOnly = false,
  partnerSummary,
  partnerRequests = [],
}: {
  shops: ShopRow[];
  readOnly?: boolean;
  partnerSummary?: PartnerCommissionSummary | null;
  partnerRequests?: PartnerAssignmentRequest[];
}) {
  const [bonusShop, setBonusShop] = React.useState<string | null>(null);
  const rankedShops = React.useMemo(
    () => [...shops].sort((a, b) => shopPerformanceScore(b) - shopPerformanceScore(a) || b.today_purchased_users - a.today_purchased_users || b.total_orders - a.total_orders),
    [shops],
  );
  const [selectedShop, setSelectedShop] = React.useState<string>(rankedShops[0]?.shop ?? "");
  const selected = rankedShops.find((s) => s.shop === selectedShop) ?? rankedShops[0] ?? null;
  const best = rankedShops[0] ?? null;

  // Sort shops by ai_this_month desc to find top 3
  const sortedByAi = [...shops].sort((a, b) => b.ai_this_month - a.ai_this_month);
  const top3AiShops = new Set(sortedByAi.slice(0, 3).filter((s) => s.ai_this_month > 0).map((s) => s.shop));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {partnerSummary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <DetailMetric label="Atanmış mağaza" value={partnerSummary.assignedShops} />
          <DetailMetric label="Aktif paket" value={partnerSummary.activeAssignedShops} tone="good" />
          <DetailMetric label="Aylık paket tutarı" value={moneyUsd(partnerSummary.monthlyPlanRevenue)} tone="good" />
          <DetailMetric label="Aylık komisyon" value={moneyUsd(partnerSummary.monthlyCommission)} tone="good" />
        </div>
      )}

      {readOnly && (
        <section style={{ ...css.card, padding: 16, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 16 }}>Mağaza atama isteği</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Admin onayladığında mağaza bu panele ve komisyon hesabına eklenir.</p>
            </div>
            <span style={{ color: "#64748b", fontSize: 12 }}>{partnerRequests.filter((r) => r.status === "pending").length} bekleyen</span>
          </div>
          <form method="post" action="/admin" style={{ display: "grid", gridTemplateColumns: "minmax(220px,0.7fr) minmax(260px,1fr) auto", gap: 10, alignItems: "center" }}>
            <input type="hidden" name="intent" value="requestAssignment" />
            <input name="shop" placeholder="ornek-magaza veya ornek.myshopify.com" required style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            <input name="message" placeholder="Not (opsiyonel)" maxLength={500} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            <button type="submit" style={{ background: "#0ea5e9", border: "none", borderRadius: 6, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              İstek gönder
            </button>
          </form>
          {partnerRequests.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {partnerRequests.slice(0, 6).map((request) => (
                <div key={request.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) 100px 130px", gap: 10, alignItems: "center", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px" }}>
                  <span>
                    <span style={{ display: "block", color: "#f1f5f9", fontWeight: 700 }}>{shopHandle(request.shop)}</span>
                    {request.message && <span style={{ display: "block", color: "#64748b", fontSize: 12, marginTop: 2 }}>{request.message}</span>}
                  </span>
                  <span style={css.badge(requestStatusColor(request.status))}>{requestStatusLabel(request.status)}</span>
                  <span style={{ color: "#64748b", fontSize: 12, textAlign: "right" }}>{new Date(request.created_at).toLocaleDateString("tr-TR")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {best && (
        <div style={{ ...css.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "16px 18px" }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Bugünün en iyi mağazası</div>
            <div style={{ color: "#f8fafc", fontSize: 22, fontWeight: 800, marginTop: 4 }}>{shopHandle(best.shop)}</div>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div><TinyMetric value={shopPerformanceScore(best)} tone="good" /> <span style={{ color: "#64748b", fontSize: 12 }}>skor</span></div>
            <div><TinyMetric value={best.today_purchased_users} tone="good" /> <span style={{ color: "#64748b", fontSize: 12 }}>satın alan</span></div>
            <div><TinyMetric value={pct(best.today_purchased_users, best.today_cart_add_users)} tone="good" /> <span style={{ color: "#64748b", fontSize: 12 }}>sepet dönüşümü</span></div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(420px, 0.95fr) minmax(360px, 1.05fr)", gap: 16, alignItems: "start" }}>
        <div style={css.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 0 14px", borderBottom: "1px solid #334155", marginBottom: 4 }}>
            <div>
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 16 }}>Mağaza karşılaştırması</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Skora göre sıralı. Mağazaya basınca detay açılır.</p>
            </div>
            <span style={{ color: "#64748b", fontSize: 12 }}>{rankedShops.length} mağaza</span>
          </div>

          {rankedShops.length === 0 ? (
            <div style={{ color: "#64748b", padding: 32, textAlign: "center" }}>Kayıt bulunamadı</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {rankedShops.map((s, index) => {
                const selectedRow = selected?.shop === s.shop;
                const score = shopPerformanceScore(s);
                const cartRate = pct(s.today_cart_add_users, s.today_design_users);
                const purchaseRate = pct(s.today_purchased_users, s.today_cart_add_users);
                return (
                  <button
                    key={s.shop}
                    type="button"
                    onClick={() => setSelectedShop(s.shop)}
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "34px minmax(160px,1fr) 88px 88px 76px",
                      gap: 12,
                      alignItems: "center",
                      background: selectedRow ? "#162032" : "transparent",
                      border: selectedRow ? "1px solid #475569" : "1px solid transparent",
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: "#cbd5e1",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ color: scoreTone(score), fontWeight: 800, fontSize: 13 }}>#{index + 1}</span>
                    <span>
                      <span style={{ display: "block", color: "#f1f5f9", fontWeight: 700 }}>{shopHandle(s.shop)}</span>
                      <span style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 2 }}>
                        {s.plan_key} · {s.subscription_status}
                      </span>
                    </span>
                    <span>
                      <span style={{ display: "block", color: scoreTone(score), fontWeight: 800 }}>{score}</span>
                      <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>skor</span>
                    </span>
                    <span>
                      <span style={{ display: "block", color: "#f1f5f9", fontWeight: 800 }}>{purchaseRate}%</span>
                      <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>sepetten</span>
                    </span>
                    <span>
                      <span style={{ display: "block", color: "#f1f5f9", fontWeight: 800 }}>{cartRate}%</span>
                      <span style={{ display: "block", color: "#64748b", fontSize: 11 }}>tasarımdan</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div style={{ ...css.card, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #334155", background: "#162032" }}>
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 20 }}>{shopHandle(selected.shop)}</h2>
                  <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>{selected.shop}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: scoreTone(shopPerformanceScore(selected)), fontSize: 24, fontWeight: 900 }}>{shopPerformanceScore(selected)}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>performans skoru</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <span style={css.badge(PLAN_COLOR[selected.plan_key] ?? "#6b7280")}>{selected.plan_key}</span>
                <span style={css.badge(STATUS_COLOR[selected.subscription_status] ?? "#6b7280")}>{selected.subscription_status}</span>
                {selected.drive_connected && <span style={css.badge("#10b981")}>Drive bağlı</span>}
                {top3AiShops.has(selected.shop) && <span style={css.badge("#f59e0b")}>AI Top 3</span>}
              </div>
            </div>

            <div style={{ padding: 20, display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                <DetailMetric label="Tasarım yapan" value={selected.today_design_users} />
                <DetailMetric label="Sepete ekleyen" value={selected.today_cart_add_users} />
                <DetailMetric label="Satın alan" value={selected.today_purchased_users} tone="good" />
                <DetailMetric label="Arka plan" value={selected.today_bg_removed_users} />
                <DetailMetric label="Sepette kalan" value={selected.today_cart_abandoned_users} tone="warn" />
                <DetailMetric label="Bugün sipariş" value={selected.today_purchased_orders} tone="good" />
              </div>

              <div style={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, color: "#f8fafc", fontSize: 14 }}>Bugünkü dönüşüm akışı</h3>
                  <span style={{ color: "#64748b", fontSize: 12 }}>
                    Sepet dönüşümü: {pct(selected.today_purchased_users, selected.today_cart_add_users)}%
                  </span>
                </div>
                <FunnelBar shop={selected} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                <DetailMetric
                  label="Toplam gelir"
                  value={`${num(selected.total_revenue).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selected.currency}`}
                  tone="good"
                />
                <DetailMetric label="Toplam sipariş" value={selected.total_orders} sub={`Bu ay ${selected.orders_this_month}`} />
                <DetailMetric label="AI bu ay" value={selected.ai_this_month} sub={top3AiShops.has(selected.shop) ? "AI kullanımında Top 3" : undefined} />
                <DetailMetric label="BG bu ay" value={selected.bg_this_month} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid #334155", paddingTop: 14, flexWrap: "wrap" }}>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  Son sipariş: {selected.last_order_at ? new Date(selected.last_order_at).toLocaleDateString("tr-TR") : "yok"}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setBonusShop(bonusShop === selected.shop ? null : selected.shop)}
                    style={{ background: bonusShop === selected.shop ? "#334155" : "transparent", border: "1px solid #475569", borderRadius: 6, padding: "6px 12px", color: "#cbd5e1", cursor: "pointer", fontSize: 12 }}
                  >
                    {bonusShop === selected.shop ? "Bonus formunu kapat" : "Bonus kota ver"}
                  </button>
                )}
              </div>

              {!readOnly && bonusShop === selected.shop && (
                <form method="post" action="/admin" style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input type="hidden" name="intent" value="setBonus" />
                  <input type="hidden" name="shop" value={selected.shop} />
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
                  <span style={{ color: "#64748b", fontSize: 12 }}>0 mevcut bonusu sıfırlar</span>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PartnersTab({
  partners,
  shops,
  assignments,
  requests,
}: {
  partners: PartnerView[];
  shops: ShopRow[];
  assignments: PartnerAssignment[];
  requests: PartnerAssignmentRequest[];
}) {
  const assignmentByShop = React.useMemo(() => {
    const map = new Map<string, PartnerAssignment>();
    assignments.forEach((assignment) => map.set(assignment.shop, assignment));
    return map;
  }, [assignments]);
  const activeCommission = partners.reduce((sum, partner) => sum + num(partner.monthly_commission), 0);
  const pendingRequests = requests.filter((request) => request.status === "pending");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <DetailMetric label="Partner" value={partners.length} />
        <DetailMetric label="Atanmış mağaza" value={assignments.length} />
        <DetailMetric label="Bekleyen istek" value={pendingRequests.length} tone={pendingRequests.length ? "warn" : undefined} />
        <DetailMetric label="Aktif komisyon" value={moneyUsd(activeCommission)} tone="good" />
      </div>

      <section style={css.card}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 16 }}>Atama istekleri</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Partnerin gönderdiği mağaza taleplerini buradan onaylayın.</p>
          </div>
          <span style={{ color: "#64748b", fontSize: 12 }}>{requests.length} kayıt</span>
        </div>
        <table style={css.table}>
          <thead>
            <tr>
              {["Partner", "Mağaza", "Not", "Durum", "Tarih", "Aksiyon"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr><td colSpan={6} style={{ ...css.td, textAlign: "center", color: "#64748b", padding: 28 }}>Atama isteği yok</td></tr>
            )}
            {requests.map((request) => {
              const knownShop = shops.some((shop) => shop.shop === request.shop);
              return (
                <tr key={request.id}>
                  <td style={css.td}>
                    <div style={{ color: "#f1f5f9", fontWeight: 800 }}>{request.partner_name || request.partner_email}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{request.partner_email}</div>
                  </td>
                  <td style={css.td}>
                    <div style={{ color: "#f1f5f9", fontWeight: 800 }}>{shopHandle(request.shop)}</div>
                    <div style={{ color: knownShop ? "#64748b" : "#f59e0b", fontSize: 12 }}>{knownShop ? request.shop : "Mağaza listesinde bulunamadı"}</div>
                  </td>
                  <td style={{ ...css.td, maxWidth: 280, color: request.message ? "#cbd5e1" : "#64748b" }}>{request.message || "Not yok"}</td>
                  <td style={css.td}><span style={css.badge(requestStatusColor(request.status))}>{requestStatusLabel(request.status)}</span></td>
                  <td style={{ ...css.td, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{new Date(request.created_at).toLocaleString("tr-TR")}</td>
                  <td style={css.td}>
                    {request.status === "pending" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <form method="post" action="/admin">
                          <input type="hidden" name="intent" value="reviewAssignmentRequest" />
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <button type="submit" disabled={!knownShop} title={knownShop ? "Mağazayı partnere ata" : "Önce mağaza uygulamada kayıtlı olmalı"} style={{ ...css.btn, background: knownShop ? "#10b981" : "#334155", color: "#fff", opacity: knownShop ? 1 : 0.55, cursor: knownShop ? "pointer" : "not-allowed" }}>
                            Onayla
                          </button>
                        </form>
                        <form method="post" action="/admin">
                          <input type="hidden" name="intent" value="reviewAssignmentRequest" />
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <button type="submit" style={{ ...css.btn, background: "#334155" }}>Reddet</button>
                        </form>
                      </div>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: 12 }}>{request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString("tr-TR") : "-"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,0.8fr) minmax(520px,1.2fr)", gap: 16, alignItems: "start" }}>
        <section style={{ ...css.card, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", color: "#f8fafc", fontSize: 16 }}>Partner ekle</h2>
          <form method="post" action="/admin" style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="intent" value="savePartner" />
            <input name="name" placeholder="İsim / şirket" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            <input type="email" name="email" placeholder="E-posta" required style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            <input type="password" name="partnerPassword" placeholder="Şifre" required style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            <label style={{ display: "grid", gap: 6, color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>
              Komisyon %
              <input type="number" name="commissionRate" min="0" max="100" step="0.1" defaultValue={DEFAULT_COMMISSION_RATE} style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
            </label>
            <button type="submit" style={{ background: "#6366f1", border: "none", borderRadius: 6, padding: "9px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Partner oluştur
            </button>
          </form>
        </section>

        <section style={css.card}>
          <table style={css.table}>
            <thead>
              <tr>
                {["Partner", "Komisyon", "Mağaza", "Aktif", "Aylık komisyon", "Güncelle"].map((h) => (
                  <th key={h} style={css.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {partners.length === 0 && (
                <tr><td colSpan={6} style={{ ...css.td, textAlign: "center", color: "#64748b", padding: 28 }}>Partner kaydı yok</td></tr>
              )}
              {partners.map((partner) => (
                <tr key={partner.id}>
                  <td style={css.td}>
                    <div style={{ color: "#f1f5f9", fontWeight: 800 }}>{partner.name || partner.email}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{partner.email}</div>
                  </td>
                  <td style={css.td}>{num(partner.commission_rate)}%</td>
                  <td style={css.td}>
                    <span style={css.badge("#0ea5e9")}>{partner.assigned_shops} atanmış</span>
                    <span style={{ marginLeft: 6, ...css.badge("#10b981") }}>{partner.active_assigned_shops} aktif</span>
                  </td>
                  <td style={css.td}><span style={css.badge(partner.is_active ? "#10b981" : "#6b7280")}>{partner.is_active ? "Aktif" : "Pasif"}</span></td>
                  <td style={{ ...css.td, color: "#10b981", fontWeight: 800 }}>{moneyUsd(partner.monthly_commission)}</td>
                  <td style={css.td}>
                    <details>
                      <summary style={{ color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>Düzenle</summary>
                      <form method="post" action="/admin" style={{ display: "grid", gap: 8, marginTop: 10, minWidth: 240 }}>
                        <input type="hidden" name="intent" value="savePartner" />
                        <input type="hidden" name="partnerId" value={partner.id} />
                        <input name="name" defaultValue={partner.name} placeholder="İsim" style={css.input} />
                        <input type="email" name="email" defaultValue={partner.email} required style={css.input} />
                        <input type="password" name="partnerPassword" placeholder="Yeni şifre (boşsa değişmez)" style={css.input} />
                        <input type="number" name="commissionRate" min="0" max="100" step="0.1" defaultValue={num(partner.commission_rate)} style={css.input} />
                        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cbd5e1", fontSize: 12 }}>
                          <input type="checkbox" name="isActive" defaultChecked={partner.is_active} /> Aktif
                        </label>
                        <button type="submit" style={{ ...css.btn, background: "#6366f1", color: "#fff", fontWeight: 700 }}>Kaydet</button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section style={css.card}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, color: "#f8fafc", fontSize: 16 }}>Mağaza atamaları</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Her mağaza tek bir partnere atanır. Boş seçim atamayı kaldırır.</p>
          </div>
          <span style={{ color: "#64748b", fontSize: 12 }}>{shops.length} mağaza</span>
        </div>
        <table style={css.table}>
          <thead>
            <tr>
              {["Mağaza", "Paket", "Durum", "Mevcut partner", "Atama"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr><td colSpan={5} style={{ ...css.td, textAlign: "center", color: "#64748b", padding: 28 }}>Mağaza yok</td></tr>
            )}
            {shops.map((shop) => {
              const assignment = assignmentByShop.get(shop.shop);
              return (
                <tr key={shop.shop}>
                  <td style={css.td}>
                    <div style={{ color: "#f1f5f9", fontWeight: 800 }}>{shopHandle(shop.shop)}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>{shop.shop}</div>
                  </td>
                  <td style={css.td}>
                    <span style={css.badge(PLAN_COLOR[shop.plan_key] ?? "#6b7280")}>{shop.plan_key}</span>
                    <span style={{ marginLeft: 6, color: "#64748b", fontSize: 12 }}>{moneyUsd(planMonthlyPrice(shop.plan_key))}/ay</span>
                  </td>
                  <td style={css.td}><span style={css.badge(STATUS_COLOR[shop.subscription_status] ?? "#6b7280")}>{shop.subscription_status}</span></td>
                  <td style={css.td}>{assignment ? `${assignment.partner_name || assignment.partner_email} (${num(assignment.commission_rate)}%)` : <span style={{ color: "#64748b" }}>Atanmamış</span>}</td>
                  <td style={css.td}>
                    <form method="post" action="/admin" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="hidden" name="intent" value="assignPartner" />
                      <input type="hidden" name="shop" value={shop.shop} />
                      <select name="partnerId" defaultValue={assignment?.partner_id ?? ""} style={{ ...css.input, minWidth: 220 }}>
                        <option value="">Partner yok</option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>{partner.name || partner.email}</option>
                        ))}
                      </select>
                      <button type="submit" style={{ ...css.btn, background: "#334155" }}>Ata</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
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

function ticketStatusLabel(status: string) {
  return ({ open: "Açık", answered: "Yanıtlandı", closed: "Kapalı" } as Record<string, string>)[status] ?? status;
}

function ticketCategoryLabel(category: string) {
  return ({
    setup: "Kurulum",
    billing: "Ödeme",
    designer: "Tasarım",
    orders: "Sipariş",
    bug: "Hata",
    general: "Genel",
  } as Record<string, string>)[category] ?? category;
}

function ticketPriorityLabel(priority: string) {
  return ({ urgent: "Acil", high: "Yüksek", normal: "Normal" } as Record<string, string>)[priority] ?? priority;
}

function SupportTab({ tickets, status, search }: { tickets: TicketRow[]; status: string; search: string }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const openCount = tickets.filter((t) => t.status === "open").length;
  const answeredCount = tickets.filter((t) => t.status === "answered").length;
  const closedCount = tickets.filter((t) => t.status === "closed").length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
        <div style={css.statCard}><div style={css.statLabel}>Bu listede açık</div><div style={css.statValue}>{openCount}</div></div>
        <div style={css.statCard}><div style={css.statLabel}>Yanıtlanan</div><div style={css.statValue}>{answeredCount}</div></div>
        <div style={css.statCard}><div style={css.statLabel}>Kapalı</div><div style={css.statValue}>{closedCount}</div></div>
      </div>

      <form method="get" action="/admin" style={{ ...css.card, padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <input type="hidden" name="tab" value="support" />
        <label style={{ display: "grid", gap: 6, color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
          Durum
          <select name="status" defaultValue={status} style={{ ...css.input, minWidth: 150 }}>
            <option value="all">Tümü</option>
            <option value="open">Açık</option>
            <option value="answered">Yanıtlandı</option>
            <option value="closed">Kapalı</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6, color: "#94a3b8", fontSize: 12, fontWeight: 600, flex: "1 1 260px" }}>
          Ara
          <input name="q" defaultValue={search} placeholder="Mağaza, konu veya mesaj ara" style={{ ...css.input, width: "100%", boxSizing: "border-box" }} />
        </label>
        <button type="submit" style={{ ...css.btn, background: "#6366f1", color: "#fff", fontWeight: 700 }}>Filtrele</button>
        {(status !== "all" || search) && (
          <a href="/admin?tab=support" style={{ ...css.btn, textDecoration: "none", display: "inline-block" }}>Temizle</a>
        )}
      </form>

      <div style={css.card}>
        <table style={css.table}>
          <thead>
            <tr>
              {["Ticket", "Mağaza", "Konu", "Öncelik", "Durum", "Son Güncelleme", "İşlem"].map((h) => (
                <th key={h} style={css.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={7} style={{ ...css.td, textAlign: "center", color: "#475569", padding: 32 }}>Destek talebi bulunamadı</td></tr>
            )}
            {tickets.map((t) => {
              const messages = t.messages?.length ? t.messages : [{ role: "merchant" as const, text: t.message, at: t.created_at }];
              const lastMessage = messages[messages.length - 1];
              const priorityColor = t.priority === "urgent" ? "#ef4444" : t.priority === "high" ? "#f59e0b" : "#64748b";
              return (
                <React.Fragment key={t.id}>
                  <tr
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#162032")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = expanded === t.id ? "#162032" : "transparent")}
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  >
                    <td style={{ ...css.td, fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                      {t.id}
                    </td>
                    <td style={{ ...css.td, fontSize: 12 }}>
                      <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{t.shop.replace(".myshopify.com", "")}</span>
                      <br /><span style={{ color: "#64748b" }}>{t.shop}</span>
                    </td>
                    <td style={{ ...css.td, maxWidth: 300 }}>
                      <span style={{ display: "block", fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                      <span style={{ display: "block", marginTop: 3, color: "#94a3b8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticketCategoryLabel(t.category)} · {lastMessage.role === "admin" ? "Son cevap: PrintLab" : "Son cevap: Mağaza"}
                      </span>
                    </td>
                    <td style={css.td}><span style={css.badge(priorityColor)}>{ticketPriorityLabel(t.priority)}</span></td>
                    <td style={css.td}><span style={css.badge(TICKET_STATUS_COLOR[t.status] ?? "#6b7280")}>{ticketStatusLabel(t.status)}</span></td>
                    <td style={{ ...css.td, fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                      {new Date(t.updated_at ?? t.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td style={css.td}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{expanded === t.id ? "Yukarı al" : "Detay"}</span>
                    </td>
                  </tr>

                  {expanded === t.id && (
                    <tr style={{ background: "#162032" }}>
                      <td colSpan={7} style={{ padding: "16px 20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {messages.map((msg, i) => (
                              <div key={i} style={{
                                padding: "10px 14px", borderRadius: 8,
                                background: msg.role === "admin" ? "#0f3460" : "#1e293b",
                                border: `1px solid ${msg.role === "admin" ? "#6366f130" : "#334155"}`,
                                alignSelf: msg.role === "admin" ? "flex-start" : "flex-end",
                                maxWidth: "88%",
                              }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: msg.role === "admin" ? "#818cf8" : "#94a3b8", textTransform: "uppercase" as const, letterSpacing: 0.8 }}>
                                  {msg.role === "admin" ? "PrintLab" : "Mağaza"}
                                </span>
                                <p style={{ margin: "6px 0 4px", color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.text}</p>
                                <span style={{ fontSize: 11, color: "#64748b" }}>{new Date(msg.at).toLocaleString("tr-TR")}</span>
                              </div>
                            ))}
                          </div>

                          <aside style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 12, alignSelf: "start" }}>
                            <div style={{ display: "grid", gap: 8, marginBottom: 12, fontSize: 12, color: "#94a3b8" }}>
                              <div><strong style={{ color: "#e2e8f0" }}>Kategori:</strong> {ticketCategoryLabel(t.category)}</div>
                              <div><strong style={{ color: "#e2e8f0" }}>Öncelik:</strong> {ticketPriorityLabel(t.priority)}</div>
                              <div><strong style={{ color: "#e2e8f0" }}>Oluşturma:</strong> {new Date(t.created_at).toLocaleString("tr-TR")}</div>
                            </div>

                            {t.status !== "closed" ? (
                              <form method="post" action="/admin" style={{ display: "grid", gap: 8 }}>
                                <input type="hidden" name="intent" value="replyTicket" />
                                <input type="hidden" name="ticketId" value={t.id} />
                                <label style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>Yanıt</label>
                                <textarea
                                  name="reply"
                                  rows={5}
                                  placeholder="Mağazaya yanıt yazın..."
                                  style={{ ...css.input, width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const, lineHeight: 1.5, fontFamily: "inherit" }}
                                />
                                <button type="submit" style={{ background: "#6366f1", border: "none", borderRadius: 6, padding: "8px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                                  Yanıtla
                                </button>
                              </form>
                            ) : (
                              <form method="post" action="/admin">
                                <input type="hidden" name="intent" value="reopenTicket" />
                                <input type="hidden" name="ticketId" value={t.id} />
                                <button type="submit" style={{ ...css.btn, width: "100%" }}>Yeniden aç</button>
                              </form>
                            )}

                            {t.status !== "closed" && (
                              <form method="post" action="/admin" style={{ marginTop: 8 }}>
                                <input type="hidden" name="intent" value="closeTicket" />
                                <input type="hidden" name="ticketId" value={t.id} />
                                <button type="submit" style={{ background: "transparent", border: "1px solid #475569", borderRadius: 6, padding: "8px 14px", color: "#94a3b8", cursor: "pointer", fontSize: 13, width: "100%" }}>
                                  Kapat
                                </button>
                              </form>
                            )}
                          </aside>
                        </div>
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

// ── Main export ───────────────────────────────────────────────────────────────

export default function Admin() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (!data.authed) {
    return <LoginPage error={(actionData as { error?: string } | undefined)?.error} />;
  }

  const gs = data.globalStats;
  const openCount = data.openCount ?? 0;
  const isAdmin = data.role === "admin";
  const partnerName = data.currentPartner?.name || data.currentPartner?.email || "";

  return (
    <div style={css.page}>
      <header style={css.header}>
        <span style={css.logo}>{isAdmin ? "Admin Panel" : "Partner Panel"}</span>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          <a href="/admin?tab=shops" style={css.navLink(data.tab === "shops")}>Mağazalar</a>
          {isAdmin && <a href="/admin?tab=partners" style={css.navLink(data.tab === "partners")}>Partnerler</a>}
          {isAdmin && <a href="/admin?tab=ai-logs" style={css.navLink(data.tab === "ai-logs")}>AI Logları</a>}
          {isAdmin && (
            <a href="/admin?tab=support" style={css.navLink(data.tab === "support")}>
              Destek{openCount > 0 && (
                <span style={{ marginLeft: 5, display: "inline-block", padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: "#f59e0b", color: "#0f172a" }}>
                  {openCount}
                </span>
              )}
            </a>
          )}
        </nav>
        {!isAdmin && partnerName && <span style={{ color: "#94a3b8", fontSize: 12 }}>{partnerName}</span>}
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
            <StatCard label="Bugün Tasarım" value={gs.todayDesignUsers} />
            <StatCard label="Bugün BG" value={gs.todayBgRemovedUsers} />
            <StatCard label="Bugün Sepet" value={gs.todayCartAddUsers} />
            <StatCard label="Sepette Kalan" value={gs.todayCartAbandonedUsers} critical />
            <StatCard label="Bugün Satın Alan" value={gs.todayPurchasedUsers} />
            <StatCard label="Bugün Sipariş" value={gs.todayPurchasedOrders} />
            <StatCard label="Toplam Gelir" value={gs.totalRevenue} isRevenue />
            <StatCard label="Toplam Sipariş" value={gs.totalOrders} />
            <StatCard label="AI Üretim" value={gs.totalAiGens} />
            <StatCard label="BG Kaldırma" value={gs.totalBgRemovals} />
            <StatCard label="Açık Talepler" value={gs.openTickets} critical />
            <StatCard label="Kredi Satışı" value={gs.totalCreditSales} />
          </div>
        )}

        {data.tab === "shops" && (
          <ShopsTab
            shops={data.shops as ShopRow[]}
            readOnly={!isAdmin}
            partnerSummary={data.partnerSummary as PartnerCommissionSummary | null}
            partnerRequests={data.partnerRequests as PartnerAssignmentRequest[]}
          />
        )}
        {isAdmin && data.tab === "partners" && (
          <PartnersTab
            partners={data.partners as PartnerView[]}
            shops={data.shops as ShopRow[]}
            assignments={data.assignments as PartnerAssignment[]}
            requests={data.partnerRequests as PartnerAssignmentRequest[]}
          />
        )}
        {isAdmin && data.tab === "ai-logs" && (
          <AiLogsTab
            logs={data.aiLogs as AiPromptLog[]}
            count={data.aiLogsCount}
            page={data.aiLogsPage}
            filterShop={data.filterShop}
          />
        )}
        {isAdmin && data.tab === "support" && (
          <SupportTab
            tickets={data.tickets as TicketRow[]}
            status={data.supportStatus ?? "all"}
            search={data.supportSearch ?? ""}
          />
        )}
      </main>
    </div>
  );
}
