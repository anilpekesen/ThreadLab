import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getActiveCliparts } from "~/models/cliparts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const cliparts = await getActiveCliparts();
  return json(
    { cliparts },
    {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
};
