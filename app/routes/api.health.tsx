import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { sessionStorage } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const dbType = process.env.DATABASE_URL ? "postgresql" : "memory";

  let sessionCount = 0;
  let dbOk = false;
  let dbError = "";

  try {
    const sessions = await (sessionStorage as any).findSessionsByShop?.("whanotify-dev.myshopify.com") ?? [];
    sessionCount = sessions.length;
    dbOk = true;
  } catch (e: any) {
    dbError = e?.message ?? "unknown error";
  }

  return json({
    status: "ok",
    dbType,
    dbOk,
    dbError: dbError || undefined,
    sessionCount,
    timestamp: new Date().toISOString(),
  });
};
