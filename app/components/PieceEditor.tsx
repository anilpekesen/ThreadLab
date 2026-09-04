import { useMemo, useRef, useState } from "react";
import {
  Card, BlockStack, InlineStack, Text, Button, Badge, Box,
  TextField, Select, Banner, Divider,
} from "@shopify/polaris";
import { SlotBoard } from "~/components/SlotBoard";
import { clonePiece, isImageSlot, type GridConfig, type Slot, type TemplatePiece } from "~/lib/slots";
import { printCanvas, aspectLabel, type PrintProduct } from "~/lib/print-spec";

/**
 * Parça editörü — set ürünlerinde ayrı ayrı basılan parçaların düzenlenmesi.
 *
 * Tek parçalı şablonlar bu bileşeni hiç görmüyor: onlarda şablonun kendi
 * tuvali yeterli ve fazladan bir katman kavramı yalnızca kafa karıştırır.
 * "Parçalara böl" denince mevcut tasarım birinci parçaya taşınıyor, sonra
 * çoğaltılıyor.
 */

export interface PieceEditorProps {
  pieces: TemplatePiece[];
  onChange: (pieces: TemplatePiece[]) => void;
  printProducts: PrintProduct[];
  /** Tek parçalı şablonun mevcut hâli; ilk parça bundan türetiliyor */
  fallback: {
    name: string;
    print_product_id: string;
    slots: Slot[];
    background_url?: string;
    overlay_url?: string;
  };
  gridConfig: GridConfig;
  onGridConfigChange: (config: GridConfig) => void;
}

export function PieceEditor({
  pieces, onChange, printProducts, fallback, gridConfig, onGridConfigChange,
}: PieceEditorProps) {
  const [activeId, setActiveId] = useState<string>(pieces[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overlayInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);

  const active = pieces.find((p) => p.id === activeId) ?? pieces[0] ?? null;
  const product = active
    ? printProducts.find((p) => p.id === active.print_product_id) ?? null
    : null;
  const canvas = useMemo(() => (product ? printCanvas(product) : null), [product]);

  function patch(id: string, next: Partial<TemplatePiece>) {
    onChange(pieces.map((p) => (p.id === id ? { ...p, ...next } : p)));
  }

  function bolParcalara() {
    const first: TemplatePiece = {
      id: "frame_1",
      name: "1. Parça",
      print_product_id: fallback.print_product_id,
      slots: fallback.slots,
      background_url: fallback.background_url,
      overlay_url: fallback.overlay_url,
      order: 1,
    };
    onChange([first]);
    setActiveId(first.id);
  }

  function parcaEkle() {
    if (!active) return;
    const n = pieces.length + 1;
    let id = `frame_${n}`;
    let k = n;
    while (pieces.some((p) => p.id === id)) id = `frame_${++k}`;
    const copy = clonePiece(active, id, `${n}. Parça`, n);
    onChange([...pieces, copy]);
    setActiveId(id);
  }

  function parcaSil(id: string) {
    const kalan = pieces.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i + 1 }));
    onChange(kalan);
    if (activeId === id) setActiveId(kalan[0]?.id ?? "");
  }

  async function gorselYukle(file: File, alan: "background_url" | "overlay_url") {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("folder", alan === "overlay_url" ? "personalizer-overlay" : "personalizer-template");
      const res = await fetch("/api/personalizer/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Yüklenemedi");
      patch(active.id, { [alan]: data.url } as Partial<TemplatePiece>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  // ── Henüz parçalara bölünmemiş ─────────────────────────────────────────
  if (pieces.length === 0) {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Set ürünü</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Bu şablon tek bir baskı dosyası üretiyor. "3'lü çerçeve seti" gibi ürünlerde bir
            sipariş satırı birden fazla dosya üretmeli — her çerçeve ayrı basılır ve kendi
            taşma payı olur.
          </Text>
          <InlineStack gap="200">
            <Button onClick={bolParcalara}>Parçalara böl</Button>
            <Text as="span" variant="bodySm" tone="subdued">
              Mevcut tasarım birinci parçaya taşınır, sonra çoğaltabilirsiniz.
            </Text>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <BlockStack gap="050">
              <Text as="h2" variant="headingMd">Parçalar</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Her parça ayrı basılır. {pieces.length} parça = sipariş başına {pieces.length} dosya.
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button onClick={parcaEkle}>Parça ekle</Button>
              {pieces.length === 1 && (
                <Button variant="plain" tone="critical" onClick={() => onChange([])}>
                  Tek parçaya dön
                </Button>
              )}
            </InlineStack>
          </InlineStack>

          <InlineStack gap="200" wrap>
            {pieces.map((p) => {
              const foto = p.slots.filter(isImageSlot).length;
              return (
                <Button
                  key={p.id}
                  pressed={p.id === active?.id}
                  onClick={() => setActiveId(p.id)}
                >
                  {`${p.name} (${foto} alan)`}
                </Button>
              );
            })}
          </InlineStack>

          {active && (
            <>
              <Divider />
              <InlineStack gap="300" align="space-between" blockAlign="end">
                <Box width="60%">
                  <TextField
                    label="Parça adı"
                    autoComplete="off"
                    value={active.name}
                    helpText="Müşteriye ve üretime bu adla görünür"
                    onChange={(v) => patch(active.id, { name: v })}
                  />
                </Box>
                {pieces.length > 1 && (
                  <Button tone="critical" variant="plain" onClick={() => parcaSil(active.id)}>
                    Bu parçayı sil
                  </Button>
                )}
              </InlineStack>

              <Select
                label="Baskı ebadı"
                options={[
                  { label: "Seçilmedi", value: "" },
                  ...printProducts.map((p) => ({
                    label: `${p.name} — ${p.width_mm}×${p.height_mm} mm (${aspectLabel(p.width_mm / p.height_mm)})`,
                    value: p.id,
                  })),
                ]}
                value={active.print_product_id}
                onChange={(v) => patch(active.id, { print_product_id: v })}
                helpText="Parçalar farklı ebatlarda olabilir"
              />

              <InlineStack gap="400" wrap>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Arka plan (fotoğrafların altında)</Text>
                  <input
                    ref={backgroundInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void gorselYukle(f, "background_url");
                    }}
                  />
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => backgroundInput.current?.click()} loading={busy} size="slim">
                      {active.background_url ? "Değiştir" : "Yükle"}
                    </Button>
                    {active.background_url && (
                      <Button variant="plain" tone="critical" size="slim"
                        onClick={() => patch(active.id, { background_url: undefined })}>Kaldır</Button>
                    )}
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Üst katman (fotoğrafların üstünde)</Text>
                  <input
                    ref={overlayInput}
                    type="file"
                    accept="image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void gorselYukle(f, "overlay_url");
                    }}
                  />
                  <InlineStack gap="200" blockAlign="center">
                    <Button onClick={() => overlayInput.current?.click()} loading={busy} size="slim">
                      {active.overlay_url ? "Değiştir" : "Yükle"}
                    </Button>
                    {active.overlay_url && (
                      <Button variant="plain" tone="critical" size="slim"
                        onClick={() => patch(active.id, { overlay_url: undefined })}>Kaldır</Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </InlineStack>

              {error && <Banner tone="critical"><p>{error}</p></Banner>}
            </>
          )}
        </BlockStack>
      </Card>

      {active && !canvas && (
        <Banner tone="warning">
          <p>
            <b>{active.name}</b> için baskı ebadı seçilmemiş. Alanlar oran olarak saklandığı için
            ebat seçilmeden yerleşim çizilemez.
          </p>
        </Banner>
      )}

      {active && canvas && (
        <SlotBoard
          slots={active.slots}
          onChange={(slots) => patch(active.id, { slots })}
          canvas={canvas}
          templateUrl={active.background_url || active.overlay_url || undefined}
          expectedSlots={active.slots.filter(isImageSlot).length}
          onExpectedSlotsChange={() => { /* parçada beklenen sayı ayrı tutulmuyor */ }}
          gridConfig={gridConfig}
          onGridConfigChange={onGridConfigChange}
          dpi={product?.dpi ?? 300}
        />
      )}
    </BlockStack>
  );
}
