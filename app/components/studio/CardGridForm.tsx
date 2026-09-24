import { useState } from "react";
import { BlockStack, InlineStack, Text, Button, Checkbox } from "@shopify/polaris";
import { NumberField } from "./NumberField";
import { useDict } from "~/i18n";
import cardDict from "~/i18n/studio/card-grid";

/**
 * Tek tek kesilecek kart ürünleri (pola kart, magnet, sticker) tabakaya
 * diziliyor. Mağaza sahibi kartın ölçüsünü söylüyor, tabakaya kaçının sığdığını
 * stüdyo hesaplıyor ve her kart için fotoğraf + alt yazı alanını bir kerede
 * açıyor.
 */

export interface CardGridFormOptions {
  cardWidthMm: number;
  cardHeightMm: number;
  marginMm: number;
  captionMm: number;
  gapMm: number;
  limit: number;
  replace: boolean;
}

export function CardGridForm({ fits, onApply, onCancel }: {
  /** Verilen ölçülerle tabakaya kaç kart sığıyor (sütun × satır) */
  fits: (o: CardGridFormOptions) => { cols: number; rows: number; count: number };
  onApply: (o: CardGridFormOptions) => void;
  onCancel: () => void;
}) {
  const L = useDict(cardDict);
  // Pola kart ölçüsü: 9x11 cm, fotoğrafın altında geniş bir yazı payı
  const [cardWidthMm, setCardWidthMm] = useState(90);
  const [cardHeightMm, setCardHeightMm] = useState(110);
  const [marginMm, setMarginMm] = useState(5);
  const [captionMm, setCaptionMm] = useState(25);
  const [gapMm, setGapMm] = useState(0);
  const [limit, setLimit] = useState(0);
  const [yazi, setYazi] = useState(true);
  const [replace, setReplace] = useState(true);

  const secim: CardGridFormOptions = {
    cardWidthMm, cardHeightMm, marginMm,
    captionMm: yazi ? captionMm : 0,
    gapMm,
    limit: limit > 0 ? limit : 0,
    replace,
  };
  const sigan = fits(secim);
  const adet = secim.limit > 0 ? Math.min(secim.limit, sigan.count) : sigan.count;
  const fotoH = cardHeightMm - marginMm - (yazi ? captionMm : 0);

  return (
    <div className="fs-size-form">
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">{L.title}</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {L.intro}
        </Text>
        <div className="fs-grid-2">
          <NumberField label={L.cardWidth} value={cardWidthMm} min={10} onCommit={setCardWidthMm} />
          <NumberField label={L.cardHeight} value={cardHeightMm} min={10} onCommit={setCardHeightMm} />
          <NumberField label={L.photoMargin} value={marginMm} min={0} onCommit={setMarginMm} />
          <NumberField label={L.cardGap} value={gapMm} min={0} onCommit={setGapMm} />
        </div>
        <Checkbox
          label={L.withCaption}
          checked={yazi}
          onChange={setYazi}
          helpText={L.withCaptionHelp}
        />
        {yazi && (
          <NumberField label={L.captionSpace} value={captionMm} min={5} onCommit={setCaptionMm} />
        )}
        <NumberField
          label={L.cardLimit}
          suffix=""
          step={1}
          value={limit}
          min={0}
          onCommit={(v) => setLimit(Math.max(0, Math.round(v)))}
        />
        <Text as="p" variant="bodySm" tone={adet > 0 ? "subdued" : "critical"}>
          {adet > 0
            ? L.fits(sigan.cols, sigan.rows, sigan.count, adet, Math.round(cardWidthMm - marginMm * 2), Math.round(fotoH))
            : L.noFit}
        </Text>
        <Checkbox
          label={L.replace}
          checked={replace}
          onChange={setReplace}
        />
        <InlineStack gap="200">
          <Button variant="primary" disabled={adet === 0} onClick={() => onApply(secim)}>
            {L.create}
          </Button>
          <Button onClick={onCancel}>{L.cancel}</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}
