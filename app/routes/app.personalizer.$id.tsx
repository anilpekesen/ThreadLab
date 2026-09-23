import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator, useParams, useSearchParams } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Checkbox,
  Button, BlockStack, InlineStack, Text, Banner, Box, Badge, Thumbnail,
} from "@shopify/polaris";
import { useState, useRef, useCallback, useEffect } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getPersonalizerTemplate,
  createPersonalizerTemplate,
  updatePersonalizerTemplate,
  listPersonalizerFrames,
  createPersonalizerFrame,
  updatePersonalizerFrame,
  deletePersonalizerFrame,
  linkPersonalizerProduct,
  unlinkPersonalizerProduct,
  listPersonalizerProductLinks,
  normalizeCustomerOptions,
  normalizeLayoutMode,
  normalizePersonalizerCategory,
  normalizeSide,
  type TemplateSide,
  type TextFieldDef,
  type PersonalizerFrame,
  type PersonalizerCategory,
} from "~/models/personalizer.server";
import { fetchShopifyProducts, findConfigForStorefront } from "~/models/product-config.server";
import { AI_STYLES, AI_PROVIDERS, normalizeAiConfig, type AiProvider } from "~/lib/ai-styles";
import { uploadToR2 } from "~/lib/r2.server";
import { removeBackgroundFromBuffer } from "~/models/background-removal.server";
import { listPrintProducts } from "~/models/print-product.server";
import { setProductTemplateMetafield, clearProductTemplateMetafield } from "~/lib/personalizer-metafield.server";
import type { PrintProduct } from "~/lib/print-spec";
import { normalizeWordArtConfig } from "~/lib/wordart";
import { FONT_LIBRARY } from "~/lib/font-library";
import { WordArtSettings } from "~/components/personalizer/WordArtSettings";
import { normalizeSlots, normalizePieces, normalizeMockups } from "~/lib/slots";
import { StudioSummary } from "~/components/studio/StudioSummary";

const MAX_UPLOAD = 20 * 1024 * 1024;
const AI_STYLE_OPTIONS = [
  { label: "Karikatür (Önerilen)", value: "caricature" },
  { label: "Suluboya", value: "watercolor" },
  { label: "Karakalem Çizim", value: "sketch" },
  { label: "Pop Art", value: "pop_art" },
  { label: "AI Dönüşümü Yok (orijinal fotoğraf)", value: "none" },
];

function normalizeShopifyNumericId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.split("/").filter(Boolean).pop() ?? trimmed;
}

function productOptionLabel(product: { title: string; handle: string }) {
  return product.handle ? `${product.title} (${product.handle})` : product.title;
}

function defaultAiTextFields(width: number, height: number): TextFieldDef[] {
  return [
    {
      id: "name",
      label: "İsim",
      placeholder: "Örn: ELİF",
      x: Math.round(width / 2),
      y: Math.round(height * 0.84),
      font_size: 180,
      color: "#111111",
      bold: true,
      max_length: 20,
      align: "center",
    },
    {
      id: "story",
      label: "Hikâye / Not",
      placeholder: "Kısa bir cümle yazın",
      x: Math.round(width / 2),
      y: Math.round(height * 0.91),
      font_size: 78,
      color: "#444444",
      bold: false,
      max_length: 160,
      align: "center",
    },
  ];
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const id = params.id ?? "";
  if (id === "new") {
    const printProducts = await listPrintProducts(session.shop, true);
    return json({ shop: session.shop, template: null, frames: [], productLinks: [], products: [], linkedAreaRatio: null, printProducts, isNew: true, productQuery: "", personalizerBlockUrl: "", designerBlockUrl: "" });
  }
  const template = await getPersonalizerTemplate(id, session.shop);
  if (!template) throw new Response("Şablon bulunamadı", { status: 404 });
  const frames = await listPersonalizerFrames(id);
  const productLinks = await listPersonalizerProductLinks(id);
  // Liste yalnızca son güncellenen 50 ürünü getiriyor; ürünü bulamayan
  // merchant bağlamayı bırakıyordu. Arama sorgusu Shopify'a iletiliyor.
  const productQuery = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const products = (await fetchShopifyProducts(admin, productQuery)).map((product) => ({
    id: normalizeShopifyNumericId(product.id),
    gid: product.id,
    title: product.title,
    handle: product.handle,
    featuredImage: product.featuredImage ?? "",
    variants: product.variants.map((variant) => ({
      id: normalizeShopifyNumericId(variant.id),
      gid: variant.id,
      title: variant.title,
      price: variant.price,
    })),
  }));
  // Dağıtım tuvalinin oranı, tasarımın oturacağı baskı kutusunun oranıyla
  // eşleşmezse tasarım kutuya sığar ama kenarlarda boşluk kalır. Editörde
  // uyarabilmek için bağlı ürünün ön baskı kutusunu da gönderiyoruz.
  let linkedAreaRatio: number | null = null;
  const linkedProductId = productLinks[0]?.product_id ?? "";
  if (linkedProductId) {
    const linkedConfig = await findConfigForStorefront(session.shop, linkedProductId, "").catch(() => null);
    const areas = linkedConfig?.printAreas ?? [];
    const front = areas.find((area: { side: string }) => area.side === "front") ?? areas[0];
    if (front?.width > 0 && front?.height > 0) linkedAreaRatio = front.width / front.height;
  }

  const printProducts = await listPrintProducts(session.shop, true);

  // Tema düzenleyicisini bloğu eklenmiş hâlde açan bağlantılar. Kurulum
  // rehberinde tema koduna elle liquid yapıştırmak anlatılıyordu; blok varken
  // buna gerek yok ve merchant'lar orada takılıyordu.
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const themeBlockUrl = (handle: string) => apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${handle}`)}&target=mainSection`
    : "";

  return json({
    shop: session.shop, template, frames, productLinks, products, linkedAreaRatio, printProducts, isNew: false,
    productQuery,
    personalizerBlockUrl: themeBlockUrl("personalizer"),
    designerBlockUrl: themeBlockUrl("tshirt-designer"),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const id = params.id ?? "";

  // Gövde iki biçimde gelebiliyor. Dosya taşıyan formlar multipart, düğmeden
  // yapılan basit gönderimler urlencoded. Eskiden her istek multipart olarak
  // ayrıştırılıyordu ve urlencoded gelenler "Could not parse content as
  // FormData" ile düşüyordu — çerçeve silme düğmesi bu yüzden hiçbir şey
  // yapmıyordu, üstelik hata da göstermeden. İçerik türüne bakıyoruz.
  const contentType = request.headers.get("content-type") ?? "";
  const form = contentType.includes("multipart/form-data")
    ? await unstable_parseMultipartFormData(
        request,
        unstable_createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD }),
      )
    : await request.formData();
  const intent = String(form.get("intent") ?? "");

  // ── Save template ─────────────────────────────────────────────────────────
  if (intent === "save") {
    const name        = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const photo_x     = parseInt(String(form.get("photo_x") ?? "0"), 10);
    const photo_y     = parseInt(String(form.get("photo_y") ?? "0"), 10);
    const photo_width  = parseInt(String(form.get("photo_width") ?? "400"), 10);
    const photo_height = parseInt(String(form.get("photo_height") ?? "400"), 10);
    const ai_style    = String(form.get("ai_style") ?? "caricature");
    const hole_seed_x = parseInt(String(form.get("hole_seed_x") ?? "-1"), 10);
    const hole_seed_y = parseInt(String(form.get("hole_seed_y") ?? "-1"), 10);
    const layout_mode = normalizeLayoutMode(form.get("layout_mode"));
    const category = normalizePersonalizerCategory(form.get("category"), layout_mode);

    const ai_config = normalizeAiConfig((() => {
      try { return JSON.parse(String(form.get("ai_config") ?? "{}")); }
      catch { return {}; }
    })());

    let scatter_config: import("~/models/personalizer.server").ScatterTemplateConfig | undefined;
    try {
      const raw = String(form.get("scatter_config") ?? "");
      if (raw) scatter_config = JSON.parse(raw);
    } catch { /* bozuk JSON — varsayilanla devam */ }

    // Yalnızca kelime sanatı kartı bu alanı gönderir; diğer tiplerde kayıtlı
    // ayar olduğu gibi kalsın diye undefined bırakılır
    const rawWordArt = form.get("wordart_config");
    const wordart_config = rawWordArt ? normalizeWordArtConfig((() => {
      try { return JSON.parse(String(rawWordArt)); }
      catch { return {}; }
    })(), FONT_LIBRARY.map((f) => f.id)) : undefined;

    const customer_options = normalizeCustomerOptions(
      (() => {
        try { return JSON.parse(String(form.get("customer_options") ?? "{}")); }
        catch { return {}; }
      })(),
    );

    // Süsleme görseli: yeni dosya varsa yükle, yoksa mevcut adresi koru
    let decoration_url = String(form.get("existing_decoration_url") ?? "");
    const decorationFile = form.get("decoration_image");
    if (decorationFile instanceof File && decorationFile.size > 0) {
      let buf = Buffer.from(await decorationFile.arrayBuffer());
      let ext = decorationFile.type === "image/webp" ? "webp" : "png";
      // Süsleme fotoğrafların üstüne serpiştirildiği için zemini şeffaf olmalı;
      // beyaz zeminli bir dosya baskıda kare lekeler bırakıyor. Kutu işaretliyse
      // yüklemeden önce temizliyoruz. Görsel zaten şeffafsa dokunulmaz ve kota
      // harcanmaz. Temizlik başarısız olursa yükleme iptal edilmez — merchant
      // dosyasını kaybetmesin diye orijinaliyle devam edilir.
      if (String(form.get("decoration_remove_bg") ?? "") === "on") {
        try {
          const cleaned = await removeBackgroundFromBuffer(shop, buf, decorationFile.type || "image/png");
          if (cleaned.changed) {
            buf = cleaned.buffer;
            ext = "png";
          }
        } catch (err) {
          console.error("[personalizer] süsleme arka planı temizlenemedi:", err);
        }
      }
      decoration_url = await uploadToR2(buf, ext, "personalizer-decoration");
    }
    // Fotoğrafların ÜSTÜNDE duran katman. Şeffaf delikli tasarımlarda aynı dosya
    // hem alan kaynağı hem üst katman olur: fotoğraf deliğin arkasından görünür,
    // çerçeve ve süslemeler fotoğrafın üstünde kalır.
    let overlay_url: string | undefined;
    const overlayFile = form.get("overlay_image");
    if (overlayFile instanceof File && overlayFile.size > 0) {
      const buf = Buffer.from(await overlayFile.arrayBuffer());
      const ext = overlayFile.type === "image/webp" ? "webp" : "png";
      overlay_url = await uploadToR2(buf, ext, "personalizer-overlay");
    }

    const sort_order  = parseInt(String(form.get("sort_order") ?? "0"), 10);

    // Fotoğraf alanları, parçalar, ölçü ve ürün görselleri Çerçeve
    // Stüdyosu'nun kaydıyla yazılıyor; bu form onlara dokunmuyor. Eskiden
    // form sayfa açıldığı andaki değerleri geri gönderiyordu ve stüdyoda
    // yapılan iş, arkada açık kalmış bir şablon sayfası kaydedilince siliniyordu.

    if (!name) return json({ error: "İsim gerekli" }, { status: 400 });

    let text_fields: TextFieldDef[] = [];
    try { text_fields = JSON.parse(String(form.get("text_fields") ?? "[]")); } catch { /* ignore */ }

    // Görseller yalnızca yeni dosya yüklenince değişir. Sayfada kaldırma
    // düğmesi yok; mevcut adresi geri yazmak, stüdyoda değiştirilen görseli
    // eski sayfanın kaydıyla ezmekten başka bir şey yapmıyordu.
    let template_url: string | undefined;
    const templateFile = form.get("template_image");
    if (templateFile instanceof File && templateFile.size > 0) {
      const buf = Buffer.from(await templateFile.arrayBuffer());
      const ext = templateFile.type === "image/jpeg" ? "jpg" : templateFile.type === "image/webp" ? "webp" : "png";
      template_url = await uploadToR2(buf, ext, "personalizer-template");
    }
    // template_url opsiyonel — sadece çerçeve bazlı kullanımda boş olabilir

    if (id === "new") {
      const created = await createPersonalizerTemplate({ shop, name, description, template_url: template_url ?? "", photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, hole_seed_x, hole_seed_y, layout_mode, category, scatter_config, decoration_url, customer_options, ai_config, wordart_config, sort_order, overlay_url: overlay_url ?? "" });
      // json döndür, client tarafı navigate etsin (Shopify embedded app redirect güvenilmez)
      return json({ redirectTo: `/app/personalizer/${created.id}` });
    } else {
      await updatePersonalizerTemplate(id, shop, { name, description, template_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, hole_seed_x, hole_seed_y, layout_mode, category, scatter_config, decoration_url, customer_options, ai_config, wordart_config, sort_order, overlay_url });
      return json({ ok: true });
    }
  }

  // ── Add frame ─────────────────────────────────────────────────────────────
  if (intent === "add_frame") {
    const templateId = id === "new" ? "" : id;
    if (!templateId) return json({ error: "Önce şablonu kaydedin" }, { status: 400 });

    const frameName    = String(form.get("frame_name") ?? "").trim() || "Çerçeve";
    const mockup_x     = parseInt(String(form.get("mockup_x") ?? "0"), 10);
    const mockup_y     = parseInt(String(form.get("mockup_y") ?? "0"), 10);
    const mockup_width  = parseInt(String(form.get("mockup_width") ?? "0"), 10);
    const mockup_height = parseInt(String(form.get("mockup_height") ?? "0"), 10);
    const sort_order   = parseInt(String(form.get("sort_order") ?? "0"), 10);
    let text_fields: TextFieldDef[] = [];
    try { text_fields = JSON.parse(String(form.get("frame_text_fields") ?? "[]")); } catch { /* ignore */ }

    const mockupFile = form.get("mockup_image");
    if (!(mockupFile instanceof File) || mockupFile.size === 0) {
      return json({ error: "Çerçeve görseli gerekli" }, { status: 400 });
    }
    const buf = Buffer.from(await mockupFile.arrayBuffer());
    const ext = mockupFile.type === "image/jpeg" ? "jpg" : mockupFile.type === "image/webp" ? "webp" : "png";
    const mockup_url = await uploadToR2(buf, ext, "personalizer-frame");

    await createPersonalizerFrame({ template_id: templateId, name: frameName, mockup_url, mockup_x, mockup_y, mockup_width, mockup_height, text_fields, sort_order });
    return json({ ok: true });
  }

  // ── Update frame ──────────────────────────────────────────────────────────
  if (intent === "update_frame") {
    const frameId = String(form.get("frame_id") ?? "");
    if (!frameId) return json({ error: "Çerçeve ID gerekli" }, { status: 400 });

    const frameName    = String(form.get("frame_name") ?? "").trim() || "Çerçeve";
    const mockup_x     = parseInt(String(form.get("mockup_x") ?? "0"), 10);
    const mockup_y     = parseInt(String(form.get("mockup_y") ?? "0"), 10);
    const mockup_width  = parseInt(String(form.get("mockup_width") ?? "0"), 10);
    const mockup_height = parseInt(String(form.get("mockup_height") ?? "0"), 10);
    const sort_order   = parseInt(String(form.get("sort_order") ?? "0"), 10);
    let text_fields: TextFieldDef[] = [];
    try { text_fields = JSON.parse(String(form.get("frame_text_fields") ?? "[]")); } catch { /* ignore */ }

    const input: Parameters<typeof updatePersonalizerFrame>[1] = {
      name: frameName,
      mockup_x,
      mockup_y,
      mockup_width,
      mockup_height,
      text_fields,
      sort_order,
    };

    const mockupFile = form.get("mockup_image");
    if (mockupFile instanceof File && mockupFile.size > 0) {
      const buf = Buffer.from(await mockupFile.arrayBuffer());
      const ext = mockupFile.type === "image/jpeg" ? "jpg" : mockupFile.type === "image/webp" ? "webp" : "png";
      input.mockup_url = await uploadToR2(buf, ext, "personalizer-frame");
    }

    await updatePersonalizerFrame(frameId, input);
    return json({ ok: true });
  }

  // ── Aktif / pasif ─────────────────────────────────────────────────────────
  // Eskiden yalnızca şablon listesindeki ⋯ menüsündeydi; editörde kurulumu
  // bitiren merchant şablonun pasif kaldığını fark etmiyordu.
  if (intent === "toggle_active") {
    if (id === "new") return json({ error: "Önce şablonu kaydedin" }, { status: 400 });
    await updatePersonalizerTemplate(id, shop, { active: form.get("active") === "true" });
    return json({ ok: true, toggled: true });
  }

  // ── Delete frame ──────────────────────────────────────────────────────────
  if (intent === "delete_frame") {
    const frameId = String(form.get("frame_id") ?? "");
    if (frameId) await deletePersonalizerFrame(frameId, id);
    return json({ ok: true });
  }

  // ── Ürün bağlantısını kaldır ─────────────────────────────────────────────
  if (intent === "unlink_product") {
    const productId = normalizeShopifyNumericId(String(form.get("product_id") ?? ""));
    if (!productId) return json({ error: "Shopify ürün ID gerekli" }, { status: 400 });

    const silinen = await unlinkPersonalizerProduct(shop, productId, id);

    // Metafield da silinmeli: tema bloğu ona bakıyor ve kayıt gitse bile
    // metafield dururken kişiselleştirme kutusu ürün sayfasında görünmeye
    // devam ederdi — üstelik artık hangi şablonu açacağını bilmeden.
    const meta = await clearProductTemplateMetafield(shop, productId);
    return json({ ok: true, unlinked: silinen, metafieldOk: meta.ok, metafieldError: meta.error ?? "" });
  }

  // ── Link Shopify product ─────────────────────────────────────────────────
  if (intent === "link_product") {
    if (id === "new") return json({ error: "Önce şablonu kaydedin" }, { status: 400 });
    const template = await getPersonalizerTemplate(id, shop);
    if (!template) return json({ error: "Şablon bulunamadı" }, { status: 404 });

    const productId = normalizeShopifyNumericId(String(form.get("product_id") ?? ""));
    const variantId = normalizeShopifyNumericId(String(form.get("variant_id") ?? ""));
    const productTitle = String(form.get("product_title") ?? "").trim();
    const productHandle = String(form.get("product_handle") ?? "").trim();
    if (!productId) return json({ error: "Shopify ürün ID gerekli" }, { status: 400 });

    // Bir ürünün ön ve arka yüzü aynı şablona tek kayıtta bağlanabilmeli.
    // Eskiden tek değer okunuyordu ve merchant aynı ürünü iki kez eklemek
    // zorundaydı; unutulunca arka yüzde "Fotoğrafını ekle" hiç çıkmıyordu.
    // İşaretlenmeyen yüze dokunulmaz — o yüz başka bir şablona bağlı olabilir,
    // kaldırmak için satırdaki "Bağlantıyı kaldır" düğmesi var.
    const secilenYuzler = Array.from(
      new Set(form.getAll("side").map((value) => normalizeSide(value))),
    );
    const sides = template.layout_mode === "ai"
      ? (["front", "back"] as TemplateSide[])
      : (secilenYuzler.length > 0 ? secilenYuzler : (["front"] as TemplateSide[]));
    await Promise.all(sides.map((side) => linkPersonalizerProduct({
      shop,
      product_id: productId,
      side,
      template_id: id,
      product_title: productTitle,
      product_handle: productHandle,
      variant_id: variantId,
    })));

    // Bağlantı iki ayrı şeyi besliyor ve ikisi aynı şablon türüne ait değil:
    //
    //   1. Tema bloğu ürün metafield'ını okuyup ÜRÜN SAYFASINDA ayrı bir
    //      kişiselleştirme kutusu açıyor. Bu, çoklu fotoğraf alanı olan
    //      şablonlar için — "6 fotoğraflı çerçeve" gibi.
    //   2. /api/designer-config bağlantıyı okuyup TASARIMCININ İÇİNDE
    //      "Fotoğrafını ekle" panelini gösteriyor. Bu, maske/AI şablonları
    //      için — tişörte basılan kalpli tasarım gibi.
    //
    // Metafield'ı ayrım gözetmeden yazınca ikisi çakışıyordu: tişört ürününde
    // hem tasarımcı hem de üstünde istenmeyen bir kişiselleştirme kutusu
    // çıkıyordu. Canlıda tam olarak bu oldu. Metafield artık yalnızca slot
    // taşıyan şablonlarda yazılıyor; diğerlerinde temizleniyor ki eski bir
    // değer kalıp kutuyu açmaya devam etmesin.
    const slotluMu =
      (Array.isArray(template.slots) && template.slots.length > 0)
      || (Array.isArray(template.pieces) && template.pieces.length > 0);

    const meta = slotluMu
      ? await setProductTemplateMetafield(shop, productId, id)
      : await clearProductTemplateMetafield(shop, productId);

    return json({
      ok: true,
      linked: true,
      kutuAcilir: slotluMu,
      metafieldOk: meta.ok,
      metafieldError: meta.ok ? undefined : meta.error,
    });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

// ── Visual Editor (template photo area) ─────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

type EditorMode = { type: "photo" } | { type: "text"; idx: number } | { type: "hole" };

interface HoleDetectResult {
  found: boolean;
  message?: string;
  mode?: string;
  coverage?: number;
  hole?: { x: number; y: number; width: number; height: number; pixels: number };
  maskPreview?: string;
}

/** Şablonda fotoğrafın gireceği boşluğu sunucuda tespit ettirir. */
async function detectHole(templateUrl: string, point?: { x: number; y: number }): Promise<HoleDetectResult> {
  const res = await fetch("/api/personalizer/detect-hole", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateUrl, ...(point ?? {}) }),
  });
  if (!res.ok) return { found: false, message: `Tespit basarisiz (${res.status})` };
  return res.json() as Promise<HoleDetectResult>;
}

function TemplatePhotoEditor({
  imageUrl,
  photoRect,
  onPhotoRect,
  textFields,
  onTextPos,
  holeSeed,
  onHoleSeed,
  textOnly = false,
  startWithHole = false,
}: {
  imageUrl: string;
  photoRect: Rect;
  onPhotoRect: (r: Rect) => void;
  textFields: TextFieldDef[];
  onTextPos: (idx: number, x: number, y: number) => void;
  holeSeed: { x: number; y: number };
  onHoleSeed: (x: number, y: number) => void;
  textOnly?: boolean;
  /** Tişört tasarımlarında baskıyı boşluk noktası belirliyor, dikdörtgen değil. */
  startWithHole?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [holeInfo, setHoleInfo] = useState<HoleDetectResult | null>(null);
  const [holeBusy, setHoleBusy] = useState(false);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>(() => (
    textOnly && textFields.length ? { type: "text", idx: 0 } : startWithHole ? { type: "hole" } : { type: "photo" }
  ));

  function getCoords(e: React.MouseEvent) {
    const img = imgRef.current!;
    const rect = img.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) * (naturalW / rect.width)),
      y: Math.round((e.clientY - rect.top) * (naturalH / rect.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    if (textOnly && mode.type !== "text") return;
    if (mode.type === "hole") {
      const c = getCoords(e);
      onHoleSeed(c.x, c.y);
      setHoleBusy(true);
      detectHole(imageUrl, { x: c.x, y: c.y })
        .then(setHoleInfo)
        .catch((err) => setHoleInfo({ found: false, message: String(err) }))
        .finally(() => setHoleBusy(false));
      return;
    }
    if (mode.type === "text") {
      const c = getCoords(e);
      onTextPos(mode.idx, c.x, c.y);
      return;
    }
    const c = getCoords(e);
    setDragStart(c);
    setDragging(true);
    onPhotoRect({ x: c.x, y: c.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || mode.type !== "photo") return;
    const c = getCoords(e);
    onPhotoRect({
      x: Math.min(dragStart.x, c.x),
      y: Math.min(dragStart.y, c.y),
      w: Math.abs(c.x - dragStart.x),
      h: Math.abs(c.y - dragStart.y),
    });
  }

  function onMouseUp() { setDragging(false); }

  const isPhotoMode = mode.type === "photo";
  const img = imgRef.current;
  const dispW = img?.getBoundingClientRect().width ?? 1;
  const dispH = img?.getBoundingClientRect().height ?? 1;
  const sx = dispW / naturalW;
  const sy = dispH / naturalH;

  return (
    <BlockStack gap="300">
      <InlineStack gap="200" wrap>
        {!textOnly && (
          <>
            <Button size="slim" variant={isPhotoMode ? "primary" : "secondary"} onClick={() => setMode({ type: "photo" })}>
              📷 Fotoğraf alanı çiz
            </Button>
            <Button size="slim" variant={mode.type === "hole" ? "primary" : "secondary"} onClick={() => setMode({ type: "hole" })}>
              🎯 Resmin gireceği boşluk
            </Button>
          </>
        )}
        {textFields.map((f, idx) => (
          <Button key={f.id} size="slim"
            variant={mode.type === "text" && mode.idx === idx ? "primary" : "secondary"}
            onClick={() => setMode({ type: "text", idx })}
          >
            {`T${idx + 1} "${f.label}"`}
          </Button>
        ))}
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        {textOnly && textFields.length === 0
          ? "Önce Müşteriden Alınacak Metinler bölümünden bir alan ekleyin."
          : mode.type === "hole"
          ? "Tasarımda fotoğrafın görüneceği BOŞ alana tıklayın. Şeklini sistem kendisi bulur; dikdörtgen çizmenize gerek yok."
          : isPhotoMode
            ? "Karikatürün yerleştirileceği alana tıklayıp sürükleyin."
            : `"${textFields[(mode as { type: "text"; idx: number }).idx]?.label}" metninin konumuna tıklayın.`}
      </Text>
      <div
        style={{ position: "relative", display: "inline-block", cursor: !textOnly && isPhotoMode ? "crosshair" : "cell", userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Şablon"
          style={{ display: "block", maxWidth: "100%", maxHeight: "65vh", borderRadius: 8, border: "1px solid #e5e7eb" }}
          onLoad={(e) => { setNaturalW(e.currentTarget.naturalWidth || 1); setNaturalH(e.currentTarget.naturalHeight || 1); }}
          draggable={false}
        />
        {!textOnly && photoRect.w > 0 && photoRect.h > 0 && (
          <div style={{ position: "absolute", left: photoRect.x * sx, top: photoRect.y * sy, width: photoRect.w * sx, height: photoRect.h * sy, border: "2px solid #6366f1", background: "rgba(99,102,241,0.15)", pointerEvents: "none", boxSizing: "border-box" }}>
            <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 700, color: "#4f46e5", background: "rgba(255,255,255,.85)", padding: "0 4px", borderRadius: 3 }}>
              📷 {photoRect.w}×{photoRect.h}
            </span>
          </div>
        )}
        {!textOnly && holeInfo?.found && holeInfo.maskPreview && (
          <img
            src={holeInfo.maskPreview}
            alt="Bulunan alan"
            style={{ position: "absolute", left: 0, top: 0, width: dispW, height: dispH, pointerEvents: "none", zIndex: 5 }}
          />
        )}
        {!textOnly && holeSeed.x >= 0 && holeSeed.y >= 0 && (
          <div style={{ position: "absolute", left: holeSeed.x * sx, top: holeSeed.y * sy, transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 11 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#6366f1", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.4)" }} />
          </div>
        )}
        {textFields.map((f, idx) => {
          if (naturalW === 1) return null;
          const isActive = mode.type === "text" && (mode as { type: "text"; idx: number }).idx === idx;
          return (
            <div key={f.id} style={{ position: "absolute", left: f.x * sx, top: f.y * sy, transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 10 }}>
              <div style={{ background: isActive ? "#6366f1" : "#10b981", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                T{idx + 1} {f.label}
              </div>
            </div>
          );
        })}
      </div>
      {!textOnly && mode.type === "hole" && (
        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
          <BlockStack gap="200">
            {holeBusy && <Text as="p" variant="bodySm">Alan taranıyor…</Text>}
            {!holeBusy && holeInfo?.found && holeInfo.hole && (
              <>
                <Banner tone="success">
                  {`Alan bulundu: ${holeInfo.hole.width}×${holeInfo.hole.height} px — tasarımın %${holeInfo.coverage ?? 0}'i. Müşterinin fotoğrafı tam bu şekle oturacak.`}
                </Banner>
                <Text as="p" tone="subdued" variant="bodySm">Mor alan doğru değilse boşluğun başka bir yerine tıklayın.</Text>
              </>
            )}
            {!holeBusy && holeInfo && !holeInfo.found && (
              <Banner tone="warning">{holeInfo.message ?? "Alan bulunamadı."}</Banner>
            )}
            {!holeBusy && !holeInfo && (
              <Text as="p" tone="subdued" variant="bodySm">Şablonda fotoğrafın görüneceği boşluğa tıklayın.</Text>
            )}
          </BlockStack>
        </Box>
      )}
      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
        {!textOnly && <Text as="p" variant="bodySm">{`📷 X=${photoRect.x} Y=${photoRect.y} — ${photoRect.w}×${photoRect.h} px`}</Text>}
        {!textOnly && holeSeed.x >= 0 && <Text as="p" variant="bodySm">{`🎯 Boşluk noktası: X=${holeSeed.x} Y=${holeSeed.y}`}</Text>}
        {textFields.map((f, idx) => (
          <Text key={f.id} as="p" variant="bodySm">{`T${idx + 1} ${f.label}: X=${f.x} Y=${f.y}`}</Text>
        ))}
      </Box>
    </BlockStack>
  );
}

// ── Frame inner-area editor (drag on frame image) ────────────────────────────

function FrameAreaEditor({
  imageUrl,
  rect,
  onRect,
  textFields = [],
  onTextPos,
}: {
  imageUrl: string;
  rect: Rect;
  onRect: (r: Rect) => void;
  textFields?: TextFieldDef[];
  onTextPos?: (idx: number, x: number, y: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>({ type: "photo" });

  function getCoords(e: React.MouseEvent) {
    const img = imgRef.current!;
    const r = img.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * (naturalW / r.width)),
      y: Math.round((e.clientY - r.top) * (naturalH / r.height)),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    if (mode.type === "text") {
      const c = getCoords(e);
      onTextPos?.(mode.idx, c.x, c.y);
      return;
    }
    const c = getCoords(e);
    setDragStart(c);
    setDragging(true);
    onRect({ x: c.x, y: c.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || mode.type !== "photo") return;
    const c = getCoords(e);
    onRect({
      x: Math.min(dragStart.x, c.x),
      y: Math.min(dragStart.y, c.y),
      w: Math.abs(c.x - dragStart.x),
      h: Math.abs(c.y - dragStart.y),
    });
  }

  function onMouseUp() { setDragging(false); }

  const img = imgRef.current;
  const dispW = img?.getBoundingClientRect().width ?? 1;
  const dispH = img?.getBoundingClientRect().height ?? 1;
  const sx = dispW / naturalW;
  const sy = dispH / naturalH;
  const isPhotoMode = mode.type === "photo";

  return (
    <BlockStack gap="200">
      <InlineStack gap="200" wrap>
        <Button size="slim" variant={isPhotoMode ? "primary" : "secondary"} onClick={() => setMode({ type: "photo" })}>
          Fotoğraf alanı çiz
        </Button>
        {textFields.map((f, idx) => (
          <Button
            key={f.id}
            size="slim"
            variant={mode.type === "text" && mode.idx === idx ? "primary" : "secondary"}
            onClick={() => setMode({ type: "text", idx })}
          >
            {`Y${idx + 1} "${f.label}"`}
          </Button>
        ))}
      </InlineStack>
      <Text as="p" tone="subdued" variant="bodySm">
        {isPhotoMode
          ? "Çerçevenin boş iç alanına tıklayıp sürükleyin; müşterinin fotoğrafı buraya yerleşecek."
          : `"${textFields[(mode as { type: "text"; idx: number }).idx]?.label}" yazısının konumuna tıklayın.`}
      </Text>
      <div
        style={{ position: "relative", display: "inline-block", cursor: isPhotoMode ? "crosshair" : "cell", userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Çerçeve"
          style={{ display: "block", maxWidth: "100%", maxHeight: "400px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          onLoad={(e) => { setNaturalW(e.currentTarget.naturalWidth || 1); setNaturalH(e.currentTarget.naturalHeight || 1); }}
          draggable={false}
        />
        {rect.w > 0 && rect.h > 0 && (
          <div style={{ position: "absolute", left: rect.x * sx, top: rect.y * sy, width: rect.w * sx, height: rect.h * sy, border: "2px solid #f59e0b", background: "rgba(245,158,11,0.2)", pointerEvents: "none", boxSizing: "border-box" }}>
            <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 700, color: "#b45309", background: "rgba(255,255,255,.85)", padding: "0 4px", borderRadius: 3 }}>
              Foto {rect.w}x{rect.h}
            </span>
          </div>
        )}
        {textFields.map((f, idx) => {
          if (naturalW === 1) return null;
          const active = mode.type === "text" && mode.idx === idx;
          return (
            <div key={f.id} style={{ position: "absolute", left: f.x * sx, top: f.y * sy, transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 10 }}>
              <div style={{ background: active ? "#6366f1" : "#10b981", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                Y{idx + 1} {f.label}
              </div>
            </div>
          );
        })}
      </div>
      {rect.w > 0 && (
        <Text as="p" variant="bodySm" tone="subdued">{`X=${rect.x} Y=${rect.y} — ${rect.w}×${rect.h} px`}</Text>
      )}
      {textFields.map((f, idx) => (
        <Text key={f.id} as="p" variant="bodySm" tone="subdued">{`Y${idx + 1} ${f.label}: X=${f.x} Y=${f.y}`}</Text>
      ))}
    </BlockStack>
  );
}

// ── Add Frame Form ───────────────────────────────────────────────────────────

function FrameForm({ frame, onDone }: { frame?: PersonalizerFrame; onDone: () => void }) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const [frameName, setFrameName] = useState(frame?.name ?? "");
  const [previewUrl, setPreviewUrl] = useState(frame?.mockup_url ?? "");
  const [rect, setRect] = useState<Rect>({
    x: frame?.mockup_x ?? 0,
    y: frame?.mockup_y ?? 0,
    w: frame?.mockup_width ?? 0,
    h: frame?.mockup_height ?? 0,
  });
  const [textFields, setTextFields] = useState<TextFieldDef[]>(
    frame?.text_fields?.length
      ? frame.text_fields
      : [{ ...newTextField(), label: "Yazı", placeholder: "Yazınızı girin", x: 500, y: 900, font_size: 64, max_length: 40 }],
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const isLoading = fetcher.state !== "idle";
  const isEdit = Boolean(frame);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      setRect({ x: 0, y: 0, w: 0, h: 0 });
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("intent", isEdit ? "update_frame" : "add_frame");
    if (frame) fd.set("frame_id", frame.id);
    fd.set("mockup_x", String(rect.x));
    fd.set("mockup_y", String(rect.y));
    fd.set("mockup_width", String(rect.w));
    fd.set("mockup_height", String(rect.h));
    fd.set("frame_text_fields", JSON.stringify(textFields));
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  }

  function addFrameTextField() {
    setTextFields((p) => [...p, { ...newTextField(), label: "Yazı", placeholder: "Yazınızı girin", x: 500, y: 900, font_size: 64, max_length: 40 }]);
  }

  function removeFrameTextField(idx: number) {
    setTextFields((p) => p.filter((_, i) => i !== idx));
  }

  function updateFrameTextField<K extends keyof TextFieldDef>(idx: number, key: K, val: TextFieldDef[K]) {
    setTextFields((p) => p.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  }

  const handleFrameTextPos = useCallback((idx: number, x: number, y: number) => {
    setTextFields((p) => p.map((f, i) => i === idx ? { ...f, x, y } : f));
  }, []);

  if (fetcher.data?.ok) {
    onDone();
    return null;
  }

  return (
    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <input type="hidden" name="intent" value={isEdit ? "update_frame" : "add_frame"} />
        {frame && <input type="hidden" name="frame_id" value={frame.id} />}
        <input type="hidden" name="sort_order" value={frame?.sort_order ?? 0} />
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{isEdit ? "Çerçeveyi Düzenle" : "Yeni Çerçeve"}</Text>
          {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
          <TextField
            label="Çerçeve Adı"
            name="frame_name"
            value={frameName}
            onChange={setFrameName}
            autoComplete="off"
            placeholder="Örn: Ahşap Koyu Çerçeve"
          />
          <BlockStack gap="100">
            <Text as="span" variant="bodySm" fontWeight="semibold">Çerçeve Görseli</Text>
            <input ref={fileRef} type="file" name="mockup_image" accept="image/png,image/jpeg,image/webp" onChange={handleFile} required={!isEdit} />
          </BlockStack>

          {previewUrl && (
            <FrameAreaEditor
              imageUrl={previewUrl}
              rect={rect}
              onRect={setRect}
              textFields={textFields}
              onTextPos={handleFrameTextPos}
            />
          )}

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h4" variant="headingSm">Yazı Alanları</Text>
              <Button onClick={addFrameTextField} size="slim">+ Yazı Alanı</Button>
            </InlineStack>
            {textFields.length === 0 && (
              <Text as="p" tone="subdued" variant="bodySm">Bu çerçevede yazı alanı olmayacak.</Text>
            )}
            {textFields.map((f, idx) => (
              <Box key={f.id} background="bg-surface" padding="300" borderRadius="200">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodySm" fontWeight="semibold">{`Y${idx + 1} - ${f.label}`}</Text>
                    <Button tone="critical" size="slim" onClick={() => removeFrameTextField(idx)}>Sil</Button>
                  </InlineStack>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField label="Etiket" value={f.label} onChange={(v) => updateFrameTextField(idx, "label", v)} autoComplete="off" />
                      <TextField label="Placeholder" value={f.placeholder} onChange={(v) => updateFrameTextField(idx, "placeholder", v)} autoComplete="off" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField label="X (px)" type="number" value={String(f.x)} onChange={(v) => updateFrameTextField(idx, "x", parseInt(v, 10) || 0)} autoComplete="off" helpText="Üstteki Y butonu ile ayarlanır" />
                      <TextField label="Y (px)" type="number" value={String(f.y)} onChange={(v) => updateFrameTextField(idx, "y", parseInt(v, 10) || 0)} autoComplete="off" helpText="Üstteki Y butonu ile ayarlanır" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField label="Font Büyüklüğü" type="number" value={String(f.font_size)} onChange={(v) => updateFrameTextField(idx, "font_size", parseInt(v, 10) || 60)} autoComplete="off" />
                      <TextField label="Renk" value={f.color} onChange={(v) => updateFrameTextField(idx, "color", v)} autoComplete="off" placeholder="#000000" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField label="Maks. Karakter" type="number" value={String(f.max_length)} onChange={(v) => updateFrameTextField(idx, "max_length", parseInt(v, 10) || 30)} autoComplete="off" />
                      <Select
                        label="Hizalama"
                        options={[{ label: "Sol", value: "left" }, { label: "Orta", value: "center" }, { label: "Sağ", value: "right" }]}
                        value={f.align}
                        onChange={(v) => updateFrameTextField(idx, "align", v as TextFieldDef["align"])}
                      />
                    </FormLayout.Group>
                    <Checkbox label="Kalın" checked={f.bold} onChange={(v) => updateFrameTextField(idx, "bold", v)} />
                  </FormLayout>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>

          <InlineStack gap="200">
            <Button submit variant="primary" loading={isLoading} disabled={!previewUrl || rect.w === 0}>
              {isEdit ? "Değişiklikleri Kaydet" : "Çerçeveyi Kaydet"}
            </Button>
            <Button onClick={onDone}>İptal</Button>
          </InlineStack>
          {rect.w === 0 && previewUrl && (
            <Text as="p" tone="caution" variant="bodySm">Kaydetmeden önce iç alanı çizin.</Text>
          )}
        </BlockStack>
      </form>
    </Box>
  );
}

// ── Frames List Section ──────────────────────────────────────────────────────

function FramesSection({ templateId, frames }: { templateId: string; frames: PersonalizerFrame[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const revalidator = useRevalidator();
  const deleteFetcher = useFetcher();

  function handleDelete(frameId: string) {
    if (!confirm("Bu çerçeveyi silmek istiyor musunuz?")) return;
    deleteFetcher.submit({ intent: "delete_frame", frame_id: frameId }, { method: "POST" });
  }

  function handleDone() {
    setShowAdd(false);
    setEditingFrameId(null);
    revalidator.revalidate();
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">Çerçeve Seçenekleri</Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Müşteri tek fotoğraf ve yazı girer; önizleme tüm çerçevelerde aynı anda oluşur. Her çerçeve için fotoğraf ve yazı alanını işaretleyin.
          </Text>
        </BlockStack>
        {!showAdd && !editingFrameId && (
          <Button onClick={() => setShowAdd(true)} variant="primary" size="slim">
            + Çerçeve Ekle
          </Button>
        )}
      </InlineStack>

      {frames.length === 0 && !showAdd && (
        <Box background="bg-surface-secondary" padding="400" borderRadius="200">
          <Text as="p" tone="subdued" alignment="center">
            Henüz çerçeve eklenmedi. Müşterilerin seçebilmesi için en az bir çerçeve ekleyin.
          </Text>
        </Box>
      )}

      {frames.map((frame) => editingFrameId === frame.id ? (
        <Box key={frame.id} background="bg-surface-secondary" padding="400" borderRadius="200">
          <FrameForm frame={frame} onDone={handleDone} />
        </Box>
      ) : (
        <Box key={frame.id} background="bg-surface-secondary" padding="400" borderRadius="200">
          <InlineStack align="space-between" blockAlign="start" gap="400">
            <InlineStack gap="400" blockAlign="start">
              {frame.mockup_url && (
                <img
                  src={frame.mockup_url}
                  alt={frame.name}
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb", flexShrink: 0 }}
                />
              )}
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{frame.name}</Text>
                {frame.mockup_width > 0 ? (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {`İç alan: X=${frame.mockup_x} Y=${frame.mockup_y} — ${frame.mockup_width}×${frame.mockup_height} px`}
                  </Text>
                ) : (
                  <Badge tone="warning">İç alan koordinatı eksik</Badge>
                )}
                {frame.text_fields?.length > 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {`${frame.text_fields.length} yazı alanı`}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200" wrap={false}>
              <Button size="slim" onClick={() => { setShowAdd(false); setEditingFrameId(frame.id); }}>
                Düzenle
              </Button>
              <Button
                tone="critical"
                size="slim"
                onClick={() => handleDelete(frame.id)}
                loading={deleteFetcher.state !== "idle"}
              >
                Sil
              </Button>
            </InlineStack>
          </InlineStack>
        </Box>
      ))}

      {showAdd && <FrameForm onDone={handleDone} />}
    </BlockStack>
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function newTextField(): TextFieldDef {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: "İsim",
    placeholder: "Adınızı girin",
    default_value: "",
    x: 1240,
    y: 3200,
    font_size: 120,
    color: "#000000",
    bold: true,
    max_length: 30,
    align: "center",
  };
}

// ── Sayfa düzeni yardımcıları ────────────────────────────────────────────────

/**
 * Editör dört farklı ürün akışını tek sayfada taşıyor ve her bölüm her
 * şablonda açık duruyordu; merchant hangi alanın kendi ürünü için gerektiğini
 * ayırt edemiyordu. Akış, kayıtlı yerleşim yönteminden ve ürün grubundan
 * çıkarılıyor; bölümler buna göre sıralanıp gerisi "Gelişmiş" altına iniyor.
 */
type EditorFlow = "apparel" | "frame" | "boxer" | "ai" | "wordart";

function editorFlow(
  layoutMode: string,
  category: string,
  hasPhotoSlots: boolean,
): EditorFlow {
  if (layoutMode === "ai") return "ai";
  if (layoutMode === "scatter") return "boxer";
  if (layoutMode === "wordart") return "wordart";
  // Maskeli yöntem ürün grubundan bağımsız: canlıdaki boxer şablonu hazır
  // tasarım + fotoğraf deliğiyle çalışıyor. Fotoğraf alanı yoksa ve şablon
  // açıkça çerçeve değilse tasarım + boşluk akışı gösterilir.
  return category === "frame" || hasPhotoSlots ? "frame" : "apparel";
}

const CATEGORY_LABEL: Record<string, string> = {
  apparel: "Tişört ve giyim",
  frame: "Fotoğraflı çerçeve",
  boxer: "Boxer ve tekrarlı desen",
  ai: "AI portre",
  wordart: "Kelime sanatı",
};

const LAYOUT_LABEL: Record<string, string> = {
  mask: "maskeli",
  scatter: "dağıtımlı",
  ai: "AI",
  wordart: "kelime sanatı",
};

const FLOW_WHERE: Record<EditorFlow, string> = {
  apparel: "Müşteri ürün sayfasındaki tasarımcıda \"Fotoğrafını ekle\" der; fotoğraf bu tasarımdaki boşluğa yerleşir.",
  frame: "Ürün sayfasında ayrı bir kişiselleştirme kutusu açılır; müşteri fotoğraf alanlarını doldurur.",
  boxer: "Müşteri tasarımcıda fotoğrafını yükler; yüzü kesilip baskı alanına desen olarak dağıtılır.",
  ai: "Müşteri tasarımcıda fotoğraf ve yazı girer; seçilen stilde görsel ve baskı dosyası üretilir.",
  wordart: "Müşteri tasarımcıda kelimelerini yazar, şekil ve renk seçer; kelimeler şeklin içine dizilip ürüne yerleşir.",
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionCard({
  id, title, description, children, collapsible = false, defaultOpen = true,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} style={{ scrollMarginTop: 16 }}>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="start" gap="300" wrap={false}>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">{title}</Text>
              {description && <Text as="p" tone="subdued" variant="bodySm">{description}</Text>}
            </BlockStack>
            {collapsible && (
              <Button variant="plain" onClick={() => setOpen((v) => !v)} ariaExpanded={open}>
                {open ? "Gizle" : "Göster"}
              </Button>
            )}
          </InlineStack>
          {/* Kapalıyken DOM'dan çıkarılmıyor: içindeki dosya seçimleri ve adlı
              form alanları kayıtta gönderilmeye devam etmeli. */}
          <div hidden={collapsible && !open}>
            <BlockStack gap="400">{children}</BlockStack>
          </div>
        </BlockStack>
      </Card>
    </div>
  );
}

type ChecklistItem = {
  label: string;
  hint: string;
  state: "done" | "todo" | "optional" | "check";
  target?: string;
  url?: string;
  action?: string;
};

function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const required = items.filter((item) => item.state === "done" || item.state === "todo");
  const doneCount = required.filter((item) => item.state === "done").length;
  const ready = doneCount === required.length;
  const marks: Record<ChecklistItem["state"], { symbol: string; color: string }> = {
    done: { symbol: "✓", color: "#29845a" },
    todo: { symbol: "!", color: "#b28400" },
    optional: { symbol: "○", color: "#8a8a8a" },
    check: { symbol: "?", color: "#4a6bd6" },
  };
  return (
    <BlockStack gap="300">
      <InlineStack gap="200" blockAlign="center">
        <Badge tone={ready ? "success" : "attention"}>
          {ready ? "Müşteriye hazır" : `${doneCount}/${required.length} adım tamam`}
        </Badge>
        <Text as="span" tone="subdued" variant="bodySm">Kaydedilmiş hâle göre hesaplanır.</Text>
      </InlineStack>
      <BlockStack gap="0">
        {items.map((item) => (
          <div
            key={item.label}
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #ebebeb" }}
          >
            <span
              aria-hidden="true"
              style={{
                flex: "0 0 22px", height: 22, borderRadius: "50%", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                color: item.state === "done" ? "#fff" : marks[item.state].color,
                background: item.state === "done" ? marks.done.color : "transparent",
                border: `1.5px solid ${marks[item.state].color}`,
              }}
            >
              {marks[item.state].symbol}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text as="p" fontWeight="semibold">{item.label}</Text>
              <Text as="p" tone="subdued" variant="bodySm">{item.hint}</Text>
            </div>
            {item.action && item.state !== "done" && (item.target || item.url) && (
              item.url
                ? <Button size="slim" url={item.url} external>{item.action}</Button>
                : <Button size="slim" onClick={() => scrollToSection(item.target!)}>{item.action}</Button>
            )}
          </div>
        ))}
      </BlockStack>
    </BlockStack>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

function PersonalizerEditor() {
  const {
    shop, template, frames, productLinks, products, linkedAreaRatio, printProducts, isNew,
    productQuery, personalizerBlockUrl, designerBlockUrl,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; ok?: boolean; redirectTo?: string }>();
  const statusFetcher = useFetcher<{ error?: string; toggled?: boolean }>();
  const formRef = useRef<HTMLFormElement>(null);
  const [, setSearchParams] = useSearchParams();
  const [productSearch, setProductSearch] = useState(productQuery);
  const linkFetcher = useFetcher<{
    error?: string; ok?: boolean; linked?: boolean; unlinked?: number; kutuAcilir?: boolean;
    metafieldOk?: boolean; metafieldError?: string;
  }>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const availableProducts = products.filter((product): product is NonNullable<typeof product> => product !== null);
  const availableProductLinks = productLinks.filter(
    (link): link is NonNullable<typeof link> => link !== null,
  );
  const firstLinkedProduct = availableProductLinks[0];
  const initialProductId = firstLinkedProduct?.product_id || availableProducts[0]?.id || "";
  const initialProduct = availableProducts.find((product) => product.id === initialProductId) || availableProducts[0];
  // Varsayılan "tüm varyantlar": çoğu üründe tek şablon yeter, varyant ayrımı
  // yalnızca set gibi ürünlerde gerekiyor.
  const initialVariantId = firstLinkedProduct?.variant_id ?? "";
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const selectedProduct = availableProducts.find((product) => product.id === selectedProductId) || availableProducts[0];

  // Yeni şablon oluşturulduktan sonra client-side navigate
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.redirectTo) {
      navigate(fetcher.data.redirectTo);
    }
  }, [fetcher.state, fetcher.data, navigate]);

  useEffect(() => {
    // Bağlama ve kaldırma sonrası "Bağlı Ürünler" listesi tazelenmeli
    if (linkFetcher.state === "idle"
      && (linkFetcher.data?.linked || linkFetcher.data?.unlinked !== undefined)) {
      revalidator.revalidate();
    }
  }, [linkFetcher.state, linkFetcher.data, revalidator]);

  useEffect(() => {
    // Seçili ürün listede yoksa (arama sonucu değişti ya da bağlı ürün son 50
    // ürünün dışında kaldı) seçim listedeki ilk ürüne çekiliyor. Aksi hâlde
    // gizli alanlar bir ürünün kimliğini, başlık başka bir ürünün adını
    // taşıyıp yanlış kayıt oluşturabiliyordu.
    if (availableProducts.length === 0) return;
    if (!availableProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(availableProducts[0].id);
    }
  }, [availableProducts, selectedProductId]);

  useEffect(() => {
    if (!selectedProduct) return;
    // Boş değer "tüm varyantlar" demek ve geçerli bir seçim; ürün değişince
    // varsayılana dönüyoruz, çünkü eski varyant kimliği yeni üründe yok.
    if (selectedVariantId === "") return;
    const hasVariant = selectedProduct.variants.some((variant) => variant.id === selectedVariantId);
    if (!hasVariant) setSelectedVariantId("");
  }, [selectedProduct, selectedVariantId]);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [photoRect, setPhotoRect] = useState<Rect>({
    x: template?.photo_x ?? 440,
    y: template?.photo_y ?? 600,
    w: template?.photo_width ?? 1600,
    h: template?.photo_height ?? 1600,
  });
  const [layoutMode, setLayoutMode] = useState<"mask" | "scatter" | "ai" | "wordart">(template?.layout_mode ?? "mask");
  const [templateCategory, setTemplateCategory] = useState<PersonalizerCategory>(
    template?.category
      ?? (template?.layout_mode === "scatter" ? "boxer" : template?.layout_mode === "ai" ? "ai"
        : template?.layout_mode === "wordart" ? "wordart" : "frame"),
  );

  // ── Çerçeve Stüdyosu'nun alanları: burada yalnızca okunur ──────────────
  const slots = normalizeSlots(template?.slots ?? []);
  const printProductId = template?.print_product_id ?? "";
  const [overlayPreview, setOverlayPreview] = useState(template?.overlay_url ?? "");
  const pieces = normalizePieces(template?.pieces);
  const mockups = normalizeMockups(template?.mockups);

  const [decorationUrl, setDecorationUrl] = useState(template?.decoration_url ?? "");
  const [decorationRemoveBg, setDecorationRemoveBg] = useState(true);
  const sc = (template?.scatter_config ?? {}) as Partial<import("~/models/personalizer.server").ScatterTemplateConfig>;
  const [faceCount, setFaceCount] = useState(String(sc.faceCount ?? 13));
  const [decorationCount, setDecorationCount] = useState(String(sc.decorationCount ?? 8));
  const [faceScale, setFaceScale] = useState(String(Math.round((sc.faceScale ?? 0.16) * 100)));
  const [decorationScale, setDecorationScale] = useState(String(Math.round((sc.decorationScale ?? 0.1) * 100)));
  const [reserveText, setReserveText] = useState(sc.reserveCenter !== null);
  const [canvasWidth, setCanvasWidth] = useState(String(sc.canvasWidth ?? 2400));
  const [canvasHeight, setCanvasHeight] = useState(String(sc.canvasHeight ?? 1650));

  const co = (template?.customer_options ?? {}) as Partial<import("~/models/personalizer.server").CustomerOptionsConfig>;
  const [optDensity, setOptDensity] = useState(co.density === true);
  const [optPhotoSize, setOptPhotoSize] = useState(co.photoSize === true);
  const [optShuffle, setOptShuffle] = useState(co.shuffle === true);
  const [optAiStyles, setOptAiStyles] = useState<string[]>(
    Array.isArray(co.aiStyles) ? co.aiStyles.filter((s) => s in AI_STYLES) : [],
  );

  const ac = normalizeAiConfig(template?.ai_config);
  const [aiProvider, setAiProvider] = useState<AiProvider>(ac.provider);
  const [aiModel, setAiModel] = useState(ac.model);
  const [aiCanvasW, setAiCanvasW] = useState(String(ac.canvasWidth));
  const [aiCanvasH, setAiCanvasH] = useState(String(ac.canvasHeight));
  const [aiRemoveBg, setAiRemoveBg] = useState(ac.removeBackground);
  const aiModelOptions = AI_PROVIDERS[aiProvider].models.map((m) => ({ label: m.label, value: m.id }));
  const aiModelNote = AI_PROVIDERS[aiProvider].models.find((m) => m.id === aiModel)?.note ?? "";

  /** Sağlayıcı değişince model o sağlayıcının listesine düşmeli */
  const changeProvider = (next: string) => {
    const p = next === "cloudflare" ? "cloudflare" : "wavespeed";
    setAiProvider(p);
    setAiModel(AI_PROVIDERS[p].models[0].id);
  };

  const toggleAiStyle = (id: string) => {
    setOptAiStyles((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  /** AI dışı şablonlarda ürün bağlarken kullanılacak yüz. */
  const [linkSides, setLinkSides] = useState<Array<"front" | "back">>(["front"]);
  const toggleLinkSide = (side: "front" | "back", checked: boolean) =>
    setLinkSides((prev) => {
      const next = checked ? [...new Set([...prev, side])] : prev.filter((item) => item !== side);
      // Hiçbiri seçilmemiş bir bağlantı anlamsız; en az bir yüz kalsın.
      return next.length > 0 ? next : prev;
    });

  const canvasRatio = (parseInt(canvasWidth, 10) || 0) / Math.max(parseInt(canvasHeight, 10) || 1, 1);
  const canvasRatioLabel = canvasRatio > 0 ? `${canvasRatio.toFixed(2)} : 1` : "—";
  // Baskı kutusu oranından %5'ten fazla sapma gözle görülür boşluk bırakır.
  const canvasRatioWarning = Boolean(
    linkedAreaRatio && canvasRatio > 0
    && Math.abs(canvasRatio - linkedAreaRatio) / linkedAreaRatio > 0.05,
  );

  const [holeSeed, setHoleSeed] = useState({
    x: template?.hole_seed_x ?? -1,
    y: template?.hole_seed_y ?? -1,
  });
  const [aiStyle, setAiStyle] = useState(template?.ai_style ?? "caricature");
  const [sortOrder, setSortOrder] = useState(String(template?.sort_order ?? 0));
  const [textFields, setTextFields] = useState<TextFieldDef[]>(template?.text_fields ?? []);
  const [templatePreview, setTemplatePreview] = useState<string>(template?.template_url ?? "");

  const isLoading = fetcher.state !== "idle";
  const saveSuccess = fetcher.data?.ok === true;

  function addTextField() { setTextFields((p) => [...p, newTextField()]); }
  function removeTextField(idx: number) { setTextFields((p) => p.filter((_, i) => i !== idx)); }
  function updateTextField<K extends keyof TextFieldDef>(idx: number, key: K, val: TextFieldDef[K]) {
    setTextFields((p) => p.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  }
  const handleTextPos = useCallback((idx: number, x: number, y: number) => {
    setTextFields((p) => p.map((f, i) => i === idx ? { ...f, x, y } : f));
  }, []);

  function handleTemplateFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setTemplatePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fieldsToSave = layoutMode === "ai" && textFields.length === 0
      ? defaultAiTextFields(parseInt(aiCanvasW, 10) || 2400, parseInt(aiCanvasH, 10) || 3000)
      : textFields;
    fd.set("text_fields", JSON.stringify(fieldsToSave));
    fd.set("hole_seed_x", String(holeSeed.x));
    fd.set("hole_seed_y", String(holeSeed.y));
    fd.set("photo_x", String(photoRect.x));
    fd.set("photo_y", String(photoRect.y));
    fd.set("photo_width", String(photoRect.w));
    fd.set("photo_height", String(photoRect.h));
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  }

  const appUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";
  const embedUrl = template
    ? `${appUrl}/embed/personalizer?templateId=${template.id}&variantId=VARIANT_ID&shop=SHOP&locale=tr`
    : "";
  const productEmbedUrl = availableProductLinks[0]
    ? `${appUrl}/embed/personalizer?productId=${availableProductLinks[0].product_id}&variantId=${availableProductLinks[0].variant_id || "VARIANT_ID"}&shop=${shop}&locale=tr`
    : "";
  const productOptions = availableProducts.map((product) => ({
    label: productOptionLabel(product),
    value: product.id,
  }));
  // "Tüm varyantlar" ürünün varsayılanı: varyant seçilmemiş bağlantı her varyant
  // için geçerli olur. Belirli bir varyant seçilirse yalnızca o varyant o
  // şablona gider — "3'lü set"te Tam Alan ile Beyaz Kenarlı böyle ayrılıyor.
  const variantOptions = [
    { label: "Tüm varyantlar (varsayılan)", value: "" },
    ...(selectedProduct?.variants ?? []).map((variant) => ({
    label: variant.title === "Default Title"
      ? `Default Title${variant.price ? ` - ${variant.price}` : ""}`
      : `${variant.title}${variant.price ? ` - ${variant.price}` : ""}`,
    value: variant.id,
    })),
  ];
  const linkedProductGroups = Object.values(availableProductLinks.reduce<
    Record<string, Array<(typeof availableProductLinks)[number]>>
  >((groups, link) => {
    (groups[link.product_id] ??= []).push(link);
    return groups;
  }, {}));

  const hasPhotoSlots = slots.length > 0 || pieces.length > 0;
  const flow = editorFlow(layoutMode, templateCategory, hasPhotoSlots);
  const savedHasPhotoSlots = Boolean(
    template && ((template.slots?.length ?? 0) > 0 || (template.pieces?.length ?? 0) > 0),
  );
  const savedFlow = template
    ? editorFlow(template.layout_mode, template.category, savedHasPhotoSlots)
    : flow;
  // Bağlama işlemi KAYITLI şablona bakarak metafield yazıyor ya da siliyor.
  // Fotoğraf alanı eklenip kaydedilmeden ürün bağlanırsa kutu açılmıyordu.
  const slotChangeUnsaved = !isNew && hasPhotoSlots !== savedHasPhotoSlots;

  const productLinked = availableProductLinks.length > 0;
  const checklist: ChecklistItem[] = [];
  if (template) {
    if (savedFlow === "apparel") {
      checklist.push({
        label: "Tasarım görseli yüklendi",
        hint: "Fotoğrafın içine yerleşeceği tişört tasarımı (PNG önerilir).",
        state: template.template_url ? "done" : "todo",
        target: "pl-design", action: "Yükle",
      });
      checklist.push({
        label: "Fotoğrafın gireceği boşluk seçildi",
        hint: template.hole_seed_x >= 0
          ? "Boşluk noktası işaretli."
          : "İsteğe bağlı: seçilmezse tasarımdaki şeffaf delik otomatik aranır. Delik yoksa boşluğa tıklayın.",
        state: template.hole_seed_x >= 0 ? "done" : "optional",
        target: "pl-design", action: "İşaretle",
      });
    }
    if (savedFlow === "frame") {
      const piecesHavePrint = (template.pieces ?? []).some((piece) => piece.print_product_id);
      const piecesHaveSlots = (template.pieces ?? []).some((piece) => piece.slots.length > 0);
      checklist.push({
        label: "Baskı ebadı seçildi",
        hint: printProducts.length === 0
          ? "Stüdyoda \"Yeni ölçü tanımla\" ile çerçevenizin ölçüsünü ekleyin."
          : "Çerçevenin fiziksel ölçüsü; fotoğraf alanları bu ölçüde çizilir.",
        state: template.print_product_id || piecesHavePrint ? "done" : "todo",
        url: `/app/personalizer/${template.id}/studio`, action: "Stüdyoda seç",
      });
      checklist.push({
        label: "Fotoğraf alanları yerleştirildi",
        hint: "Müşterinin dolduracağı kutular. Stüdyoda hazır bir düzenle tek tıkla oluşturabilirsiniz.",
        state: (template.slots?.length ?? 0) > 0 || piecesHaveSlots ? "done" : "todo",
        url: `/app/personalizer/${template.id}/studio`, action: "Stüdyoyu aç",
      });
    }
    if (savedFlow === "boxer") {
      checklist.push({
        label: "Süsleme görseli",
        hint: "İsteğe bağlı: kalp, yıldız gibi fotoğrafların arasına serpiştirilen saydam görsel.",
        state: template.decoration_url ? "done" : "optional",
        target: "pl-scatter", action: "Ekle",
      });
    }
    checklist.push({
      label: "Shopify ürününe bağlandı",
      hint: productLinked
        ? `${linkedProductGroups.length} ürüne bağlı.`
        : "Şablon hangi üründe açılacağını bilmeden müşteriye görünmez.",
      state: productLinked ? "done" : "todo",
      target: "pl-link", action: "Ürün bağla",
    });
    if (savedFlow === "boxer" && productLinked) {
      checklist.push({
        label: "Bağlı ürünün baskı alanı tanımlı",
        hint: linkedAreaRatio
          ? "Desen ürünün baskı alanına göre ölçekleniyor."
          : "Ürünler sayfasında bu ürün için baskı alanı tanımlanmamış; desen varsayılan ölçüye düşer.",
        state: linkedAreaRatio ? "done" : "todo",
        url: "/app/products", action: "Ürün ayarları",
      });
    }
    checklist.push({
      label: "Şablon aktif",
      hint: template.active ? "Müşteriler bu şablonu görebilir." : "Pasif şablon ürün sayfasında açılmaz.",
      state: template.active ? "done" : "todo",
    });
    const blockUrl = savedFlow === "frame" ? personalizerBlockUrl : designerBlockUrl;
    checklist.push({
      label: savedFlow === "frame"
        ? "Ürün sayfasında \"PrintLab Kişiselleştirici\" bloğu var"
        : "Ürün sayfasında \"DesignKit\" tasarımcı bloğu var",
      hint: "Uygulama bunu otomatik göremez. Bir kez eklemeniz yeterli; tema düzenleyicide blok ekli açılır, Kaydet'e basın.",
      state: "check",
      url: blockUrl || undefined, action: "Tema düzenleyiciyi aç",
    });
  }

  // ── Bölümler ─────────────────────────────────────────────────────────────
  // Her bölüm bir kez tanımlanıp akışa göre ana sıraya ya da "Gelişmiş"
  // altına yerleştiriliyor; aynı dosya alanı sayfada iki kez bulunmamalı.

  const designUpload = (
    <BlockStack gap="200">
      {templatePreview && (
        <img src={templatePreview} alt="Şablon" style={{ maxWidth: 200, maxHeight: 200, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
      )}
      <input type="file" name="template_image" accept="image/png,image/jpeg,image/webp" onChange={handleTemplateFileChange} />
      <Text as="p" tone="subdued" variant="bodySm">Dosyayı seçtikten sonra sayfanın altındaki Kaydet'e basın.</Text>
    </BlockStack>
  );

  const photoEditor = templatePreview ? (
    <TemplatePhotoEditor
      imageUrl={templatePreview}
      photoRect={photoRect}
      onPhotoRect={setPhotoRect}
      textFields={textFields}
      onTextPos={handleTextPos}
      holeSeed={holeSeed}
      onHoleSeed={(x, y) => setHoleSeed({ x, y })}
      startWithHole={flow === "apparel"}
    />
  ) : null;

  const overlayUpload = (
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">Üst katman (isteğe bağlı)</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Fotoğrafların <b>üstünde</b> duracak tasarım. Şeffaf delikli şablonlarda
        tasarımın kendisini buraya da yükleyin: fotoğraf deliğin arkasından görünür,
        çerçeve ve yazılar fotoğrafın üstünde kalır. Izgara şablonlarında gerekmez.
      </Text>
      {overlayPreview && (
        <img src={overlayPreview} alt="Üst katman"
          style={{ maxWidth: 160, maxHeight: 160, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
      )}
      <input type="file" name="overlay_image" accept="image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setOverlayPreview(URL.createObjectURL(f));
        }} />
    </BlockStack>
  );

  const textFieldsEditor = (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" tone="subdued" variant="bodySm">
          {textFields.length === 0 ? "Henüz yazı alanı yok. Müşteriden isim, tarih gibi bir yazı alınacaksa ekleyin." : `${textFields.length} yazı alanı`}
        </Text>
        <Button onClick={addTextField} size="slim">+ Yazı alanı ekle</Button>
      </InlineStack>
      {textFields.map((f, idx) => (
        <Box key={f.id} background="bg-surface-secondary" padding="400" borderRadius="200">
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingSm">T{idx + 1} — {f.label}</Text>
              <Button tone="critical" size="slim" onClick={() => removeTextField(idx)}>Sil</Button>
            </InlineStack>
            <FormLayout>
              <FormLayout.Group>
                <TextField label="Müşterinin göreceği başlık" value={f.label} onChange={(v) => updateTextField(idx, "label", v)} autoComplete="off" />
                <TextField label="Örnek metin (kutu boşken görünür)" value={f.placeholder} onChange={(v) => updateTextField(idx, "placeholder", v)} autoComplete="off" />
              </FormLayout.Group>
              <TextField label="Maksimum karakter" type="number" value={String(f.max_length)} onChange={(v) => updateTextField(idx, "max_length", parseInt(v, 10) || 30)} autoComplete="off" />
              <TextField label="Varsayılan metin (isteğe bağlı)" value={f.default_value ?? ""} onChange={(v) => updateTextField(idx, "default_value", v)} autoComplete="off" helpText="Müşteri değiştirmezse bu metin basılır." />
            </FormLayout>
            <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#303030" }}>
                Yazı görünümü ve konumu
              </summary>
              <div style={{ marginTop: 14 }}>
                <FormLayout>
                  <FormLayout.Group>
                    <TextField label="X (px)" type="number" value={String(f.x)} onChange={(v) => updateTextField(idx, "x", parseInt(v, 10) || 0)} autoComplete="off" helpText="Yerleşim editöründen de ayarlanır" />
                    <TextField label="Y (px)" type="number" value={String(f.y)} onChange={(v) => updateTextField(idx, "y", parseInt(v, 10) || 0)} autoComplete="off" helpText="Yerleşim editöründen de ayarlanır" />
                  </FormLayout.Group>
                  <FormLayout.Group>
                    <TextField label="Font büyüklüğü (px)" type="number" value={String(f.font_size)} onChange={(v) => updateTextField(idx, "font_size", parseInt(v, 10) || 60)} autoComplete="off" />
                    <TextField label="Renk (hex)" value={f.color} onChange={(v) => updateTextField(idx, "color", v)} autoComplete="off" placeholder="#000000" />
                  </FormLayout.Group>
                  <Select
                    label="Hizalama"
                    options={[{ label: "Sol", value: "left" }, { label: "Orta", value: "center" }, { label: "Sağ", value: "right" }]}
                    value={f.align}
                    onChange={(v) => updateTextField(idx, "align", v as TextFieldDef["align"])}
                  />
                  <Checkbox label="Kalın yazı" checked={f.bold} onChange={(v) => updateTextField(idx, "bold", v)} />
                </FormLayout>
              </div>
            </details>
          </BlockStack>
        </Box>
      ))}
    </BlockStack>
  );

  const aiCard = (
    <SectionCard
      id="pl-ai"
      title="AI portre ayarları"
      description="Müşteri fotoğrafını ve metinleri girer; sistem görseli ve baskı dosyasını hazırlar."
    >
      <FormLayout>
        <Select
          label="Görsel stili"
          name="ai_style"
          options={Object.entries(AI_STYLES).map(([k, v]) => ({ label: v.label, value: k }))}
          value={aiStyle}
          onChange={setAiStyle}
          helpText={AI_STYLES[aiStyle]?.description ?? "Müşteriye başka stil açmazsanız tüm siparişlerde bu stil kullanılır."}
        />
        <Checkbox
          label="Baskı dosyasını şeffaf arka planla hazırla"
          checked={aiRemoveBg}
          onChange={setAiRemoveBg}
          helpText="Tişört baskısı için önerilir. Üretilen görselin düz zemini kaldırılır."
        />
      </FormLayout>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Müşterinin seçebileceği stiller</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Çoğu ürün için tek stil daha tutarlı sonuç verir. Hiçbirini işaretlemezseniz
          müşteri stil seçmez, yukarıdaki stil kullanılır.
        </Text>
        <InlineStack gap="300" wrap>
          {Object.entries(AI_STYLES).map(([id, def]) => (
            <Checkbox
              key={id}
              label={def.label}
              checked={optAiStyles.includes(id)}
              onChange={() => toggleAiStyle(id)}
            />
          ))}
        </InlineStack>
      </BlockStack>

      <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#303030" }}>
          Gelişmiş üretim ayarları
        </summary>
        <div style={{ marginTop: 16 }}>
          <FormLayout>
            <FormLayout.Group>
              <Select
                label="AI sağlayıcısı"
                options={Object.entries(AI_PROVIDERS).map(([k, v]) => ({ label: v.label, value: k }))}
                value={aiProvider}
                onChange={changeProvider}
              />
              <Select label="Model" options={aiModelOptions} value={aiModel} onChange={setAiModel} />
            </FormLayout.Group>
            {aiModelNote && (
              <Banner tone="warning">
                <Text as="p" variant="bodySm">{aiModelNote}</Text>
              </Banner>
            )}
            <FormLayout.Group>
              <TextField label="Baskı genişliği (px)" type="number" value={aiCanvasW}
                onChange={setAiCanvasW} autoComplete="off" />
              <TextField label="Baskı yüksekliği (px)" type="number" value={aiCanvasH}
                onChange={setAiCanvasH} autoComplete="off" />
            </FormLayout.Group>
          </FormLayout>
        </div>
      </details>

      <input type="hidden" name="ai_config" readOnly value={JSON.stringify({
        provider: aiProvider,
        model: aiModel,
        canvasWidth: parseInt(aiCanvasW, 10) || 2400,
        canvasHeight: parseInt(aiCanvasH, 10) || 3000,
        removeBackground: aiRemoveBg,
      })} />
    </SectionCard>
  );

  const scatterCard = (
    <SectionCard
      id="pl-scatter"
      title="Desen ayarları"
      description="Tasarım dosyası yüklemezsiniz. Müşterinin fotoğrafından yüz kesilir ve bu sayılarla baskı alanına dağıtılır."
    >
      <FormLayout>
        <FormLayout.Group>
          <TextField label="Kaç yüz" type="number" value={faceCount}
            onChange={setFaceCount} autoComplete="off" helpText="Örn: 13" />
          <TextField label="Kaç süsleme" type="number" value={decorationCount}
            onChange={setDecorationCount} autoComplete="off" helpText="Süsleme yoksa 0" />
        </FormLayout.Group>
        <FormLayout.Group>
          <TextField label="Yüz boyutu (%)" type="number" value={faceScale}
            onChange={setFaceScale} autoComplete="off" helpText="Baskı alanı genişliğine oranı" />
          <TextField label="Süsleme boyutu (%)" type="number" value={decorationScale}
            onChange={setDecorationScale} autoComplete="off" />
        </FormLayout.Group>
        <Checkbox
          label="Ortada yazı için yer bırak"
          checked={reserveText}
          onChange={setReserveText}
          helpText="İşaretliyse parçalar ortadaki yazının üstüne binmez."
        />
      </FormLayout>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Süsleme görseli</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Kalp, yıldız gibi tekrarlanacak öğe. Arka planı saydam PNG olmalı.
        </Text>
        {decorationUrl ? (
          <InlineStack gap="300" blockAlign="center">
            <Thumbnail source={decorationUrl} alt="Süsleme" size="small" />
            <Button variant="plain" tone="critical" onClick={() => setDecorationUrl("")}>Kaldır</Button>
          </InlineStack>
        ) : (
          <Text as="p" tone="subdued" variant="bodySm">Henüz yüklenmedi.</Text>
        )}
        <input
          type="file"
          name="decoration_image"
          accept="image/png,image/webp"
          style={{ display: "block", fontSize: 13 }}
        />
        <Checkbox
          label="Arka planı otomatik temizle"
          name="decoration_remove_bg"
          checked={decorationRemoveBg}
          onChange={setDecorationRemoveBg}
          helpText="Görsel zaten saydamsa atlanır ve kota harcanmaz."
        />
      </BlockStack>

      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Müşteriye açılan seçenekler</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Müşteri yukarıdaki sayıları değiştiremez — yalnızca üç kademeli bir seçim
          yapar, sistem onu sizin değerlerinizin üstüne uygular.
        </Text>
        <Checkbox
          label="Yoğunluk seçimi"
          checked={optDensity}
          onChange={setOptDensity}
          helpText="Seyrek / Normal / Yoğun — parça sayısını %60 ile %150 arasında değiştirir."
        />
        <Checkbox
          label="Boyut seçimi"
          checked={optPhotoSize}
          onChange={setOptPhotoSize}
          helpText="Küçük / Orta / Büyük — yüz ve süslemeyi birlikte %80 ile %125 arasında ölçekler."
        />
        <Checkbox
          label="Farklı dizilim deneme"
          checked={optShuffle}
          onChange={setOptShuffle}
          helpText="Müşteri aynı ayarlarla en fazla 5 farklı yerleşim deneyebilir."
        />
      </BlockStack>

      <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#303030" }}>
          Tuval ölçüsü
        </summary>
        <div style={{ marginTop: 16 }}>
          <FormLayout>
            <FormLayout.Group>
              <TextField label="Tuval genişliği (px)" type="number" value={canvasWidth}
                onChange={setCanvasWidth} autoComplete="off" />
              <TextField label="Tuval yüksekliği (px)" type="number" value={canvasHeight}
                onChange={setCanvasHeight} autoComplete="off" />
            </FormLayout.Group>
          </FormLayout>
        </div>
      </details>
      <Banner tone={canvasRatioWarning ? "warning" : "info"}>
        <Text as="p">
          Tasarımın en/boy oranı: <strong>{canvasRatioLabel}</strong>.
          {canvasRatioWarning
            ? ` Bağlı ürünün baskı kutusu ${linkedAreaRatio?.toFixed(2)} : 1 oranında —`
              + " ikisi eşit değilse tasarım kutuya sığar ama kenarlarda boşluk kalır."
            : " Ürün ayarlarındaki baskı kutusu da bu oranda olmalı ki tasarım"
              + " kenarlara kadar dolsun."}
        </Text>
      </Banner>

      <input type="hidden" name="existing_decoration_url" value={decorationUrl} readOnly />
      <input type="hidden" name="scatter_config" readOnly value={JSON.stringify({
        faceCount: parseInt(faceCount, 10) || 0,
        decorationCount: parseInt(decorationCount, 10) || 0,
        faceScale: (parseFloat(faceScale) || 16) / 100,
        decorationScale: (parseFloat(decorationScale) || 10) / 100,
        sizeJitter: 0.18,
        angleJitter: 0,
        reserveCenter: reserveText ? { width: 0.42, height: 0.26 } : null,
        seed: 1,
        canvasWidth: parseInt(canvasWidth, 10) || 2400,
        canvasHeight: parseInt(canvasHeight, 10) || 1650,
      })} />
    </SectionCard>
  );

  // Akışın gerektirmediği ama eski şablonlarda dolu olabilecek bölümler.
  // Veri varsa bölüm açık başlıyor ki mevcut ayar gözden kaybolmasın.
  const advancedHasData = flow === "apparel"
    ? textFields.length > 0 || Boolean(overlayPreview)
    : flow === "boxer"
      ? Boolean(templatePreview) || textFields.length > 0 || Boolean(overlayPreview)
      : false;

  return (
    <Page
      title={isNew ? "Yeni şablon" : (template?.name || "Şablonu düzenle")}
      subtitle={isNew ? undefined : CATEGORY_LABEL[templateCategory]}
      titleMetadata={template ? (
        <Badge tone={template.active ? "success" : undefined}>{template.active ? "Aktif" : "Pasif"}</Badge>
      ) : undefined}
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
      primaryAction={{
        content: isNew ? "Şablonu oluştur" : "Kaydet",
        loading: isLoading,
        onAction: () => formRef.current?.requestSubmit(),
      }}
    >
      <Layout>
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical">{fetcher.data.error}</Banner>
          </Layout.Section>
        )}
        {saveSuccess && (
          <Layout.Section>
            <Banner tone="success">Şablon kaydedildi.</Banner>
          </Layout.Section>
        )}

        {/* ── Kurulum durumu ── */}
        {template && (
          <Layout.Section>
            <SectionCard
              title="Kurulum durumu"
              description={FLOW_WHERE[savedFlow]}
            >
              <SetupChecklist items={checklist} />
              {statusFetcher.data?.error && <Banner tone="critical">{statusFetcher.data.error}</Banner>}
              <InlineStack gap="200">
                <Button
                  variant={template.active ? "secondary" : "primary"}
                  loading={statusFetcher.state !== "idle"}
                  onClick={() => statusFetcher.submit(
                    { intent: "toggle_active", active: String(!template.active) },
                    { method: "POST" },
                  )}
                >
                  {template.active ? "Pasife al" : "Şablonu aktifleştir"}
                </Button>
                <Button url="/app/personalizer/setup">Nasıl çalışır?</Button>
              </InlineStack>
            </SectionCard>
          </Layout.Section>
        )}

        {/* ── Şablon formu ── */}
        <Layout.Section>
          <form ref={formRef} onSubmit={handleSubmit} encType="multipart/form-data">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="hole_seed_x" value={holeSeed.x} readOnly />
            <input type="hidden" name="hole_seed_y" value={holeSeed.y} readOnly />
            <input type="hidden" name="photo_x" value={photoRect.x} readOnly />
            <input type="hidden" name="photo_y" value={photoRect.y} readOnly />
            <input type="hidden" name="photo_width" value={photoRect.w} readOnly />
            <input type="hidden" name="photo_height" value={photoRect.h} readOnly />
            {/* Müşteriye açılan ayarlar her şablon tipinde gönderilmeli — AI
                şablonunda stil listesi burada, dağıtımlıda yoğunluk/boyut. */}
            <input type="hidden" name="customer_options" readOnly value={JSON.stringify({
              density: optDensity,
              photoSize: optPhotoSize,
              shuffle: optShuffle,
              aiStyles: optAiStyles,
            })} />

            <BlockStack gap="500">
              <SectionCard id="pl-basics" title="Temel bilgiler">
                <FormLayout>
                  <TextField label="Şablon adı" name="name" value={name} onChange={setName} autoComplete="off" placeholder="Örn: Karikatür Tablo" helpText="Yalnızca yönetim ekranında görünür." />
                  <TextField label="Açıklama (isteğe bağlı)" name="description" value={description} onChange={setDescription} multiline={2} autoComplete="off" />
                  <Select
                    label="Ürün türü"
                    name="category"
                    options={[
                      { label: "Tişört ve giyim — fotoğraf tasarımdaki boşluğa girer", value: "apparel" },
                      { label: "Fotoğraflı çerçeve — bir veya birden çok fotoğraf alanı", value: "frame" },
                      { label: "Boxer ve tekrarlı desen — yüz baskı alanına dağıtılır", value: "boxer" },
                      { label: "AI portre — fotoğraf yapay zekâ ile çizilir", value: "ai" },
                      { label: "Kelime sanatı — kelimeler bir şeklin içine dizilir", value: "wordart" },
                    ]}
                    value={templateCategory}
                    onChange={(value) => {
                      const next = value as PersonalizerCategory;
                      setTemplateCategory(next);
                      // Tür ile yerleşim yöntemi eskiden iki ayrı seçimdi ve
                      // uyumsuz ikili (ör. boxer + maskeli) sessizce kaydediliyordu.
                      // Tür değişince yöntem de ona uyuyor; özel ikili gerekirse
                      // Gelişmiş'ten ayrıca seçilebilir.
                      setLayoutMode(next === "boxer" ? "scatter" : next === "ai" ? "ai" : next === "wordart" ? "wordart" : "mask");
                    }}
                    helpText="Aşağıdaki bölümler seçtiğiniz türe göre değişir."
                  />
                </FormLayout>
                {template && layoutMode !== template.layout_mode && (
                  <Banner tone="warning" title="Yerleşim yöntemi değişecek">
                    <p>
                      {`Bu şablon şu an ${LAYOUT_LABEL[template.layout_mode] ?? template.layout_mode} yöntemle çalışıyor; kaydederseniz ${LAYOUT_LABEL[layoutMode]} yönteme geçer ve müşterinin gördüğü akış değişir. İstemiyorsanız türü eski hâline getirin ya da kaydetmeden çıkın.`}
                    </p>
                  </Banner>
                )}
                <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#303030" }}>
                    Gelişmiş: yerleşim yöntemi ve sıralama
                  </summary>
                  <div style={{ marginTop: 16 }}>
                    <FormLayout>
                      <Select
                        label="Yerleşim yöntemi"
                        name="layout_mode"
                        options={[
                          { label: "Maskeli — fotoğraf tasarımın boşluğuna girer", value: "mask" },
                          { label: "Dağıtımlı — yüz çoğaltılıp yayılır", value: "scatter" },
                          { label: "AI — fotoğraf yapay zekâ ile stilize edilir", value: "ai" },
                          { label: "Kelime sanatı — fotoğrafsız, kelimeler şekle dizilir", value: "wordart" },
                        ]}
                        value={layoutMode}
                        onChange={(value) => setLayoutMode(value as "mask" | "scatter" | "ai" | "wordart")}
                        helpText="Normalde ürün türüyle birlikte otomatik ayarlanır; emin değilseniz değiştirmeyin."
                      />
                      {layoutMode !== "ai" && layoutMode !== "wordart" && (
                        <Select label="Fotoğrafa uygulanacak AI stili (eski önizleme akışı)" name="ai_style" options={AI_STYLE_OPTIONS}
                          value={aiStyle} onChange={setAiStyle} />
                      )}
                      <TextField label="Listede sıralama" name="sort_order" type="number" value={sortOrder} onChange={setSortOrder} autoComplete="off" helpText="Küçük sayı önce gelir." />
                    </FormLayout>
                  </div>
                </details>
              </SectionCard>

              {flow === "ai" && aiCard}
              {flow === "boxer" && scatterCard}
              {flow === "wordart" && (
                <SectionCard
                  id="pl-wordart"
                  title="Kelime sanatı ayarları"
                  description="Tasarım dosyası ya da fotoğraf gerekmez. Müşterinin yazdığı kelimeler seçtiği şeklin içine üst üste binmeden dizilir."
                >
                  <WordArtSettings initial={template?.wordart_config} />
                </SectionCard>
              )}

              {flow === "apparel" && (
                <SectionCard
                  id="pl-design"
                  title="Tasarım ve fotoğraf alanı"
                  description="Tasarımınızı yükleyin, sonra görsel üzerinde müşterinin fotoğrafının görüneceği boş alana tıklayın."
                >
                  {designUpload}
                  {photoEditor ?? (
                    <Text as="p" tone="subdued" variant="bodySm">Görsel seçildiğinde boşluğu burada işaretleyebileceksiniz.</Text>
                  )}
                </SectionCard>
              )}

              {flow === "frame" && (
                <SectionCard
                  id="pl-studio"
                  title="Çerçeve tasarımı"
                  description="Ölçü, fotoğraf alanları, yazılar, set parçaları ve ürün görselleri Çerçeve Stüdyosu'nda tek ekranda kurulur."
                >
                  <StudioSummary
                    pieces={pieces.length > 0 ? pieces : [{
                      id: "main", name: name || "Tasarım", print_product_id: printProductId, slots,
                      background_url: templatePreview || undefined, overlay_url: overlayPreview || undefined, order: 1,
                    }]}
                    printProducts={printProducts as PrintProduct[]}
                    mockupCount={mockups.length}
                  />
                  {isNew ? (
                    <Text as="p" tone="subdued">Stüdyoyu açmak için önce şablonu oluşturun.</Text>
                  ) : (
                    <InlineStack gap="300" blockAlign="center">
                      <Button variant="primary" url={`/app/personalizer/${template?.id}/studio`}>
                        {hasPhotoSlots ? "Stüdyoda düzenle" : "Çerçeve Stüdyosu'nu aç"}
                      </Button>
                      <Text as="span" tone="subdued" variant="bodySm">
                        Bu sayfadaki değişiklikleri önce kaydedin; stüdyo kendi kaydını ayrı yapar.
                      </Text>
                    </InlineStack>
                  )}
                </SectionCard>
              )}

              {(flow === "apparel" || flow === "boxer") && (
                <SectionCard
                  title="Gelişmiş ayarlar"
                  description={advancedHasData
                    ? "Bu şablonda burada kayıtlı ayarlar var; o yüzden açık gösteriliyor."
                    : "Çoğu şablonda gerekmez."}
                  collapsible
                  defaultOpen={advancedHasData}
                >
                  {flow === "boxer" && (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Arka plan tasarımı</Text>
                      {designUpload}
                    </BlockStack>
                  )}
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Yazı alanları</Text>
                    {textFieldsEditor}
                  </BlockStack>
                  {overlayUpload}
                  <Text as="p" tone="subdued" variant="bodySm">
                    Birden fazla fotoğraf alanı ya da set gerekiyorsa ürün türünü "Fotoğraflı çerçeve" yapıp
                    kaydedin; Çerçeve Stüdyosu açılır.
                  </Text>
                </SectionCard>
              )}

              {flow === "frame" && (photoEditor || textFields.length > 0) && (
                <SectionCard
                  title="Eski tek fotoğraf ayarları"
                  description="Fotoğraf alanları stüdyoda kurulan şablonlarda kullanılmaz. Eski önizleme akışı için duruyor."
                  collapsible
                  defaultOpen={false}
                >
                  {photoEditor}
                  {textFields.length > 0 && textFieldsEditor}
                </SectionCard>
              )}

              <InlineStack gap="300" align="end">
                <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
                <Button submit variant="primary" loading={isLoading}>
                  {isNew ? "Şablonu oluştur" : "Değişiklikleri kaydet"}
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </Layout.Section>

        {/* ── Shopify ürün bağlantısı ── */}
        {!isNew && template && (
          <Layout.Section>
            <div id="pl-link" style={{ scrollMarginTop: 16 }}>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Ürüne bağla</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {layoutMode === "ai"
                      ? "Şablonun açılacağı Shopify ürününü seçin. AI şablonu ön ve arka yüze birlikte bağlanır."
                      : "Şablonun açılacağı Shopify ürününü seçin. Bir ürün bağlamadan şablon müşteriye görünmez."}
                  </Text>
                </BlockStack>

                {slotChangeUnsaved && (
                  <Banner tone="warning" title="Önce değişiklikleri kaydedin">
                    <p>
                      Fotoğraf alanlarında kaydedilmemiş bir değişiklik var. Ürün bağlama kayıtlı
                      şablona bakıyor; kaydetmeden bağlarsanız ürün sayfasındaki kutu doğru açılmaz.
                    </p>
                  </Banner>
                )}

                {linkFetcher.data?.error && <Banner tone="critical">{linkFetcher.data.error}</Banner>}
                {linkFetcher.data?.unlinked !== undefined && (
                  <Banner tone={linkFetcher.data.metafieldOk ? "success" : "warning"}>
                    <p>
                      {linkFetcher.data.metafieldOk
                        ? "Bağlantı kaldırıldı. Bu ürünün sayfasında kişiselleştirme artık görünmeyecek."
                        : `Bağlantı kaydı silindi ama Shopify'daki personalizer.template_id alanı temizlenemedi: ${linkFetcher.data.metafieldError}. Alan dururken kutu görünmeye devam eder; Shopify yöneticisinden elle silin.`}
                    </p>
                  </Banner>
                )}
                {linkFetcher.data?.linked && linkFetcher.data.metafieldOk && (
                  <Banner tone="success">
                    <p>
                      {linkFetcher.data.kutuAcilir
                        ? "Ürün bağlandı. Ürün sayfasındaki \"PrintLab Kişiselleştirici\" bloğu bu şablonu açacak."
                        : "Ürün bağlandı. Müşteri bu şablonu ürün sayfasındaki tasarımcıda \"Fotoğrafını ekle\" ile görecek."}
                    </p>
                  </Banner>
                )}
                {linkFetcher.data?.linked && linkFetcher.data.metafieldOk === false && (
                  <Banner tone="warning" title="Bağlantı kaydedildi ama Shopify'a yazılamadı">
                    <p>
                      {linkFetcher.data.metafieldError}
                    </p>
                    <p style={{ marginTop: 8 }}>
                      Ürün sayfasında kutunun görünmesi için Shopify yöneticisinde ürünün{" "}
                      <code>personalizer.template_id</code> metafield'ına{" "}
                      <code>{template?.id}</code> değerini elle girin.
                    </p>
                  </Banner>
                )}

                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Ürün ara"
                      value={productSearch}
                      onChange={setProductSearch}
                      autoComplete="off"
                      placeholder="Ürün adı yazın"
                      clearButton
                      onClearButtonClick={() => {
                        setProductSearch("");
                        setSearchParams({}, { replace: true, preventScrollReset: true });
                      }}
                      connectedRight={(
                        <Button
                          onClick={() => setSearchParams(
                            productSearch.trim() ? { q: productSearch.trim() } : {},
                            { replace: true, preventScrollReset: true },
                          )}
                        >
                          Ara
                        </Button>
                      )}
                      helpText={productQuery
                        ? `"${productQuery}" için ${availableProducts.length} aktif ürün bulundu.`
                        : "Liste son güncellenen 50 aktif ürünü gösterir; ürününüz yoksa adıyla arayın."}
                    />
                  </div>
                </InlineStack>

                {availableProducts.length === 0 ? (
                  <Banner tone="warning">
                    {productQuery
                      ? "Aramanızla eşleşen aktif ürün bulunamadı. Ürünün Shopify'da \"Aktif\" durumda olduğundan emin olun."
                      : "Aktif Shopify ürünü bulunamadı. Önce Shopify tarafında ürünü aktif hâle getirin."}
                  </Banner>
                ) : (
                  <linkFetcher.Form method="post" encType="multipart/form-data">
                    <input type="hidden" name="intent" value="link_product" />
                    <input type="hidden" name="product_title" value={selectedProduct?.title ?? ""} />
                    <input type="hidden" name="product_handle" value={selectedProduct?.handle ?? ""} />
                    <FormLayout>
                      <Select
                        label="Shopify ürünü"
                        name="product_id"
                        options={productOptions}
                        value={selectedProductId}
                        onChange={(value) => setSelectedProductId(value)}
                      />
                      {layoutMode !== "ai" && (
                        <BlockStack gap="150">
                          <Text as="p" variant="bodyMd">Ürünün hangi yüzü</Text>
                          <InlineStack gap="400">
                            <Checkbox
                              label="Ön yüz"
                              checked={linkSides.includes("front")}
                              onChange={(checked) => toggleLinkSide("front", checked)}
                            />
                            <Checkbox
                              label="Arka yüz"
                              checked={linkSides.includes("back")}
                              onChange={(checked) => toggleLinkSide("back", checked)}
                            />
                          </InlineStack>
                          {/* Polaris Checkbox'ın form serileştirmesine güvenmek
                              yerine seçimi gizli alanlara yazıyoruz; action
                              form.getAll("side") ile okuyor. */}
                          {linkSides.map((side) => (
                            <input key={side} type="hidden" name="side" value={side} readOnly />
                          ))}
                          <Text as="p" tone="subdued" variant="bodySm">
                            Çerçeve gibi tek yüzlü ürünlerde "Ön yüz" yeterli. İşaretlemediğiniz
                            yüze dokunulmaz — o yüz başka bir şablona bağlıysa öyle kalır.
                          </Text>
                        </BlockStack>
                      )}
                      {/* Boş değer "tüm varyantlar" demek: bağlantı ürün
                          düzeyinde kurulur ve her varyant bu şablonu açar.
                          Renk gibi tasarımı değiştirmeyen seçeneklerde doğru
                          olan bu — sonradan yeni bir renk eklendiğinde tekrar
                          bağlamak gerekmiyor. Yalnızca varyanta göre TASARIM
                          değişiyorsa (bordürlü/bordürsüz gibi) tek varyant
                          seçilip her biri ayrı ayrı bağlanır. */}
                      <Select
                        label="Hangi varyantlar"
                        name="variant_id"
                        options={variantOptions.length ? variantOptions : [{ label: "Varyant yok", value: "" }]}
                        value={selectedVariantId}
                        onChange={(value) => setSelectedVariantId(value)}
                        disabled={!variantOptions.length}
                        helpText={
                          selectedVariantId
                            ? "Yalnızca bu varyant bu şablonu açar. Tasarım varyanta göre değişiyorsa böyle bağlayın ve her varyant için tekrarlayın."
                            : "Çoğu ürün için doğru seçim. Ürünün bütün varyantları bu şablonu açar; sonradan eklenenler de."
                        }
                      />
                      <Button submit variant="primary" loading={linkFetcher.state !== "idle"} disabled={!selectedProductId}>
                        {layoutMode === "ai" ? "Ürünü iki yüze bağla" : "Ürüne bağla"}
                      </Button>
                    </FormLayout>
                  </linkFetcher.Form>
                )}

                {linkedProductGroups.length > 0 && (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Bağlı ürünler</Text>
                    {linkedProductGroups.map((links) => {
                      const link = links[0];
                      const hasFront = links.some((item) => item.side === "front");
                      const hasBack = links.some((item) => item.side === "back");
                      const sideLabel = hasFront && hasBack ? "Ön ve arka yüz" : hasBack ? "Arka yüz" : "Ön yüz";
                      const variantIds = [...new Set(links.map((item) => item.variant_id).filter(Boolean))];
                      return (
                      <Box key={`${link.shop}-${link.product_id}`} background="bg-surface-secondary" padding="300" borderRadius="200">
                        <InlineStack align="space-between" blockAlign="center" gap="300">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {link.product_title || link.product_handle || link.product_id}
                              </Text>
                              <Badge tone={hasFront && hasBack ? "success" : hasBack ? "attention" : "info"}>{sideLabel}</Badge>
                            </InlineStack>
                            <Text as="p" tone="subdued" variant="bodySm">
                              {variantIds.length ? `${variantIds.length} varyanta özel` : "Tüm varyantlar"}
                            </Text>
                          </BlockStack>
                          {/* Form yerine programatik gönderim: bu sayfanın
                              action'ı dosya taşıyan gövdeyi multipart
                              ayrıştırıyor, gönderim türünü açıkça veriyoruz. */}
                          <InlineStack gap="200">
                            {link.product_handle && (
                              <Button size="slim" url={`https://${shop}/products/${link.product_handle}`} external>
                                Mağazada gör
                              </Button>
                            )}
                            <Button
                              variant="plain"
                              tone="critical"
                              size="slim"
                              loading={linkFetcher.state !== "idle"}
                              onClick={() => {
                                if (!confirm("Bu ürünün bağlantısı kaldırılsın mı? Ürün sayfasında kişiselleştirme görünmez olur.")) return;
                                const fd = new FormData();
                                fd.set("intent", "unlink_product");
                                fd.set("product_id", link.product_id);
                                linkFetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
                              }}
                            >
                              Bağlantıyı kaldır
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                      );
                    })}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
            </div>
          </Layout.Section>
        )}

        {/* ── Eski çerçeve seçim akışı ── */}
        {!isNew && template && layoutMode !== "ai" && (
          <Layout.Section>
            <SectionCard
              title="Hazır çerçeve seçenekleri (eski akış)"
              description={frames.length > 0
                ? `Bu şablonda ${frames.length} hazır çerçeve kayıtlı; müşteri önizlemede bunlar arasından seçer.`
                : "Yeni şablonlarda gerekmez. Fotoğraf alanlarını yukarıdaki bölümlerden kurun."}
              collapsible
              defaultOpen={frames.length > 0}
            >
              <FramesSection templateId={template.id} frames={frames} />
            </SectionCard>
          </Layout.Section>
        )}

        {/* ── Geliştirici bilgileri ── */}
        {!isNew && template && (
          <Layout.Section>
            <SectionCard
              title="Teknik bilgiler"
              description="Destek veya tema geliştiricisi için. Normal kurulumda gerekmez."
              collapsible
              defaultOpen={false}
            >
              <Text as="p" variant="bodySm">
                Şablon kimliği: <code style={{ userSelect: "all" }}>{template.id}</code>
              </Text>
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Embed adresi (VARIANT_ID ve SHOP değerlerini değiştirin):</Text>
                  <code style={{ fontSize: 12, wordBreak: "break-all" }}>{embedUrl}</code>
                  {productEmbedUrl && (
                    <>
                      <Text as="p" variant="bodySm" tone="subdued">Bağlı ürün üzerinden:</Text>
                      <code style={{ fontSize: 12, wordBreak: "break-all" }}>{productEmbedUrl}</code>
                    </>
                  )}
                </BlockStack>
              </Box>
            </SectionCard>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

// Key prop ile state sıfırlama — aynı route component farklı $id için yeniden mount olur
export default function PersonalizerEditorWrapper() {
  const params = useParams();
  return <PersonalizerEditor key={params.id ?? "template"} />;
}
