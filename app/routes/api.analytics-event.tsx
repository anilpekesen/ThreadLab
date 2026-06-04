import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { trackAnalyticsEvent, type AnalyticsEventType } from "~/models/analytics.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const EVENT_TYPES = new Set<AnalyticsEventType>([
  "design_created",
  "design_activity",
  "template_applied",
  "cart_add",
  "background_removed",
]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  return json({ ok: true }, { headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const b = body as Record<string, unknown>;
  const eventType = typeof b.eventType === "string" ? b.eventType : "";
  if (!EVENT_TYPES.has(eventType as AnalyticsEventType)) {
    return json({ error: "Invalid event type" }, { status: 400, headers: CORS });
  }

  await trackAnalyticsEvent({
    shop: typeof b.shop === "string" ? b.shop : "",
    eventType: eventType as AnalyticsEventType,
    productId: typeof b.productId === "string" ? b.productId : undefined,
    productName: typeof b.productName === "string" ? b.productName : undefined,
    templateId: typeof b.templateId === "string" ? b.templateId : undefined,
    templateName: typeof b.templateName === "string" ? b.templateName : undefined,
    templateKind: typeof b.templateKind === "string" ? b.templateKind : undefined,
    designToken: typeof b.designToken === "string" ? b.designToken : undefined,
    sessionId: typeof b.sessionId === "string" ? b.sessionId : undefined,
    valueNumeric: typeof b.valueNumeric === "number" ? b.valueNumeric : undefined,
    metadata: b.metadata && typeof b.metadata === "object"
      ? b.metadata as Record<string, unknown>
      : undefined,
  });

  return json({ ok: true }, { headers: CORS });
};
