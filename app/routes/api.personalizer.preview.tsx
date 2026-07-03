import { json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData, type ActionFunctionArgs } from "@remix-run/node";
import { uploadToR2 } from "~/lib/r2.server";
import { getPersonalizerTemplatePublic } from "~/models/personalizer.server";
import { transformPhoto } from "~/lib/personalizer-ai.server";
import { composePreview } from "~/lib/personalizer-compose.server";

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
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 10 * 1024 * 1024 });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);

    const templateId = String(form.get("templateId") ?? "").trim();
    const photoFile = form.get("photo");
    const textValuesRaw = String(form.get("textValues") ?? "{}");

    if (!templateId) return json({ error: "templateId gerekli" }, { status: 400, headers: CORS });
    if (!(photoFile instanceof File) || photoFile.size === 0) {
      return json({ error: "Fotoğraf yüklenmedi" }, { status: 400, headers: CORS });
    }

    const template = await getPersonalizerTemplatePublic(templateId);
    if (!template) return json({ error: "Şablon bulunamadı" }, { status: 404, headers: CORS });

    let textValues: Record<string, string> = {};
    try { textValues = JSON.parse(textValuesRaw); } catch { /* ignore */ }

    // Upload customer photo to R2 (temp)
    const photoBuf = Buffer.from(await photoFile.arrayBuffer());
    const photoExt = photoFile.type === "image/jpeg" ? "jpg" : photoFile.type === "image/webp" ? "webp" : "png";
    const photoUrl = await uploadToR2(photoBuf, photoExt, "personalizer-upload");

    // AI transformation (if style not 'none')
    let transformedUrl = photoUrl;
    if (template.ai_style && template.ai_style !== "none") {
      try {
        transformedUrl = await transformPhoto(photoUrl, template.ai_style);
      } catch (err) {
        console.error("[personalizer/preview] AI transform failed, using original:", err);
        transformedUrl = photoUrl;
      }
    }

    // Composite: photo → design template → frame (if frame configured)
    const previewUrl = await composePreview({
      templateUrl: template.template_url,
      photoUrl: transformedUrl,
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

    return json(
      { previewUrl, transformedPhotoUrl: transformedUrl },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[personalizer/preview]", msg);
    return json({ error: `Önizleme oluşturulamadı: ${msg}` }, { status: 500, headers: CORS });
  }
};
