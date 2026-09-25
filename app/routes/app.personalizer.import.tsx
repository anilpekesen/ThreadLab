import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, TextField, Select, Button, Banner, DropZone, List, Box,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { langFromRequest } from "~/i18n/server";
import { pickDict, useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/personalizer/import";
import { importTemplateFile, TemplateImportError, type ImportResult } from "~/lib/template-import.server";
import type { PersonalizerCategory } from "~/models/personalizer.server";

/**
 * PSD ya da Canva tasarımından şablon (bkz. ~/lib/template-import.server).
 * Sonuç stüdyoda gözden geçirilir; uyarılar burada listelenir.
 */

// nginx gövde sınırı 50 MB; çok parçalı zarf için pay bırakılıyor
const MAX_UPLOAD = 45 * 1024 * 1024;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate(request);
  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const form = await unstable_parseMultipartFormData(
    request,
    unstable_createMemoryUploadHandler({ maxPartSize: MAX_UPLOAD }),
  ).catch(() => null);
  const L = pickDict(dict, langFromRequest(request, form ?? undefined));
  if (!form) return json({ error: L.tooLarge }, { status: 413 });

  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const file = form.get("file");
  if (!name) return json({ error: L.nameRequired }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return json({ error: L.fileRequired }, { status: 400 });
  const category: PersonalizerCategory = form.get("category") === "apparel" ? "apparel" : "frame";

  try {
    const result = await importTemplateFile(
      { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) },
      { shop: session.shop, name, category, en: L === dict.en },
    );
    return json({ result });
  } catch (err) {
    if (err instanceof TemplateImportError) return json({ error: err.message }, { status: 400 });
    console.error("[template-import]", err);
    return json({ error: L.failed }, { status: 500 });
  }
};

const ACCEPT = ".psd,image/png,image/jpeg,image/vnd.adobe.photoshop,application/octet-stream";

export default function ImportTemplatePage() {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const fetcher = useFetcher<{ result?: ImportResult; error?: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("frame");
  const [clientError, setClientError] = useState("");
  // "Başka bir dosya" sonucu gizler; yeni gönderimde yeniden gösterilir
  const [hideResult, setHideResult] = useState(false);
  const busy = fetcher.state !== "idle";
  const result = hideResult ? undefined : fetcher.data?.result;
  const error = clientError || (hideResult ? "" : fetcher.data?.error) || "";

  const pick = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setClientError("");
    if (!/\.(psd|png|jpe?g)$/i.test(f.name)) { setClientError(L.wrongType); return; }
    if (f.size > MAX_UPLOAD) { setClientError(L.tooLarge); return; }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
  };

  const submit = () => {
    if (!file) { setClientError(L.fileRequired); return; }
    if (!name.trim()) { setClientError(L.nameRequired); return; }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name.trim());
    fd.set("category", category);
    fd.set("_lang", lang);
    setHideResult(false);
    fetcher.submit(fd, { method: "POST", encType: "multipart/form-data" });
  };

  const reset = () => { setFile(null); setName(""); setClientError(""); setHideResult(true); };

  const warningText = (w: ImportResult["warnings"][number]) => {
    switch (w.code) {
      case "font": return L.warn.font(w.layer, w.font);
      case "lowres": case "dpi_assumed": return L.warn[w.code](w.dpi);
      default: return L.warn[w.code](w.layer);
    }
  };
  const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString(lang === "en" ? "en-US" : "tr-TR");

  return (
    <Page title={L.title} subtitle={L.subtitle} backAction={{ content: L.back, url: "/app/personalizer" }}>
      <Layout>
        <Layout.Section>
          {result ? (
            <Card>
              <BlockStack gap="400">
                <Banner tone="success" title={L.doneTitle}>
                  <BlockStack gap="100">
                    <p>{L.doneSummary(result.photos, result.texts)}</p>
                    <p>{L.doneSize(cm(result.size.widthMm), cm(result.size.heightMm), result.size.dpi, result.size.created)}</p>
                    <p>{L.doneNext}</p>
                  </BlockStack>
                </Banner>
                {result.warnings.length > 0 && (
                  <Banner tone="warning" title={L.warningsTitle}>
                    <List>
                      {result.warnings.map((w, i) => <List.Item key={i}>{warningText(w)}</List.Item>)}
                    </List>
                  </Banner>
                )}
                <InlineStack gap="200">
                  <Button variant="primary" url={`/app/personalizer/${result.id}/studio`}>{L.openStudio}</Button>
                  <Button url={`/app/personalizer/${result.id}`}>{L.openTemplate}</Button>
                  <Button variant="plain" onClick={reset}>{L.another}</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          ) : (
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">{L.fileTitle}</Text>
                  <Text as="p" tone="subdued">{L.fileHint}</Text>
                </BlockStack>
                <DropZone accept={ACCEPT} allowMultiple={false} onDrop={(all) => pick(all)} disabled={busy}>
                  {file ? (
                    <Box padding="400">
                      <InlineStack align="center" gap="200">
                        <Text as="span" fontWeight="semibold">{file.name}</Text>
                        <Text as="span" tone="subdued">{(file.size / 1024 / 1024).toFixed(1)} MB</Text>
                      </InlineStack>
                    </Box>
                  ) : (
                    <DropZone.FileUpload actionHint={L.fileDrop} />
                  )}
                </DropZone>
                <TextField label={L.name} value={name} onChange={setName} placeholder={L.namePlaceholder} autoComplete="off" disabled={busy} />
                <Select
                  label={L.category}
                  value={category}
                  onChange={setCategory}
                  options={[{ label: L.catFrame, value: "frame" }, { label: L.catApparel, value: "apparel" }]}
                  disabled={busy}
                />
                {error && <Banner tone="critical"><p>{error}</p></Banner>}
                {busy && <Text as="p" tone="subdued">{L.working}</Text>}
                <InlineStack align="end">
                  <Button variant="primary" onClick={submit} loading={busy} disabled={!file}>{L.submit}</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          )}
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">{L.guideTitle}</Text>
              <Text as="h3" variant="headingSm">{L.psdTitle}</Text>
              <List type="number">{L.psdSteps.map((s, i) => <List.Item key={i}>{s}</List.Item>)}</List>
              <Text as="h3" variant="headingSm">{L.canvaTitle}</Text>
              <List type="number">{L.canvaSteps.map((s, i) => <List.Item key={i}>{s}</List.Item>)}</List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
