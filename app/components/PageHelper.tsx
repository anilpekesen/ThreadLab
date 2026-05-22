import { useState } from "react";
import { BlockStack, Text, Box, InlineStack } from "@shopify/polaris";
import { useTranslation } from "~/i18n";
import type { TranslationKey } from "~/i18n/tr";

interface Section {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

interface Props {
  sections: Section[];
}

export function PageHelper({ sections }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "1px solid #c9cccf",
          borderRadius: 6,
          cursor: "pointer",
          padding: "5px 12px",
          fontSize: 13,
          color: "#6b7280",
          fontWeight: 500,
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>ⓘ</span>
        {open ? t("helper.hide") : t("helper.show")}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            background: "#f8faff",
            border: "1px solid #d1dafe",
            borderRadius: 10,
            padding: "16px 20px",
          }}
        >
          <BlockStack gap="400">
            {sections.map((s, i) => (
              <BlockStack key={i} gap="100">
                <InlineStack gap="150" blockAlign="center">
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f" }}>
                    {t(s.titleKey)}
                  </span>
                </InlineStack>
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t(s.bodyKey)}
                  </Text>
                </Box>
              </BlockStack>
            ))}
          </BlockStack>
        </div>
      )}
    </div>
  );
}
