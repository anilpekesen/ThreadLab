import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { query } from "~/lib/db.server";

export const loader = async (_: LoaderFunctionArgs) => {
  const dbType = process.env.DATABASE_URL ? "postgresql" : "memory";

  let sessionCount = 0;
  let dbOk = false;
  let dbError = "";

  try {
    const result = await query(`SELECT COUNT(*) FROM shopify_sessions`);
    sessionCount = parseInt(result.rows[0]?.count ?? "0", 10);
    dbOk = true;
  } catch (e: unknown) {
    dbError = (e as Error)?.message ?? "unknown error";
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
