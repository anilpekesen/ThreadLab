import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Checkbox,
  Button, BlockStack, InlineStack, Text, Banner, Box,
} from "@shopify/polaris";
import { useState, useRef, useCallback } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getPersonalizerTemplate,
  createPersonalizerTemplate,
  updatePersonalizerTemplate,
  type TextFieldDef,
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
  if (id === "new") return json({ shop: session.shop, template: null, isNew: true });
  const template = await getPersonalizerTemplate(id, session.shop);
  if (!template) throw new Response("Şablon bulunamadı", { status: 404 });
  return json({ shop: session.shop, template, isNew: false });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const id = params.id ?? "";

  const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD });
  const form = await unstable_parseMultipartFormData(request, uploadHandler);
  const intent = String(form.get("intent") ?? "");

  if (intent === "save") {
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const photo_x = parseInt(String(form.get("photo_x") ?? "0"), 10);
    const photo_y = parseInt(String(form.get("photo_y") ?? "0"), 10);
    const photo_width = parseInt(String(form.get("photo_width") ?? "400"), 10);
    const photo_height = parseInt(String(form.get("photo_height") ?? "400"), 10);
    const ai_style = String(form.get("ai_style") ?? "caricature");
    const sort_order = parseInt(String(form.get("sort_order") ?? "0"), 10);

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

    let mockup_url = String(form.get("existing_mockup_url") ?? "");
    const mockupFile = form.get("mockup_image");
    if (mockupFile instanceof File && mockupFile.size > 0) {
      const buf = Buffer.from(await mockupFile.arrayBuffer());
      const ext = mockupFile.type === "image/jpeg" ? "jpg" : mockupFile.type === "image/webp" ? "webp" : "png";
      mockup_url = await uploadToR2(buf, ext, "personalizer-mockup");
    }

    if (!template_url) return json({ error: "Şablon görseli gerekli" }, { status: 400 });

    if (id === "new") {
      await createPersonalizerTemplate({ shop, name, description, template_url, mockup_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, sort_order });
    } else {
      await updatePersonalizerTemplate(id, shop, { name, description, template_url, mockup_url, photo_x, photo_y, photo_width, photo_height, text_fields, ai_style, sort_order });
    }
    return redirect("/app/personalizer");
  }
  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

// ── Visual Editor ───────────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

type EditorMode =
  | { type: "photo" }         // drag to set photo area
  | { type: "text"; idx: number }; // click to set text position

function TemplateVisualEditor({
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

  function getImgCoords(e: React.MouseEvent) {
    const img = imgRef.current!;
    const rect = img.getBoundingClientRect();
    const sx = naturalW / rect.width;
    const sy = naturalH / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * sx),
      y: Math.round((e.clientY - rect.top) * sy),
    };
  }

  // image-space rect → display-space CSS (relative to img container)
  function toCSS(ix: number, iy: number, iw: number, ih: number) {
    const img = imgRef.current;
    if (!img || naturalW === 1) return {};
    const rect = img.getBoundingClientRect();
    const sx = rect.width / naturalW;
    const sy = rect.height / naturalH;
    return {
      left: `${ix * sx}px`,
      top: `${iy * sy}px`,
      width: `${iw * sx}px`,
      height: `${ih * sy}px`,
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    if (mode.type === "text") {
      const c = getImgCoords(e);
      onTextPos(mode.idx, c.x, c.y);
      return;
    }
    const c = getImgCoords(e);
    setDragStart(c);
    setDragging(true);
    onPhotoRect({ x: c.x, y: c.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || mode.type !== "photo") return;
    const c = getImgCoords(e);
    onPhotoRect({
      x: Math.min(dragStart.x, c.x),
      y: Math.min(dragStart.y, c.y),
      w: Math.abs(c.x - dragStart.x),
      h: Math.abs(c.y - dragStart.y),
    });
  }

  function onMouseUp() { setDragging(false); }

  const photoCss = toCSS(photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  const isPhotoMode = mode.type === "photo";

  return (
    <BlockStack gap="300">
      {/* Mode buttons */}
      <InlineStack gap="200" wrap>
        <Button
          size="slim"
          variant={isPhotoMode ? "primary" : "secondary"}
          onClick={() => setMode({ type: "photo" })}
        >
          📷 Fotoğraf alanı çiz
        </Button>
        {textFields.map((f, idx) => (
          <Button
            key={f.id}
            size="slim"
            variant={mode.type === "text" && mode.idx === idx ? "primary" : "secondary"}
            onClick={() => setMode({ type: "text", idx })}
          >
            {`T${idx + 1} "${f.label}"`}
          </Button>
        ))}
      </InlineStack>

      <Text as="p" tone="subdued" variant="bodySm">
        {isPhotoMode
          ? "Fotoğrafın yerleştirileceği alana tıklayıp sürükleyin."
          : `"${textFields[mode.idx]?.label}" metninin çıkacağı yere tıklayın.`}
      </Text>

      {/* Image + overlays */}
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
          style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", borderRadius: "8px", border: "1px solid #e5e7eb" }}
          onLoad={(e) => {
            const img = e.currentTarget;
            setNaturalW(img.naturalWidth || 1);
            setNaturalH(img.naturalHeight || 1);
          }}
          draggable={false}
        />

        {/* Photo area overlay */}
        {photoRect.w > 0 && photoRect.h > 0 && (
          <div style={{
            position: "absolute",
            ...photoCss,
            border: "2px solid #6366f1",
            background: "rgba(99,102,241,0.15)",
            pointerEvents: "none",
            boxSizing: "border-box",
          }}>
            <span style={{
              position: "absolute", top: 2, left: 4, fontSize: 11, fontWeight: 700,
              color: "#4f46e5", background: "rgba(255,255,255,.85)", padding: "0 4px", borderRadius: 3,
            }}>
              📷 {photoRect.w}×{photoRect.h}
            </span>
          </div>
        )}

        {/* Text field markers */}
        {textFields.map((f, idx) => {
          const img = imgRef.current;
          if (!img || naturalW === 1) return null;
          const rect = img.getBoundingClientRect();
          const sx = rect.width / naturalW;
          const sy = rect.height / naturalH;
          const dx = f.x * sx;
          const dy = f.y * sy;
          const isActive = mode.type === "text" && mode.idx === idx;
          return (
            <div key={f.id} style={{
              position: "absolute",
              left: dx,
              top: dy,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              zIndex: 10,
            }}>
              <div style={{
                background: isActive ? "#6366f1" : "#10b981",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 4px rgba(0,0,0,.3)",
              }}>
                T{idx + 1} {f.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Current values display */}
      <Box background="bg-surface-secondary" padding="300" borderRadius="200">
        <Text as="p" variant="bodySm">
          📷 Fotoğraf: X={photoRect.x} Y={photoRect.y} — {photoRect.w}×{photoRect.h} px
        </Text>
        {textFields.map((f, idx) => (
          <Text key={f.id} as="p" variant="bodySm">
            T{idx + 1} {f.label}: X={f.x} Y={f.y}
          </Text>
        ))}
      </Box>
    </BlockStack>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

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

export default function PersonalizerEditor() {
  const { template, isNew } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string }>();
  const navigate = useNavigate();

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
  const [mockupPreview, setMockupPreview] = useState<string>(template?.mockup_url ?? "");

  const isLoading = fetcher.state !== "idle";

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
  function handleMockupFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setMockupPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("text_fields", JSON.stringify(textFields));
    // inject photo rect from state (hidden inputs may be stale)
    fd.set("photo_x", String(photoRect.x));
    fd.set("photo_y", String(photoRect.y));
    fd.set("photo_width", String(photoRect.w));
    fd.set("photo_height", String(photoRect.h));
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  }

  return (
    <Page
      title={isNew ? "Yeni Personalizer Şablonu" : "Şablonu Düzenle"}
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
    >
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="existing_template_url" value={template?.template_url ?? ""} />
        <input type="hidden" name="existing_mockup_url" value={template?.mockup_url ?? ""} />
        {/* These are overridden in handleSubmit but needed as form fields */}
        <input type="hidden" name="photo_x" value={photoRect.x} readOnly />
        <input type="hidden" name="photo_y" value={photoRect.y} readOnly />
        <input type="hidden" name="photo_width" value={photoRect.w} readOnly />
        <input type="hidden" name="photo_height" value={photoRect.h} readOnly />

        <Layout>
          {fetcher.data?.error && (
            <Layout.Section>
              <Banner tone="critical">{fetcher.data.error}</Banner>
            </Layout.Section>
          )}

          {/* Temel bilgiler */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Temel Bilgiler</Text>
                <FormLayout>
                  <TextField label="Şablon Adı" name="name" value={name} onChange={setName} autoComplete="off" placeholder="Örn: Ahşap Çerçeve Karikatür" />
                  <TextField label="Açıklama (opsiyonel)" name="description" value={description} onChange={setDescription} multiline={2} autoComplete="off" />
                  <Select label="AI Dönüşüm Stili" name="ai_style" options={AI_STYLE_OPTIONS} value={aiStyle} onChange={setAiStyle} />
                  <TextField label="Sıralama" name="sort_order" type="number" value={sortOrder} onChange={setSortOrder} autoComplete="off" />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Şablon görseli yükle */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Şablon Görseli</Text>
                <Text as="p" tone="subdued">
                  Arka plan tasarım görseli. Önerilen: 2480×3508 px (A4 @300dpi). PNG veya JPEG.
                </Text>
                <input type="file" name="template_image" accept="image/png,image/jpeg,image/webp" onChange={handleTemplateFileChange} />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Visual coordinate editor */}
          {templatePreview && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Koordinat Editörü</Text>
                  <Text as="p" tone="subdued">
                    Görsele tıklayıp sürükleyerek fotoğraf alanını çizin.
                    Metin alanı butonuna tıklayıp görselde o metnin çıkacağı yere tıklayın.
                  </Text>
                  <TemplateVisualEditor
                    imageUrl={templatePreview}
                    photoRect={photoRect}
                    onPhotoRect={setPhotoRect}
                    textFields={textFields}
                    onTextPos={handleTextPos}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Metin alanları */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Metin Alanları</Text>
                  <Button onClick={addTextField} size="slim">+ Alan Ekle</Button>
                </InlineStack>
                <Text as="p" tone="subdued">
                  Koordinat editöründe T1, T2... butonlarıyla konumlarını görsele tıklayarak ayarlayın.
                </Text>

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
                            options={[
                              { label: "Sol", value: "left" },
                              { label: "Orta", value: "center" },
                              { label: "Sağ", value: "right" },
                            ]}
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
          </Layout.Section>

          {/* Mockup (opsiyonel) */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Lifestyle Mockup (Opsiyonel)</Text>
                <Text as="p" tone="subdued">Ahşap çerçeve, duvar vb. ortam fotoğrafı.</Text>
                {mockupPreview && (
                  <img src={mockupPreview} alt="Mockup" style={{ maxWidth: 280, maxHeight: 280, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                )}
                <input type="file" name="mockup_image" accept="image/png,image/jpeg,image/webp" onChange={handleMockupFileChange} />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <InlineStack gap="300" align="end">
              <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
              <Button submit variant="primary" loading={isLoading}>
                {isNew ? "Şablonu Oluştur" : "Değişiklikleri Kaydet"}
              </Button>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </form>
    </Page>
  );
}
