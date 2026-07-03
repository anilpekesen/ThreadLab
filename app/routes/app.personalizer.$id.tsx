import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator, useParams } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Checkbox,
  Button, BlockStack, InlineStack, Text, Banner, Box, Badge,
} from "@shopify/polaris";
import { useState, useRef, useCallback, useEffect } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getPersonalizerTemplate,
  createPersonalizerTemplate,
  updatePersonalizerTemplate,
  listPersonalizerFrames,
  createPersonalizerFrame,
  deletePersonalizerFrame,
  type TextFieldDef,
  type PersonalizerFrame,
} from "~/models/personalizer.server";
import { uploadToR2 } from "~/lib/r2.server";

const MAX_UPLOAD = 20 * 1024 * 1024;
const AI_STYLE_OPTIONS = [
  { label: "Karikatür (Önerilen)", value: "caricature" },
  { label: "Suluboya", value: "watercolor" },
  { label: "Karakalem Çizim", value: "sketch" },
  { label: "Pop Art", value: "pop_art" },
  { label: "AI Dönüşümü Yok (orijinal fotoğraf)", value: "none" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const id = params.id ?? "";
  if (id === "new") return json({ shop: session.shop, template: null, frames: [], isNew: true });
  const template = await getPersonalizerTemplate(id, session.shop);
  if (!template) throw new Response("Şablon bulunamadı", { status: 404 });
  const frames = await listPersonalizerFrames(id);
  return json({ shop: session.shop, template, frames, isNew: false });
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
    const sort_order  = parseInt(String(form.get("sort_order") ?? "0"), 10);

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
      const created = await createPersonalizerTemplate({ shop, name, description, template_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, sort_order });
      // json döndür, client tarafı navigate etsin (Shopify embedded app redirect güvenilmez)
      return json({ redirectTo: `/app/personalizer/${created.id}` });
    } else {
      await updatePersonalizerTemplate(id, shop, { name, description, template_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, sort_order });
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

    const mockupFile = form.get("mockup_image");
    if (!(mockupFile instanceof File) || mockupFile.size === 0) {
      return json({ error: "Çerçeve görseli gerekli" }, { status: 400 });
    }
    const buf = Buffer.from(await mockupFile.arrayBuffer());
    const ext = mockupFile.type === "image/jpeg" ? "jpg" : mockupFile.type === "image/webp" ? "webp" : "png";
    const mockup_url = await uploadToR2(buf, ext, "personalizer-frame");

    await createPersonalizerFrame({ template_id: templateId, name: frameName, mockup_url, mockup_x, mockup_y, mockup_width, mockup_height, sort_order });
    return json({ ok: true });
  }

  // ── Delete frame ──────────────────────────────────────────────────────────
  if (intent === "delete_frame") {
    const frameId = String(form.get("frame_id") ?? "");
    if (frameId) await deletePersonalizerFrame(frameId, id);
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

// ── Visual Editor (template photo area) ─────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

type EditorMode = { type: "photo" } | { type: "text"; idx: number };

function TemplatePhotoEditor({
  imageUrl,
  photoRect,
  onPhotoRect,
  textFields,
  onTextPos,
}: {
  imageUrl: string;
  photoRect: Rect;
  onPhotoRect: (r: Rect) => void;
  textFields: TextFieldDef[];
  onTextPos: (idx: number, x: number, y: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>({ type: "photo" });

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
        <Button size="slim" variant={isPhotoMode ? "primary" : "secondary"} onClick={() => setMode({ type: "photo" })}>
          📷 Fotoğraf alanı çiz
        </Button>
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
        {isPhotoMode ? "Karikatürün yerleştirileceği alana tıklayıp sürükleyin." : `"${textFields[(mode as { type: "text"; idx: number }).idx]?.label}" metninin konumuna tıklayın.`}
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
          alt="Şablon"
          style={{ display: "block", maxWidth: "100%", maxHeight: "65vh", borderRadius: 8, border: "1px solid #e5e7eb" }}
          onLoad={(e) => { setNaturalW(e.currentTarget.naturalWidth || 1); setNaturalH(e.currentTarget.naturalHeight || 1); }}
          draggable={false}
        />
        {photoRect.w > 0 && photoRect.h > 0 && (
          <div style={{ position: "absolute", left: photoRect.x * sx, top: photoRect.y * sy, width: photoRect.w * sx, height: photoRect.h * sy, border: "2px solid #6366f1", background: "rgba(99,102,241,0.15)", pointerEvents: "none", boxSizing: "border-box" }}>
            <span style={{ position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 700, color: "#4f46e5", background: "rgba(255,255,255,.85)", padding: "0 4px", borderRadius: 3 }}>
              📷 {photoRect.w}×{photoRect.h}
            </span>
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
      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
        <Text as="p" variant="bodySm">{`📷 X=${photoRect.x} Y=${photoRect.y} — ${photoRect.w}×${photoRect.h} px`}</Text>
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
}: {
  imageUrl: string;
  rect: Rect;
  onRect: (r: Rect) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(1);
  const [naturalH, setNaturalH] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
    const c = getCoords(e);
    setDragStart(c);
    setDragging(true);
    onRect({ x: c.x, y: c.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
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

  return (
    <BlockStack gap="200">
      <Text as="p" tone="subdued" variant="bodySm">Çerçevenin boş iç alanına tıklayıp sürükleyin — tasarım buraya yerleşecek.</Text>
      <div
        style={{ position: "relative", display: "inline-block", cursor: "crosshair", userSelect: "none" }}
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
              🖼 {rect.w}×{rect.h}
            </span>
          </div>
        )}
      </div>
      {rect.w > 0 && (
        <Text as="p" variant="bodySm" tone="subdued">{`X=${rect.x} Y=${rect.y} — ${rect.w}×${rect.h} px`}</Text>
      )}
    </BlockStack>
  );
}

// ── Add Frame Form ───────────────────────────────────────────────────────────

function AddFrameForm({ templateId, onDone }: { templateId: string; onDone: () => void }) {
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const [frameName, setFrameName] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const isLoading = fetcher.state !== "idle";

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
    fd.set("intent", "add_frame");
    fd.set("mockup_x", String(rect.x));
    fd.set("mockup_y", String(rect.y));
    fd.set("mockup_width", String(rect.w));
    fd.set("mockup_height", String(rect.h));
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  }

  if (fetcher.data?.ok) {
    onDone();
    return null;
  }

  return (
    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <input type="hidden" name="intent" value="add_frame" />
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">Yeni Çerçeve</Text>
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
            <input ref={fileRef} type="file" name="mockup_image" accept="image/png,image/jpeg,image/webp" onChange={handleFile} required />
          </BlockStack>

          {previewUrl && (
            <FrameAreaEditor imageUrl={previewUrl} rect={rect} onRect={setRect} />
          )}

          <InlineStack gap="200">
            <Button submit variant="primary" loading={isLoading} disabled={!previewUrl || rect.w === 0}>
              Çerçeveyi Kaydet
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
  const revalidator = useRevalidator();
  const deleteFetcher = useFetcher();

  function handleDelete(frameId: string) {
    if (!confirm("Bu çerçeveyi silmek istiyor musunuz?")) return;
    deleteFetcher.submit({ intent: "delete_frame", frame_id: frameId }, { method: "POST" });
  }

  function handleDone() {
    setShowAdd(false);
    revalidator.revalidate();
  }

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">Çerçeve Seçenekleri</Text>
          <Text as="p" tone="subdued" variant="bodySm">
            Müşteri bu çerçevelerden birini seçecek. Her çerçeve için iç boş alanı işaretleyin.
          </Text>
        </BlockStack>
        {!showAdd && (
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

      {frames.map((frame) => (
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
              </BlockStack>
            </InlineStack>
            <Button
              tone="critical"
              size="slim"
              onClick={() => handleDelete(frame.id)}
              loading={deleteFetcher.state !== "idle"}
            >
              Sil
            </Button>
          </InlineStack>
        </Box>
      ))}

      {showAdd && <AddFrameForm templateId={templateId} onDone={handleDone} />}
    </BlockStack>
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function newTextField(): TextFieldDef {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: "İsim",
    placeholder: "Adınızı girin",
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
  const { template, frames, isNew } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; ok?: boolean; redirectTo?: string }>();
  const navigate = useNavigate();

  // Yeni şablon oluşturulduktan sonra client-side navigate
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.redirectTo) {
      navigate(fetcher.data.redirectTo);
    }
  }, [fetcher.state, fetcher.data, navigate]);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [photoRect, setPhotoRect] = useState<Rect>({
    x: template?.photo_x ?? 440,
    y: template?.photo_y ?? 600,
    w: template?.photo_width ?? 1600,
    h: template?.photo_height ?? 1600,
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
    fd.set("text_fields", JSON.stringify(textFields));
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

  return (
    <Page
      title={isNew ? "Yeni Personalizer Şablonu" : "Şablonu Düzenle"}
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
    >
      <Layout>
        {isNew && (
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
            <input type="hidden" name="photo_x" value={photoRect.x} readOnly />
            <input type="hidden" name="photo_y" value={photoRect.y} readOnly />
            <input type="hidden" name="photo_width" value={photoRect.w} readOnly />
            <input type="hidden" name="photo_height" value={photoRect.h} readOnly />

            <BlockStack gap="500">
              {/* Temel bilgiler */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Temel Bilgiler</Text>
                  <FormLayout>
                    <TextField label="Şablon Adı" name="name" value={name} onChange={setName} autoComplete="off" placeholder="Örn: Karikatür Tablo" />
                    <TextField label="Açıklama (opsiyonel)" name="description" value={description} onChange={setDescription} multiline={2} autoComplete="off" />
                    <Select label="AI Dönüşüm Stili" name="ai_style" options={AI_STYLE_OPTIONS} value={aiStyle} onChange={setAiStyle} />
                    <TextField label="Sıralama" name="sort_order" type="number" value={sortOrder} onChange={setSortOrder} autoComplete="off" />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Şablon görseli */}
              <Card>
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
              </Card>

              {/* Koordinat editörü */}
              {templatePreview && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Fotoğraf Koordinat Editörü</Text>
                    <TemplatePhotoEditor
                      imageUrl={templatePreview}
                      photoRect={photoRect}
                      onPhotoRect={setPhotoRect}
                      textFields={textFields}
                      onTextPos={handleTextPos}
                    />
                  </BlockStack>
                </Card>
              )}

              {/* Metin alanları */}
              <Card>
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
                          <FormLayout.Group>
                            <TextField label="X (px)" type="number" value={String(f.x)} onChange={(v) => updateTextField(idx, "x", parseInt(v, 10) || 0)} autoComplete="off" helpText="Editörde T butonu ile ayarlanır" />
                            <TextField label="Y (px)" type="number" value={String(f.y)} onChange={(v) => updateTextField(idx, "y", parseInt(v, 10) || 0)} autoComplete="off" helpText="Editörde T butonu ile ayarlanır" />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            <TextField label="Font Büyüklüğü (px)" type="number" value={String(f.font_size)} onChange={(v) => updateTextField(idx, "font_size", parseInt(v, 10) || 60)} autoComplete="off" />
                            <TextField label="Renk (hex)" value={f.color} onChange={(v) => updateTextField(idx, "color", v)} autoComplete="off" placeholder="#000000" />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            <TextField label="Maks. Karakter" type="number" value={String(f.max_length)} onChange={(v) => updateTextField(idx, "max_length", parseInt(v, 10) || 30)} autoComplete="off" />
                            <Select
                              label="Hizalama"
                              options={[{ label: "Sol", value: "left" }, { label: "Orta", value: "center" }, { label: "Sağ", value: "right" }]}
                              value={f.align}
                              onChange={(v) => updateTextField(idx, "align", v as TextFieldDef["align"])}
                            />
                          </FormLayout.Group>
                          <Checkbox label="Kalın (Bold)" checked={f.bold} onChange={(v) => updateTextField(idx, "bold", v)} />
                        </FormLayout>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>

              <InlineStack gap="300" align="end">
                <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
                <Button submit variant="primary" loading={isLoading}>
                  {isNew ? "Şablonu Oluştur ve Çerçeve Ekle →" : "Değişiklikleri Kaydet"}
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </Layout.Section>

        {/* ── Frames section (only after template saved) ── */}
        {!isNew && template && (
          <Layout.Section>
            <Card>
              <FramesSection templateId={template.id} frames={frames} />
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
