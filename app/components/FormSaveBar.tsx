import { useCallback, useEffect, useRef, useState } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { Button, InlineStack } from "@shopify/polaris";
import { useTranslation } from "~/i18n";

/**
 * Shopify'ın bağlamsal kaydetme çubuğu (Built for Shopify 4.1.5). Form
 * değiştiğinde admin'in üstünde "Kaydedilmemiş değişiklikler" çubuğu açılır;
 * merchant kaydetmeden sayfadan çıkmak isterse Shopify onay sorar.
 *
 * Shopify dışında (WooCommerce yönetimi) App Bridge yüklü değil ve SaveBar
 * çizilir çizilmez hata veriyor; orada sayfanın altında sabit bir çubuk çıkar.
 * App Bridge varlığı yalnız tarayıcıda bilinir: ilk çizim ikisini de basmaz,
 * yoksa SaveBar'ın etkisi bizim kontrolümüzden önce çalışıp çöker.
 */
export function FormSaveBar({
  id,
  dirty,
  saving = false,
  onSave,
  onDiscard,
}: {
  id: string;
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"pending" | "shopify" | "standalone">("pending");
  useEffect(() => {
    setMode((window as unknown as { shopify?: unknown }).shopify ? "shopify" : "standalone");
  }, []);

  if (mode === "shopify") {
    return (
      <SaveBar id={id} open={dirty} discardConfirmation>
        <button variant="primary" onClick={onSave} loading={saving ? "" : undefined}>
          {t("common.save")}
        </button>
        <button onClick={onDiscard} disabled={saving}>
          {t("common.discard")}
        </button>
      </SaveBar>
    );
  }
  if (mode === "pending" || !dirty) return null;
  return (
    <div className="app-save-bar" role="region" aria-label={t("common.save")}>
      <InlineStack gap="200" align="end" blockAlign="center">
        <Button onClick={onDiscard} disabled={saving}>{t("common.discard")}</Button>
        <Button variant="primary" onClick={onSave} loading={saving}>{t("common.save")}</Button>
      </InlineStack>
    </div>
  );
}

function serializeForm(form: HTMLFormElement): string {
  const out: string[] = [];
  new FormData(form).forEach((value, key) => {
    if (key === "_lang") return;
    if (typeof value === "string") out.push(`${key}=${value}`);
    // Seçilen dosya da değişikliktir (boş dosya alanı sayılmaz)
    else if (value.size > 0) out.push(`${key}=file:${value.name}:${value.size}`);
  });
  return out.join("\u0001");
}

/**
 * Formun kaydedilmiş hâlinden farklı olup olmadığını söyler. İlk çizimde
 * formun tüm alanlarının (gizli JSON alanları dahil) anlık görüntüsünü alır,
 * sonraki her çizimde ve her input/change olayında karşılaştırır. Kayıttan
 * sonra `reset()` çağrılınca o anki hâl yeni "kaydedilmiş" hâl olur.
 */
export function useFormDirty(formRef: React.RefObject<HTMLFormElement>) {
  const [dirty, setDirty] = useState(false);
  const baseline = useRef<string | null>(null);

  const check = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const current = serializeForm(form);
    if (baseline.current === null) {
      baseline.current = current;
      setDirty(false);
      return;
    }
    setDirty(current !== baseline.current);
  }, [formRef]);

  // React durumundan beslenen gizli alanlar olay tetiklemez: her çizimden sonra bak
  useEffect(() => {
    check();
  });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    return () => {
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
    };
  }, [formRef, check]);

  const reset = useCallback(() => {
    baseline.current = null;
    setDirty(false);
  }, []);

  return { dirty, reset };
}
