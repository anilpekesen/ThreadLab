import { json, type ActionFunctionArgs } from "@remix-run/node";
import sharp from "sharp";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { normalizeGeneratorConfig, GENERATOR_CONFIGS } from "~/lib/generators/configs";
import { getGeneratorModule } from "~/lib/generators/registry.server";
import { GeneratorInputError } from "~/lib/generators/types";

/**
 * Yönetim ekranındaki üretici önizlemesi. Kaydedilmemiş ayarla, modülün örnek
 * girdisiyle çizer; R2'ye bir şey yüklemez. Örnek fotoğraf isteyen üreticiye
 * degrade bir yer tutucu verilir.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body: { config?: unknown; fields?: Record<string, string>; choices?: Record<string, string | number | boolean>; _lang?: string };
  try { body = await request.json(); }
  catch { return json({ error: langFromRequest(request) === "en" ? "Invalid request" : "Geçersiz istek" }, { status: 400 }); }
  const lang = body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request);
  const en = lang === "en";

  const config = normalizeGeneratorConfig(body.config);
  if (!config) return json({ error: en ? "Unknown generator type" : "Üretici türü tanınmadı" }, { status: 400 });
  const sample = GENERATOR_CONFIGS[config.kind];

  const photo = sample.samplePhoto
    ? await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#f472b6" } })
        .composite([{ input: Buffer.from(
          `<svg width="1200" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#g)"/><circle cx="600" cy="520" r="210" fill="#fde68a"/><rect x="330" y="760" width="540" height="440" rx="270" fill="#fde68a"/></svg>`,
        ) }])
        .png().toBuffer()
    : null;

  try {
    const result = await getGeneratorModule(config.kind).compose(config, {
      fields: { ...sample.sampleInput.fields, ...(body.fields ?? {}) },
      choices: { ...sample.sampleInput.choices, ...(body.choices ?? {}) },
      photo,
    }, { shop: session.shop });
    const small = await sharp(result.buffer).resize(900, 900, { fit: "inside" }).png().toBuffer();
    return json({
      image: `data:image/png;base64,${small.toString("base64")}`,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    if (err instanceof GeneratorInputError) return json({ error: err.messageFor(lang) }, { status: 400 });
    console.error("[generator-preview]", err);
    return json({ error: en ? "Couldn't create preview" : "Önizleme üretilemedi" }, { status: 500 });
  }
};
