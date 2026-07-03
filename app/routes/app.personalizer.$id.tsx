import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, FormLayout, TextField, Select, Checkbox,
  Button, BlockStack, InlineStack, Text, Banner, Divider, Box,
  Thumbnail, Badge, ColorPicker, hsbToHex, hexToRgb, rgbToHsb,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getPersonalizerTemplate,
  createPersonalizerTemplate,
  updatePersonalizerTemplate,
  type TextFieldDef,
} from "~/models/personalizer.server";
import { uploadToR2 } from "~/lib/r2.server";
import { randomBytes } from "node:crypto";

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

  if (id === "new") {
    return json({ shop: session.shop, template: null, isNew: true });
  }

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
    try {
      text_fields = JSON.parse(String(form.get("text_fields") ?? "[]"));
    } catch { /* ignore */ }

    // Upload template image if provided
    let template_url = String(form.get("existing_template_url") ?? "");
    const templateFile = form.get("template_image");
    if (templateFile instanceof File && templateFile.size > 0) {
      const buf = Buffer.from(await templateFile.arrayBuffer());
      const ext = templateFile.type === "image/jpeg" ? "jpg" : templateFile.type === "image/webp" ? "webp" : "png";
      template_url = await uploadToR2(buf, ext, "personalizer-template");
    }

    // Upload mockup image if provided
    let mockup_url = String(form.get("existing_mockup_url") ?? "");
    const mockupFile = form.get("mockup_image");
    if (mockupFile instanceof File && mockupFile.size > 0) {
      const buf = Buffer.from(await mockupFile.arrayBuffer());
      const ext = mockupFile.type === "image/jpeg" ? "jpg" : mockupFile.type === "image/webp" ? "webp" : "png";
      mockup_url = await uploadToR2(buf, ext, "personalizer-mockup");
    }

    if (!template_url) return json({ error: "Şablon görseli gerekli" }, { status: 400 });

    if (id === "new") {
      await createPersonalizerTemplate({
        shop, name, description, template_url, mockup_url,
        photo_x, photo_y, photo_width, photo_height,
        text_fields, ai_style, sort_order,
      });
    } else {
      await updatePersonalizerTemplate(id, shop, {
        name, description, template_url, mockup_url,
        photo_x, photo_y, photo_width, photo_height,
        text_fields, ai_style, sort_order,
      });
    }

    return redirect("/app/personalizer");
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

function newTextField(): TextFieldDef {
  return {
    id: randomBytes(4).toString("hex"),
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
  const [photoX, setPhotoX] = useState(String(template?.photo_x ?? 440));
  const [photoY, setPhotoY] = useState(String(template?.photo_y ?? 600));
  const [photoW, setPhotoW] = useState(String(template?.photo_width ?? 1600));
  const [photoH, setPhotoH] = useState(String(template?.photo_height ?? 1600));
  const [aiStyle, setAiStyle] = useState(template?.ai_style ?? "caricature");
  const [sortOrder, setSortOrder] = useState(String(template?.sort_order ?? 0));
  const [textFields, setTextFields] = useState<TextFieldDef[]>(template?.text_fields ?? []);
  const [templatePreview, setTemplatePreview] = useState<string>(template?.template_url ?? "");
  const [mockupPreview, setMockupPreview] = useState<string>(template?.mockup_url ?? "");

  const isLoading = fetcher.state !== "idle";

  function addTextField() {
    setTextFields((prev) => [...prev, newTextField()]);
  }

  function removeTextField(idx: number) {
    setTextFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateTextField<K extends keyof TextFieldDef>(idx: number, key: K, value: TextFieldDef[K]) {
    setTextFields((prev) => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));
  }

  function handleTemplateFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setTemplatePreview(url);
    }
  }

  function handleMockupFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setMockupPreview(url);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("text_fields", JSON.stringify(textFields));
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

          <Layout>
            {fetcher.data?.error && (
              <Layout.Section>
                <Banner tone="critical">{fetcher.data.error}</Banner>
              </Layout.Section>
            )}

            {/* Temel Bilgiler */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Temel Bilgiler</Text>
                  <FormLayout>
                    <TextField
                      label="Şablon Adı"
                      name="name"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="Örn: Ahşap Çerçeve Karikatür"
                    />
                    <TextField
                      label="Açıklama (opsiyonel)"
                      name="description"
                      value={description}
                      onChange={setDescription}
                      multiline={2}
                      autoComplete="off"
                    />
                    <Select
                      label="AI Dönüşüm Stili"
                      name="ai_style"
                      options={AI_STYLE_OPTIONS}
                      value={aiStyle}
                      onChange={setAiStyle}
                    />
                    <TextField
                      label="Sıralama"
                      name="sort_order"
                      type="number"
                      value={sortOrder}
                      onChange={setSortOrder}
                      autoComplete="off"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Şablon Görseli */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Şablon Görseli</Text>
                  <Text as="p" tone="subdued">
                    Müşterinin fotoğrafının yerleştirileceği arka plan tasarımı.
                    Önerilen boyut: 2480×3508 px (A4 @300dpi). PNG veya JPEG.
                  </Text>
                  {templatePreview && (
                    <Box>
                      <img
                        src={templatePreview}
                        alt="Şablon önizleme"
                        style={{ maxWidth: "300px", maxHeight: "400px", objectFit: "contain", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                      />
                    </Box>
                  )}
                  <input
                    type="file"
                    name="template_image"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleTemplateFileChange}
                  />
                  {!isNew && !templatePreview && (
                    <Text as="p" tone="subdued">Mevcut görsel korunacak</Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Fotoğraf Alanı Koordinatları */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Fotoğraf Alanı Koordinatları</Text>
                  <Text as="p" tone="subdued">
                    Müşterinin fotoğrafının şablon üzerinde nereye yerleştirileceğini piksel cinsinden belirtin.
                    Sol üst köşe (X, Y) ve boyutlar (Genişlik, Yükseklik).
                  </Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField label="X (sol)" name="photo_x" type="number" value={photoX} onChange={setPhotoX} autoComplete="off" suffix="px" />
                      <TextField label="Y (üst)" name="photo_y" type="number" value={photoY} onChange={setPhotoY} autoComplete="off" suffix="px" />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField label="Genişlik" name="photo_width" type="number" value={photoW} onChange={setPhotoW} autoComplete="off" suffix="px" />
                      <TextField label="Yükseklik" name="photo_height" type="number" value={photoH} onChange={setPhotoH} autoComplete="off" suffix="px" />
                    </FormLayout.Group>
                  </FormLayout>
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Mockup Görseli */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Lifestyle Mockup (Opsiyonel)</Text>
                  <Text as="p" tone="subdued">
                    Ürünün çerçeve/ortam içinde gösterildiği yaşam stili fotoğrafı.
                    Şu an yalnızca bilgi amaçlı saklanır.
                  </Text>
                  {mockupPreview && (
                    <Box>
                      <img
                        src={mockupPreview}
                        alt="Mockup önizleme"
                        style={{ maxWidth: "300px", maxHeight: "300px", objectFit: "contain", borderRadius: "8px", border: "1px solid #e5e7eb" }}
                      />
                    </Box>
                  )}
                  <input
                    type="file"
                    name="mockup_image"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleMockupFileChange}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Metin Alanları */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Metin Alanları</Text>
                    <Button onClick={addTextField} size="slim">+ Alan Ekle</Button>
                  </InlineStack>
                  <Text as="p" tone="subdued">
                    Müşterilerin doldurabileceği metin alanları (isim, tarih, mesaj vb.)
                    X ve Y koordinatları, şablon görseli üzerindeki piksel konumunu belirtir.
                  </Text>

                  {textFields.length === 0 && (
                    <Text as="p" tone="subdued">Henüz metin alanı eklenmedi.</Text>
                  )}

                  {textFields.map((f, idx) => (
                    <Box key={f.id} background="bg-surface-secondary" padding="400" borderRadius="200">
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingSm">Alan #{idx + 1}</Text>
                          <Button tone="critical" size="slim" onClick={() => removeTextField(idx)}>Sil</Button>
                        </InlineStack>
                        <FormLayout>
                          <FormLayout.Group>
                            <TextField
                              label="Etiket (müşteriye gösterilir)"
                              value={f.label}
                              onChange={(v) => updateTextField(idx, "label", v)}
                              autoComplete="off"
                            />
                            <TextField
                              label="Placeholder"
                              value={f.placeholder}
                              onChange={(v) => updateTextField(idx, "placeholder", v)}
                              autoComplete="off"
                            />
                          </FormLayout.Group>
                          <FormLayout.Group>
                            <TextField label="X konumu (px)" type="number" value={String(f.x)} onChange={(v) => updateTextField(idx, "x", parseInt(v, 10) || 0)} autoComplete="off" />
                            <TextField label="Y konumu (px)" type="number" value={String(f.y)} onChange={(v) => updateTextField(idx, "y", parseInt(v, 10) || 0)} autoComplete="off" />
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
                          <Checkbox
                            label="Kalın (Bold)"
                            checked={f.bold}
                            onChange={(v) => updateTextField(idx, "bold", v)}
                          />
                        </FormLayout>
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <InlineStack gap="300" align="end">
                <Button onClick={() => navigate("/app/personalizer")}>İptal</Button>
                <Button
                  submit
                  variant="primary"
                  loading={isLoading}
                >
                  {isNew ? "Şablonu Oluştur" : "Değişiklikleri Kaydet"}
                </Button>
              </InlineStack>
            </Layout.Section>
          </Layout>
        </form>
    </Page>
  );
}
