import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineGrid,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "~/shopify.server";
import {
  fetchShopifyProductById,
  getProductConfig,
  getProductPrintAreas,
  normalizeProductConfig,
  saveProductConfig,
  saveProductPrintAreas,
  type PrintAreaRecord,
  type ProductConfig,
} from "~/models/product-config.server";

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

type AreaState = {
  id: string;
  name: string;
  side: "front" | "back";
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

function parseAreaRows(form: FormData, surfaceMode: ProductConfig["surfaceMode"]): PrintAreaRecord[] {
  const sides: Array<"front" | "back"> = surfaceMode === "front_only" ? ["front"] : ["front", "back"];
  return sides.map((side) => ({
    id: String(form.get(`${side}AreaId`) || ""),
    productId: "",
    name: String(form.get(`${side}AreaName`) || `${side} Print`),
    side,
    x: parseNumber(form.get(`${side}AreaX`)),
    y: parseNumber(form.get(`${side}AreaY`)),
    width: parseNumber(form.get(`${side}AreaWidth`)),
    height: parseNumber(form.get(`${side}AreaHeight`)),
    realWidthMm: parseNumber(form.get(`${side}AreaRealWidthMm`)),
    realHeightMm: parseNumber(form.get(`${side}AreaRealHeightMm`)),
    safeMargin: parseNumber(form.get(`${side}AreaSafeMargin`), 10),
    bleedMargin: parseNumber(form.get(`${side}AreaBleedMargin`), 5),
    dpi: parseNumber(form.get(`${side}AreaDpi`), 300),
  }));
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

function toAreaState(areas: PrintAreaRecord[], side: "front" | "back"): AreaState {
  const area = areas.find((item) => item.side === side);
  return {
    id: area?.id || "",
    name: area?.name || `${side} Print`,
    side,
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

function updateAreaState(area: AreaState, field: keyof AreaState, value: string) {
  return { ...area, [field]: value };
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

function applyProductPreset(area: AreaState, productType: ProductConfig["productType"], side: "front" | "back") {
  const overlay = defaultOverlay(productType)[side];
  const dimensions = defaultPrintDimensions(productType)[side];

  return {
    ...area,
    x: String(overlay.x),
    y: String(overlay.y),
    width: String(overlay.width),
    height: String(overlay.height),
    realWidthMm: String(dimensions.realWidthMm),
    realHeightMm: String(dimensions.realHeightMm),
  };
}

function PrintAreaEditor({
  title,
  area,
  onChange,
  imageUrl,
}: {
  title: string;
  area: AreaState;
  onChange: (field: keyof AreaState, value: string) => void;
  imageUrl?: string | null;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<
    | {
        pointerId: number;
        mode: "move" | "resize";
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        originWidth: number;
        originHeight: number;
      }
    | null
  >(null);
  const x = Number(area.x || 0);
  const y = Number(area.y || 0);
  const width = Number(area.width || 0);
  const height = Number(area.height || 0);

  useEffect(() => {
    if (!dragState.current) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.current || event.pointerId !== dragState.current.pointerId) return;
      const frame = frameRef.current;
      if (!frame) return;

      const bounds = frame.getBoundingClientRect();
      const scaleX = PREVIEW_WIDTH / bounds.width;
      const scaleY = PREVIEW_HEIGHT / bounds.height;
      const deltaX = (event.clientX - dragState.current.startX) * scaleX;
      const deltaY = (event.clientY - dragState.current.startY) * scaleY;

      if (dragState.current.mode === "move") {
        const nextX = clamp(Math.round(dragState.current.originX + deltaX), 0, PREVIEW_WIDTH - width);
        const nextY = clamp(Math.round(dragState.current.originY + deltaY), 0, PREVIEW_HEIGHT - height);
        onChange("x", String(nextX));
        onChange("y", String(nextY));
        return;
      }

      const nextWidth = clamp(
        Math.round(dragState.current.originWidth + deltaX),
        MIN_AREA_SIZE,
        PREVIEW_WIDTH - x,
      );
      const nextHeight = clamp(
        Math.round(dragState.current.originHeight + deltaY),
        MIN_AREA_SIZE,
        PREVIEW_HEIGHT - y,
      );
      onChange("width", String(nextWidth));
      onChange("height", String(nextHeight));
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
  }, [height, onChange, width, x, y]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();

    dragState.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
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
          <Text as="p" tone="subdued">
            Kutuyu surukleyerek tasiyabilir, sag alt koseden yeniden boyutlandirabilirsin.
          </Text>

          <div
            ref={frameRef}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 280,
              aspectRatio: `${PREVIEW_WIDTH} / ${PREVIEW_HEIGHT}`,
              borderRadius: 16,
              overflow: "hidden",
              background: imageUrl
                ? `center / cover no-repeat url("${imageUrl}")`
                : "linear-gradient(160deg, #f3f4f6 0%, #e5e7eb 100%)",
              border: "1px solid rgba(15, 23, 42, 0.12)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.04) 60%, rgba(15,23,42,0.08) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: `${(x / PREVIEW_WIDTH) * 100}%`,
                top: `${(y / PREVIEW_HEIGHT) * 100}%`,
                width: `${(width / PREVIEW_WIDTH) * 100}%`,
                height: `${(height / PREVIEW_HEIGHT) * 100}%`,
                border: "2px dashed #0f766e",
                background: "rgba(20, 184, 166, 0.14)",
                boxSizing: "border-box",
                cursor: "move",
              }}
              onPointerDown={(event) => startDrag(event, "move")}
            />
            <div
              style={{
                position: "absolute",
                left: `${((x + width) / PREVIEW_WIDTH) * 100}%`,
                top: `${((y + height) / PREVIEW_HEIGHT) * 100}%`,
                width: 18,
                height: 18,
                marginLeft: -9,
                marginTop: -9,
                borderRadius: 999,
                background: "#0f766e",
                border: "2px solid white",
                boxShadow: "0 4px 12px rgba(15, 118, 110, 0.35)",
                cursor: "nwse-resize",
              }}
              onPointerDown={(event) => startDrag(event, "resize")}
            />
          </div>

          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <TextField label="X" value={area.x} onChange={(value) => onChange("x", value)} autoComplete="off" type="number" />
            <TextField label="Y" value={area.y} onChange={(value) => onChange("y", value)} autoComplete="off" type="number" />
          </InlineGrid>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <TextField
              label="Kutu genisligi"
              value={area.width}
              onChange={(value) => onChange("width", value)}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="Kutu yuksekligi"
              value={area.height}
              onChange={(value) => onChange("height", value)}
              autoComplete="off"
              type="number"
            />
          </InlineGrid>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
            <TextField
              label="Gercek baski genisligi (mm)"
              value={area.realWidthMm}
              onChange={(value) => onChange("realWidthMm", value)}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="Gercek baski yuksekligi (mm)"
              value={area.realHeightMm}
              onChange={(value) => onChange("realHeightMm", value)}
              autoComplete="off"
              type="number"
            />
          </InlineGrid>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
            <TextField
              label="Safe margin"
              value={area.safeMargin}
              onChange={(value) => onChange("safeMargin", value)}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="Bleed margin"
              value={area.bleedMargin}
              onChange={(value) => onChange("bleedMargin", value)}
              autoComplete="off"
              type="number"
            />
            <TextField
              label="DPI"
              value={area.dpi}
              onChange={(value) => onChange("dpi", value)}
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
  const { admin, session, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productToken = params.productId ?? "";
  const productId = decodeProductToken(productToken);
  let product;
  try {
    product = await fetchShopifyProductById(admin, productId);
  } catch (error: unknown) {
    if (error instanceof Response && error.status === 403) {
      console.warn("[product-detail] graphql returned 403, redirecting to reauth for", session.shop);
      const authUrl = new URL("/auth", url.origin);
      authUrl.searchParams.set("shop", session.shop);
      authUrl.searchParams.set("returnTo", `${url.pathname}${url.search}`);
      throw redirect(`${authUrl.pathname}${authUrl.search}`, { target: "_parent" });
    }
    throw error;
  }
  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  const config = getProductConfig(product);
  const printAreas = getProductPrintAreas(product.id, config.productType, config.surfaceMode, config);
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const appBlockHandle = "tshirt-designer";
  const themeUrl = apiKey
    ? `https://${session.shop}/admin/themes/current/editor?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${appBlockHandle}`)}&target=mainSection`
    : null;

  return json({ product, config, printAreas, themeUrl });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);
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
    surchargeVariantId: '',
  };

  const frontBands = parseBandRows(form, "front");
  const backBands = parseBandRows(form, "back");
  const surfaceMode = String(form.get("surfaceMode") || "front_back") as ProductConfig["surfaceMode"];
  const printAreas = parseAreaRows(form, surfaceMode);
  const frontArea = printAreas.find((area) => area.side === "front");
  const backArea = printAreas.find((area) => area.side === "back");

  const normalized = normalizeProductConfig(
    {
      isActive: form.get("isActive") === "true",
      productTitle: String(form.get("productTitle") || ""),
      productHandle: String(form.get("productHandle") || ""),
      productType: String(form.get("productType") || "apparel") as ProductConfig["productType"],
      surfaceMode,
      frontPrintWidthCm: Number((frontArea?.realWidthMm || 0) / 10),
      frontPrintHeightCm: Number((frontArea?.realHeightMm || 0) / 10),
      backPrintWidthCm: Number(((backArea?.realWidthMm || frontArea?.realWidthMm || 0) / 10)),
      backPrintHeightCm: Number(((backArea?.realHeightMm || frontArea?.realHeightMm || 0) / 10)),
      pricingBands: {
        front: frontBands.bands,
        back: backBands.bands,
      },
      surchargeVariantId: String(form.get("surchargeVariantId") || "").trim(),
      updatedAt: new Date().toISOString(),
    },
    fallback,
  );

  saveProductConfig(productId, normalized);
  saveProductPrintAreas(productId, printAreas);
  return redirect(`/app/products/${encodeURIComponent(productToken)}?saved=1`);
};

export default function ProductSettingsRoute() {
  const { product, config, printAreas, themeUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const hasMounted = useRef(false);

  const [isActive, setIsActive] = useState(config.isActive);
  const [productType, setProductType] = useState<ProductConfig["productType"]>(config.productType);
  const [surfaceMode, setSurfaceMode] = useState<ProductConfig["surfaceMode"]>(config.surfaceMode);
  const [surchargeVariantId, setSurchargeVariantId] = useState(config.surchargeVariantId || "");
  const [frontBands, setFrontBands] = useState<BandState[]>(toBandState(config, "front"));
  const [backBands, setBackBands] = useState<BandState[]>(toBandState(config, "back"));
  const [frontArea, setFrontArea] = useState<AreaState>(toAreaState(printAreas, "front"));
  const [backArea, setBackArea] = useState<AreaState>(toAreaState(printAreas, "back"));

  const variantOptions = [
    { label: "Secilmedi", value: "" },
    ...product.variants.map((variant) => ({
      label: `${variant.title} - ${variant.price}`,
      value: variant.id,
    })),
  ];

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
      backAction={{ content: "Urunler", url: "/app/products" }}
      primaryAction={themeUrl ? { content: "Tema editoru", url: themeUrl, external: true } : undefined}
    >
      <BlockStack gap="500">
        <Card>
          <Box padding="400">
            <InlineStack gap="200" align="space-between">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Urun tipi ayarlari</Text>
                <Text as="p" tone="subdued">
                  Bu urun icin hangi yuzlerde calisacagi, varsayilan yerlesim ve baski sinirlari burada belirlenir.
                </Text>
              </BlockStack>
              <Badge tone={isActive ? "success" : "attention"}>
                {isActive ? "Aktif" : "Pasif"}
              </Badge>
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

                  <Checkbox
                    label="Bu urunde tasarim aracini aktif et"
                    name="isActive"
                    value="true"
                    checked={isActive}
                    onChange={setIsActive}
                  />

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

                  <input type="hidden" name="frontAreaId" value={frontArea.id} />
                  <input type="hidden" name="frontAreaName" value={frontArea.name} />
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
                    onChange={(field, value) => setFrontArea((current) => updateAreaState(current, field, value))}
                    imageUrl={product.featuredImage}
                  />

                  {surfaceMode === "front_back" ? (
                    <>
                      <input type="hidden" name="backAreaId" value={backArea.id} />
                      <input type="hidden" name="backAreaName" value={backArea.name} />
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
                        onChange={(field, value) => setBackArea((current) => updateAreaState(current, field, value))}
                        imageUrl={product.featuredImage}
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
                  <Select
                    label="Ek ucret varyanti (1 birim fiyatli)"
                    helpText="Shopify'da 1 TL/birim fiyatli bir varyant olusturun. Sistem ek ucreti bu varyantin adediyle odemektirir. Bos birakılırsa ek ucret sepete ayri kalem olarak eklenmez."
                    options={variantOptions}
                    value={surchargeVariantId}
                    onChange={setSurchargeVariantId}
                    name="surchargeVariantId"
                  />

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
