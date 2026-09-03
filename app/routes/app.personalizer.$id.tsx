import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator, useParams } from "@remix-run/react";
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
  listPersonalizerProductLinks,
  normalizeCustomerOptions,
  normalizeLayoutMode,
  normalizeSide,
  type TextFieldDef,
  type PersonalizerFrame,
} from "~/models/personalizer.server";
import { fetchShopifyProducts, findConfigForStorefront } from "~/models/product-config.server";
import { AI_STYLES, AI_PROVIDERS, normalizeAiConfig, type AiProvider } from "~/lib/ai-styles";
import { uploadToR2 } from "~/lib/r2.server";
import { listPrintProducts } from "~/models/print-product.server";
import { setProductTemplateMetafield } from "~/lib/personalizer-metafield.server";
import { printCanvas, aspectLabel, type PrintProduct } from "~/lib/print-spec";
import { normalizeSlots, normalizeGridConfig, type GridConfig, type Slot } from "~/lib/slots";
import { SlotBoard } from "~/components/SlotBoard";

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
    return json({ shop: session.shop, template: null, frames: [], productLinks: [], products: [], linkedAreaRatio: null, printProducts, isNew: true });
  }
  const template = await getPersonalizerTemplate(id, session.shop);
  if (!template) throw new Response("Şablon bulunamadı", { status: 404 });
  const frames = await listPersonalizerFrames(id);
  const productLinks = await listPersonalizerProductLinks(id);
  const products = (await fetchShopifyProducts(admin)).map((product) => ({
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

  return json({ shop: session.shop, template, frames, productLinks, products, linkedAreaRatio, printProducts, isNew: false });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const id = params.id ?? "";

  const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD });
  const form = await unstable_parseMultipartFormData(request, uploadHandler);
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

    const ai_config = normalizeAiConfig((() => {
      try { return JSON.parse(String(form.get("ai_config") ?? "{}")); }
      catch { return {}; }
    })());

    let scatter_config: import("~/models/personalizer.server").ScatterTemplateConfig | undefined;
    try {
      const raw = String(form.get("scatter_config") ?? "");
      if (raw) scatter_config = JSON.parse(raw);
    } catch { /* bozuk JSON — varsayilanla devam */ }

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
      const buf = Buffer.from(await decorationFile.arrayBuffer());
      const ext = decorationFile.type === "image/webp" ? "webp" : "png";
      decoration_url = await uploadToR2(buf, ext, "personalizer-decoration");
    }
    // Fotoğrafların ÜSTÜNDE duran katman. Şeffaf delikli tasarımlarda aynı dosya
    // hem alan kaynağı hem üst katman olur: fotoğraf deliğin arkasından görünür,
    // çerçeve ve süslemeler fotoğrafın üstünde kalır.
    let overlay_url = String(form.get("existing_overlay_url") ?? "");
    const overlayFile = form.get("overlay_image");
    if (overlayFile instanceof File && overlayFile.size > 0) {
      const buf = Buffer.from(await overlayFile.arrayBuffer());
      const ext = overlayFile.type === "image/webp" ? "webp" : "png";
      overlay_url = await uploadToR2(buf, ext, "personalizer-overlay");
    }

    const sort_order  = parseInt(String(form.get("sort_order") ?? "0"), 10);

    // Çoklu fotoğraf alanları. İstemciden gelen dizi normalize ediliyor:
    // tanınmayan alanlar ve geometrisi bozuk kayıtlar sessizce eleniyor ki
    // eski ya da kurcalanmış bir istemci render motoruna bozuk slot sokamasın.
    const slots = normalizeSlots((() => {
      try { return JSON.parse(String(form.get("slots") ?? "[]")); }
      catch { return []; }
    })());
    let grid_config: GridConfig | undefined;
    try {
      const raw = String(form.get("grid_config") ?? "");
      if (raw) grid_config = JSON.parse(raw);
    } catch { /* bozuk JSON — ızgara parametreleri kaydedilmez, slotlar durur */ }
    const print_product_id = String(form.get("print_product_id") ?? "").trim();
    const expected_slots = Math.max(0, parseInt(String(form.get("expected_slots") ?? "0"), 10) || 0);

    if (!name) return json({ error: "İsim gerekli" }, { status: 400 });

    let text_fields: TextFieldDef[] = [];
    try { text_fields = JSON.parse(String(form.get("text_fields") ?? "[]")); } catch { /* ignore */ }

    let template_url = String(form.get("existing_template_url") ?? "");
    const templateFile = form.get("template_image");
    if (templateFile instanceof File && templateFile.size > 0) {
      const buf = Buffer.from(await templateFile.arrayBuffer());
      const ext = templateFile.type === "image/jpeg" ? "jpg" : templateFile.type === "image/webp" ? "webp" : "png";
      template_url = await uploadToR2(buf, ext, "personalizer-template");
    }
    // template_url opsiyonel — sadece çerçeve bazlı kullanımda boş olabilir

    if (id === "new") {
      const created = await createPersonalizerTemplate({ shop, name, description, template_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, hole_seed_x, hole_seed_y, layout_mode, scatter_config, decoration_url, customer_options, ai_config, sort_order, slots, grid_config, print_product_id, expected_slots, overlay_url });
      // json döndür, client tarafı navigate etsin (Shopify embedded app redirect güvenilmez)
      return json({ redirectTo: `/app/personalizer/${created.id}` });
    } else {
      await updatePersonalizerTemplate(id, shop, { name, description, template_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, hole_seed_x, hole_seed_y, layout_mode, scatter_config, decoration_url, customer_options, ai_config, sort_order, slots, grid_config, print_product_id, expected_slots, overlay_url });
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

  // ── Delete frame ──────────────────────────────────────────────────────────
  if (intent === "delete_frame") {
    const frameId = String(form.get("frame_id") ?? "");
    if (frameId) await deletePersonalizerFrame(frameId, id);
    return json({ ok: true });
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

    const sides = template.layout_mode === "ai"
      ? (["front", "back"] as const)
      : ([normalizeSide(form.get("side"))] as const);
    await Promise.all(sides.map((side) => linkPersonalizerProduct({
      shop,
      product_id: productId,
      side,
      template_id: id,
      product_title: productTitle,
      product_handle: productHandle,
      variant_id: variantId,
    })));

    // Tema snippet'i şablonu ürün metafield'ından okuyor. Bu yazılmazsa
    // uygulamadaki bağlantı mağaza tarafında hiçbir şey yapmaz: kişiselleştirme
    // kutusu ürün sayfasında görünmez ve sebebi anlaşılmaz.
    //
    // Yazma başarısız olursa bağlantı geri alınmıyor: kayıt uygulamada duruyor,
    // mağaza sahibine metafield'ı elle girmesi gerektiği söyleniyor.
    const meta = await setProductTemplateMetafield(shop, productId, id);
    return json({
      ok: true,
      linked: true,
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
}: {
  imageUrl: string;
  photoRect: Rect;
  onPhotoRect: (r: Rect) => void;
  textFields: TextFieldDef[];
  onTextPos: (idx: number, x: number, y: number) => void;
  holeSeed: { x: number; y: number };
  onHoleSeed: (x: number, y: number) => void;
  textOnly?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [holeInfo, setHoleInfo] = useState<HoleDetectResult | null>(null);
  const [holeBusy, setHoleBusy] = useState(false);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>(() => (
    textOnly && textFields.length ? { type: "text", idx: 0 } : { type: "photo" }
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

// ── Main Component ───────────────────────────────────────────────────────────

function PersonalizerEditor() {
  const { shop, template, frames, productLinks, products, linkedAreaRatio, printProducts, isNew } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; ok?: boolean; redirectTo?: string }>();
  const linkFetcher = useFetcher<{
    error?: string; ok?: boolean; linked?: boolean;
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
  const initialVariantId = firstLinkedProduct?.variant_id || initialProduct?.variants[0]?.id || "";
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
    if (linkFetcher.state === "idle" && linkFetcher.data?.linked) {
      revalidator.revalidate();
    }
  }, [linkFetcher.state, linkFetcher.data, revalidator]);

  useEffect(() => {
    if (!selectedProduct) return;
    const hasVariant = selectedProduct.variants.some((variant) => variant.id === selectedVariantId);
    if (!hasVariant) {
      setSelectedVariantId(selectedProduct.variants[0]?.id || "");
    }
  }, [selectedProduct, selectedVariantId]);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [photoRect, setPhotoRect] = useState<Rect>({
    x: template?.photo_x ?? 440,
    y: template?.photo_y ?? 600,
    w: template?.photo_width ?? 1600,
    h: template?.photo_height ?? 1600,
  });
  const [layoutMode, setLayoutMode] = useState<"mask" | "scatter" | "ai">(template?.layout_mode ?? "mask");

  // ── Çoklu fotoğraf alanları ────────────────────────────────────────────
  const [slots, setSlots] = useState<Slot[]>(() => normalizeSlots(template?.slots ?? []));
  const [gridConfig, setGridConfig] = useState<GridConfig>(
    () => normalizeGridConfig(template?.grid_config),
  );
  const [printProductId, setPrintProductId] = useState(template?.print_product_id ?? "");
  const [overlayPreview, setOverlayPreview] = useState(template?.overlay_url ?? "");
  const [expectedSlots, setExpectedSlots] = useState(template?.expected_slots ?? 0);

  // Deneme çıktısı — şablonu örnek fotoğraflarla basıp gösterir.
  // Ayrı bir fetcher: kaydetme akışına karışmamalı, kaydedilmiş şablon üstünde
  // çalışıyor.
  const testFetcher = useFetcher<{
    url?: string;
    error?: string;
    photoCount?: number;
    version?: number;
    issues?: Array<{ level: string; message: string }>;
  }>();

  const activePrintProduct: PrintProduct | null =
    (printProducts as PrintProduct[]).find((p) => p.id === printProductId) ?? null;
  const slotCanvas = activePrintProduct ? printCanvas(activePrintProduct) : null;
  const [decorationUrl, setDecorationUrl] = useState(template?.decoration_url ?? "");
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
  const [linkSide, setLinkSide] = useState<"front" | "back">("front");

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
    fd.set("slots", JSON.stringify(slots));
    fd.set("grid_config", JSON.stringify(gridConfig));
    fd.set("print_product_id", printProductId);
    fd.set("expected_slots", String(expectedSlots));
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
  const variantOptions = (selectedProduct?.variants ?? []).map((variant) => ({
    label: variant.title === "Default Title"
      ? `Default Title${variant.price ? ` - ${variant.price}` : ""}`
      : `${variant.title}${variant.price ? ` - ${variant.price}` : ""}`,
    value: variant.id,
  }));
  const linkedProductGroups = Object.values(availableProductLinks.reduce<
    Record<string, Array<(typeof availableProductLinks)[number]>>
  >((groups, link) => {
    (groups[link.product_id] ??= []).push(link);
    return groups;
  }, {}));

  return (
    <Page
      title={isNew ? "Yeni Personalizer Şablonu" : "Şablonu Düzenle"}
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
    >
      <Layout>
        {isNew && layoutMode !== "ai" && (
          <Layout.Section>
            <Banner tone="warning">
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">📋 Önce şablonu oluşturun, sonra çerçeveleri ekleyin</Text>
                <Text as="p">
                  1. Sadece <strong>adı</strong> girin ve kaydedin → 2. Açılan sayfada <strong>"+ Çerçeve Ekle"</strong> ile ahşap çerçeve/tablo resimlerinizi tek tek ekleyin
                </Text>
                <Text as="p">
                  4 farklı çerçeveniz varsa: 1 şablon oluşturun, içine 4 çerçeve ekleyin. Her çerçeve ayrı şablon OLMAMALI.
                </Text>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}
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

        {/* ── Template form ── */}
        <Layout.Section>
          <form onSubmit={handleSubmit} encType="multipart/form-data">
            <input type="hidden" name="intent" value="save" />
            <input type="hidden" name="existing_template_url" value={template?.template_url ?? ""} />
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
              {/* Temel bilgiler */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Temel Bilgiler</Text>
                  <FormLayout>
                    <TextField label="Şablon Adı" name="name" value={name} onChange={setName} autoComplete="off" placeholder="Örn: Karikatür Tablo" />
                    <TextField label="Açıklama (opsiyonel)" name="description" value={description} onChange={setDescription} multiline={2} autoComplete="off" />
                    <Select
                      label="Şablon Tipi"
                      name="layout_mode"
                      options={[
                        { label: "Maskeli — fotoğraf tasarımın boşluğuna girer (kalpli tişört)", value: "mask" },
                        { label: "Dağıtımlı — kafa kesiti çoğaltılıp yayılır (Hepsi Benim boxer)", value: "scatter" },
                        { label: "AI — fotoğraf yapay zekâ ile stilize edilir, üstüne yazı basılır", value: "ai" },
                      ]}
                      value={layoutMode}
                      onChange={(v) => setLayoutMode(v as "mask" | "scatter" | "ai")}
                      helpText={layoutMode === "ai"
                        ? "Müşteri fotoğraf, isim ve hikâye girer; görsel ve baskı dosyası otomatik üretilir. Arka plan veya çerçeve yüklemeniz gerekmez."
                        : layoutMode === "scatter"
                          ? "Tasarım görseli yüklemezsiniz; sistem üretir. Aşağıdaki sayıları ve süsleme görselini ayarlayın."
                          : "Tasarımı yükleyip fotoğrafın gireceği boşluğu işaretlersiniz."}
                    />
                    {layoutMode !== "ai" && (
                      <Select label="AI Dönüşüm Stili" name="ai_style" options={AI_STYLE_OPTIONS}
                        value={aiStyle} onChange={setAiStyle} />
                    )}
                    <TextField label="Sıralama" name="sort_order" type="number" value={sortOrder} onChange={setSortOrder} autoComplete="off" />
                  </FormLayout>
                </BlockStack>
              </Card>

              {layoutMode === "ai" && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">AI Üretim Akışı</Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Müşteri fotoğrafını ve metinleri girer; sistem görseli ve baskı dosyasını hazırlar.
                        </Text>
                      </BlockStack>
                      <Badge tone="success">Fotoğraf → Metin → Önizleme</Badge>
                    </InlineStack>

                    <FormLayout>
                      <Select
                        label="Görsel Stili"
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
                      <Text as="h3" variant="headingSm">Müşterinin Seçebileceği Stiller</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Çoğu ürün için tek stil daha tutarlı sonuç verir. Birden fazla görünüm
                        satıyorsanız müşteriye açmak istediklerinizi işaretleyin.
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
                              label="AI Sağlayıcısı"
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
                  </BlockStack>
                </Card>
              )}

              {layoutMode === "scatter" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Dağıtım Ayarları</Text>
                    <Banner tone="info">
                      <Text as="p">
                        Bu tipte tasarım dosyası yüklemezsiniz. Müşterinin fotoğrafından kafa kesilir,
                        aşağıdaki sayılarla baskı alanına dağıtılır. Baskı alanı ürün ayarlarından otomatik alınır.
                      </Text>
                    </Banner>

                    <FormLayout>
                      <FormLayout.Group>
                        <TextField label="Kaç kafa" type="number" value={faceCount}
                          onChange={setFaceCount} autoComplete="off" helpText="Örn: 13" />
                        <TextField label="Kaç süsleme" type="number" value={decorationCount}
                          onChange={setDecorationCount} autoComplete="off" helpText="Süsleme yoksa 0" />
                      </FormLayout.Group>
                      <FormLayout.Group>
                        <TextField label="Kafa boyutu (%)" type="number" value={faceScale}
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
                      <FormLayout.Group>
                        <TextField label="Tuval genişliği (px)" type="number" value={canvasWidth}
                          onChange={setCanvasWidth} autoComplete="off" />
                        <TextField label="Tuval yüksekliği (px)" type="number" value={canvasHeight}
                          onChange={setCanvasHeight} autoComplete="off" />
                      </FormLayout.Group>
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
                    </FormLayout>

                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Süsleme Görseli</Text>
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
                      <Text as="p" tone="subdued" variant="bodySm">
                        Dosya seçip aşağıdan <strong>Kaydet</strong> deyin.
                      </Text>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Müşteriye Açılan Ayarlar</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        İşaretlediğiniz ayarlar müşterinin tasarım penceresinde görünür.
                        Müşteri yukarıdaki sayıları değiştiremez — yalnızca üç kademeli
                        bir seçim yapar, sistem onu sizin değerlerinizin üstüne uygular.
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
                        helpText="Küçük / Orta / Büyük — kafa ve süslemeyi birlikte %80 ile %125 arasında ölçekler."
                      />
                      <Checkbox
                        label="Farklı dizilim deneme"
                        checked={optShuffle}
                        onChange={setOptShuffle}
                        helpText="Müşteri aynı ayarlarla en fazla 5 farklı yerleşim deneyebilir."
                      />
                    </BlockStack>

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
                  </BlockStack>
                </Card>
              )}

              {/* Şablon görseli */}
              {layoutMode !== "ai" && <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Arka Plan Tasarımı (Opsiyonel)</Text>
                  <Banner tone="info">
                    <BlockStack gap="100">
                      <Text as="p" fontWeight="semibold">Çerçeve bazlı kullanım için bu alanı boş bırakın.</Text>
                      <Text as="p">
                        Eğer sadece ahşap çerçeve veya tablo görselleri kullanıyorsanız buraya bir şey yüklemenize gerek yok.
                        Çerçeve resimlerini aşağıdaki <strong>"Çerçeve Ekle"</strong> bölümünden ekleyin.
                        Karikatür doğrudan seçilen çerçevenin içine yerleşecek.
                      </Text>
                    </BlockStack>
                  </Banner>
                  <Text as="p" tone="subdued" variant="bodySm">
                    İsteğe bağlı: Ayrı bir artistik tasarım şablonu (örn. "Birlikte Sonsuza Dek" yazılı arka plan) varsa buraya yükleyin.
                  </Text>
                  {templatePreview && (
                    <img src={templatePreview} alt="Şablon" style={{ maxWidth: 200, maxHeight: 200, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  )}
                  <input type="file" name="template_image" accept="image/png,image/jpeg,image/webp" onChange={handleTemplateFileChange} />
                </BlockStack>
              </Card>}

              {/* Koordinat editörü */}
              {layoutMode !== "ai" && templatePreview && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Fotoğraf Koordinat Editörü</Text>
                    <TemplatePhotoEditor
                      imageUrl={templatePreview}
                      photoRect={photoRect}
                      onPhotoRect={setPhotoRect}
                      textFields={textFields}
                      onTextPos={handleTextPos}
                      holeSeed={holeSeed}
                      onHoleSeed={(x, y) => setHoleSeed({ x, y })}
                    />
                  </BlockStack>
                </Card>
              )}

              {/* Baskı ebadı ve çoklu fotoğraf alanları */}
              {layoutMode !== "ai" && (
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Baskı ebadı</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Fotoğraf alanları oran olarak saklanır; aynı şablon, aynı en-boy oranındaki
                        her ebatta çalışır.
                      </Text>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Üst katman (opsiyonel)</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Fotoğrafların <b>üstünde</b> duracak tasarım. Şeffaf delikli şablonlarda
                        tasarımın kendisini buraya da yükleyin: fotoğraf deliğin arkasından görünür,
                        çerçeve ve yazılar fotoğrafın üstünde kalır. Izgara şablonlarında gerekmez.
                      </Text>
                      {overlayPreview && (
                        <img src={overlayPreview} alt="Üst katman"
                          style={{ maxWidth: 160, maxHeight: 160, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      )}
                      <input type="hidden" name="existing_overlay_url" value={template?.overlay_url ?? ""} readOnly />
                      <input type="file" name="overlay_image" accept="image/png,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setOverlayPreview(URL.createObjectURL(f));
                        }} />
                    </BlockStack>

                    {printProducts.length === 0 ? (
                      <Banner tone="warning" title="Henüz baskı ebadı tanımlı değil">
                        <p>
                          Çoklu fotoğraf alanı kullanmak için önce <b>Baskı ebatları</b> sayfasından
                          en az bir ebat ekleyin.
                        </p>
                      </Banner>
                    ) : (
                      <Select
                        label="Ebat"
                        options={[
                          { label: "Seçilmedi", value: "" },
                          ...(printProducts as PrintProduct[]).map((p) => ({
                            label: `${p.name} — ${p.width_mm}×${p.height_mm} mm (${aspectLabel(p.width_mm / p.height_mm)})`,
                            value: p.id,
                          })),
                        ]}
                        value={printProductId}
                        onChange={setPrintProductId}
                      />
                    )}
                  </BlockStack>
                </Card>
              )}

              {layoutMode !== "ai" && slotCanvas && (
                <SlotBoard
                  slots={slots}
                  onChange={setSlots}
                  canvas={slotCanvas}
                  templateUrl={templatePreview || undefined}
                  expectedSlots={expectedSlots}
                  onExpectedSlotsChange={setExpectedSlots}
                  gridConfig={gridConfig}
                  onGridConfigChange={setGridConfig}
                  dpi={activePrintProduct?.dpi ?? 300}
                />
              )}

              {/* Deneme çıktısı */}
              {layoutMode !== "ai" && slotCanvas && !isNew && (
                <Card>
                  <BlockStack gap="400">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">Deneme çıktısı</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Şablonu örnek fotoğraflarla basar. Slot sırasını, kırpmayı, metin taşmasını
                        ve font sorunlarını canlıya çıkmadan önce burada görün — şablonu ilk kez
                        müşteri denememeli.
                      </Text>
                    </BlockStack>

                    <InlineStack gap="200" blockAlign="center">
                      <Button
                        onClick={() =>
                          testFetcher.submit(
                            { templateId: template?.id ?? "" },
                            { method: "POST", action: "/api/personalizer/test-render", encType: "application/json" },
                          )
                        }
                        loading={testFetcher.state !== "idle"}
                      >
                        Deneme çıktısı al
                      </Button>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Kaydedilmiş hâli kullanır — önce değişiklikleri kaydedin.
                      </Text>
                    </InlineStack>

                    {testFetcher.data?.error && (
                      <Banner tone="critical"><p>{testFetcher.data.error}</p></Banner>
                    )}

                    {testFetcher.data?.issues && testFetcher.data.issues.length > 0 && (
                      <Banner tone={testFetcher.data.issues.some((i) => i.level === "error") ? "critical" : "warning"}>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {testFetcher.data.issues.map((i, n) => <li key={n}>{i.message}</li>)}
                        </ul>
                      </Banner>
                    )}

                    {testFetcher.data?.url && (
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          {testFetcher.data.photoCount} örnek fotoğraf · şablon sürümü v{testFetcher.data.version}
                        </Text>
                        <img
                          src={testFetcher.data.url}
                          alt="Deneme çıktısı"
                          style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Metin alanları */}
              {layoutMode !== "ai" && <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Metin Alanları</Text>
                    <Button onClick={addTextField} size="slim">+ Alan Ekle</Button>
                  </InlineStack>
                  {textFields.length === 0 && <Text as="p" tone="subdued">Henüz metin alanı eklenmedi.</Text>}
                  {textFields.map((f, idx) => (
                    <Box key={f.id} background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingSm">T{idx + 1} — {f.label}</Text>
                          <Button tone="critical" size="slim" onClick={() => removeTextField(idx)}>Sil</Button>
                        </InlineStack>
                        <FormLayout>
                          <FormLayout.Group>
                            <TextField label="Etiket" value={f.label} onChange={(v) => updateTextField(idx, "label", v)} autoComplete="off" />
                            <TextField label="Placeholder" value={f.placeholder} onChange={(v) => updateTextField(idx, "placeholder", v)} autoComplete="off" />
                          </FormLayout.Group>
                          <TextField label="Maksimum karakter" type="number" value={String(f.max_length)} onChange={(v) => updateTextField(idx, "max_length", parseInt(v, 10) || 30)} autoComplete="off" />
                          <TextField label="Varsayılan metin (opsiyonel)" value={f.default_value ?? ""} onChange={(v) => updateTextField(idx, "default_value", v)} autoComplete="off" helpText="Müşteri değiştirmezse bu metin basılır." />
                        </FormLayout>
                        <details style={{ borderTop: "1px solid #e1e3e5", paddingTop: 10 }} open>
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
              </Card>}

              <InlineStack gap="300" align="end">
                <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
                <Button submit variant="primary" loading={isLoading}>
                  {isNew
                    ? layoutMode === "ai" ? "AI Şablonunu Oluştur" : "Şablonu Oluştur ve Çerçeve Ekle →"
                    : "Değişiklikleri Kaydet"}
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </Layout.Section>

        {/* ── Frames section (only after template saved) ── */}
        {!isNew && template && layoutMode !== "ai" && (
          <Layout.Section>
            <Card>
              <FramesSection templateId={template.id} frames={frames} />
            </Card>
          </Layout.Section>
        )}

        {/* ── Shopify product link ── */}
        {!isNew && template && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Shopify Ürün Eşleştirme</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {layoutMode === "ai"
                      ? "Ürünü ve varsayılan varyantı seçin. AI şablonu ön ve arka yüze birlikte bağlanır."
                      : "Bu şablonu Shopify ürününe bağlayın."}
                  </Text>
                </BlockStack>

                {linkFetcher.data?.error && <Banner tone="critical">{linkFetcher.data.error}</Banner>}
                {linkFetcher.data?.linked && linkFetcher.data.metafieldOk && (
                  <Banner tone="success">
                    <p>
                      Ürün bağlandı ve Shopify'daki <code>personalizer.template_id</code> alanı
                      yazıldı. Ürün sayfasında kişiselleştirme kutusu görünmeye başlayacak.
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
                {linkFetcher.data?.linked && (
                  <Banner tone="success">
                    {layoutMode === "ai"
                      ? "Ürün bu AI şablonuna ön ve arka yüz için bağlandı."
                      : "Ürün bu şablona bağlandı."}
                  </Banner>
                )}

                {availableProducts.length === 0 ? (
                  <Banner tone="warning">
                    Aktif Shopify ürünü bulunamadı. Önce Shopify tarafında ürünü aktif hale getirin.
                  </Banner>
                ) : (
                  <linkFetcher.Form method="post" encType="multipart/form-data">
                    <input type="hidden" name="intent" value="link_product" />
                    <input type="hidden" name="product_title" value={selectedProduct?.title ?? ""} />
                    <input type="hidden" name="product_handle" value={selectedProduct?.handle ?? ""} />
                    <FormLayout>
                      <Select
                        label="Shopify Ürünü"
                        name="product_id"
                        options={productOptions}
                        value={selectedProductId}
                        onChange={(value) => setSelectedProductId(value)}
                        helpText="Son güncellenen 50 aktif Shopify ürünü listelenir."
                      />
                      {layoutMode !== "ai" && (
                        <Select
                          label="Ürünün Hangi Yüzü"
                          name="side"
                          options={[
                            { label: "Ön yüz", value: "front" },
                            { label: "Arka yüz", value: "back" },
                          ]}
                          value={linkSide}
                          onChange={(v) => setLinkSide(v === "back" ? "back" : "front")}
                          helpText="Aynı ürünün ön ve arka yüzü ayrı şablonlara bağlanabilir."
                        />
                      )}
                      <Select
                        label="Varsayılan Varyant"
                        name="variant_id"
                        options={variantOptions.length ? variantOptions : [{ label: "Varyant yok", value: "" }]}
                        value={selectedVariantId}
                        onChange={(value) => setSelectedVariantId(value)}
                        disabled={!variantOptions.length}
                        helpText="Sepete ekleme için bu varyant kullanılır."
                      />
                      {selectedProduct && (
                        <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" tone="subdued">
                              {`Product ID: ${selectedProduct.id}`}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {`Handle: ${selectedProduct.handle || "-"}`}
                            </Text>
                          </BlockStack>
                        </Box>
                      )}
                      <Button submit variant="primary" loading={linkFetcher.state !== "idle"} disabled={!selectedProductId || !selectedVariantId}>
                        {layoutMode === "ai" ? "Ürünü iki yüze bağla" : "Seçili ürüne bağla"}
                      </Button>
                    </FormLayout>
                  </linkFetcher.Form>
                )}

                {linkedProductGroups.length > 0 && (
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Bağlı Ürünler</Text>
                    {linkedProductGroups.map((links) => {
                      const link = links[0];
                      const hasFront = links.some((item) => item.side === "front");
                      const hasBack = links.some((item) => item.side === "back");
                      const sideLabel = hasFront && hasBack ? "Ön ve arka yüz" : hasBack ? "Arka yüz" : "Ön yüz";
                      const variantIds = [...new Set(links.map((item) => item.variant_id).filter(Boolean))];
                      return (
                      <Box key={`${link.shop}-${link.product_id}`} background="bg-surface-secondary" padding="300" borderRadius="200">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {link.product_title || link.product_handle || link.product_id}
                            </Text>
                            <Badge tone={hasFront && hasBack ? "success" : hasBack ? "attention" : "info"}>{sideLabel}</Badge>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            {`Product ID: ${link.product_id}${variantIds.length ? `, Variant ID: ${variantIds.join(", ")}` : ""}`}
                          </Text>
                        </BlockStack>
                      </Box>
                      );
                    })}
                  </BlockStack>
                )}

                {productEmbedUrl && (
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <code style={{ fontSize: 12, wordBreak: "break-all" }}>{productEmbedUrl}</code>
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* ── Embed URL ── */}
        {!isNew && template && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Embed URL</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Bu URL'yi mağazanızdaki ürün sayfasına iframe olarak ekleyin. VARIANT_ID ve SHOP değerlerini değiştirin.
                </Text>
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <Text as="p" variant="bodyMd">
                    <code style={{ fontSize: 12, wordBreak: "break-all" }}>{embedUrl}</code>
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

// Key prop ile state sıfırlama — aynı route component farklı $id için yeniden mount olur
export default function PersonalizerEditorWrapper() {
  const params = useParams();
  return <PersonalizerEditor key={params.id ?? "new"} />;
}
