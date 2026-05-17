import { unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, Banner, Divider, EmptyState, TextField, Select, Thumbnail,
} from "@shopify/polaris";
import { useState, useRef } from "react";
import { authenticate } from "~/shopify.server";
import {
  getShopTemplates,
  addShopTemplate,
  deleteShopTemplate,
  updateShopTemplate,
  type ShopTemplate,
} from "~/models/shop-templates.server";

const CATEGORIES = [
  { label: "Özel", value: "custom" },
  { label: "Çizgi Film", value: "cartoon" },
  { label: "Süper Kahraman", value: "superhero" },
  { label: "Spor", value: "sport" },
  { label: "Doğa", value: "nature" },
  { label: "Soyut", value: "abstract" },
  { label: "Yazı / Logo", value: "text" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const templates = await getShopTemplates(shop);
  const url = new URL(request.url);
  const saved = url.searchParams.get("saved") === "1";
  return json({ shop, templates, saved });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const contentType = request.headers.get("content-type") ?? "";

  // Multipart upload
  if (contentType.includes("multipart/form-data")) {
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 8 * 1024 * 1024 });
    const form = await unstable_parseMultipartFormData(request, uploadHandler);
    const intent = String(form.get("intent") || "");

    if (intent === "upload") {
      const file = form.get("image");
      const name = String(form.get("name") || "Şablon").trim().slice(0, 80);
      const category = String(form.get("category") || "custom");

      if (!(file instanceof File) || file.size === 0) {
        return json({ error: "Görsel seçilmedi" }, { status: 400 });
      }

      try {
        await addShopTemplate(shop, name, category, file, request.url);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Yükleme başarısız" }, { status: 500 });
      }

      return redirect("/app/templates?saved=1");
    }
  }

  // JSON / urlencoded actions
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "delete") {
    const id = String(form.get("id") || "");
    if (id) await deleteShopTemplate(shop, id);
    return json({ ok: true });
  }

  if (intent === "rename") {
    const id = String(form.get("id") || "");
    const name = String(form.get("name") || "").trim().slice(0, 80);
    const category = String(form.get("category") || "custom");
    if (id) await updateShopTemplate(shop, id, { name, category });
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

function TemplateCard({ tpl }: { tpl: ShopTemplate }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tpl.name);
  const [category, setCategory] = useState(tpl.category);
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
  const isSaving = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "rename";

  return (
    <Card>
      <Box padding="300">
        <BlockStack gap="300">
          <InlineStack gap="300" blockAlign="start">
            <Thumbnail
              source={tpl.imageUrl}
              alt={tpl.name}
              size="large"
            />
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold">{tpl.name}</Text>
              <Badge>{CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category}</Badge>
            </BlockStack>
          </InlineStack>

          {editing ? (
            <BlockStack gap="200">
              <TextField
                label="İsim"
                value={name}
                onChange={setName}
                autoComplete="off"
              />
              <Select
                label="Kategori"
                options={CATEGORIES}
                value={category}
                onChange={setCategory}
              />
              <InlineStack gap="200">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={tpl.id} />
                  <input type="hidden" name="name" value={name} />
                  <input type="hidden" name="category" value={category} />
                  <Button submit variant="primary" size="slim" loading={isSaving}>
                    Kaydet
                  </Button>
                </fetcher.Form>
                <Button size="slim" onClick={() => setEditing(false)}>İptal</Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <InlineStack gap="200">
              <Button size="slim" onClick={() => setEditing(true)}>Düzenle</Button>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={tpl.id} />
                <Button submit variant="plain" tone="critical" size="slim" loading={isDeleting}>
                  Sil
                </Button>
              </fetcher.Form>
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function TemplatesRoute() {
  const { templates, saved } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isUploading = navigation.state === "submitting";
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("custom");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <Page
      title="Mağaza Şablonları"
      subtitle="Müşterilerin tasarım ekranında göreceği hazır görseller"
    >
      <BlockStack gap="500">
        {saved && <Banner tone="success" title="Şablon başarıyla yüklendi." onDismiss={() => {}} />}

        {/* Upload form */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Yeni Şablon Ekle</Text>
              <Text as="p" tone="subdued">
                PNG, JPG, WebP veya SVG formatında görsel yükleyin.
                Müşteriler bu görselleri tişörtlerine tek tıkla ekleyebilir.
                Marvel, Disney, Looney Tunes gibi lisanslı karakterler için
                geçerli lisans sahibi olduğunuzdan emin olun.
              </Text>

              <form method="post" encType="multipart/form-data">
                <input type="hidden" name="intent" value="upload" />
                <BlockStack gap="300">
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                    style={{ cursor: "pointer" }}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      name="image"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleFile}
                    />
                    {preview ? (
                      <img
                        src={preview}
                        alt="Önizleme"
                        style={{ maxHeight: 160, maxWidth: "100%", objectFit: "contain", margin: "0 auto" }}
                      />
                    ) : (
                      <Text as="p" tone="subdued">
                        Görsel seçmek için tıklayın (PNG, JPG, WebP, SVG · maks 8 MB)
                      </Text>
                    )}
                  </div>

                  <TextField
                    label="Şablon adı"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    placeholder="örn. Spider-Man, Bugs Bunny, Çiçek Logo"
                  />

                  <Select
                    label="Kategori"
                    name="category"
                    options={CATEGORIES}
                    value={category}
                    onChange={setCategory}
                  />

                  <InlineStack align="end">
                    <Button variant="primary" submit loading={isUploading} disabled={!preview}>
                      Yükle ve Kaydet
                    </Button>
                  </InlineStack>
                </BlockStack>
              </form>
            </BlockStack>
          </Box>
        </Card>

        <Divider />

        {/* Template list */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Mevcut Şablonlar ({templates.length})
          </Text>

          {templates.length === 0 ? (
            <Card>
              <EmptyState
                heading="Henüz şablon yok"
                image=""
              >
                <Text as="p">Yukarıdaki formu kullanarak ilk şablonunuzu ekleyin.</Text>
              </EmptyState>
            </Card>
          ) : (
            <Layout>
              {templates.map((tpl) => (
                <Layout.Section key={tpl.id} variant="oneThird">
                  <TemplateCard tpl={tpl as ShopTemplate} />
                </Layout.Section>
              ))}
            </Layout>
          )}
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
