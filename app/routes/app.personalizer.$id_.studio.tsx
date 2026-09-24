import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getPersonalizerTemplate, listPersonalizerProductLinks, updatePersonalizerTemplate,
} from "~/models/personalizer.server";
import { createPrintProduct, listPrintProducts } from "~/models/print-product.server";
import { clearProductTemplateMetafield, setProductTemplateMetafield } from "~/lib/personalizer-metafield.server";
import { normalizeGridConfig, normalizeMockups, normalizePieces, type TemplatePiece } from "~/lib/slots";
import { SINGLE_PIECE_ID, piecesToTemplateFields } from "~/lib/frame-studio";
import type { PrintProduct } from "~/lib/print-spec";
import { FrameStudio, type NewSizeInput, type StudioSavePayload } from "~/components/studio/FrameStudio";
import { pickDict, useTranslation } from "~/i18n";
import { langFromRequest } from "~/i18n/server";
import dict from "~/i18n/personalizer/studio";
import studioStyles from "~/styles/frame-studio.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: studioStyles }];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const L = pickDict(dict, langFromRequest(request));
  const template = await getPersonalizerTemplate(params.id ?? "", session.shop);
  if (!template) throw new Response(L.notFound, { status: 404 });

  // Stüdyo her şablonu parça listesi olarak düzenler. Tek parçalı şablonun
  // arka planı `template_url` kolonunda duruyor; kayıtta aynı yere dönüyor.
  const pieces: TemplatePiece[] = template.pieces.length > 0
    ? template.pieces
    : [{
        id: SINGLE_PIECE_ID,
        name: template.name || L.defaultPieceName,
        print_product_id: template.print_product_id,
        slots: template.slots,
        background_url: template.template_url || undefined,
        overlay_url: template.overlay_url || undefined,
        order: 1,
      }];

  // Pasif ölçüler de listede: şablon pasife alınmış bir ölçüyü kullanıyorsa
  // stüdyo "ölçü seçin" deyip mevcut düzeni gizlememeli.
  const printProducts = await listPrintProducts(session.shop);
  return json({
    templateId: template.id,
    templateName: template.name,
    pieces,
    grid: template.grid_config ?? null,
    mockups: template.mockups,
    printProducts,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const id = params.id ?? "";

  let body: { intent?: string; _lang?: string } & Partial<StudioSavePayload> & { size?: Partial<NewSizeInput> };
  try { body = await request.json(); }
  catch { return json({ error: pickDict(dict, langFromRequest(request)).invalidRequest }, { status: 400 }); }
  // JSON gövdesinde form olmadığından dil `_lang` alanından okunur
  const L = pickDict(dict, body._lang === "en" || body._lang === "tr" ? body._lang : langFromRequest(request));

  if (body.intent === "create_size") {
    const s = body.size ?? {};
    const width = Number(s.width_mm);
    const height = Number(s.height_mm);
    if (!(width > 0) || !(height > 0)) return json({ error: L.sizeRequired }, { status: 400 });
    const created = await createPrintProduct(shop, {
      name: String(s.name ?? "").trim() || `${width / 10}×${height / 10} cm`,
      width_mm: width,
      height_mm: height,
      dpi: Math.max(72, Math.min(1200, Math.round(Number(s.dpi) || 300))),
      bleed_mm: Math.max(0, Number(s.bleed_mm) || 0),
      safe_mm: Math.max(0, Number(s.safe_mm) || 0),
      wrap: "flat",
      mockup_url: "",
    });
    return json({ ok: true, createdSizeId: created.id });
  }

  if (body.intent !== "save") return json({ error: L.unknownIntent }, { status: 400 });

  const template = await getPersonalizerTemplate(id, shop);
  if (!template) return json({ error: L.notFound }, { status: 404 });

  // İstemciden gelen her şey normalize ediliyor: bozuk geometri render
  // motoruna ve müşteri sayfasına geçmemeli.
  const pieces = normalizePieces(body.pieces);
  if (pieces.length === 0) return json({ error: L.nothingToSave }, { status: 400 });

  const fields = piecesToTemplateFields(pieces, template);
  const hadPhotoSlots = template.slots.length > 0 || template.pieces.length > 0;

  // Yalnızca stüdyonun sahip olduğu kolonlar yazılıyor. Ad, tür, AI ayarları
  // ve bağlantılar şablon sayfasında; burada dokunulmaz.
  await updatePersonalizerTemplate(id, shop, {
    slots: fields.slots,
    pieces: fields.pieces,
    print_product_id: fields.print_product_id,
    template_url: fields.template_url,
    overlay_url: fields.overlay_url,
    expected_slots: fields.expected_slots,
    grid_config: normalizeGridConfig(body.grid_config),
    mockups: normalizeMockups(body.mockups),
  });

  // Ürün sayfasındaki kişiselleştirme kutusu, fotoğraf alanı olan şablonlarda
  // ürün metafield'ıyla açılıyor ve metafield bağlama anında yazılıyordu.
  // Şablon stüdyoda alan kazanır ya da kaybederse bağlı ürünler eşitlenmeli;
  // yoksa kutu ya hiç açılmaz ya da boş şablonla açılır.
  const hasPhotoSlots = fields.slots.length > 0 || fields.pieces.length > 0;
  const metafieldErrors: string[] = [];
  if (hasPhotoSlots !== hadPhotoSlots) {
    const links = await listPersonalizerProductLinks(id);
    for (const productId of new Set(links.map((l) => l.product_id).filter(Boolean))) {
      const result = hasPhotoSlots
        ? await setProductTemplateMetafield(shop, productId, id)
        : await clearProductTemplateMetafield(shop, productId);
      if (!result.ok) metafieldErrors.push(result.error ?? L.unknownError);
    }
  }

  return json({
    ok: true,
    saved: true,
    error: metafieldErrors.length
      ? L.metafieldPartial(metafieldErrors.join(", "))
      : undefined,
  });
};

export default function PersonalizerStudioRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const saveFetcher = useFetcher<{ ok?: boolean; saved?: boolean; error?: string }>();
  const sizeFetcher = useFetcher<{ ok?: boolean; createdSizeId?: string; error?: string }>();
  const [saveCount, setSaveCount] = useState(0);
  const handled = useRef<unknown>(null);

  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data?.saved && handled.current !== saveFetcher.data) {
      handled.current = saveFetcher.data;
      setSaveCount((n) => n + 1);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  return (
    <FrameStudio
      // Kaydedilen hâl sunucudan yeniden yüklenince stüdyo sıfırlanmasın:
      // durum stüdyoda, yükleyici yalnızca ilk açılışı besliyor.
      key={data.templateId}
      templateId={data.templateId}
      templateName={data.templateName}
      initialPieces={normalizePieces(data.pieces)}
      initialGrid={data.grid ? normalizeGridConfig(data.grid) : null}
      initialMockups={normalizeMockups(data.mockups)}
      printProducts={data.printProducts as PrintProduct[]}
      saving={saveFetcher.state !== "idle"}
      saveError={saveFetcher.data?.error ?? sizeFetcher.data?.error}
      saveCount={saveCount}
      onSave={(payload) => saveFetcher.submit(
        { intent: "save", ...payload, _lang: lang } as never,
        { method: "POST", encType: "application/json" },
      )}
      onBack={() => navigate(`/app/personalizer/${data.templateId}`)}
      creatingSize={sizeFetcher.state !== "idle"}
      createdSizeId={sizeFetcher.data?.createdSizeId}
      onCreateSize={(size) => sizeFetcher.submit(
        { intent: "create_size", size, _lang: lang } as never,
        { method: "POST", encType: "application/json" },
      )}
    />
  );
}
