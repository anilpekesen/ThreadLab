import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { saveDesign } from "~/models/designs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ ok: true, method: request.method });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = `d_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const b = body as Record<string, unknown>;
  const shop = typeof b.shop === "string" ? b.shop : "";

  await saveDesign(shop, {
    token,
    productId: typeof b.productId === "string" ? b.productId : undefined,
    sessionId: typeof b.sessionId === "string" && b.sessionId ? b.sessionId : undefined,
    designJson: "designJson" in b ? b.designJson : undefined,
    frontPreviewUrl: typeof b.frontPreviewUrl === "string" ? b.frontPreviewUrl : undefined,
    backPreviewUrl: typeof b.backPreviewUrl === "string" ? b.backPreviewUrl : undefined,
    frontPrintUrl: typeof b.frontPrintUrl === "string" ? b.frontPrintUrl : undefined,
    backPrintUrl: typeof b.backPrintUrl === "string" ? b.backPrintUrl : undefined,
  });

  return json({ token });
};
