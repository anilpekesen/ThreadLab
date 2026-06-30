import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, Banner, EmptyState, TextField, Select, Thumbnail,
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
import { useTranslation } from "~/i18n";

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
function ClipartCard({ c, catLabel }: { c: Clipart; catLabel: string }) {
  const { t } = useTranslation();
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
              <Badge>{catLabel}</Badge>
              <Badge tone={c.isActive ? "success" : "critical"}>
                {c.isActive ? t("cliparts.activeLabel") : t("cliparts.inactiveLabel")}
              </Badge>
            </BlockStack>
          </InlineStack>

          <InlineStack gap="200">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="toggle" />
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={c.isActive ? "0" : "1"} />
              <Button submit size="slim" loading={isToggling}>
                {c.isActive ? t("cliparts.deactivateBtn") : t("cliparts.activateBtn")}
              </Button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={c.id} />
              <Button submit variant="plain" tone="critical" size="slim" loading={isDeleting}>
                {t("cliparts.deleteBtn")}
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
  const { t } = useTranslation();
  const uploadFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isUploading = uploadFetcher.state !== "idle";
  const uploadOk = !isUploading && uploadFetcher.data?.ok === true;
  const uploadError = !isUploading && uploadFetcher.data?.error;

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("genel");

  const CLIPART_CATEGORIES = [
    { label: t("cliparts.catSekil"),   value: "sekil" },
    { label: t("cliparts.catCerceve"), value: "cerceve" },
    { label: t("cliparts.catSpor"),    value: "spor" },
    { label: t("cliparts.catAnadolu"), value: "anadolu" },
    { label: t("cliparts.catDoga"),    value: "doga" },
    { label: t("cliparts.catGenel"),   value: "genel" },
  ];

  const catLabelMap = Object.fromEntries(CLIPART_CATEGORIES.map((c) => [c.value, c.label]));

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
      title={t("cliparts.pageTitle")}
      subtitle={t("cliparts.pageSubtitle")}
    >
      <BlockStack gap="500">
        {uploadOk && <Banner tone="success" title={t("cliparts.uploadSuccess")} onDismiss={() => {}} />}
        {uploadError && <Banner tone="critical" title={String(uploadError)} onDismiss={() => {}} />}

        {/* Bilgi */}
        <Banner tone="info" title={t("cliparts.infoBannerTitle")}>
          <Text as="p">{t("cliparts.infoBannerBody")}</Text>
        </Banner>

        {/* Upload */}
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">{t("cliparts.uploadTitle")}</Text>

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
                            alt="preview"
                            style={{ maxHeight: 120, maxWidth: "100%", objectFit: "contain", margin: "0 auto", display: "block" }}
                          />
                          <Text as="p" variant="bodySm" tone="subdued">{fileName} — {t("cliparts.filePickerChange")}</Text>
                        </BlockStack>
                      ) : (
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="medium">{t("cliparts.filePickerLabel")}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{t("cliparts.filePickerHint")}</Text>
                        </BlockStack>
                      )}
                    </label>
                  </div>

                  <TextField
                    label={t("cliparts.nameLabel")}
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    placeholder={t("cliparts.namePlaceholder")}
                  />

                  <Select
                    label={t("cliparts.categoryLabel")}
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
                      {t("cliparts.saveBtn")}
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
              {t("cliparts.listTitle")} ({cliparts.length})
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              {cliparts.filter((c) => c.isActive).length} {t("cliparts.activeCount")}
            </Text>
          </InlineStack>

          {cliparts.length === 0 ? (
            <Card>
              <EmptyState heading={t("cliparts.emptyHeading")} image="">
                <Text as="p">{t("cliparts.emptyBody")}</Text>
              </EmptyState>
            </Card>
          ) : (
            byCategory.map((cat) => (
              <BlockStack key={cat.value} gap="200">
                <Text as="h3" variant="headingSm">{cat.label} ({cat.items.length})</Text>
                <Layout>
                  {cat.items.map((c) => (
                    <Layout.Section key={c.id} variant="oneThird">
                      <ClipartCard c={c} catLabel={catLabelMap[c.category] ?? c.category} />
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
