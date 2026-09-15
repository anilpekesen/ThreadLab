import { useState } from "react";
import { BlockStack, InlineStack, Text, Button, Checkbox } from "@shopify/polaris";
import { NumberField } from "./NumberField";

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
        <Text as="h3" variant="headingSm">Kart tabakası</Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Kartlar tabakaya dizilir, basılır ve tek tek kesilir. Her kart için bir fotoğraf
          alanı, istenirse altında bir yazı alanı açılır.
        </Text>
        <div className="fs-grid-2">
          <NumberField label="Kart eni" value={cardWidthMm} min={10} onCommit={setCardWidthMm} />
          <NumberField label="Kart boyu" value={cardHeightMm} min={10} onCommit={setCardHeightMm} />
          <NumberField label="Fotoğraf kenarı" value={marginMm} min={0} onCommit={setMarginMm} />
          <NumberField label="Kartlar arası" value={gapMm} min={0} onCommit={setGapMm} />
        </div>
        <Checkbox
          label="Kartın altında yazı alanı olsun"
          checked={yazi}
          onChange={setYazi}
          helpText="Müşteri her kart için kısa bir yazı girer."
        />
        {yazi && (
          <NumberField label="Yazı payı" value={captionMm} min={5} onCommit={setCaptionMm} />
        )}
        <NumberField
          label="Bu tabakadaki kart sayısı"
          suffix=""
          step={1}
          value={limit}
          min={0}
          onCommit={(v) => setLimit(Math.max(0, Math.round(v)))}
        />
        <Text as="p" variant="bodySm" tone={adet > 0 ? "subdued" : "critical"}>
          {adet > 0
            ? `Tabakaya ${sigan.cols} × ${sigan.rows} = ${sigan.count} kart sığıyor;`
              + ` ${adet} kart oluşturulacak. Fotoğraf alanı ${Math.round(cardWidthMm - marginMm * 2)}`
              + ` × ${Math.round(fotoH)} mm. (0 yazarsanız sığan kadar.)`
            : "Bu ölçüdeki kart tabakaya sığmıyor; kartı küçültün ya da daha büyük bir ölçü seçin."}
        </Text>
        <Checkbox
          label="Mevcut alanların yerine koy"
          checked={replace}
          onChange={setReplace}
        />
        <InlineStack gap="200">
          <Button variant="primary" disabled={adet === 0} onClick={() => onApply(secim)}>
            Kartları oluştur
          </Button>
          <Button onClick={onCancel}>Vazgeç</Button>
        </InlineStack>
      </BlockStack>
    </div>
  );
}
