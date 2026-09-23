import { Banner, BlockStack, Button, InlineStack, Text } from "@shopify/polaris";
import { useState, type ComponentType } from "react";
import { GENERATOR_CONFIGS } from "~/lib/generators/configs";
import type { GeneratorConfigBase, GeneratorKind } from "~/lib/generators/types";
import type { GeneratorSettingsProps } from "./types";
import { SongSettings } from "./SongSettings";
import { MonogramSettings } from "./MonogramSettings";
import { StarmapSettings } from "./StarmapSettings";
import { CitymapSettings } from "./CitymapSettings";
import { BirthflowerSettings } from "./BirthflowerSettings";

// Her tür kendi ayar tipini kullanır; kayıt defteri bunları ortak tipe indirir
type AnySettings = ComponentType<GeneratorSettingsProps<GeneratorConfigBase>>;

const SETTINGS: Record<GeneratorKind, AnySettings> = {
  song: SongSettings as unknown as AnySettings,
  monogram: MonogramSettings as unknown as AnySettings,
  starmap: StarmapSettings as unknown as AnySettings,
  citymap: CitymapSettings as unknown as AnySettings,
  birthflower: BirthflowerSettings as unknown as AnySettings,
};

/**
 * Üretici şablonunun ayar kartı: türün kendi ayar bileşeni + örnek girdiyle
 * önizleme + kaydetme formuna giden `generator_config` gizli alanı.
 */
export function GeneratorSettings({ kind, initial }: { kind: GeneratorKind; initial: unknown }) {
  const mod = GENERATOR_CONFIGS[kind];
  const [config, setConfig] = useState<GeneratorConfigBase>(() => mod.normalize(initial ?? mod.defaults));
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const Settings = SETTINGS[kind] as ComponentType<GeneratorSettingsProps<GeneratorConfigBase>>;

  async function runPreview() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/personalizer/generator-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: mod.normalize(config) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Önizleme üretilemedi");
      setPreview(data.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme üretilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlockStack gap="500">
      <Settings value={config} onChange={(next) => setConfig(mod.normalize(next))} />

      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Önizleme</Text>
        <InlineStack gap="200">
          <Button onClick={runPreview} loading={busy}>Örnek bilgilerle önizle</Button>
        </InlineStack>
        {error && <Banner tone="critical">{error}</Banner>}
        {preview && (
          <div style={{
            background: "repeating-conic-gradient(#f1f1f1 0% 25%, #fff 0% 50%) 50% / 20px 20px",
            border: "1px solid #e1e3e5", borderRadius: 8, padding: 12, display: "flex", justifyContent: "center",
          }}>
            <img src={preview} alt="Önizleme" style={{ maxWidth: "100%", maxHeight: 480 }} />
          </div>
        )}
      </BlockStack>

      <input type="hidden" name="generator_config" readOnly value={JSON.stringify(mod.normalize(config))} />
    </BlockStack>
  );
}
