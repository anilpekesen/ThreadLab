import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { recordReviewPrompt } from "~/models/review-prompt.server";

/** Yorum penceresi istendikten sonra Shopify'ın cevabını kaydeder */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await request.formData();
  await recordReviewPrompt(session.shop, String(form.get("code") ?? ""));
  return json({ ok: true });
};
