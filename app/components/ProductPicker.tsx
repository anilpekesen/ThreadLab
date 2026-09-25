import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "@remix-run/react";
import { BlockStack, Checkbox, InlineStack, Modal, Spinner, Text, TextField, Thumbnail } from "@shopify/polaris";

export interface PickedProduct {
  id: string;
  title: string;
  handle: string;
}

type ListedProduct = PickedProduct & { image: string | null };

const COPY = {
  tr: { title: "Ürün seç", search: "Ürün ara", select: "Seç", cancel: "Vazgeç", empty: "Ürün bulunamadı.", selected: (n: number) => `${n} ürün seçildi` },
  en: { title: "Select products", search: "Search products", select: "Select", cancel: "Cancel", empty: "No products found.", selected: (n: number) => `${n} selected` },
};

/**
 * Çoklu ürün seçimi. Shopify yönetiminde App Bridge'in kendi seçicisi açılır;
 * Shopify dışında (WooCommerce) mağazanın ürünlerini listeleyen bir pencere.
 * Kullanım: `const { pick, modal } = useProductPicker(lang)`, `modal`
 * sayfada bir yere konur, `await pick()` seçilenleri ya da null döndürür.
 */
export function useProductPicker(lang: "tr" | "en" = "tr") {
  const [pending, setPending] = useState<((v: PickedProduct[] | null) => void) | null>(null);

  const pick = useCallback(async (): Promise<PickedProduct[] | null> => {
    const appBridge = typeof window !== "undefined"
      ? (window as unknown as { shopify?: { resourcePicker?: (o: unknown) => Promise<Array<{ id: string; title?: string; handle?: string }> | undefined> } }).shopify
      : undefined;
    if (appBridge?.resourcePicker) {
      const picked = await appBridge.resourcePicker({ type: "product", multiple: true, filter: { variants: false } });
      return picked?.length ? picked.map((p) => ({ id: p.id, title: p.title ?? "", handle: p.handle ?? "" })) : null;
    }
    return new Promise((resolve) => setPending(() => resolve));
  }, []);

  const modal = pending ? (
    <ProductPickerModal
      lang={lang}
      onDone={(value) => {
        pending(value);
        setPending(null);
      }}
    />
  ) : null;

  return { pick, modal };
}

function ProductPickerModal({ lang, onDone }: { lang: "tr" | "en"; onDone: (v: PickedProduct[] | null) => void }) {
  const c = COPY[lang];
  const fetcher = useFetcher<{ products: ListedProduct[] }>();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Map<string, PickedProduct>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fetcher.load(`/app/api/store-products?q=${encodeURIComponent(q)}`), q ? 300 : 0);
    return () => clearTimeout(timer.current);
    // fetcher.load kimliği her çizimde değişiyor; yalnız arama metnine bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const products = fetcher.data?.products ?? [];
  const toggle = (p: ListedProduct, on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(p.id, { id: p.id, title: p.title, handle: p.handle });
      else next.delete(p.id);
      return next;
    });
  };

  return (
    <Modal
      open
      onClose={() => onDone(null)}
      title={c.title}
      primaryAction={{ content: c.select, disabled: selected.size === 0, onAction: () => onDone([...selected.values()]) }}
      secondaryActions={[{ content: c.cancel, onAction: () => onDone(null) }]}
      footer={selected.size ? <Text as="span" tone="subdued">{c.selected(selected.size)}</Text> : undefined}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <TextField label={c.search} labelHidden placeholder={c.search} value={q} onChange={setQ} autoComplete="off" clearButton onClearButtonClick={() => setQ("")} />
          {fetcher.state !== "idle" && !products.length ? (
            <InlineStack align="center"><Spinner size="small" /></InlineStack>
          ) : products.length === 0 ? (
            <Text as="p" tone="subdued">{c.empty}</Text>
          ) : (
            <BlockStack gap="200">
              {products.map((p) => (
                <InlineStack key={p.id} gap="300" blockAlign="center" wrap={false}>
                  <Checkbox label={p.title} labelHidden checked={selected.has(p.id)} onChange={(on) => toggle(p, on)} />
                  <Thumbnail source={p.image || ""} alt="" size="small" />
                  <Text as="span">{p.title}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
