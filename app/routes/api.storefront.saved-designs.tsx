import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { verifyProxyHmac } from "~/lib/shopify.server";
import {
  listCustomerDesigns,
  saveCustomerDesign,
  deleteCustomerDesign,
  type CustomerSavedDesign,
} from "~/models/customer-designs.server";

// pq = tasarımcı iframe'inin app proxy'den devraldığı imzalı query string.
// HMAC doğrulanınca shop + logged_in_customer_id Shopify imzalı demektir;
// istemcinin kendi gönderdiği değerlere güvenmek gerekmez.
function authFromProxyQuery(pq: unknown): { shop: string; customerId: string } | null {
  if (typeof pq !== "string" || !pq) return null;
  const params = new URLSearchParams(pq.startsWith("?") ? pq.slice(1) : pq);
  if (!verifyProxyHmac(params)) return null;
  const shop = params.get("shop") ?? "";
  const customerId = params.get("logged_in_customer_id") ?? "";
  if (!shop.endsWith(".myshopify.com") || !/^\d+$/.test(customerId)) return null;
  return { shop, customerId };
}

const MAX_NAME = 200;
const MAX_THUMBNAIL = 800_000; // base64 PNG data URL
const MAX_JSON = 3_000_000; // fabric.js canvas JSON

function parseDesign(raw: unknown): CustomerSavedDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id || d.id.length > 100) return null;
  const name = typeof d.name === "string" ? d.name.slice(0, MAX_NAME) : "";
  const thumbnail = typeof d.thumbnail === "string" ? d.thumbnail : "";
  const frontJson = typeof d.frontJson === "string" ? d.frontJson : "";
  const backJson = typeof d.backJson === "string" ? d.backJson : "";
  if (thumbnail.length > MAX_THUMBNAIL) return null;
  if (frontJson.length > MAX_JSON || backJson.length > MAX_JSON) return null;
  return {
    id: d.id,
    name,
    thumbnail,
    frontJson,
    backJson,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const auth = authFromProxyQuery(url.searchParams.get("pq"));
  if (!auth) return json({ error: "Unauthorized" }, { status: 403 });

  const designs = await listCustomerDesigns(auth.shop, auth.customerId);
  return json({ designs });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const auth = authFromProxyQuery(b.pq);
  if (!auth) return json({ error: "Unauthorized" }, { status: 403 });

  if (request.method === "POST") {
    const design = parseDesign(b.design);
    if (!design) return json({ error: "Invalid design" }, { status: 400 });
    await saveCustomerDesign(auth.shop, auth.customerId, design);
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    if (typeof b.id !== "string" || !b.id) {
      return json({ error: "Missing id" }, { status: 400 });
    }
    await deleteCustomerDesign(auth.shop, auth.customerId, b.id);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
