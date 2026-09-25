import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Card, BlockStack, InlineStack, Text, TextField, Select, Checkbox, Button, Banner, Box, Divider,
} from "@shopify/polaris";
import { useDict, useTranslation } from "~/i18n";
import dict from "~/i18n/personalizer/option-pricing";
import {
  minimumOptionFee, normalizeOptionPricing,
  type ExtraOption, type OptionPricing, type TextPriceRule,
} from "~/lib/option-pricing";

export interface PricingTextField {
  id: string;
  label: string;
  /** Müşteriye açılan seçimler: ücreti yalnız açık olanlar için soruyoruz */
  font: boolean;
  color: boolean;
  size: boolean;
}

const EMPTY_RULE: TextPriceRule = { fee: 0, per_char: 0, free_chars: 0, font: 0, color: 0, size: 0 };

function num(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Şablon başına seçeneğe göre ek ücret. Kendi kaydetme düğmesi var: ücretler
 * şablonun baskı ayarlarından bağımsız ve kaydedilince bağlı ürünlerin sepet
 * fiyat kaydı da yenileniyor.
 */
export function OptionPricingCard({
  pricing, textFields, hasSlots, surchargeConfigured,
}: {
  pricing: OptionPricing;
  textFields: PricingTextField[];
  hasSlots: boolean;
  surchargeConfigured: boolean;
}) {
  const L = useDict(dict);
  const { lang } = useTranslation();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; pricing?: OptionPricing }>();
  const [p, setP] = useState<OptionPricing>(pricing);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data.pricing) {
      setP(fetcher.data.pricing);
      setDirty(false);
    }
  }, [fetcher.state, fetcher.data]);

  const update = (next: OptionPricing) => { setP(next); setDirty(true); };
  const rule = (id: string) => p.texts[id] ?? EMPTY_RULE;
  const setRule = (id: string, key: keyof TextPriceRule, value: string) =>
    update({ ...p, texts: { ...p.texts, [id]: { ...rule(id), [key]: key === "free_chars" ? Math.floor(num(value)) : num(value) } } });
  const setExtra = (i: number, e: ExtraOption) => update({ ...p, extras: p.extras.map((x, j) => (j === i ? e : x)) });

  const save = () => {
    fetcher.submit(
      { intent: "save_option_pricing", option_pricing: JSON.stringify(normalizeOptionPricing(p)), _lang: lang },
      { method: "POST" },
    );
  };

  const min = minimumOptionFee(normalizeOptionPricing(p));
  const field = (label: string, value: number, onChange: (v: string) => void, help?: string) => (
    <TextField
      label={label} type="number" min={0} step={0.01} autoComplete="off"
      value={value ? String(value) : ""} placeholder="0" helpText={help}
      onChange={onChange}
    />
  );

  if (!hasSlots) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{L.title}</Text>
          <Text as="p" tone="subdued">{L.noSlots}</Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <BlockStack gap="100">
          <Text as="h2" variant="headingMd">{L.title}</Text>
          <Text as="p" tone="subdued">{L.intro}</Text>
        </BlockStack>

        {!surchargeConfigured && (
          <Banner tone="warning" action={{ content: L.openSettings, url: "/app/settings" }}>
            <p>{L.noSurcharge}</p>
          </Banner>
        )}

        <Box maxWidth="280px">
          {field(L.base, p.base, (v) => update({ ...p, base: num(v) }), L.baseHelp)}
        </Box>

        <Divider />
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{L.textsTitle}</Text>
          {textFields.length === 0 && <Text as="p" tone="subdued">{L.textsEmpty}</Text>}
          {textFields.map((f) => (
            <BlockStack key={f.id} gap="200">
              <Text as="p" fontWeight="semibold">{f.label || f.id}</Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="140px">{field(L.fee, rule(f.id).fee, (v) => setRule(f.id, "fee", v), L.feeHelp)}</Box>
                <Box minWidth="140px">{field(L.perChar, rule(f.id).per_char, (v) => setRule(f.id, "per_char", v))}</Box>
                <Box minWidth="140px">
                  <TextField
                    label={L.freeChars} type="number" min={0} step={1} autoComplete="off"
                    value={rule(f.id).free_chars ? String(rule(f.id).free_chars) : ""} placeholder="0"
                    helpText={L.freeCharsHelp} onChange={(v) => setRule(f.id, "free_chars", v)}
                  />
                </Box>
                {f.font && <Box minWidth="140px">{field(L.font, rule(f.id).font, (v) => setRule(f.id, "font", v))}</Box>}
                {f.color && <Box minWidth="140px">{field(L.color, rule(f.id).color, (v) => setRule(f.id, "color", v))}</Box>}
                {f.size && <Box minWidth="140px">{field(L.size, rule(f.id).size, (v) => setRule(f.id, "size", v))}</Box>}
              </InlineStack>
            </BlockStack>
          ))}
        </BlockStack>

        <Divider />
        <BlockStack gap="300">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">{L.extrasTitle}</Text>
            <Text as="p" tone="subdued">{L.extrasHelp}</Text>
          </BlockStack>
          {p.extras.map((e, i) => (
            <Box key={e.id} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
              <BlockStack gap="300">
                <InlineStack gap="300" wrap blockAlign="end">
                  <Box minWidth="220px">
                    <TextField
                      label={L.extraLabel} autoComplete="off" value={e.label}
                      placeholder={e.type === "checkbox" ? L.exampleCheckbox : L.exampleSelect}
                      onChange={(v) => setExtra(i, { ...e, label: v })}
                    />
                  </Box>
                  <Box minWidth="200px">
                    <Select
                      label={L.extraType} value={e.type}
                      options={[{ label: L.typeCheckbox, value: "checkbox" }, { label: L.typeSelect, value: "select" }]}
                      onChange={(v) => setExtra(i, {
                        ...e, type: v === "select" ? "select" : "checkbox",
                        required: v === "select" ? e.required : false,
                        choices: v === "select" ? e.choices : e.choices.slice(0, 1),
                      })}
                    />
                  </Box>
                  {e.type === "checkbox" && (
                    <Box minWidth="140px">
                      {field(L.price, e.choices[0]?.price ?? 0, (v) => setExtra(i, {
                        ...e, choices: [{ id: e.choices[0]?.id ?? "c1", label: e.label, price: num(v) }],
                      }))}
                    </Box>
                  )}
                  <Button variant="plain" tone="critical" onClick={() => update({ ...p, extras: p.extras.filter((_, j) => j !== i) })}>
                    {L.remove}
                  </Button>
                </InlineStack>

                {e.type === "select" && (
                  <BlockStack gap="200">
                    {e.choices.map((c, k) => (
                      <InlineStack key={c.id} gap="300" blockAlign="end" wrap>
                        <Box minWidth="220px">
                          <TextField
                            label={L.choiceLabel} labelHidden={k > 0} autoComplete="off" value={c.label}
                            onChange={(v) => setExtra(i, { ...e, choices: e.choices.map((x, m) => (m === k ? { ...x, label: v } : x)) })}
                          />
                        </Box>
                        <Box minWidth="140px">
                          <TextField
                            label={L.price} labelHidden={k > 0} type="number" min={0} step={0.01} autoComplete="off"
                            value={c.price ? String(c.price) : ""} placeholder="0"
                            onChange={(v) => setExtra(i, { ...e, choices: e.choices.map((x, m) => (m === k ? { ...x, price: num(v) } : x)) })}
                          />
                        </Box>
                        <Button variant="plain" tone="critical" onClick={() => setExtra(i, { ...e, choices: e.choices.filter((_, m) => m !== k) })}>
                          {L.remove}
                        </Button>
                      </InlineStack>
                    ))}
                    <InlineStack gap="400" blockAlign="center">
                      <Button onClick={() => setExtra(i, { ...e, choices: [...e.choices, { id: newId("c"), label: "", price: 0 }] })}>
                        {L.addChoice}
                      </Button>
                      <Checkbox label={L.required} checked={e.required} onChange={(v) => setExtra(i, { ...e, required: v })} />
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Box>
          ))}
          <InlineStack>
            <Button onClick={() => update({
              ...p,
              extras: [...p.extras, { id: newId("x"), label: "", type: "checkbox", required: false, choices: [{ id: "c1", label: "", price: 0 }] }],
            })}>
              {L.addExtra}
            </Button>
          </InlineStack>
        </BlockStack>

        <Divider />
        {fetcher.data?.ok && !dirty && <Banner tone="success"><p>{L.saved}</p></Banner>}
        {fetcher.data?.error && <Banner tone="critical"><p>{fetcher.data.error || L.saveError}</p></Banner>}
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" tone="subdued">{min > 0 ? L.summaryMin(min.toFixed(2)) : L.summaryNone}</Text>
          <Button variant="primary" onClick={save} loading={fetcher.state !== "idle"} disabled={!dirty}>
            {L.save}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
