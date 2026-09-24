import { BlockStack, InlineStack, Text, Badge } from "@shopify/polaris";
import type { PrintProduct } from "~/lib/print-spec";
import { isImageSlot, isTextSlot, type TemplatePiece } from "~/lib/slots";
import { useDict } from "~/i18n";
import summaryDict from "~/i18n/studio/summary";

/**
 * Şablon sayfasında stüdyonun kaydettiği düzenin özeti.
 *
 * Mağaza sahibi stüdyoya girmeden neyin kurulu olduğunu görebilmeli: ölçü,
 * kaç fotoğraf ve yazı alanı var, set mi. Küçük resim alanların gerçek
 * yerleşimini çiziyor; sayılar tek başına "6 alan"ın nasıl dizildiğini söylemiyor.
 */
export function StudioSummary({
  pieces, printProducts, mockupCount,
}: {
  pieces: TemplatePiece[];
  printProducts: PrintProduct[];
  mockupCount: number;
}) {
  const L = useDict(summaryDict);
  return (
    <BlockStack gap="300">
      <InlineStack gap="400" wrap>
        {pieces.map((piece) => {
          const product = printProducts.find((p) => p.id === piece.print_product_id);
          const aspect = product ? product.width_mm / product.height_mm : 1;
          const w = 96;
          const h = Math.round(w / aspect);
          const images = piece.slots.filter(isImageSlot).length;
          const texts = piece.slots.filter(isTextSlot).length;
          return (
            <InlineStack key={piece.id} gap="300" blockAlign="center" wrap={false}>
              <svg
                width={w}
                height={Math.min(h, 128)}
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={L.layoutAria(piece.name)}
                style={{ flex: "none", background: "#fff", border: "1px solid #d4d4d4", borderRadius: 4 }}
              >
                {piece.slots.map((slot) => (
                  <rect
                    key={slot.id}
                    x={slot.rect.x * w}
                    y={slot.rect.y * h}
                    width={slot.rect.w * w}
                    height={slot.rect.h * h}
                    fill={isImageSlot(slot) ? "#b8cdee" : "#f6e3b4"}
                  />
                ))}
              </svg>
              <BlockStack gap="050">
                {pieces.length > 1 && <Text as="p" fontWeight="semibold">{piece.name}</Text>}
                <Text as="p" variant="bodySm">
                  {product ? `${product.name} (${product.width_mm / 10}×${product.height_mm / 10} cm)` : L.noSize}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {L.slotCounts(images, texts)}
                </Text>
              </BlockStack>
            </InlineStack>
          );
        })}
      </InlineStack>
      <InlineStack gap="200">
        {pieces.length > 1 && <Badge tone="info">{L.pieceSet(pieces.length)}</Badge>}
        <Badge tone={mockupCount > 0 ? "success" : undefined}>
          {mockupCount > 0 ? L.mockupCount(mockupCount) : L.noMockups}
        </Badge>
      </InlineStack>
    </BlockStack>
  );
}
