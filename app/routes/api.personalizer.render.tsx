import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getPersonalizerTemplatePublic } from "~/models/personalizer.server";
import { composeFinalRender } from "~/lib/personalizer-compose.server";
import { query } from "~/lib/db.server";
import { randomBytes } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(null, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: CORS });

  try {
    const body = await request.json() as Record<string, unknown>;
    const templateId = String(body.templateId ?? "").trim();
    const transformedPhotoUrl = String(body.transformedPhotoUrl ?? "").trim();
    const textValues = (body.textValues ?? {}) as Record<string, string>;

    if (!templateId || !transformedPhotoUrl) {
      return json({ error: "templateId ve transformedPhotoUrl gerekli" }, { status: 400, headers: CORS });
    }

    const template = await getPersonalizerTemplatePublic(templateId);
    if (!template) return json({ error: "Şablon bulunamadı" }, { status: 404, headers: CORS });

    const printUrl = await composeFinalRender({
      templateUrl: template.template_url,
      photoUrl: transformedPhotoUrl,
      photoX: template.photo_x,
      photoY: template.photo_y,
      photoWidth: template.photo_width,
      photoHeight: template.photo_height,
      mockupUrl: template.mockup_url || undefined,
      mockupX: template.mockup_x,
      mockupY: template.mockup_y,
      mockupWidth: template.mockup_width,
      mockupHeight: template.mockup_height,
      textFields: template.text_fields,
      textValues,
    });

    // Save design record so the order webhook can reference it
    const designToken = randomBytes(16).toString("hex");
    await query(
      `INSERT INTO designs (token, shop, front_print_url, front_preview_url, design_json, created_at)
       VALUES ($1, $2, $3, $3, $4, now())`,
      [
        designToken,
        template.shop,
        printUrl,
        JSON.stringify({ type: "personalizer", templateId, textValues, templateName: template.name }),
      ],
    );

    return json({ printUrl, designToken }, { headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[personalizer/render]", msg);
    return json({ error: `Render başarısız: ${msg}` }, { status: 500, headers: CORS });
  }
};
