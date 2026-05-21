import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleWaveSpeedRemoveBackground } from "~/models/background-removal.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ error: `Method ${request.method} not allowed` }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return json({ error: "shop parametresi eksik" }, { status: 400 });
  return handleWaveSpeedRemoveBackground(request, shop);
};
