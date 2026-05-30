import {
  unstable_parseMultipartFormData,
  unstable_createMemoryUploadHandler,
} from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useNavigate } from "@remix-run/react";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  Page, Layout, Card, Box, Text, BlockStack, InlineStack, Button,
  Badge, Banner, Divider, EmptyState, TextField, Thumbnail,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { authenticate } from "~/lib/authenticate.server";
import {
  getShopTemplates,
  addShopTemplate,
  deleteShopTemplate,
  updateShopTemplate,
  checkTemplateQuota,
  type ShopTemplate,
} from "~/models/shop-templates.server";
import { getShopPlan } from "~/models/bg-removal-usage.server";

const CATEGORY_SUGGESTION_KEYS = [
  "cat.cartoon", "cat.superhero", "cat.sport", "cat.nature",
  "cat.abstract", "cat.textLogo", "cat.animals", "cat.vehicles", "cat.custom",
] as const;

const MAX_TEMPLATE_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_TEMPLATE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const [templates, quota, planKey] = await Promise.all([
    getShopTemplates(shop),
    checkTemplateQuota(shop),
    getShopPlan(shop),
  ]);
  return json({ shop, templates, quota, planKey });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const cloned = request.clone();
  const { session } = await authenticate(request);
  const shop = session.shop;

  const contentType = cloned.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: MAX_TEMPLATE_UPLOAD_BYTES });
      form = await unstable_parseMultipartFormData(cloned, uploadHandler);
    } catch (err) {
      console.error("[templates] multipart parse failed:", err);
      return json({ error: "Dosya yüklenemedi. PNG, JPG, WebP veya SVG formatında en fazla 20 MB görsel yükleyin." }, { status: 400 });
    }
    const intent = String(form.get("intent") || "");

    if (intent === "upload") {
      const file = form.get("image");
      const name = String(form.get("name") || "Şablon").trim().slice(0, 80);
      const category = String(form.get("category") || "").trim().slice(0, 60) || "Genel";

      if (!(file instanceof File) || file.size === 0) {
        return json({ error: "Görsel seçilmedi" }, { status: 400 });
      }
      if (file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
        return json({ error: "Görsel 20 MB sınırını aşıyor" }, { status: 400 });
      }
      if (!ALLOWED_TEMPLATE_TYPES.has(file.type)) {
        return json({ error: "PNG, JPG, WebP veya SVG formatında görsel yükleyin" }, { status: 400 });
      }

      const quota = await checkTemplateQuota(shop);
      if (!quota.allowed) {
        return json(
          { error: `Planınızın şablon limiti doldu (${quota.count}/${quota.quota}). Plan yükseltmek için Abonelik sayfasını ziyaret edin.` },
          { status: 429 },
        );
      }

      try {
        await addShopTemplate(shop, name, category, file, cloned.url);
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Yükleme başarısız" }, { status: 500 });
      }

      return json({ ok: true });
    }
  }

  const form = await cloned.formData().catch(() => new FormData());
  const intent = String(form.get("intent") || "");

  if (intent === "delete") {
    const id = String(form.get("id") || "");
    if (id) await deleteShopTemplate(shop, id);
    return json({ ok: true });
  }

  if (intent === "rename") {
    const id = String(form.get("id") || "");
    const name = String(form.get("name") || "").trim().slice(0, 80);
    const category = String(form.get("category") || "").trim().slice(0, 60) || "Genel";
    if (id) await updateShopTemplate(shop, id, { name, category });
    return json({ ok: true });
  }

  return json({ error: "Bilinmeyen işlem" }, { status: 400 });
};

// ─── Category input ────────────────────────────────────────────────
function CategoryField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <BlockStack gap="200">
      <TextField
        label={t("productTypes.categoryLabel")}
        name="category"
        value={value}
        onChange={onChange}
        autoComplete="off"
        placeholder={t("templates.namePlaceholder")}
        helpText={t("productTypes.categoryHelp")}
        disabled={disabled}
      />
      {!disabled && (
        <InlineStack gap="150" wrap>
          {CATEGORY_SUGGESTION_KEYS.map((key) => {
            const label = t(key);
            return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(label)}
              style={{
                padding: "2px 10px",
                borderRadius: 20,
                border: "1px solid #d1d5db",
                background: value === label ? "#e0e7ff" : "#f9fafb",
                color: value === label ? "#4f46e5" : "#374151",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: value === label ? 600 : 400,
              }}
            >
              {label}
            </button>
            );
          })}
        </InlineStack>
      )}
    </BlockStack>
  );
}

// ─── Template card ────────────────────────────────────────────────
function TemplateCard({ tpl }: { tpl: ShopTemplate }) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const { t } = useTranslation();
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
            <Thumbnail source={tpl.imageUrl} alt={tpl.name} size="large" />
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold">{tpl.name}</Text>
              <Badge>{tpl.category}</Badge>
            </BlockStack>
          </InlineStack>

          {editing ? (
            <BlockStack gap="200">
              <TextField label={t("templates.nameLabel")} value={name} onChange={setName} autoComplete="off" />
              <CategoryField value={category} onChange={setCategory} />
              <InlineStack gap="200">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={tpl.id} />
                  <input type="hidden" name="name" value={name} />
                  <input type="hidden" name="category" value={category} />
                  <Button submit variant="primary" size="slim" loading={isSaving}>{t("common.save")}</Button>
                </fetcher.Form>
                <Button size="slim" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <InlineStack gap="200">
              <Button size="slim" onClick={() => setEditing(true)}>{t("common.edit")}</Button>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={tpl.id} />
                <Button submit variant="plain" tone="critical" size="slim" loading={isDeleting}>{t("common.delete")}</Button>
              </fetcher.Form>
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export default function TemplatesRoute() {
  const { templates, quota, planKey } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const uploadFetcher = useFetcher<typeof action>();
  const isUploading = uploadFetcher.state !== "idle";
  const uploadData = uploadFetcher.data as { ok?: boolean; error?: string } | undefined;
  const uploadSuccess = !isUploading && uploadData?.ok === true;
  const uploadError = !isUploading && uploadData?.error;

  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (uploadSuccess) {
      setPreview(null);
      setFileName(null);
      setName("");
      setCategory("");
      revalidate();
    }
  }, [uploadSuccess]);

  const isStarterBlocked = quota.quota === 0;
  const quotaFull = isStarterBlocked || (quota.quota !== -1 && quota.count >= quota.quota);
  const quotaLabel = quota.quota === -1 ? t("common.unlimited") : quota.quota === 0 ? "—" : `${quota.count} / ${quota.quota}`;

  return (
    <Page
      title={t("templates.title")}
      subtitle={t("templates.desc")}
    >
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.templates.1.title", bodyKey: "helper.templates.1.body" },
          { titleKey: "helper.templates.2.title", bodyKey: "helper.templates.2.body" },
          { titleKey: "helper.templates.3.title", bodyKey: "helper.templates.3.body" },
          { titleKey: "helper.templates.4.title", bodyKey: "helper.templates.4.body" },
        ]} />
        {uploadSuccess && <Banner tone="success" title={t("common.success")} onDismiss={() => {}} />}
        {uploadError && <Banner tone="critical" title={String(uploadError)} onDismiss={() => {}} />}

        {/* Plan / kota durumu */}
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="bold">{t("templates.upgradeNeeded").split(" ")[0] === "Plan" ? "Şablon Kotası" : "Template Quota"}</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  {t("templates.usageLabel")} <strong>{planKey}</strong>{isStarterBlocked ? "" : ` — ${t("templates.usageUsed")} ${quotaLabel}`}
                </Text>
              </BlockStack>
              {isStarterBlocked ? (
                <Badge tone="warning">{t("templates.starterBlocked").split(".")[0]}</Badge>
              ) : quotaFull ? (
                <Badge tone="critical">{t("templates.quotaFull")}</Badge>
              ) : (
                <Badge tone="success">{quotaLabel}</Badge>
              )}
            </InlineStack>
          </Box>
        </Card>

        {/* Starter yasağı */}
        {isStarterBlocked && (
          <Banner tone="warning" title={t("templates.starterBlocked")}>
            <Text as="p">{t("templates.upgradeToAdd")}</Text>
            <Box paddingBlockStart="200">
              <Button variant="primary" onClick={() => navigate("/app/billing")}>{t("templates.upgradeNeeded")} →</Button>
            </Box>
          </Banner>
        )}

        {/* Upload form */}
        {!isStarterBlocked && (
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{t("templates.addNew")}</Text>
                <Text as="p" tone="subdued">{t("templates.licenseNote")}</Text>

                {quotaFull && (
                  <Banner tone="warning" title={`${planKey} ${t("templates.quotaWarning")}`}>
                    <p>{t("templates.upgradeForMore")}</p>
                  </Banner>
                )}

                <uploadFetcher.Form method="post" encType="multipart/form-data">
                  <input type="hidden" name="intent" value="upload" />
                  <BlockStack gap="300">

                    <div>
                      <label
                        htmlFor="tmpl-file-input"
                        style={{
                          display: "block",
                          cursor: quotaFull ? "not-allowed" : "pointer",
                          borderRadius: 12,
                          border: "2px dashed #d1d5db",
                          padding: "24px 16px",
                          textAlign: "center",
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!quotaFull) {
                            (e.currentTarget as HTMLLabelElement).style.borderColor = "#6366f1";
                            (e.currentTarget as HTMLLabelElement).style.background = "rgba(99,102,241,0.04)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLLabelElement).style.borderColor = "#d1d5db";
                          (e.currentTarget as HTMLLabelElement).style.background = "transparent";
                        }}
                      >
                        <input
                          id="tmpl-file-input"
                          type="file"
                          name="image"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          disabled={quotaFull}
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
                              style={{ maxHeight: 160, maxWidth: "100%", objectFit: "contain", margin: "0 auto", display: "block" }}
                            />
                            <Text as="p" variant="bodySm" tone="subdued">{fileName} — {t("templates.changeImage")}</Text>
                          </BlockStack>
                        ) : (
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd" fontWeight="medium">
                              {quotaFull ? t("templates.quotaFull") : t("templates.imageSelectClick")}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">{t("templates.fileSpec")}</Text>
                          </BlockStack>
                        )}
                      </label>
                    </div>

                    <TextField
                      label={t("templates.templateNameLabel")}
                      name="name"
                      value={name}
                      onChange={setName}
                      autoComplete="off"
                      placeholder="örn. Spider-Man, Bugs Bunny, Çiçek Logo"
                      disabled={quotaFull}
                    />

                    <CategoryField value={category} onChange={setCategory} disabled={quotaFull} />

                    <InlineStack align="end">
                      <Button
                        variant="primary"
                        submit
                        loading={isUploading}
                        disabled={!preview || quotaFull}
                      >
                        {t("templates.uploadSave")}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </uploadFetcher.Form>
              </BlockStack>
            </Box>
          </Card>
        )}

        <Divider />

        {/* Template list */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">{t("templates.existing")} ({templates.length})</Text>
          {templates.length === 0 ? (
            <Card>
              <EmptyState heading={t("templates.noTemplates")} image="">
                <Text as="p">{isStarterBlocked ? t("templates.upgradeToAdd") : t("templates.addFirst")}</Text>
              </EmptyState>
            </Card>
          ) : (
            <Layout>
              {(templates as ShopTemplate[]).map((tpl) => (
                <Layout.Section key={tpl.id} variant="oneThird">
                  <TemplateCard tpl={tpl} />
                </Layout.Section>
              ))}
            </Layout>
          )}
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
