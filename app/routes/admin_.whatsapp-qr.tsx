import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getWAStatus, getWAQr, logoutWhatsApp } from "~/lib/whatsapp.server";

const AUTH_COOKIE = "panel_auth";

function isAuthed(request: Request): boolean {
  const secret = process.env.ADMIN_PANEL_SECRET ?? "";
  if (!secret) return false;
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `${AUTH_COOKIE}=${encodeURIComponent(secret)}`);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthed(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "status";

  if (mode === "qr") {
    const data = await getWAQr();
    return json(data, { headers: { "Cache-Control": "no-store" } });
  }

  const data = await getWAStatus();
  return json(data, { headers: { "Cache-Control": "no-store" } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!isAuthed(request)) return json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "logout") {
    await logoutWhatsApp();
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen intent" }, { status: 400 });
};
