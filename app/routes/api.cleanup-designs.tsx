import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { cleanupUnorderedDesigns } from "~/models/design-cleanup.server";

function cleanupSecret() {
  return process.env.DESIGN_CLEANUP_SECRET || process.env.ADMIN_PANEL_SECRET || "";
}

function isAuthorized(request: Request) {
  const secret = cleanupSecret();
  if (!secret) return false;

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = request.headers.get("X-Cleanup-Secret") || "";
  return bearer === secret || headerSecret === secret;
}

function getPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!isAuthorized(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const olderThanDays = getPositiveInt(url.searchParams.get("days"), 7, 365);
  const limit = getPositiveInt(url.searchParams.get("limit"), 200, 1000);

  const result = await cleanupUnorderedDesigns({ olderThanDays, limit, dryRun: true });
  return json(result);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isAuthorized(request)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const olderThanDays = getPositiveInt(url.searchParams.get("days"), 7, 365);
  const limit = getPositiveInt(url.searchParams.get("limit"), 200, 1000);

  const result = await cleanupUnorderedDesigns({ olderThanDays, limit, dryRun: false });
  return json(result);
};
