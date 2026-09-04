import { useRef, useState } from "react";
import {
  Card, BlockStack, InlineStack, Text, Button, Badge, Box,
  TextField, Banner, Divider, Thumbnail,
} from "@shopify/polaris";
import type { TemplateMockup } from "~/lib/slots";

/**
 * Mockup editörü — varyanta göre ürün görselleri.
 *
 * Çerçeve rengi baskı dosyasını değiştirmiyor; değişen tek şey müşterinin
 * gördüğü ürün. Anahtar, Shopify'daki seçenek değeriyle eşleşiyor ("Ceviz");
 * müşteri o varyantı seçtiğinde fotoğrafını o çerçevenin içinde görüyor.
 *
 * Görselin ortası şeffaf bırakılmışsa açıklık kendiliğinden bulunuyor; mağaza
 * sahibinin her renk için elle alan çizmesi gerekmiyor.
 */

export interface MockupEditorProps {
  mockups: TemplateMockup[];
  onChange: (mockups: TemplateMockup[]) => void;
}

export function MockupEditor({ mockups, onChange }: MockupEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uyari, setUyari] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const hedef = useRef<number | null>(null);

  function patch(i: number, next: Partial<TemplateMockup>) {
    onChange(mockups.map((m, k) => (k === i ? { ...m, ...next } : m)));
  }

  function ekle() {
    onChange([...mockups, { key: "", label: "", url: "", areas: [] }]);
  }

  function sil(i: number) {
    onChange(mockups.filter((_, k) => k !== i));
  }

  async function yukle(file: File, i: number) {
    setBusy(true);
    setError("");
    setUyari("");
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("folder", "personalizer-mockup");
      const res = await fetch("/api/personalizer/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Yüklenemedi");
      patch(i, { url: data.url });
      if (!data.hasAlpha) {
        // Şeffaflık yoksa açıklık taranamaz ve fotoğraf çerçevenin içinde
        // görünmez. Kaydetmeden önce söylenmesi gerekiyor.
        setUyari(
          "Bu görselde şeffaflık yok. Fotoğrafın görüneceği alanın şeffaf bırakılması gerekiyor; "
          + "aksi halde müşteri fotoğrafını çerçevenin içinde göremez.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingMd">Varyant görselleri</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Müşteri fotoğrafını seçtiği varyantın ürün görselinde görür. Zorunlu değil.
            </Text>
          </BlockStack>
          <Button onClick={ekle}>Görsel ekle</Button>
        </InlineStack>

        {mockups.length === 0 && (
          <Text as="p" tone="subdued" variant="bodySm">
            Henüz görsel eklenmemiş. Eklerseniz müşteri düzenlemesini gerçek ürünün üstünde
            yapar; eklemezseniz yalnızca baskı tuvalini görür.
          </Text>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            const i = hedef.current;
            e.target.value = "";
            hedef.current = null;
            if (f && i !== null) void yukle(f, i);
          }}
        />

        {mockups.map((m, i) => (
          <Box key={i} background="bg-surface-secondary" padding="300" borderRadius="200">
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="center" align="space-between" wrap={false}>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  {m.url
                    ? <Thumbnail source={m.url} alt={m.label || m.key} size="small" />
                    : <Badge tone="warning">Görsel yok</Badge>}
                  <Button
                    size="slim"
                    loading={busy}
                    onClick={() => { hedef.current = i; fileInput.current?.click(); }}
                  >
                    {m.url ? "Değiştir" : "Görsel yükle"}
                  </Button>
                </InlineStack>
                <Button tone="critical" variant="plain" onClick={() => sil(i)}>Sil</Button>
              </InlineStack>

              <InlineStack gap="300" wrap>
                <Box minWidth="220px">
                  <TextField
                    label="Seçenek değeri"
                    autoComplete="off"
                    value={m.key}
                    placeholder="Ceviz"
                    helpText="Shopify'daki değerle birebir aynı olmalı; boş bırakılırsa varsayılan olur"
                    onChange={(v) => patch(i, { key: v })}
                  />
                </Box>
                <Box minWidth="220px">
                  <TextField
                    label="Görünen ad"
                    autoComplete="off"
                    value={m.label}
                    placeholder="Ceviz çerçeve"
                    onChange={(v) => patch(i, { label: v })}
                  />
                </Box>
              </InlineStack>
            </BlockStack>
          </Box>
        ))}

        {uyari && <Banner tone="warning"><p>{uyari}</p></Banner>}
        {error && <Banner tone="critical"><p>{error}</p></Banner>}

        {mockups.length > 0 && (
          <>
            <Divider />
            <Text as="p" variant="bodySm" tone="subdued">
              Görselin fotoğrafın görüneceği kısmı <b>şeffaf</b> olmalı. Açıklık otomatik bulunur,
              elle alan çizmeniz gerekmez. Paspartu baskıdan geliyorsa görselde paspartu
              bulunmamalı — yoksa iki kez uygulanmış görünür.
            </Text>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
