import { json, type ActionFunctionArgs } from "@remix-run/node";
import { isWooShop } from "~/lib/platform";
import { applyWooProductLink } from "~/models/woo.server";

/** Eklenti: üründe şablon seçildi/kaldırıldı (webhook sırrıyla imzalı) */
export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? "");
  const shop = get("shop");
  if (!isWooShop(shop)) return json({ error: "bad request" }, { status: 400 });
  const r = await applyWooProductLink({
    shop, ts: get("ts"), sig: get("sig"), productId: get("product_id"),
    templateId: get("template_id"), title: get("title"), slug: get("slug"),
  });
  return json({ ok: r.ok }, { status: r.status });
};

export const loader = () => new Response(null, { status: 405 });
