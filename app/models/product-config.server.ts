import { randomBytes } from "node:crypto";
import { query, runMigrations } from "~/lib/db.server";

let migrationsRan = false;
async function ensureMigrations() {
  if (!migrationsRan) {
    await runMigrations();
    migrationsRan = true;
  }
}

export type SurfaceMode = "front_back" | "front_only";
export type ProductType = "apparel" | "sweatshirt" | "bag" | "mug" | "boxer" | "other";

export interface PricingBand {
  key: string;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxAreaCm2?: number | null;
  label: string;
  surcharge: number;
}

export interface ProductConfig {
  isActive: boolean;
  productTitle: string;
  productHandle: string;
  productType: ProductType;
  surfaceMode: SurfaceMode;
  imageUpload: boolean;
  textUpload: boolean;
  maxFileSize: number;
  allowedTypes: string[];
  minResolution: number;
  removeBg: boolean;
  printFormat: string;
  printDpi: number;
  requireApproval: boolean;
  frontPrintWidthCm: number;
  frontPrintHeightCm: number;
  backPrintWidthCm: number;
  backPrintHeightCm: number;
  pricingBands: {
    front: PricingBand[];
    back: PricingBand[];
  };
  surchargeVariantId: string;
  updatedAt?: string;
}

export interface PrintAreaRecord {
  id: string;
  productId: string;
  name: string;
  side: "front" | "back";
  mockupX: number;
  mockupY: number;
  mockupWidth: number;
  mockupHeight: number;
  mockupImageUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  realWidthMm: number;
  realHeightMm: number;
  safeMargin: number;
  bleedMargin: number;
  dpi: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShopifyProductSummary {
  id: string;
  title: string;
  handle: string;
  productType: string;
  status: string;
  featuredImage?: string | null;
  images: string[];
  variants: Array<{
    id: string;
    title: string;
    price: string;
    selectedOptions: Array<{ name: string; value: string }>;
    image?: string | null;
  }>;
}

type SettingsMap = Record<string, ProductConfig>;

export function toStorefrontSettings(config: ProductConfig) {
  return {
    ...config,
    removeBgAvailable: Boolean(config.removeBg),
  };
}

export async function readSettingsMap(): Promise<SettingsMap> {
  await ensureMigrations();
  const result = await query<{ product_id: string; config: ProductConfig }>(
    "SELECT product_id, config FROM product_settings",
  );
  const map: SettingsMap = {};
  for (const row of result.rows) {
    map[row.product_id] = row.config;
  }
  return map;
}

export async function writeSettingsMap(settings: SettingsMap): Promise<void> {
  await ensureMigrations();
  for (const [productId, config] of Object.entries(settings)) {
    await query(
      `INSERT INTO product_settings (product_id, config, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (product_id) DO UPDATE SET config = $2, updated_at = now()`,
      [productId, JSON.stringify(config)],
    );
  }
}

export async function readPrintAreas(): Promise<PrintAreaRecord[]> {
  await ensureMigrations();
  const result = await query<{
    id: string; product_id: string; name: string; side: "front" | "back";
    mockup_x: string; mockup_y: string; mockup_width: string; mockup_height: string;
    mockup_image_url: string;
    x: string; y: string; width: string; height: string;
    real_width_mm: number; real_height_mm: number;
    safe_margin: string; bleed_margin: string; dpi: number; updated_at: string;
  }>("SELECT * FROM product_print_areas ORDER BY updated_at");
  return result.rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    name: r.name,
    side: r.side,
    mockupX: Number(r.mockup_x ?? 0),
    mockupY: Number(r.mockup_y ?? 0),
    mockupWidth: Number(r.mockup_width ?? 480),
    mockupHeight: Number(r.mockup_height ?? 580),
    mockupImageUrl: r.mockup_image_url || undefined,
    x: Number(r.x),
    y: Number(r.y),
    width: Number(r.width),
    height: Number(r.height),
    realWidthMm: r.real_width_mm,
    realHeightMm: r.real_height_mm,
    safeMargin: Number(r.safe_margin),
    bleedMargin: Number(r.bleed_margin),
    dpi: r.dpi,
    updatedAt: r.updated_at,
  }));
}

export async function writePrintAreas(areas: PrintAreaRecord[]): Promise<void> {
  await ensureMigrations();
  if (areas.length === 0) return;
  for (const a of areas) {
    await query(
      `INSERT INTO product_print_areas
         (id, product_id, side, name, mockup_x, mockup_y, mockup_width, mockup_height, x, y, width, height, real_width_mm, real_height_mm, safe_margin, bleed_margin, dpi, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
       ON CONFLICT (id) DO UPDATE SET
         product_id=$2, side=$3, name=$4, mockup_x=$5, mockup_y=$6, mockup_width=$7, mockup_height=$8,
         x=$9, y=$10, width=$11, height=$12,
         real_width_mm=$13, real_height_mm=$14, safe_margin=$15, bleed_margin=$16, dpi=$17, updated_at=now()`,
      [a.id, a.productId, a.side, a.name, a.mockupX, a.mockupY, a.mockupWidth, a.mockupHeight, a.x, a.y, a.width, a.height,
       a.realWidthMm, a.realHeightMm, a.safeMargin, a.bleedMargin, a.dpi],
    );
  }
}

function normalizeBands(sideBands: unknown): PricingBand[] {
  if (!Array.isArray(sideBands)) return [];
  return sideBands.map((band, idx) => {
    const source = band as {
      key?: unknown;
      maxWidthCm?: unknown;
      maxHeightCm?: unknown;
      maxAreaCm2?: unknown;
      label?: unknown;
      surcharge?: unknown;
    };
    const maxWidthCm =
      source?.maxWidthCm == null || source.maxWidthCm === "" ? null : Number(source.maxWidthCm);
    const maxHeightCm =
      source?.maxHeightCm == null || source.maxHeightCm === "" ? null : Number(source.maxHeightCm);
    const legacyAreaCm2 =
      source?.maxAreaCm2 == null || source.maxAreaCm2 === "" ? null : Number(source.maxAreaCm2);

    return {
      key: String(source?.key || `${maxWidthCm || "max"}x${maxHeightCm || "max"}` || legacyAreaCm2 || idx),
      maxWidthCm,
      maxHeightCm,
      maxAreaCm2: legacyAreaCm2,
      label: String(source?.label || `Band ${idx + 1}`),
      surcharge: Number(source?.surcharge || 0),
    };
  });
}


export function defaultPricingBands() {
  const values = [60, 120, 180];
  const sizes = [
    { widthCm: 10, heightCm: 15, label: "10 x 15 cm" },
    { widthCm: 21, heightCm: 29, label: "21 x 29 cm" },
    { widthCm: 29, heightCm: 42, label: "29 x 42 cm" },
  ];
  const build = () =>
    sizes.map((size, idx) => ({
      key: `${size.widthCm}x${size.heightCm}`,
      maxWidthCm: size.widthCm,
      maxHeightCm: size.heightCm,
      maxAreaCm2: size.widthCm * size.heightCm,
      label: size.label,
      surcharge: values[idx],
    }));
  return { front: build(), back: build() };
}

export function defaultPrintAreaForType(productType: string) {
  const type = String(productType || "apparel");
  if (type === "bag") return { front: { widthCm: 24, heightCm: 30 }, back: { widthCm: 24, heightCm: 30 } };
  if (type === "mug") return { front: { widthCm: 21, heightCm: 9 }, back: { widthCm: 21, heightCm: 9 } };
  if (type === "boxer") return { front: { widthCm: 10, heightCm: 8 }, back: { widthCm: 10, heightCm: 8 } };
  if (type === "other") return { front: { widthCm: 20, heightCm: 20 }, back: { widthCm: 20, heightCm: 20 } };
  return { front: { widthCm: 28, heightCm: 45 }, back: { widthCm: 28, heightCm: 45 } };
}

export function defaultOverlayForType(productType: string) {
  const type = String(productType || "apparel");
  if (type === "bag") {
    return {
      front: { x: 106, y: 139, width: 269, height: 336 },
      back: { x: 106, y: 139, width: 269, height: 336 },
    };
  }
  if (type === "mug") {
    return {
      front: { x: 86, y: 203, width: 307, height: 139 },
      back: { x: 86, y: 203, width: 307, height: 139 },
    };
  }
  if (type === "boxer") {
    return {
      front: { x: 152, y: 235, width: 176, height: 122 },
      back: { x: 152, y: 235, width: 176, height: 122 },
    };
  }
  if (type === "other") {
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

export function defaultMockupBoundsForType(productType: string) {
  const type = String(productType || "apparel");
  if (type === "bag") {
    return {
      front: { x: 74, y: 57, width: 332, height: 460 },
      back: { x: 74, y: 57, width: 332, height: 460 },
    };
  }
  if (type === "mug") {
    return {
      front: { x: 32, y: 152, width: 416, height: 232 },
      back: { x: 32, y: 152, width: 416, height: 232 },
    };
  }
  if (type === "boxer") {
    return {
      front: { x: 110, y: 116, width: 260, height: 318 },
      back: { x: 110, y: 116, width: 260, height: 318 },
    };
  }
  if (type === "other") {
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

export function normalizeProductType(input: string): ProductType {
  const value = String(input || "").toLowerCase().trim();
  if (value.includes("sweat") || value.includes("hoodie")) return "sweatshirt";
  if (value === "bag") return "bag";
  if (value.includes("bag") || value.includes("canta")) return "bag";
  if (value === "mug" || value.includes("kupa") || value.includes("bardak") || value.includes("cup")) return "mug";
  if (value.includes("boxer") || value.includes("baksir") || value.includes("boxer short")) return "boxer";
  if (value === "other" || value.includes("diger") || value.includes("other")) return "other";
  if (value === "sweatshirt") return "sweatshirt";
  return "apparel";
}

export function normalizeSurfaceMode(input: string): SurfaceMode {
  return input === "front_only" ? "front_only" : "front_back";
}

export function buildDefaultConfig(product: Pick<ShopifyProductSummary, "title" | "handle" | "productType">): ProductConfig {
  const productType = normalizeProductType(product.productType);
  const printDefaults = defaultPrintAreaForType(productType);
  return {
    isActive: true,
    productTitle: product.title,
    productHandle: product.handle,
    productType,
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
    frontPrintWidthCm: printDefaults.front.widthCm,
    frontPrintHeightCm: printDefaults.front.heightCm,
    backPrintWidthCm: printDefaults.back.widthCm,
    backPrintHeightCm: printDefaults.back.heightCm,
    pricingBands: defaultPricingBands(),
    surchargeVariantId: '',
  };
}

export function normalizeProductConfig(
  input: Partial<ProductConfig>,
  fallback: ProductConfig,
): ProductConfig {
  return {
    ...fallback,
    ...input,
    isActive: Boolean(input?.isActive),
    productTitle: String(input?.productTitle || fallback.productTitle),
    productHandle: String(input?.productHandle || fallback.productHandle),
    productType: normalizeProductType(input?.productType || fallback.productType),
    surfaceMode: normalizeSurfaceMode(input?.surfaceMode || fallback.surfaceMode),
    imageUpload: input?.imageUpload ?? fallback.imageUpload,
    textUpload: input?.textUpload ?? fallback.textUpload,
    maxFileSize: Number(input?.maxFileSize || fallback.maxFileSize),
    allowedTypes: Array.isArray(input?.allowedTypes)
      ? input.allowedTypes.map((item) => String(item))
      : fallback.allowedTypes,
    minResolution: Number(input?.minResolution || fallback.minResolution),
    removeBg: input?.removeBg ?? fallback.removeBg,
    printFormat: String(input?.printFormat || fallback.printFormat),
    printDpi: Number(input?.printDpi || fallback.printDpi),
    requireApproval: input?.requireApproval ?? fallback.requireApproval,
    frontPrintWidthCm: Number(input?.frontPrintWidthCm || fallback.frontPrintWidthCm),
    frontPrintHeightCm: Number(input?.frontPrintHeightCm || fallback.frontPrintHeightCm),
    backPrintWidthCm: Number(input?.backPrintWidthCm || fallback.backPrintWidthCm),
    backPrintHeightCm: Number(input?.backPrintHeightCm || fallback.backPrintHeightCm),
    pricingBands: {
      front: normalizeBands(input?.pricingBands?.front).length
        ? normalizeBands(input?.pricingBands?.front)
        : fallback.pricingBands.front,
      back: normalizeBands(input?.pricingBands?.back).length
        ? normalizeBands(input?.pricingBands?.back)
        : fallback.pricingBands.back,
    },
    surchargeVariantId: String((input as { surchargeVariantId?: unknown })?.surchargeVariantId || fallback.surchargeVariantId || ''),
    updatedAt: input?.updatedAt || fallback.updatedAt,
  };
}

export async function fetchShopifyProducts(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  query = "",
): Promise<ShopifyProductSummary[]> {
  const activeQuery = query ? `status:active ${query}` : "status:active";
  const response = await admin.graphql(
    `#graphql
    query Products($query: String!) {
      products(first: 50, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          productType
          status
          featuredImage {
            url
          }
          variants(first: 30) {
            nodes {
              id
              title
              price
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }`,
    { variables: { query: activeQuery } },
  );

  const payload = (await response.json()) as {
    data?: { products?: { nodes?: Array<Record<string, unknown>> } };
  };

  const nodes = payload.data?.products?.nodes ?? [];
  return nodes.map((node) => ({
    id: String(node.id || ""),
    title: String(node.title || ""),
    handle: String(node.handle || ""),
    productType: String(node.productType || ""),
    status: String(node.status || ""),
    featuredImage:
      node.featuredImage && typeof node.featuredImage === "object"
        ? String((node.featuredImage as { url?: string }).url || "")
        : null,
    images: [],
    variants:
      node.variants && typeof node.variants === "object"
        ? (((node.variants as { nodes?: Array<Record<string, unknown>> }).nodes ?? []).map((variant) => ({
            id: String(variant.id || ""),
            title: String(variant.title || ""),
            price: String(variant.price || ""),
            selectedOptions: Array.isArray(variant.selectedOptions)
              ? variant.selectedOptions.map((option) => ({
                  name: String((option as { name?: string }).name || ""),
                  value: String((option as { value?: string }).value || ""),
                }))
              : [],
          })) as ShopifyProductSummary["variants"])
        : [],
  }));
}

export async function fetchShopifyProductById(
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> },
  id: string,
): Promise<ShopifyProductSummary | null> {
  const response = await admin.graphql(
    `#graphql
    query Product($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        productType
        status
        featuredImage {
          url
        }
        images(first: 5) {
          nodes {
            url
          }
        }
        variants(first: 50) {
          nodes {
            id
            title
            price
            selectedOptions {
              name
              value
            }
            image {
              url
            }
          }
        }
      }
    }`,
    { variables: { id } },
  );
  const payload = (await response.json()) as {
    data?: { product?: Record<string, unknown> | null };
  };
  const product = payload.data?.product;
  if (!product) return null;
  const [mapped] = await Promise.resolve(
    ([
      {
        id: String(product.id || ""),
        title: String(product.title || ""),
        handle: String(product.handle || ""),
        productType: String(product.productType || ""),
        status: String(product.status || ""),
        featuredImage:
          product.featuredImage && typeof product.featuredImage === "object"
            ? String((product.featuredImage as { url?: string }).url || "")
            : null,
        images:
          product.images && typeof product.images === "object"
            ? (((product.images as { nodes?: Array<Record<string, unknown>> }).nodes ?? [])
                .map((img) => String((img as { url?: string }).url || ""))
                .filter(Boolean))
            : [],
        variants:
          product.variants && typeof product.variants === "object"
            ? (((product.variants as { nodes?: Array<Record<string, unknown>> }).nodes ?? []).map((variant) => ({
                id: String(variant.id || ""),
                title: String(variant.title || ""),
                price: String(variant.price || ""),
                selectedOptions: Array.isArray(variant.selectedOptions)
                  ? variant.selectedOptions.map((option) => ({
                      name: String((option as { name?: string }).name || ""),
                      value: String((option as { value?: string }).value || ""),
                    }))
                  : [],
                image: variant.image && typeof variant.image === "object"
                  ? String((variant.image as { url?: string }).url || "") || null
                  : null,
              })) as ShopifyProductSummary["variants"])
            : [],
      },
    ] as ShopifyProductSummary[]),
  );
  return mapped;
}

export async function getProductConfig(product: ShopifyProductSummary): Promise<ProductConfig> {
  const settings = await readSettingsMap();
  const fallback = buildDefaultConfig(product);
  const stored = settings[product.id];
  return stored ? normalizeProductConfig(stored, fallback) : fallback;
}

export async function saveProductConfig(productId: string, config: ProductConfig): Promise<void> {
  await ensureMigrations();
  await query(
    `INSERT INTO product_settings (product_id, config, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (product_id) DO UPDATE SET config = $2, updated_at = now()`,
    [productId, JSON.stringify(config)],
  );
}

export async function findConfigForStorefront(productId: string, handle: string) {
  const idKey = String(productId || "").trim();
  const handleKey = String(handle || "").trim();
  if (!idKey && !handleKey) return null;
  const settings = await readSettingsMap();
  const entry = Object.entries(settings).find(([storedId, value]) => {
    if (idKey && String(storedId).trim() === idKey) return true;
    return handleKey && String(value?.productHandle || "").trim() === handleKey;
  });
  if (!entry) return null;

  const [storedProductId, storedConfig] = entry;
  const fallback = buildDefaultConfig({
    title: String(storedConfig?.productTitle || ""),
    handle: String(storedConfig?.productHandle || handleKey),
    productType: String(storedConfig?.productType || "apparel"),
  });
  const config = normalizeProductConfig(storedConfig, fallback);
  const allAreas = await readPrintAreas();
  const printAreas = allAreas.filter((area) => area.productId === storedProductId);

  return {
    productId: storedProductId,
    settings: config,
    printAreas,
  };
}

export async function getProductPrintAreas(
  productId: string,
  productType: string,
  surfaceMode: SurfaceMode,
  config: ProductConfig,
): Promise<PrintAreaRecord[]> {
  const allAreas = await readPrintAreas();
  const overlay = defaultOverlayForType(productType);
  const mockup = defaultMockupBoundsForType(productType);

  const buildDefault = (side: "front" | "back"): PrintAreaRecord => ({
    id: `area_${randomBytes(8).toString("hex")}`,
    productId,
    name: side === "front" ? "Front Print" : "Back Print",
    side,
    mockupX: mockup[side].x,
    mockupY: mockup[side].y,
    mockupWidth: mockup[side].width,
    mockupHeight: mockup[side].height,
    x: overlay[side].x,
    y: overlay[side].y,
    width: overlay[side].width,
    height: overlay[side].height,
    realWidthMm: Math.round(
      ((side === "front" ? config.frontPrintWidthCm : config.backPrintWidthCm) || 0) * 10,
    ),
    realHeightMm: Math.round(
      ((side === "front" ? config.frontPrintHeightCm : config.backPrintHeightCm) || 0) * 10,
    ),
    safeMargin: 10,
    bleedMargin: 5,
    dpi: 300,
  });

  const front = allAreas.find((area) => area.productId === productId && area.side === "front") || buildDefault("front");
  const result = [front];

  if (surfaceMode === "front_back") {
    const back = allAreas.find((area) => area.productId === productId && area.side === "back") || buildDefault("back");
    result.push(back);
  }

  return result;
}

export async function saveProductPrintAreas(productId: string, areas: PrintAreaRecord[]): Promise<void> {
  await ensureMigrations();
  await query("DELETE FROM product_print_areas WHERE product_id = $1", [productId]);
  for (const a of areas) {
    await query(
      `INSERT INTO product_print_areas
         (id, product_id, side, name, mockup_x, mockup_y, mockup_width, mockup_height, mockup_image_url, x, y, width, height, real_width_mm, real_height_mm, safe_margin, bleed_margin, dpi, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
      [a.id, productId, a.side, a.name, a.mockupX, a.mockupY, a.mockupWidth, a.mockupHeight, a.mockupImageUrl ?? "",
       a.x, a.y, a.width, a.height, a.realWidthMm, a.realHeightMm, a.safeMargin, a.bleedMargin, a.dpi],
    );
  }
}
