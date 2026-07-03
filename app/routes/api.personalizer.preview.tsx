import { json, unstable_createMemoryUploadHandler, unstable_parseMultipartFormData, type ActionFunctionArgs } from "@remix-run/node";
import { uploadToR2 } from "~/lib/r2.server";
import { getPersonalizerTemplatePublic, getPersonalizerFramePublic, listPersonalizerFrames } from "~/models/personalizer.server";
import { transformPhoto } from "~/lib/personalizer-ai.server";
import { composePreview } from "~/lib/personalizer-compose.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function getMessages(locale: string) {
  const isTr = !locale.toLowerCase().startsWith("en");
  return {
    templateRequired: isTr ? "templateId gerekli" : "templateId is required",
    photoRequired: isTr ? "Fotoğraf yüklenmedi" : "Photo was not uploaded",
    notFound: isTr ? "Şablon bulunamadı" : "Template was not found",
    unknown: isTr ? "Bilinmeyen hata" : "Unknown error",
    previewFailed: isTr ? "Önizleme oluşturulamadı" : "Preview could not be created",
    frameName: (value: string | null | undefined) => {
      if (isTr) return value ?? null;
      return String(value || "")
        .replace(/Çerçeve/g, "Frame")
        .replace(/çerçeve/g, "frame")
        .replace(/Ekran Resmi/g, "Screenshot") || null;
    },
  };
}

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return new Response(null, { status: 405, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405, headers: CORS });

  let messages = getMessages("tr");
  try {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 10 * 1024 * 1024 });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);

    const templateId = String(form.get("templateId") ?? "").trim();
    const frameId    = String(form.get("frameId") ?? "").trim();
    const locale     = String(form.get("locale") ?? "tr").trim();
    const t = getMessages(locale);
    messages = t;
    const photoFile = form.get("photo");
    const textValuesRaw = String(form.get("textValues") ?? "{}");

    if (!templateId) return json({ error: t.templateRequired }, { status: 400, headers: CORS });
    if (!(photoFile instanceof File) || photoFile.size === 0) {
      return json({ error: t.photoRequired }, { status: 400, headers: CORS });
    }

    const template = await getPersonalizerTemplatePublic(templateId);
    if (!template) return json({ error: t.notFound }, { status: 404, headers: CORS });

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

    const frames = frameId
      ? [await getPersonalizerFramePublic(frameId)].filter(Boolean)
      : await listPersonalizerFrames(templateId);

    const targets = frames.length > 0 ? frames : [null];
    const previews = await Promise.all(targets.map(async (frame) => {
      const activeTextFields = frame?.text_fields?.length ? frame.text_fields : template.text_fields;
      const previewUrl = await composePreview({
        templateUrl: template.template_url,
        photoUrl: transformedUrl,
        photoX: template.photo_x,
        photoY: template.photo_y,
        photoWidth: template.photo_width,
        photoHeight: template.photo_height,
        mockupUrl: frame?.mockup_url || undefined,
        mockupX: frame?.mockup_x ?? 0,
        mockupY: frame?.mockup_y ?? 0,
        mockupWidth: frame?.mockup_width ?? 0,
        mockupHeight: frame?.mockup_height ?? 0,
        textFields: activeTextFields,
        textValues,
      });
      return { frameId: frame?.id ?? null, frameName: t.frameName(frame?.name), previewUrl };
    }));

    return json(
      {
        previewUrl: previews[0]?.previewUrl ?? "",
        previews,
        transformedPhotoUrl: transformedUrl,
        frameId: previews[0]?.frameId ?? null,
      },
      { headers: CORS },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : messages.unknown;
    console.error("[personalizer/preview]", msg);
    return json({ error: `${messages.previewFailed}: ${msg}` }, { status: 500, headers: CORS });
  }
};
