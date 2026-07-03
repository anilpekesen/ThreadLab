import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Checkbox,
  Button, BlockStack, InlineStack, Text, Banner, Box, Badge,
} from "@shopify/polaris";
import { useState, useRef, useCallback, useEffect } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { createPersonalizerTemplate, type TextFieldDef } from "~/models/personalizer.server";
import { uploadToR2 } from "~/lib/r2.server";

const MAX_UPLOAD = 20 * 1024 * 1024;
const AI_STYLE_OPTIONS = [
  { label: "Karikatür (Önerilen)", value: "caricature" },
  { label: "Suluboya", value: "watercolor" },
  { label: "Karakalem Çizim", value: "sketch" },
  { label: "Pop Art", value: "pop_art" },
  { label: "AI Dönüşümü Yok (orijinal fotoğraf)", value: "none" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  return json({ shop: session.shop });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;

  const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD });
  const form = await unstable_parseMultipartFormData(request, uploadHandler);

  const count = parseInt(String(form.get("count") ?? "0"), 10);
  if (count === 0) return json({ error: "En az 1 şablon gerekli" }, { status: 400 });

  const aiStyle = String(form.get("ai_style") ?? "caricature");
  const globalFields: TextFieldDef[] = JSON.parse(String(form.get("global_text_fields") ?? "[]"));

  const errors: string[] = [];

  for (let i = 0; i < count; i++) {
    const name = String(form.get(`name_${i}`) ?? "").trim() || `Şablon ${i + 1}`;
    const photo_x = parseInt(String(form.get(`photo_x_${i}`) ?? "0"), 10);
    const photo_y = parseInt(String(form.get(`photo_y_${i}`) ?? "0"), 10);
    const photo_width = parseInt(String(form.get(`photo_width_${i}`) ?? "400"), 10);
    const photo_height = parseInt(String(form.get(`photo_height_${i}`) ?? "400"), 10);
    const textPositionsRaw = String(form.get(`text_positions_${i}`) ?? "{}");
    let textPositions: Record<string, { x: number; y: number }> = {};
    try { textPositions = JSON.parse(textPositionsRaw); } catch { /* ignore */ }

    // Merge global field defs + per-template positions
    const text_fields: TextFieldDef[] = globalFields.map((f) => ({
      ...f,
      x: textPositions[f.id]?.x ?? f.x,
      y: textPositions[f.id]?.y ?? f.y,
    }));

    const existingUrl = String(form.get(`existing_url_${i}`) ?? "");
    let template_url = existingUrl;
    const file = form.get(`template_image_${i}`);
    if (file instanceof File && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
      try {
        template_url = await uploadToR2(buf, ext, "personalizer-template");
      } catch (e) {
        errors.push(`Şablon ${i + 1}: görsel yüklenemedi`);
        continue;
      }
    }

    if (!template_url) {
      errors.push(`Şablon ${i + 1}: görsel eksik`);
      continue;
    }

    await createPersonalizerTemplate({
      shop, name, template_url, mockup_url: "",
      photo_x, photo_y, photo_width, photo_height,
      text_fields, ai_style: aiStyle, sort_order: i,
    });
  }

  if (errors.length > 0) return json({ error: errors.join(" | ") }, { status: 207 });
  return redirect("/app/personalizer");
};

// ── Visual Editor (same as in $id.tsx) ─────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }
interface GlobalField { id: string; label: string; placeholder: string; font_size: number; color: string; bold: boolean; max_length: number; align: "left" | "center" | "right" }

type EditorMode = { type: "photo" } | { type: "text"; fieldId: string };

function VisualEditor({
  imageUrl,
  photoRect,
  onPhotoRect,
  globalFields,
  textPositions,
  onTextPos,
}: {
  imageUrl: string;
  photoRect: Rect;
  onPhotoRect: (r: Rect) => void;
  globalFields: GlobalField[];
  textPositions: Record<string, { x: number; y: number }>;
  onTextPos: (fieldId: string, x: number, y: number) => void;
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
    return {
      x: Math.round((e.clientX - rect.left) * (naturalW / rect.width)),
      y: Math.round((e.clientY - rect.top) * (naturalH / rect.height)),
    };
  }

  function toDisplayPx(imgX: number, imgY: number) {
    const img = imgRef.current;
    if (!img || naturalW === 1) return { left: 0, top: 0 };
    const rect = img.getBoundingClientRect();
    return { left: imgX * (rect.width / naturalW), top: imgY * (rect.height / naturalH) };
  }

  function toDisplayRect(r: Rect) {
    const img = imgRef.current;
    if (!img || naturalW === 1) return {};
    const rect = img.getBoundingClientRect();
    return {
      left: `${r.x * (rect.width / naturalW)}px`,
      top: `${r.y * (rect.height / naturalH)}px`,
      width: `${r.w * (rect.width / naturalW)}px`,
      height: `${r.h * (rect.height / naturalH)}px`,
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const c = getImgCoords(e);
    if (mode.type === "text") { onTextPos(mode.fieldId, c.x, c.y); return; }
    setDragStart(c);
    setDragging(true);
    onPhotoRect({ x: c.x, y: c.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragging || mode.type !== "photo") return;
    const c = getImgCoords(e);
    onPhotoRect({ x: Math.min(dragStart.x, c.x), y: Math.min(dragStart.y, c.y), w: Math.abs(c.x - dragStart.x), h: Math.abs(c.y - dragStart.y) });
  }

  const isPhotoMode = mode.type === "photo";

  return (
    <BlockStack gap="200">
      <InlineStack gap="200" wrap>
        <Button size="slim" variant={isPhotoMode ? "primary" : "secondary"} onClick={() => setMode({ type: "photo" })}>
          📷 Fotoğraf alanı
        </Button>
        {globalFields.map((f) => (
          <Button key={f.id} size="slim"
            variant={mode.type === "text" && mode.fieldId === f.id ? "primary" : "secondary"}
            onClick={() => setMode({ type: "text", fieldId: f.id })}
          >
            {`T "${f.label}"`}
          </Button>
        ))}
      </InlineStack>

      <Text as="p" tone="subdued" variant="bodySm">
        {isPhotoMode ? "Fotoğraf alanına tıklayıp sürükleyin." : `"${globalFields.find((f) => mode.type === "text" && f.id === mode.fieldId)?.label}" konumu için görsele tıklayın.`}
      </Text>

      <div
        style={{ position: "relative", display: "inline-block", cursor: isPhotoMode ? "crosshair" : "cell", userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Şablon"
          style={{ display: "block", maxWidth: "100%", maxHeight: "60vh", borderRadius: 8, border: "1px solid #e5e7eb" }}
          onLoad={(e) => { setNaturalW(e.currentTarget.naturalWidth || 1); setNaturalH(e.currentTarget.naturalHeight || 1); }}
          draggable={false}
        />

        {photoRect.w > 0 && photoRect.h > 0 && (
          <div style={{ position: "absolute", ...toDisplayRect(photoRect), border: "2px solid #6366f1", background: "rgba(99,102,241,0.15)", pointerEvents: "none", boxSizing: "border-box" }}>
            <span style={{ position: "absolute", top: 2, left: 4, fontSize: 10, fontWeight: 700, color: "#4f46e5", background: "rgba(255,255,255,.85)", padding: "0 4px", borderRadius: 3 }}>
              {`📷 ${photoRect.w}×${photoRect.h}`}
            </span>
          </div>
        )}

        {globalFields.map((f) => {
          const pos = textPositions[f.id];
          if (!pos) return null;
          const dp = toDisplayPx(pos.x, pos.y);
          return (
            <div key={f.id} style={{ position: "absolute", left: dp.left, top: dp.top, transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 10 }}>
              <div style={{ background: mode.type === "text" && mode.fieldId === f.id ? "#6366f1" : "#10b981", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 5px", borderRadius: 4, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                {f.label}
              </div>
            </div>
          );
        })}
      </div>

      <Box background="bg-surface-secondary" padding="200" borderRadius="200">
        <Text as="p" variant="bodySm">{`📷 X=${photoRect.x} Y=${photoRect.y} — ${photoRect.w}×${photoRect.h}px`}</Text>
        {globalFields.map((f) => {
          const pos = textPositions[f.id];
          return <Text key={f.id} as="p" variant="bodySm">{`"${f.label}": X=${pos?.x ?? "?"} Y=${pos?.y ?? "?"}`}</Text>;
        })}
      </Box>
    </BlockStack>
  );
}

// ── Template Item Card ───────────────────────────────────────────────────────

interface TemplateItemState {
  tempId: string;
  name: string;
  file: File | null;
  previewUrl: string;
  photoRect: Rect;
  textPositions: Record<string, { x: number; y: number }>;
}

function TemplateCard({
  item,
  index,
  globalFields,
  onUpdate,
  onRemove,
  isOnly,
}: {
  item: TemplateItemState;
  index: number;
  globalFields: GlobalField[];
  onUpdate: (updated: TemplateItemState) => void;
  onRemove: () => void;
  isOnly: boolean;
}) {
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    onUpdate({ ...item, file: f, previewUrl: URL.createObjectURL(f) });
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge>{`Şablon ${index + 1}`}</Badge>
            <Text as="h3" variant="headingSm" fontWeight="bold">{item.name || `Şablon ${index + 1}`}</Text>
          </InlineStack>
          {!isOnly && <Button tone="critical" size="slim" onClick={onRemove}>Kaldır</Button>}
        </InlineStack>

        <FormLayout>
          <TextField
            label="Şablon Adı"
            value={item.name}
            onChange={(v) => onUpdate({ ...item, name: v })}
            autoComplete="off"
            placeholder={`Örn: Şablon ${index + 1} — Ahşap Çerçeve`}
          />
        </FormLayout>

        {!item.previewUrl ? (
          <Box background="bg-surface-secondary" padding="600" borderRadius="200">
            <BlockStack gap="200" inlineAlign="center">
              <Text as="p" tone="subdued">Şablon görselini seçin</Text>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
            </BlockStack>
          </Box>
        ) : (
          <BlockStack gap="300">
            <InlineStack gap="300" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">Görsel yüklendi</Text>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
            </InlineStack>
            <VisualEditor
              imageUrl={item.previewUrl}
              photoRect={item.photoRect}
              onPhotoRect={(r) => onUpdate({ ...item, photoRect: r })}
              globalFields={globalFields}
              textPositions={item.textPositions}
              onTextPos={(fieldId, x, y) => onUpdate({ ...item, textPositions: { ...item.textPositions, [fieldId]: { x, y } } })}
            />
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function makeGlobalField(): GlobalField {
  return { id: Math.random().toString(36).slice(2, 10), label: "İsim", placeholder: "Adınızı girin", font_size: 120, color: "#000000", bold: true, max_length: 30, align: "center" };
}

function makeTemplateItem(): TemplateItemState {
  return { tempId: Math.random().toString(36).slice(2, 10), name: "", file: null, previewUrl: "", photoRect: { x: 0, y: 0, w: 0, h: 0 }, textPositions: {} };
}

export default function PersonalizerBulkNew() {
  const navigate = useNavigate();
  const fetcher = useFetcher<{ error?: string }>();

  const [aiStyle, setAiStyle] = useState("caricature");
  const [globalFields, setGlobalFields] = useState<GlobalField[]>([makeGlobalField()]);
  const [templates, setTemplates] = useState<TemplateItemState[]>([makeTemplateItem()]);

  const isLoading = fetcher.state !== "idle";

  function addField() { setGlobalFields((p) => [...p, makeGlobalField()]); }
  function removeField(idx: number) { setGlobalFields((p) => p.filter((_, i) => i !== idx)); }
  function updateField<K extends keyof GlobalField>(idx: number, key: K, val: GlobalField[K]) {
    setGlobalFields((p) => p.map((f, i) => i === idx ? { ...f, [key]: val } : f));
  }

  function addTemplate() { setTemplates((p) => [...p, makeTemplateItem()]); }
  function removeTemplate(idx: number) { setTemplates((p) => p.filter((_, i) => i !== idx)); }
  function updateTemplate(idx: number, updated: TemplateItemState) {
    setTemplates((p) => p.map((t, i) => i === idx ? updated : t));
  }

  // Handle multiple file drop onto the page
  function handleMultiFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setTemplates((prev) => {
      const current = prev.filter((t) => t.file || t.previewUrl);
      const newItems: TemplateItemState[] = files.map((f) => ({
        ...makeTemplateItem(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      }));
      return current.length > 0 ? [...current, ...newItems] : newItems;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("count", String(templates.length));
    fd.set("ai_style", aiStyle);

    // GlobalFields with default x/y (fallback positions)
    const fullGlobalFields: TextFieldDef[] = globalFields.map((f) => ({ ...f, x: 1240, y: 3200 }));
    fd.set("global_text_fields", JSON.stringify(fullGlobalFields));

    templates.forEach((t, i) => {
      fd.set(`name_${i}`, t.name || `Şablon ${i + 1}`);
      fd.set(`photo_x_${i}`, String(t.photoRect.x));
      fd.set(`photo_y_${i}`, String(t.photoRect.y));
      fd.set(`photo_width_${i}`, String(t.photoRect.w || 400));
      fd.set(`photo_height_${i}`, String(t.photoRect.h || 400));
      fd.set(`text_positions_${i}`, JSON.stringify(t.textPositions));
      if (t.file) fd.set(`template_image_${i}`, t.file);
    });

    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  }

  return (
    <Page
      title="Yeni Personalizer Şablonları"
      backAction={{ content: "Şablonlar", onAction: () => navigate("/app/personalizer") }}
      subtitle="Birden fazla şablonu aynı anda oluşturun"
    >
      <form onSubmit={handleSubmit}>
        <Layout>
          {fetcher.data?.error && (
            <Layout.Section>
              <Banner tone="critical">{fetcher.data.error}</Banner>
            </Layout.Section>
          )}

          {/* Toplu görsel sürükle-bırak */}
          <Layout.Section>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleMultiFileDrop}
              style={{ border: "2px dashed #6366f1", borderRadius: 12, padding: "28px 20px", textAlign: "center", background: "#f5f5ff", cursor: "pointer" }}
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file"; inp.multiple = true; inp.accept = "image/png,image/jpeg,image/webp";
                inp.onchange = (ev) => {
                  const files = Array.from((ev.target as HTMLInputElement).files ?? []);
                  setTemplates((prev) => {
                    const current = prev.filter((t) => t.file || t.previewUrl);
                    const newItems = files.map((f) => ({ ...makeTemplateItem(), file: f, previewUrl: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") }));
                    return current.length > 0 ? [...current, ...newItems] : newItems;
                  });
                };
                inp.click();
              }}
            >
              <Text as="p" variant="headingSm">📁 Görselleri buraya sürükleyin veya tıklayın</Text>
              <Text as="p" tone="subdued" variant="bodySm">PNG, JPEG — birden fazla dosya seçebilirsiniz</Text>
            </div>
          </Layout.Section>

          {/* Global Ayarlar */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Tüm Şablonlar İçin Ortak Ayarlar</Text>
                <Select label="AI Dönüşüm Stili" options={AI_STYLE_OPTIONS} value={aiStyle} onChange={setAiStyle} />

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Metin Alanları</Text>
                  <Button size="slim" onClick={addField}>+ Alan Ekle</Button>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  Bu alanlar tüm şablonlarda geçerlidir. Her şablonun editöründe T butonuna basarak konumunu ayrı ayrı ayarlayın.
                </Text>

                {globalFields.map((f, idx) => (
                  <Box key={f.id} background="bg-surface-secondary" padding="300" borderRadius="200">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="h4" variant="bodySm" fontWeight="bold">{`Metin Alanı ${idx + 1}`}</Text>
                        {globalFields.length > 1 && <Button size="slim" tone="critical" onClick={() => removeField(idx)}>Sil</Button>}
                      </InlineStack>
                      <FormLayout>
                        <FormLayout.Group>
                          <TextField label="Etiket" value={f.label} onChange={(v) => updateField(idx, "label", v)} autoComplete="off" />
                          <TextField label="Placeholder" value={f.placeholder} onChange={(v) => updateField(idx, "placeholder", v)} autoComplete="off" />
                        </FormLayout.Group>
                        <FormLayout.Group>
                          <TextField label="Font Büyüklüğü (px)" type="number" value={String(f.font_size)} onChange={(v) => updateField(idx, "font_size", parseInt(v, 10) || 60)} autoComplete="off" />
                          <TextField label="Renk (hex)" value={f.color} onChange={(v) => updateField(idx, "color", v)} autoComplete="off" placeholder="#000000" />
                        </FormLayout.Group>
                        <FormLayout.Group>
                          <TextField label="Maks. Karakter" type="number" value={String(f.max_length)} onChange={(v) => updateField(idx, "max_length", parseInt(v, 10) || 30)} autoComplete="off" />
                          <Select label="Hizalama" options={[{ label: "Sol", value: "left" }, { label: "Orta", value: "center" }, { label: "Sağ", value: "right" }]} value={f.align} onChange={(v) => updateField(idx, "align", v as GlobalField["align"])} />
                        </FormLayout.Group>
                        <Checkbox label="Kalın (Bold)" checked={f.bold} onChange={(v) => updateField(idx, "bold", v)} />
                      </FormLayout>
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Template Cards */}
          {templates.map((t, idx) => (
            <Layout.Section key={t.tempId}>
              <TemplateCard
                item={t}
                index={idx}
                globalFields={globalFields}
                onUpdate={(updated) => updateTemplate(idx, updated)}
                onRemove={() => removeTemplate(idx)}
                isOnly={templates.length === 1}
              />
            </Layout.Section>
          ))}

          <Layout.Section>
            <InlineStack gap="300" align="space-between">
              <Button onClick={addTemplate} size="slim">+ Şablon Ekle</Button>
              <InlineStack gap="300">
                <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
                <Button submit variant="primary" loading={isLoading}>
                  {`${templates.length} Şablonu Kaydet`}
                </Button>
              </InlineStack>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </form>
    </Page>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#e5e7eb", margin: "4px 0" }} />;
}
