import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "~/lib/authenticate.server";
import { useTranslation } from "~/i18n";
import { PageHelper } from "~/components/PageHelper";
import {
  fetchShopifyProductById,
  getProductConfig,
  getProductPrintAreas,
  normalizeProductConfig,
  saveProductConfig,
  saveProductPrintAreas,
} from "~/models/product-config.server";
import type { PrintAreaRecord, ProductConfig } from "~/models/product-config.server";

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 580;
const MIN_AREA_SIZE = 24;

function decodeProductToken(productToken: string) {
  try {
    return Buffer.from(productToken, "base64url").toString("utf8");
  } catch {
    return productToken;
  }
}

type BandState = {
  key: string;
  label: string;
  maxWidthCm: string;
  maxHeightCm: string;
  surcharge: string;
};

type VolumeDiscountState = {
  key: string;
  minQuantity: string;
  percentage: string;
};

type AreaState = {
  id: string;
  name: string;
  side: "front" | "back";
  mockupX: string;
  mockupY: string;
  mockupWidth: string;
  mockupHeight: string;
  mockupImageUrl: string;
  x: string;
  y: string;
  width: string;
  height: string;
  realWidthMm: string;
  realHeightMm: string;
  safeMargin: string;
  bleedMargin: string;
  dpi: string;
};

function parseNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBandRows(form: FormData, side: "front" | "back") {
  const count = Number(form.get(`${side}BandCount`) || 0);
  const bands = [];

  for (let index = 0; index < count; index += 1) {
    const key = String(form.get(`${side}BandKey_${index}`) || "").trim();
    const label = String(form.get(`${side}BandLabel_${index}`) || "").trim();
    const maxWidthRaw = String(form.get(`${side}BandMaxWidth_${index}`) || "").trim();
    const maxHeightRaw = String(form.get(`${side}BandMaxHeight_${index}`) || "").trim();
    const surcharge = Number(form.get(`${side}BandSurcharge_${index}`) || 0);

    if (!key) continue;
    bands.push({
      key,
      label: label || key,
      maxWidthCm: maxWidthRaw === "" ? null : Number(maxWidthRaw),
      maxHeightCm: maxHeightRaw === "" ? null : Number(maxHeightRaw),
      maxAreaCm2:
        maxWidthRaw === "" || maxHeightRaw === ""
          ? null
          : Number(maxWidthRaw) * Number(maxHeightRaw),
      surcharge,
    });
  }

  return { bands };
}

function parseVolumeDiscountRows(form: FormData) {
  const count = Number(form.get("volumeDiscountCount") || 0);
  const tiers = [];

  for (let index = 0; index < count; index += 1) {
    const key = String(form.get(`volumeDiscountKey_${index}`) || "").trim();
    const minQuantity = Math.floor(Number(form.get(`volumeDiscountMinQuantity_${index}`) || 0));
    const percentage = Number(form.get(`volumeDiscountPercentage_${index}`) || 0);

    if (!key || minQuantity <= 0 || percentage <= 0) continue;
    tiers.push({
      key,
      minQuantity,
      percentage: Math.min(100, Math.max(0, percentage)),
    });
  }

  return tiers.sort((a, b) => a.minQuantity - b.minQuantity);
}

function parseAreaRows(form: FormData, surfaceMode: ProductConfig["surfaceMode"]): PrintAreaRecord[] {
  const sides: Array<"front" | "back"> = surfaceMode === "front_only" ? ["front"] : ["front", "back"];
  return sides.map((side) => {
    const normalized = normalizeAreaNumbers({
      mockupX: parseNumber(form.get(`${side}AreaMockupX`)),
      mockupY: parseNumber(form.get(`${side}AreaMockupY`)),
      mockupWidth: parseNumber(form.get(`${side}AreaMockupWidth`), PREVIEW_WIDTH),
      mockupHeight: parseNumber(form.get(`${side}AreaMockupHeight`), PREVIEW_HEIGHT),
      x: parseNumber(form.get(`${side}AreaX`)),
      y: parseNumber(form.get(`${side}AreaY`)),
      width: parseNumber(form.get(`${side}AreaWidth`)),
      height: parseNumber(form.get(`${side}AreaHeight`)),
    });

    return {
      id: String(form.get(`${side}AreaId`) || ""),
      productId: "",
      name: String(form.get(`${side}AreaName`) || `${side} Print`),
      side,
      mockupX: normalized.mockupX,
      mockupY: normalized.mockupY,
      mockupWidth: normalized.mockupWidth,
      mockupHeight: normalized.mockupHeight,
      mockupImageUrl: String(form.get(`${side}AreaMockupImageUrl`) || ""),
      x: normalized.x,
      y: normalized.y,
      width: normalized.width,
      height: normalized.height,
      realWidthMm: parseNumber(form.get(`${side}AreaRealWidthMm`)),
      realHeightMm: parseNumber(form.get(`${side}AreaRealHeightMm`)),
      safeMargin: parseNumber(form.get(`${side}AreaSafeMargin`), 10),
      bleedMargin: parseNumber(form.get(`${side}AreaBleedMargin`), 5),
      dpi: parseNumber(form.get(`${side}AreaDpi`), 300),
    };
  });
}

function toBandState(config: ProductConfig, side: "front" | "back"): BandState[] {
  return config.pricingBands[side].map((band) => ({
    key: band.key,
    label: band.label,
    maxWidthCm: band.maxWidthCm == null ? "" : String(band.maxWidthCm),
    maxHeightCm: band.maxHeightCm == null ? "" : String(band.maxHeightCm),
    surcharge: String(band.surcharge),
  }));
}

function toVolumeDiscountState(config: ProductConfig): VolumeDiscountState[] {
  return (config.volumeDiscounts ?? []).map((tier) => ({
    key: tier.key,
    minQuantity: String(tier.minQuantity),
    percentage: String(tier.percentage),
  }));
}

function toAreaState(areas: PrintAreaRecord[], side: "front" | "back"): AreaState {
  const area = areas.find((item) => item.side === side);
  return {
    id: area?.id || "",
    name: area?.name || `${side} Print`,
    side,
    mockupX: String(area?.mockupX ?? 0),
    mockupY: String(area?.mockupY ?? 0),
    mockupWidth: String(area?.mockupWidth ?? PREVIEW_WIDTH),
    mockupHeight: String(area?.mockupHeight ?? PREVIEW_HEIGHT),
    mockupImageUrl: area?.mockupImageUrl ?? "",
    x: String(area?.x ?? 0),
    y: String(area?.y ?? 0),
    width: String(area?.width ?? 0),
    height: String(area?.height ?? 0),
    realWidthMm: String(area?.realWidthMm ?? 0),
    realHeightMm: String(area?.realHeightMm ?? 0),
    safeMargin: String(area?.safeMargin ?? 10),
    bleedMargin: String(area?.bleedMargin ?? 5),
    dpi: String(area?.dpi ?? 300),
  };
}

function updateBandArray(
  bands: BandState[],
  index: number,
  field: keyof BandState,
  value: string,
) {
  return bands.map((band, currentIndex) =>
    currentIndex === index ? { ...band, [field]: value } : band,
  );
}

function updateVolumeDiscountArray(
  tiers: VolumeDiscountState[],
  index: number,
  field: keyof VolumeDiscountState,
  value: string,
) {
  return tiers.map((tier, currentIndex) =>
    currentIndex === index ? { ...tier, [field]: value } : tier,
  );
}

function normalizeAreaNumbers(input: {
  mockupX: number;
  mockupY: number;
  mockupWidth: number;
  mockupHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const mockupWidth = clamp(Math.round(input.mockupWidth || PREVIEW_WIDTH), MIN_AREA_SIZE, PREVIEW_WIDTH);
  const mockupHeight = clamp(Math.round(input.mockupHeight || PREVIEW_HEIGHT), MIN_AREA_SIZE, PREVIEW_HEIGHT);
  const mockupX = clamp(Math.round(input.mockupX || 0), 0, PREVIEW_WIDTH - mockupWidth);
  const mockupY = clamp(Math.round(input.mockupY || 0), 0, PREVIEW_HEIGHT - mockupHeight);
  const width = clamp(Math.round(input.width || MIN_AREA_SIZE), MIN_AREA_SIZE, mockupWidth);
  const height = clamp(Math.round(input.height || MIN_AREA_SIZE), MIN_AREA_SIZE, mockupHeight);
  const x = clamp(Math.round(input.x || mockupX), mockupX, mockupX + mockupWidth - width);
  const y = clamp(Math.round(input.y || mockupY), mockupY, mockupY + mockupHeight - height);

  return {
    mockupX,
    mockupY,
    mockupWidth,
    mockupHeight,
    x,
    y,
    width,
    height,
  };
}

function normalizeAreaState(area: AreaState): AreaState {
  const normalized = normalizeAreaNumbers({
    mockupX: Number(area.mockupX || 0),
    mockupY: Number(area.mockupY || 0),
    mockupWidth: Number(area.mockupWidth || PREVIEW_WIDTH),
    mockupHeight: Number(area.mockupHeight || PREVIEW_HEIGHT),
    x: Number(area.x || 0),
    y: Number(area.y || 0),
    width: Number(area.width || MIN_AREA_SIZE),
    height: Number(area.height || MIN_AREA_SIZE),
  });

  return {
    ...area,
    mockupX: String(normalized.mockupX),
    mockupY: String(normalized.mockupY),
    mockupWidth: String(normalized.mockupWidth),
    mockupHeight: String(normalized.mockupHeight),
    mockupImageUrl: area.mockupImageUrl ?? "",
    x: String(normalized.x),
    y: String(normalized.y),
    width: String(normalized.width),
    height: String(normalized.height),
  };
}

function patchAreaState(area: AreaState, patch: Partial<AreaState>) {
  return normalizeAreaState({ ...area, ...patch, side: area.side });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildBandKey(side: "front" | "back", count: number) {
  return `${side}_${Date.now()}_${count}`;
}

function defaultPrintDimensions(productType: ProductConfig["productType"]) {
  if (productType === "bag") {
    return {
      front: { realWidthMm: 240, realHeightMm: 300 },
      back: { realWidthMm: 240, realHeightMm: 300 },
    };
  }

  if (productType === "mug") {
    return {
      front: { realWidthMm: 210, realHeightMm: 90 },
      back: { realWidthMm: 210, realHeightMm: 90 },
    };
  }

  if (productType === "boxer") {
    return {
      front: { realWidthMm: 100, realHeightMm: 80 },
      back: { realWidthMm: 100, realHeightMm: 80 },
    };
  }

  if (productType === "other") {
    return {
      front: { realWidthMm: 200, realHeightMm: 200 },
      back: { realWidthMm: 200, realHeightMm: 200 },
    };
  }

  return {
    front: { realWidthMm: 280, realHeightMm: 450 },
    back: { realWidthMm: 280, realHeightMm: 450 },
  };
}

function defaultOverlay(productType: ProductConfig["productType"]) {
  if (productType === "bag") {
    return {
      front: { x: 106, y: 139, width: 269, height: 336 },
      back: { x: 106, y: 139, width: 269, height: 336 },
    };
  }

  if (productType === "mug") {
    return {
      front: { x: 86, y: 203, width: 307, height: 139 },
      back: { x: 86, y: 203, width: 307, height: 139 },
    };
  }

  if (productType === "boxer") {
    return {
      front: { x: 152, y: 235, width: 176, height: 122 },
      back: { x: 152, y: 235, width: 176, height: 122 },
    };
  }

  if (productType === "other") {
    return {
      front: { x: 110, y: 150, width: 260, height: 260 },
      back: { x: 110, y: 150, width: 260, height: 260 },
    };
  }

  return {
    front: { x: 139, y: 157, width: 202, height: 325 },
    back: { x: 139, y: 157, width: 202, height: 325 },
  };
}

function defaultMockupBounds(productType: ProductConfig["productType"]) {
  if (productType === "bag") {
    return {
      front: { x: 74, y: 57, width: 332, height: 460 },
      back: { x: 74, y: 57, width: 332, height: 460 },
    };
  }

  if (productType === "mug") {
    return {
      front: { x: 32, y: 152, width: 416, height: 232 },
      back: { x: 32, y: 152, width: 416, height: 232 },
    };
  }

  if (productType === "boxer") {
    return {
      front: { x: 110, y: 116, width: 260, height: 318 },
      back: { x: 110, y: 116, width: 260, height: 318 },
    };
  }

  if (productType === "other") {
    return {
      front: { x: 80, y: 70, width: 320, height: 440 },
      back: { x: 80, y: 70, width: 320, height: 440 },
    };
  }

  return {
    front: { x: 76, y: 28, width: 328, height: 524 },
    back: { x: 76, y: 28, width: 328, height: 524 },
  };
}

function applyProductPreset(area: AreaState, productType: ProductConfig["productType"], side: "front" | "back") {
  const overlay = defaultOverlay(productType)[side];
  const mockup = defaultMockupBounds(productType)[side];
  const dimensions = defaultPrintDimensions(productType)[side];

  return normalizeAreaState({
    ...area,
    mockupX: String(mockup.x),
    mockupY: String(mockup.y),
    mockupWidth: String(mockup.width),
    mockupHeight: String(mockup.height),
    x: String(overlay.x),
    y: String(overlay.y),
    width: String(overlay.width),
    height: String(overlay.height),
    realWidthMm: String(dimensions.realWidthMm),
    realHeightMm: String(dimensions.realHeightMm),
  });
}

function PrintAreaEditor({
  title,
  area,
  onChange,
  imageUrl,
  imageOptions = [],
}: {
  title: string;
  area: AreaState;
  onChange: (nextArea: AreaState) => void;
  imageUrl?: string | null;
  imageOptions?: string[];
}) {
  // Kayıtlı mockupImageUrl varsa onu kullan, yoksa prop'tan gelen default'u kullan
  const savedImage = area.mockupImageUrl || null;
  const [activeImage, setActiveImage] = useState<string | null>(savedImage || imageUrl || null);

  // area.mockupImageUrl dışarıdan değişirse senkronize et
  const prevSaved = useRef(savedImage);
  if (savedImage !== prevSaved.current) {
    prevSaved.current = savedImage;
    if (savedImage) setActiveImage(savedImage);
  }

  function selectImage(url: string) {
    setActiveImage(url);
    onChange({ ...area, mockupImageUrl: url });
  }
  const activeTarget = "print";
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<
    | {
        pointerId: number;
        target: "mockup" | "print";
        mode: "move" | "resize";
        startX: number;
        startY: number;
        originMockupX: number;
        originMockupY: number;
        originMockupWidth: number;
        originMockupHeight: number;
        originX: number;
        originY: number;
        originWidth: number;
        originHeight: number;
      }
    | null
  >(null);
  const currentArea = normalizeAreaState(area);
  const mockupX = Number(currentArea.mockupX || 0);
  const mockupY = Number(currentArea.mockupY || 0);
  const mockupWidth = Number(currentArea.mockupWidth || PREVIEW_WIDTH);
  const mockupHeight = Number(currentArea.mockupHeight || PREVIEW_HEIGHT);
  const x = Number(currentArea.x || 0);
  const y = Number(currentArea.y || 0);
  const width = Number(currentArea.width || 0);
  const height = Number(currentArea.height || 0);
  const centerX = x + Math.round(width / 2);
  const leftGap = x - mockupX;
  const rightGap = mockupX + mockupWidth - x - width;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) return;
      const frame = frameRef.current;
      if (!frame) return;

      const bounds = frame.getBoundingClientRect();
      const scaleX = PREVIEW_WIDTH / bounds.width;
      const scaleY = PREVIEW_HEIGHT / bounds.height;
      const deltaX = (event.clientX - dragState.current.startX) * scaleX;
      const deltaY = (event.clientY - dragState.current.startY) * scaleY;
      const origin = dragState.current;

      if (origin.target === "mockup" && origin.mode === "move") {
        const nextMockupX = clamp(Math.round(origin.originMockupX + deltaX), 0, PREVIEW_WIDTH - origin.originMockupWidth);
        const nextMockupY = clamp(Math.round(origin.originMockupY + deltaY), 0, PREVIEW_HEIGHT - origin.originMockupHeight);
        const moveDeltaX = nextMockupX - origin.originMockupX;
        const moveDeltaY = nextMockupY - origin.originMockupY;
        onChange(
          patchAreaState(currentArea, {
            mockupX: String(nextMockupX),
            mockupY: String(nextMockupY),
            x: String(origin.originX + moveDeltaX),
            y: String(origin.originY + moveDeltaY),
          }),
        );
        return;
      }

      if (origin.target === "mockup" && origin.mode === "resize") {
        const nextMockupWidth = clamp(Math.round(origin.originMockupWidth + deltaX), MIN_AREA_SIZE, PREVIEW_WIDTH - origin.originMockupX);
        const nextMockupHeight = clamp(Math.round(origin.originMockupHeight + deltaY), MIN_AREA_SIZE, PREVIEW_HEIGHT - origin.originMockupY);
        onChange(
          patchAreaState(currentArea, {
            mockupWidth: String(nextMockupWidth),
            mockupHeight: String(nextMockupHeight),
          }),
        );
        return;
      }

      if (origin.target === "print" && origin.mode === "move") {
        const nextX = clamp(Math.round(origin.originX + deltaX), 0, PREVIEW_WIDTH - origin.originWidth);
        const nextY = clamp(Math.round(origin.originY + deltaY), 0, PREVIEW_HEIGHT - origin.originHeight);
        onChange(patchAreaState(currentArea, { x: String(nextX), y: String(nextY) }));
        return;
      }

      const nextWidth = clamp(Math.round(origin.originWidth + deltaX), MIN_AREA_SIZE, PREVIEW_WIDTH - origin.originX);
      const nextHeight = clamp(Math.round(origin.originHeight + deltaY), MIN_AREA_SIZE, PREVIEW_HEIGHT - origin.originY);
      onChange(patchAreaState(currentArea, { width: String(nextWidth), height: String(nextHeight) }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) return;
      dragState.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [currentArea, onChange]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>, target: "mockup" | "print", mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();

    dragState.current = {
      pointerId: event.pointerId,
      target,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originMockupX: mockupX,
      originMockupY: mockupY,
      originMockupWidth: mockupWidth,
      originMockupHeight: mockupHeight,
      originX: x,
      originY: y,
      originWidth: width,
      originHeight: height,
    };
  }

  return (
    <Card>
      <Box padding="300">
        <BlockStack gap="300">
          <Text as="h3" variant="headingSm">{title}</Text>

          {imageOptions.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {imageOptions.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectImage(url)}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: activeImage === url ? "3px solid #0f766e" : "2px solid #e5e7eb",
                    cursor: "pointer",
                    padding: 0,
                    background: "none",
                    flexShrink: 0,
                  }}
                >
                  <img src={url} alt={`Gorsel ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              ))}
            </div>
          )}

          <div
            ref={frameRef}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`,
              borderRadius: 16,
              overflow: "hidden",
              background: activeImage ? "transparent" : "linear-gradient(160deg, #f3f4f6 0%, #e5e7eb 100%)",
              border: "1px solid rgba(15, 23, 42, 0.12)",
            }}
          >
            {activeImage && (
              <img
                src={activeImage}
                alt="Urun gorseli"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", objectFit: "cover" }}
              />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.00) 60%, rgba(15,23,42,0.06) 100%)" }} />
            <div
              style={{
                position: "absolute",
                left: `${(x / PREVIEW_WIDTH) * 100}%`,
                top: `${(y / PREVIEW_HEIGHT) * 100}%`,
                width: `${(width / PREVIEW_WIDTH) * 100}%`,
                height: `${(height / PREVIEW_HEIGHT) * 100}%`,
                border: activeTarget === "print" ? "2px dashed #0f766e" : "2px dashed rgba(15, 118, 110, 0.82)",
                background: activeTarget === "print" ? "rgba(20, 184, 166, 0.16)" : "rgba(20, 184, 166, 0.12)",
                boxSizing: "border-box",
                cursor: "move",
                zIndex: 3,
              }}
              onPointerDown={(event) => startDrag(event, "print", "move")}
            />
            <div
              style={{
                position: "absolute",
                left: `${((x + width) / PREVIEW_WIDTH) * 100}%`,
                top: `${((y + height) / PREVIEW_HEIGHT) * 100}%`,
                width: 18, height: 18, marginLeft: -9, marginTop: -9,
                borderRadius: 999, background: "#0f766e", border: "2px solid white",
                boxShadow: "0 4px 12px rgba(15, 118, 110, 0.35)", cursor: "nwse-resize", zIndex: 4,
              }}
              onPointerDown={(event) => startDrag(event, "print", "resize")}
            />
          </div>

          <InlineStack gap="150">
            <Button size="slim" onClick={() => onChange(patchAreaState(currentArea, { x: String(Math.round((PREVIEW_WIDTH - width) / 2)) }))}>
              Yatay ortala
            </Button>
            <Button size="slim" onClick={() => onChange(patchAreaState(currentArea, { y: String(Math.round((PREVIEW_HEIGHT - height) / 2)) }))}>
              Dikey ortala
            </Button>
          </InlineStack>

          {/* Real print dimensions — critical for gang sheet calculations */}
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <TextField
              label="Gerçek baskı genişliği (mm)"
              value={currentArea.realWidthMm}
              onChange={(value) => onChange({ ...currentArea, realWidthMm: value })}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="Gerçek baskı yüksekliği (mm)"
              value={currentArea.realHeightMm}
              onChange={(value) => onChange({ ...currentArea, realHeightMm: value })}
              autoComplete="off"
              type="number"
            />
          </InlineGrid>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            <TextField
              label="Güvenli kenar (mm)"
              value={currentArea.safeMargin}
              onChange={(value) => onChange({ ...currentArea, safeMargin: value })}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="Taşma payı (mm)"
              value={currentArea.bleedMargin}
              onChange={(value) => onChange({ ...currentArea, bleedMargin: value })}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="DPI"
              value={currentArea.dpi}
              onChange={(value) => onChange({ ...currentArea, dpi: value })}
              autoComplete="off"
              type="number"
            />
          </InlineGrid>
        </BlockStack>
      </Box>
    </Card>
  );
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate(request);
  const productToken = params.productId ?? "";
  const productId = decodeProductToken(productToken);
  const product = await fetchShopifyProductById(admin, productId);
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const config = await getProductConfig(session.shop, product);
  const printAreas = await getProductPrintAreas(session.shop, product.id, config.productType, config.surfaceMode, config);

  return json({ product, config, printAreas });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const productToken = params.productId ?? "";
  const productId = decodeProductToken(productToken);
  const form = await request.formData();

  const fallback: ProductConfig = {
    isActive: true,
    productTitle: String(form.get("productTitle") || ""),
    productHandle: String(form.get("productHandle") || ""),
    productType: "apparel",
    surfaceMode: "front_back",
    imageUpload: true,
    textUpload: true,
    maxFileSize: 8,
    allowedTypes: ["PNG", "JPG"],
    minResolution: 1000,
    removeBg: false,
    printFormat: "PNG",
    printDpi: 300,
    requireApproval: true,
    frontPrintWidthCm: 28,
    frontPrintHeightCm: 45,
    backPrintWidthCm: 28,
    backPrintHeightCm: 45,
    pricingBands: { front: [], back: [] },
    volumeDiscounts: [],
    surchargeVariantId: '',
  };

  const frontBands = parseBandRows(form, "front");
  const backBands = parseBandRows(form, "back");
  const volumeDiscounts = parseVolumeDiscountRows(form);
  const surfaceMode = String(form.get("surfaceMode") || "front_back") as ProductConfig["surfaceMode"];
  const printAreas = parseAreaRows(form, surfaceMode);
  const frontArea = printAreas.find((area) => area.side === "front");
  const backArea = printAreas.find((area) => area.side === "back");

  const normalized = normalizeProductConfig(
    {
      isActive: true,
      productTitle: String(form.get("productTitle") || ""),
      productHandle: String(form.get("productHandle") || ""),
      productType: String(form.get("productType") || "apparel") as ProductConfig["productType"],
      surfaceMode,
      frontPrintWidthCm: Number((frontArea?.realWidthMm || 0) / 10),
      frontPrintHeightCm: Number((frontArea?.realHeightMm || 0) / 10),
      backPrintWidthCm: Number(((backArea?.realWidthMm || frontArea?.realWidthMm || 0) / 10)),
      backPrintHeightCm: Number(((backArea?.realHeightMm || frontArea?.realHeightMm || 0) / 10)),
      removeBg: true,

      pricingBands: {
        front: frontBands.bands,
        back: backBands.bands,
      },
      volumeDiscounts,
      surchargeVariantId: String(form.get("surchargeVariantId") || "").trim(),
      updatedAt: new Date().toISOString(),
    },
    fallback,
  );

  const variantMockupsRaw = String(form.get("variantMockups") || "{}");
  let parsedVariantMockups: Record<string, { front?: string; back?: string }> = {};
  try { parsedVariantMockups = JSON.parse(variantMockupsRaw); } catch { /* ignore bad JSON */ }
  normalized.variantMockups = parsedVariantMockups;

  await saveProductConfig(shop, productId, normalized);
  await saveProductPrintAreas(shop, productId, printAreas);
  return redirect(`/app/products/${encodeURIComponent(productToken)}?saved=1`);
};

export default function ProductSettingsRoute() {
  const { product, config, printAreas } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>();
  const hasMounted = useRef(false);

  const [productType, setProductType] = useState<ProductConfig["productType"]>(config.productType);
  const [surfaceMode, setSurfaceMode] = useState<ProductConfig["surfaceMode"]>(config.surfaceMode);
  const [surchargeVariantId, setSurchargeVariantId] = useState(config.surchargeVariantId || "");
  const [frontBands, setFrontBands] = useState<BandState[]>(toBandState(config, "front"));
  const [backBands, setBackBands] = useState<BandState[]>(toBandState(config, "back"));
  const [volumeDiscounts, setVolumeDiscounts] = useState<VolumeDiscountState[]>(toVolumeDiscountState(config));
  const [frontArea, setFrontArea] = useState<AreaState>(toAreaState(printAreas, "front"));
  const [backArea, setBackArea] = useState<AreaState>(toAreaState(printAreas, "back"));
  const [variantMockups, setVariantMockups] = useState<Record<string, { front?: string; back?: string }>>(
    config.variantMockups ?? {}
  );

  const colorOptionNames = ["renk", "color", "colour"];
  const colorOptionName = product.variants[0]?.selectedOptions.find(
    (opt) => colorOptionNames.some((k) => opt.name.toLowerCase().includes(k))
  )?.name ?? product.variants[0]?.selectedOptions[0]?.name ?? "";
  const uniqueColors = colorOptionName
    ? [...new Set(
        product.variants
          .map((v) => v.selectedOptions.find((o) => o.name === colorOptionName)?.value)
          .filter((v): v is string => Boolean(v))
      )]
    : [];

  const [selectedColor, setSelectedColor] = useState<string>(uniqueColors[0] ?? "");

  function handleColorChange(color: string) {
    setSelectedColor(color);
    const mockup = variantMockups[color];
    if (mockup?.front) setFrontArea((prev) => ({ ...prev, mockupImageUrl: mockup.front! }));
    if (mockup?.back) setBackArea((prev) => ({ ...prev, mockupImageUrl: mockup.back! }));
  }

  // Liquid mantığıyla aynı: option3'e göre ön/arka variant görselini seç
  const designerFrontImage = (() => {
    const v = product.variants.find((variant) => {
      const opt3 = (variant.selectedOptions[2]?.value ?? "").toLowerCase();
      return (opt3.includes("ön") || opt3.includes("on") || opt3.includes("front")) && !opt3.includes("arka") && !opt3.includes("back");
    });
    return v?.image || product.images[0] || product.featuredImage || "";
  })();

  const designerBackImage = (() => {
    const v = product.variants.find((variant) => {
      const opt3 = (variant.selectedOptions[2]?.value ?? "").toLowerCase();
      return opt3.includes("arka") || opt3.includes("back");
    });
    return v?.image || product.images[1] || product.images[0] || product.featuredImage || "";
  })();



  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    setFrontArea((current) => applyProductPreset(current, productType, "front"));
    setBackArea((current) => applyProductPreset(current, productType, "back"));
  }, [productType]);

  return (
    <Page
      title={product.title}
      subtitle={product.handle}
      backAction={{ content: t("products.backToProducts"), onAction: () => navigate("/app/products") }}
    >
      <BlockStack gap="500">
        <PageHelper sections={[
          { titleKey: "helper.productDetail.1.title", bodyKey: "helper.productDetail.1.body" },
          { titleKey: "helper.productDetail.2.title", bodyKey: "helper.productDetail.2.body" },
          { titleKey: "helper.productDetail.3.title", bodyKey: "helper.productDetail.3.body" },
          { titleKey: "helper.productDetail.4.title", bodyKey: "helper.productDetail.4.body" },
          { titleKey: "helper.productDetail.5.title", bodyKey: "helper.productDetail.5.body" },
        ]} />
        <Card>
          <Box padding="400">
            <InlineStack gap="200" align="space-between">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">{t("products.typeSettings")}</Text>
                <Text as="p" tone="subdued">{t("products.typeSettingsDesc")}</Text>
              </BlockStack>
              <Badge tone="success">{t("common.active")}</Badge>
            </InlineStack>
          </Box>
        </Card>

        <Form method="post">
          <BlockStack gap="500">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <input type="hidden" name="productTitle" value={product.title} />
                  <input type="hidden" name="productHandle" value={product.handle} />

                  <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                    <Select
                      label="Urun tipi"
                      name="productType"
                      options={[
                        { label: "T-shirt / genel giyim", value: "apparel" },
                        { label: "Sweatshirt / hoodie", value: "sweatshirt" },
                        { label: "Bez canta", value: "bag" },
                        { label: "Kupa bardak", value: "mug" },
                        { label: "Baksir / boxer", value: "boxer" },
                        { label: "Diger", value: "other" },
                      ]}
                      value={productType}
                      onChange={(value) => setProductType(value as ProductConfig["productType"])}
                    />

                    <Select
                      label="Yuz modu"
                      name="surfaceMode"
                      options={[
                        { label: "On + arka", value: "front_back" },
                        { label: "Sadece on", value: "front_only" },
                      ]}
                      value={surfaceMode}
                      onChange={(value) => setSurfaceMode(value as ProductConfig["surfaceMode"])}
                    />
                  </InlineGrid>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Baski alani editoru</Text>
                  <Text as="p" tone="subdued">
                    Asagidaki kutu musterinin tasarim yapabilecegi alani temsil eder. Konum ve boyutu urune gore
                    ayarlayabilirsin.
                  </Text>

                  <input type="hidden" name="variantMockups" value={JSON.stringify(variantMockups)} />

                  {uniqueColors.length > 0 && (
                    <BlockStack gap="150">
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Renk seç — seçili rengin mockup görseli editörde görünür:
                      </Text>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {uniqueColors.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => handleColorChange(color)}
                            style={{
                              padding: "6px 16px",
                              borderRadius: 20,
                              border: selectedColor === color ? "2px solid #0f766e" : "2px solid #d1d5db",
                              background: selectedColor === color ? "#f0fdf9" : "white",
                              color: selectedColor === color ? "#0f766e" : "#374151",
                              fontWeight: selectedColor === color ? "600" : "400",
                              cursor: "pointer",
                              fontSize: 13,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {color}
                            {(variantMockups[color]?.front) ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                    </BlockStack>
                  )}

                  <input type="hidden" name="frontAreaId" value={frontArea.id} />
                  <input type="hidden" name="frontAreaName" value={frontArea.name} />
                  <input type="hidden" name="frontAreaMockupX" value={frontArea.mockupX} />
                  <input type="hidden" name="frontAreaMockupY" value={frontArea.mockupY} />
                  <input type="hidden" name="frontAreaMockupWidth" value={frontArea.mockupWidth} />
                  <input type="hidden" name="frontAreaMockupHeight" value={frontArea.mockupHeight} />
                  <input type="hidden" name="frontAreaMockupImageUrl" value={frontArea.mockupImageUrl} />
                  <input type="hidden" name="frontAreaX" value={frontArea.x} />
                  <input type="hidden" name="frontAreaY" value={frontArea.y} />
                  <input type="hidden" name="frontAreaWidth" value={frontArea.width} />
                  <input type="hidden" name="frontAreaHeight" value={frontArea.height} />
                  <input type="hidden" name="frontAreaRealWidthMm" value={frontArea.realWidthMm} />
                  <input type="hidden" name="frontAreaRealHeightMm" value={frontArea.realHeightMm} />
                  <input type="hidden" name="frontAreaSafeMargin" value={frontArea.safeMargin} />
                  <input type="hidden" name="frontAreaBleedMargin" value={frontArea.bleedMargin} />
                  <input type="hidden" name="frontAreaDpi" value={frontArea.dpi} />

                  <PrintAreaEditor
                    title="On yuz"
                    area={frontArea}
                    onChange={(nextArea) => {
                      setFrontArea(nextArea);
                      if (selectedColor && nextArea.mockupImageUrl !== frontArea.mockupImageUrl) {
                        setVariantMockups((prev) => ({
                          ...prev,
                          [selectedColor]: { ...prev[selectedColor], front: nextArea.mockupImageUrl },
                        }));
                      }
                    }}
                    imageUrl={frontArea.mockupImageUrl || designerFrontImage}
                    imageOptions={product.images}
                  />

                  {surfaceMode === "front_back" ? (
                    <>
                      <input type="hidden" name="backAreaId" value={backArea.id} />
                      <input type="hidden" name="backAreaName" value={backArea.name} />
                      <input type="hidden" name="backAreaMockupX" value={backArea.mockupX} />
                      <input type="hidden" name="backAreaMockupY" value={backArea.mockupY} />
                      <input type="hidden" name="backAreaMockupWidth" value={backArea.mockupWidth} />
                      <input type="hidden" name="backAreaMockupHeight" value={backArea.mockupHeight} />
                      <input type="hidden" name="backAreaMockupImageUrl" value={backArea.mockupImageUrl} />
                      <input type="hidden" name="backAreaX" value={backArea.x} />
                      <input type="hidden" name="backAreaY" value={backArea.y} />
                      <input type="hidden" name="backAreaWidth" value={backArea.width} />
                      <input type="hidden" name="backAreaHeight" value={backArea.height} />
                      <input type="hidden" name="backAreaRealWidthMm" value={backArea.realWidthMm} />
                      <input type="hidden" name="backAreaRealHeightMm" value={backArea.realHeightMm} />
                      <input type="hidden" name="backAreaSafeMargin" value={backArea.safeMargin} />
                      <input type="hidden" name="backAreaBleedMargin" value={backArea.bleedMargin} />
                      <input type="hidden" name="backAreaDpi" value={backArea.dpi} />

                      <PrintAreaEditor
                        title="Arka yuz"
                        area={backArea}
                        onChange={(nextArea) => {
                          setBackArea(nextArea);
                          if (selectedColor && nextArea.mockupImageUrl !== backArea.mockupImageUrl) {
                            setVariantMockups((prev) => ({
                              ...prev,
                              [selectedColor]: { ...prev[selectedColor], back: nextArea.mockupImageUrl },
                            }));
                          }
                        }}
                        imageUrl={backArea.mockupImageUrl || designerBackImage}
                        imageOptions={product.images}
                      />
                    </>
                  ) : null}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Baski fiyat bantlari</Text>
                  <Text as="p" tone="subdued">
                    Tasarimin fiziksel olcusune gore ek ucretleri burada yonet. Ornek olarak 10x15, 21x29, 29x42
                    gibi esikler tanimlayabilirsin; bu degerler tamamen degistirilebilir.
                  </Text>
                  <input type="hidden" name="surchargeVariantId" value={surchargeVariantId} />

                  <input type="hidden" name="frontBandCount" value={String(frontBands.length)} />
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">On yuz bantlari</Text>
                    <InlineStack gap="200">
                      <Button
                        onClick={() =>
                          setFrontBands((current) =>
                            current.concat({
                              key: buildBandKey("front", current.length),
                              label: `Yeni bant ${current.length + 1}`,
                              maxWidthCm: "",
                              maxHeightCm: "",
                              surcharge: "0",
                            }),
                          )
                        }
                      >
                        Bant ekle
                      </Button>
                    </InlineStack>
                    {frontBands.map((band, index) => (
                      <Card key={`front-${band.key}`}>
                        <Box padding="300">
                          <BlockStack gap="300">
                            <input type="hidden" name={`frontBandKey_${index}`} value={band.key} />
                            <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
                              <TextField
                                label="Etiket"
                                value={band.label}
                                onChange={(value) => setFrontBands((current) => updateBandArray(current, index, "label", value))}
                                autoComplete="off"
                                name={`frontBandLabel_${index}`}
                              />
                              <TextField
                                label="Maks genislik (cm)"
                                value={band.maxWidthCm}
                                onChange={(value) => setFrontBands((current) => updateBandArray(current, index, "maxWidthCm", value))}
                                autoComplete="off"
                                type="number"
                                name={`frontBandMaxWidth_${index}`}
                              />
                              <TextField
                                label="Maks yukseklik (cm)"
                                value={band.maxHeightCm}
                                onChange={(value) => setFrontBands((current) => updateBandArray(current, index, "maxHeightCm", value))}
                                autoComplete="off"
                                type="number"
                                name={`frontBandMaxHeight_${index}`}
                              />
                              <TextField
                                label="Ek ucret"
                                value={band.surcharge}
                                onChange={(value) => setFrontBands((current) => updateBandArray(current, index, "surcharge", value))}
                                autoComplete="off"
                                type="number"
                                name={`frontBandSurcharge_${index}`}
                              />
                            </InlineGrid>
                            <InlineStack gap="200">
                              <Button
                                tone="critical"
                                onClick={() =>
                                  setFrontBands((current) => current.filter((_, currentIndex) => currentIndex !== index))
                                }
                              >
                                Sil
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    ))}
                  </BlockStack>

                  {surfaceMode === "front_back" ? (
                    <>
                      <input type="hidden" name="backBandCount" value={String(backBands.length)} />
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingSm">Arka yuz bantlari</Text>
                        <InlineStack gap="200">
                          <Button
                            onClick={() =>
                              setBackBands((current) =>
                                current.concat({
                                  key: buildBandKey("back", current.length),
                                  label: `Yeni bant ${current.length + 1}`,
                                  maxWidthCm: "",
                                  maxHeightCm: "",
                                  surcharge: "0",
                                }),
                              )
                            }
                          >
                            Bant ekle
                          </Button>
                        </InlineStack>
                        {backBands.map((band, index) => (
                          <Card key={`back-${band.key}`}>
                            <Box padding="300">
                              <BlockStack gap="300">
                                <input type="hidden" name={`backBandKey_${index}`} value={band.key} />
                                <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
                                  <TextField
                                    label="Etiket"
                                    value={band.label}
                                    onChange={(value) => setBackBands((current) => updateBandArray(current, index, "label", value))}
                                    autoComplete="off"
                                    name={`backBandLabel_${index}`}
                                  />
                                  <TextField
                                    label="Maks genislik (cm)"
                                    value={band.maxWidthCm}
                                    onChange={(value) => setBackBands((current) => updateBandArray(current, index, "maxWidthCm", value))}
                                    autoComplete="off"
                                    type="number"
                                    name={`backBandMaxWidth_${index}`}
                                  />
                                  <TextField
                                    label="Maks yukseklik (cm)"
                                    value={band.maxHeightCm}
                                    onChange={(value) => setBackBands((current) => updateBandArray(current, index, "maxHeightCm", value))}
                                    autoComplete="off"
                                    type="number"
                                    name={`backBandMaxHeight_${index}`}
                                  />
                                  <TextField
                                    label="Ek ucret"
                                    value={band.surcharge}
                                    onChange={(value) => setBackBands((current) => updateBandArray(current, index, "surcharge", value))}
                                    autoComplete="off"
                                    type="number"
                                    name={`backBandSurcharge_${index}`}
                                  />
                                </InlineGrid>
                                <InlineStack gap="200">
                                  <Button
                                    tone="critical"
                                    onClick={() =>
                                      setBackBands((current) => current.filter((_, currentIndex) => currentIndex !== index))
                                    }
                                  >
                                    Sil
                                  </Button>
                                </InlineStack>
                              </BlockStack>
                            </Box>
                          </Card>
                        ))}
                      </BlockStack>
                    </>
                  ) : (
                    <input type="hidden" name="backBandCount" value="0" />
                  )}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Toplu adet indirimi</Text>
                  <Text as="p" tone="subdued">
                    Toplam adet bu esiklere ulastiginda baski ucretine indirim uygular. Ornek: 20 adet ve uzeri icin %3.
                  </Text>
                  <input type="hidden" name="volumeDiscountCount" value={String(volumeDiscounts.length)} />
                  <InlineStack gap="200">
                    <Button
                      onClick={() =>
                        setVolumeDiscounts((current) =>
                          current.concat({
                            key: `volume-${Date.now()}-${current.length}`,
                            minQuantity: "20",
                            percentage: "3",
                          }),
                        )
                      }
                    >
                      Indirim esigi ekle
                    </Button>
                  </InlineStack>
                  {volumeDiscounts.map((tier, index) => (
                    <Card key={tier.key}>
                      <Box padding="300">
                        <BlockStack gap="300">
                          <input type="hidden" name={`volumeDiscountKey_${index}`} value={tier.key} />
                          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                            <TextField
                              label="Minimum adet"
                              value={tier.minQuantity}
                              onChange={(value) => setVolumeDiscounts((current) => updateVolumeDiscountArray(current, index, "minQuantity", value))}
                              autoComplete="off"
                              type="number"
                              min={1}
                              name={`volumeDiscountMinQuantity_${index}`}
                            />
                            <TextField
                              label="Indirim (%)"
                              value={tier.percentage}
                              onChange={(value) => setVolumeDiscounts((current) => updateVolumeDiscountArray(current, index, "percentage", value))}
                              autoComplete="off"
                              type="number"
                              min={0}
                              max={100}
                              name={`volumeDiscountPercentage_${index}`}
                            />
                          </InlineGrid>
                          <InlineStack gap="200">
                            <Button
                              tone="critical"
                              onClick={() =>
                                setVolumeDiscounts((current) => current.filter((_, currentIndex) => currentIndex !== index))
                              }
                            >
                              Sil
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  ))}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Varyant referansi</Text>
                  <Text as="p" tone="subdued">
                    Ana fiyatlari Shopify varyantlarindan yonet. Buradaki liste, ek ucret varyanti seciminde
                    referans olarak kullanilir.
                  </Text>
                  <BlockStack gap="200">
                    {product.variants.map((variant) => (
                      <Box key={variant.id} paddingBlockEnd="200">
                        <Text as="p" variant="bodySm">
                          {variant.title} - {variant.price}
                        </Text>
                      </Box>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            <InlineStack gap="200">
              <Button submit variant="primary">Kaydet</Button>
              {actionData ? <Text as="p" tone="critical">Kayit sirasinda bir sorun olustu.</Text> : null}
            </InlineStack>
          </BlockStack>
        </Form>
      </BlockStack>
    </Page>
  );
}
