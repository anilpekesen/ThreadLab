import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, Banner, EmptyState, TextField, Thumbnail, Select,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getAllCliparts,
  addClipart,
  deleteClipart,
  toggleClipartActive,
  type Clipart,
} from "~/models/cliparts.server";

const CLIPART_CATEGORIES = [
  { label: "Şekil",   value: "sekil" },
  { label: "Çerçeve", value: "cerceve" },
  { label: "Spor",    value: "spor" },
  { label: "Anadolu", value: "anadolu" },
  { label: "Doğa",    value: "doga" },
  { label: "Genel",   value: "genel" },
];

const MAX_BYTES = 5 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate(request);
  const cliparts = await getAllCliparts();
  return json({ cliparts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate(request);

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const cloned = request.clone();
    const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_BYTES });
    const form = await unstable_parseMultipartFormData(cloned, uploadHandler);
    const intent = String(form.get("intent") || "");

    if (intent === "upload") {
      const file = form.get("image");
      const name = String(form.get("name") || "Klipart").trim().slice(0, 80);
      const category = String(form.get("category") || "genel");

      if (!(file instanceof File) || file.size === 0)
        return json({ error: "Dosya seçilmedi" }, { status: 400 });
      if (file.size > MAX_BYTES)
        return json({ error: "Dosya 5 MB sınırını aşıyor" }, { status: 400 });

      try {
        await addClipart(name, category, file, request.url);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 });
      }
      return json({ ok: true });
    }
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "delete") {
    const id = String(form.get("id") || "");
    if (id) await deleteClipart(id);
    return json({ ok: true });
  }

  if (intent === "toggle") {
    const id = String(form.get("id") || "");
    const active = form.get("active") === "1";
    if (id) await toggleClipartActive(id, active);
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

// ─── Klipart Kartı ──────────────────────────────────────────────────
function ClipartCard({ c }: { c: Clipart }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "delete";
  const isToggling = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "toggle";

  return (
    <Card>
      <Box padding="300">
        <BlockStack gap="300">
          <InlineStack gap="300" blockAlign="start">
            <Thumbnail
              source={c.imageUrl.startsWith("https://assets.printlabapp.com/")
                ? `/api/img-proxy?url=${encodeURIComponent(c.imageUrl)}`
                : c.imageUrl}
              alt={c.name}
              size="large"
            />
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold">{c.name}</Text>
              <Badge>{c.category}</Badge>
              <Badge tone={c.isActive ? "success" : "critical"}>
                {c.isActive ? "Aktif" : "Pasif"}
              </Badge>
            </BlockStack>
          </InlineStack>

          <InlineStack gap="200">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="toggle" />
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
              <Button submit size="slim" loading={isToggling}>
                {c.isActive ? "Pasif Et" : "Aktif Et"}
              </Button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={c.id} />
              <Button submit variant="plain" tone="critical" size="slim" loading={isDeleting}>
                Sil
              </Button>
            </fetcher.Form>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Sayfa ──────────────────────────────────────────────────────────
export default function ClipartsRoute() {
  const { cliparts } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const uploadFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isUploading = uploadFetcher.state !== "idle";
  const uploadOk = !isUploading && uploadFetcher.data?.ok === true;
  const uploadError = !isUploading && uploadFetcher.data?.error;

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("genel");

  useEffect(() => {
    if (uploadOk) {
      setPreview(null);
      setFileName(null);
      setName("");
      setCategory("genel");
      revalidate();
    }
  }, [uploadOk]);

  const byCategory = CLIPART_CATEGORIES.map((cat) => ({
    ...cat,
    items: cliparts.filter((c) => c.category === cat.value),
  })).filter((cat) => cat.items.length > 0);

  return (
    <Page
      title="Klipart Kütüphanesi"
      subtitle="Tüm müşteri tasarım araçlarında görünen hazır grafik kütüphanesi. SVG formatı önerilir."
    >
      <BlockStack gap="500">
        {uploadOk && <Banner tone="success" title="Klipart başarıyla yüklendi" onDismiss={() => {}} />}
        {uploadError && <Banner tone="critical" title={String(uploadError)} onDismiss={() => {}} />}

        {/* Bilgi */}
        <Banner tone="info" title="Bu klipartlar tüm müşterilere görünür">
          <Text as="p">
            Yüklediğiniz görseller anında tüm ürün tasarım araçlarının "Klipart" sekmesinde belirir.
            SVG formatında yüklerseniz müşteri rengi değiştirebilir. PNG/JPG yüklerseniz saydam arka planlı görsel önerilir.
          </Text>
        </Banner>

        {/* Upload */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Yeni Klipart Ekle</Text>

              <uploadFetcher.Form method="post" encType="multipart/form-data">
                <input type="hidden" name="intent" value="upload" />
                <BlockStack gap="300">

                  {/* Dosya seç */}
                  <div>
                    <label
                      htmlFor="clipart-file-input"
                      style={{
                        display: "block",
                        cursor: "pointer",
                        borderRadius: 12,
                        border: "2px dashed #d1d5db",
                        padding: "24px 16px",
                        textAlign: "center",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLLabelElement).style.borderColor = "#10b981";
                        (e.currentTarget as HTMLLabelElement).style.background = "rgba(16,185,129,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db";
                        (e.currentTarget as HTMLLabelElement).style.background = "transparent";
                      }}
                    >
                      <input
                        id="clipart-file-input"
                        type="file"
                        name="image"
                        accept="image/svg+xml,image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setFileName(file.name);
                          if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60));
                          const reader = new FileReader();
                          reader.onload = (ev) => setPreview(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                      {preview ? (
                        <BlockStack gap="200">
                          <img
                            src={preview}
                            alt="Önizleme"
                            style={{ maxHeight: 120, maxWidth: "100%", objectFit: "contain", margin: "0 auto", display: "block" }}
                          />
                          <Text as="p" variant="bodySm" tone="subdued">{fileName} — değiştirmek için tıkla</Text>
                        </BlockStack>
                      ) : (
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="medium">Görsel seçmek için tıkla</Text>
                          <Text as="p" variant="bodySm" tone="subdued">SVG, PNG, JPG — max 5 MB</Text>
                        </BlockStack>
                      )}
                    </label>
                  </div>

                  <TextField
                    label="Klipart Adı"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    placeholder="örn. Türk Yıldızı, Çiçek Motifi"
                  />

                  <Select
                    label="Kategori"
                    name="category"
                    options={CLIPART_CATEGORIES}
                    value={category}
                    onChange={setCategory}
                  />

                  <InlineStack align="end">
                    <Button
                      variant="primary"
                      submit
                      loading={isUploading}
                      disabled={!preview}
                    >
                      Kaydet
                    </Button>
                  </InlineStack>
                </BlockStack>
              </uploadFetcher.Form>
            </BlockStack>
          </Box>
        </Card>

        {/* Liste */}
        <BlockStack gap="300">
          <InlineStack align="space-between">
            <Text as="h2" variant="headingMd">
              Mevcut Klipartlar ({cliparts.length})
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {cliparts.filter((c) => c.isActive).length} aktif
            </Text>
          </InlineStack>

          {cliparts.length === 0 ? (
            <Card>
              <EmptyState heading="Henüz klipart yok" image="">
                <Text as="p">Yukarıdan ilk klipartı ekleyin. Anadolu motifleri, geometrik şekiller veya marka grafikleri yükleyebilirsiniz.</Text>
              </EmptyState>
            </Card>
          ) : (
            byCategory.map((cat) => (
              <BlockStack key={cat.value} gap="200">
                <Text as="h3" variant="headingSm">{cat.label} ({cat.items.length})</Text>
                <Layout>
                  {cat.items.map((c) => (
                    <Layout.Section key={c.id} variant="oneThird">
                      <ClipartCard c={c} />
                    </Layout.Section>
                  ))}
                </Layout>
              </BlockStack>
            ))
          )}
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
