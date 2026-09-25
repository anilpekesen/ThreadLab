import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleFaceCutout } from "~/models/face-cutout.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ error: `Method ${request.method} not allowed` }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return json({ error: (url.searchParams.get("locale") ?? "tr").toLowerCase().startsWith("tr") ? "shop parametresi eksik" : "Missing shop parameter" }, { status: 400 });
  return handleFaceCutout(request, shop);
};
