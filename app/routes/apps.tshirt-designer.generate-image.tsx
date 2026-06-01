import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleAiImageGeneration } from "~/models/ai-image-generation.server";
import { getAiQuotaInfo } from "~/models/ai-generation-usage.server";

// GET — kota bilgisini tüketmeden döndürür
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!shop) return json({ error: "shop parametresi eksik" }, { status: 400 });
  return json(await getAiQuotaInfo(shop, sessionId));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) return json({ error: "shop parametresi eksik" }, { status: 400 });
  return handleAiImageGeneration(request, shop);
};
