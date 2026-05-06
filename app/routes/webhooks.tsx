import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { createOrderFromWebhook } from "~/models/orders.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, payload } = await authenticate.webhook(request);

  if (topic === "ORDERS_CREATE") {
    await createOrderFromWebhook(payload as Record<string, unknown>);
  }

  return json({ ok: true });
};
