import type { Order } from "~/models/orders.server";
import { setShopifyOrderDriveFolder } from "~/models/orders.server";
import { getDesignByToken, type DesignRecord } from "~/models/designs.server";
import {
  clearGeneratedOrderFiles,
  ensureSubfolder,
  uploadBytes,
  uploadFromUrl,
  uploadText,
} from "~/lib/google-drive.server";
import { query, withAdvisoryLock } from "~/lib/db.server";
import sharp from "sharp";

export interface DriveExportProduct {
  row: Order;
  rows: Order[];
  design: DesignRecord | null;
  frontPrint: string;
  backPrint: string;
  frontPreview: string;
  backPreview: string;
  quantity: number;
}

export function withOrderDriveExportLock<T>(
  shop: string,
  shopifyOrderId: string,
  callback: () => Promise<T>,
): Promise<T> {
  return withAdvisoryLock("google-drive-order", `${shop}:${shopifyOrderId}`, callback);
}

export async function ensureOrderDriveFolder(params: {
  shop: string;
  shopifyOrderId: string;
  accessToken: string;
  rootFolderId: string;
  folderName: string;
}): Promise<string> {
  // Query ALL rows for this order — a single UPDATE may not cover rows inserted
  // after the first export (e.g. a second webhook fires and importOrder adds a
  // new row with a different line_item_id before we reach this check).
  const existing = await query<{ drive_folder_id: string }>(
    `SELECT drive_folder_id FROM orders
     WHERE shop = $1 AND shopify_order_id = $2
       AND drive_folder_id IS NOT NULL
       AND drive_folder_id != ''
       AND drive_folder_id != 'pending'
     LIMIT 1`,
    [params.shop, params.shopifyOrderId],
  );
  const persistedId = existing.rows[0]?.drive_folder_id ?? null;

  // A persisted id is authoritative. A transient Drive lookup failure must
  // never be interpreted as permission to create a duplicate folder.
  if (persistedId) return persistedId;

  const folderId = await ensureSubfolder(
    params.accessToken,
    params.rootFolderId,
    params.folderName,
  );
  // Persist before uploading files so concurrent retries reuse this folder.
  await setShopifyOrderDriveFolder(params.shop, params.shopifyOrderId, folderId);
  return folderId;
}

function firstValue(values: Array<string | null | undefined>): string {
  return values.find((value) => Boolean(value && value.trim())) || "";
}

function productKey(row: Order): string {
  if (row.designToken) return `design:${row.designToken}`;
  const printUrl = row.designFrontPrintUrl || row.productionFileUrl || row.designBackPrintUrl || "";
  if (printUrl) return `file:${printUrl}`;
  return `row:${row.id}`;
}

function productPrefix(index: number, totalProducts: number): string {
  return totalProducts > 1 ? `${index + 1}-` : "";
}

function printFileName(side: "front" | "back", index: number, totalProducts: number, copy: number, quantity: number): string {
  const copySuffix = quantity > 1 ? `-${String(copy + 1).padStart(2, "0")}` : "";
  return `${productPrefix(index, totalProducts)}${side}-print${copySuffix}.png`;
}

async function getPrintAreaDimensions(shop: string, productId: string, side: "front" | "back") {
  if (!productId) return null;
  const result = await query<{ real_width_mm: number; real_height_mm: number; dpi: number }>(
    "SELECT real_width_mm, real_height_mm, dpi FROM product_print_areas WHERE shop = $1 AND product_id = $2 AND side = $3 LIMIT 1",
    [shop, productId, side],
  );
  const row = result.rows[0];
  if (!row?.real_width_mm || !row?.real_height_mm) return null;
  return { widthMm: row.real_width_mm, heightMm: row.real_height_mm, dpi: row.dpi || 300 };
}

async function normalizeToPhysicalSize(raw: Buffer, widthMm: number, heightMm: number, dpi: number): Promise<Buffer> {
  const pxW = Math.round((widthMm / 25.4) * dpi);
  const pxH = Math.round((heightMm / 25.4) * dpi);
  return sharp(raw)
    .resize(pxW, pxH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: false })
    .withMetadata({ density: dpi })
    .png()
    .toBuffer();
}

async function fetchWithRetry(url: string, maxAttempts = 5): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      // 429 (rate limit) ve 5xx geçici hatalar — yeniden dene
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Source fetch failed (${res.status}): ${url}`);
      }
      if (!res.ok) throw new Error(`Source fetch failed (${res.status}): ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        // exponential backoff + jitter: ~0.5s, 1s, 2s, 4s
        const delay = Math.min(500 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 300);
        console.warn(`[drive] fetch retry ${attempt}/${maxAttempts} in ${delay}ms: ${url}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Source fetch failed: ${url}`);
}

async function uploadCopiesFromUrl(
  accessToken: string,
  folderId: string,
  names: string[],
  url: string,
  printDimensions?: { widthMm: number; heightMm: number; dpi: number } | null,
): Promise<number> {
  if (!names.length || !url) return 0;

  const rawBuffer = await fetchWithRetry(url);

  let finalBuffer: Buffer;
  if (printDimensions) {
    finalBuffer = await normalizeToPhysicalSize(rawBuffer, printDimensions.widthMm, printDimensions.heightMm, printDimensions.dpi);
  } else {
    finalBuffer = rawBuffer;
  }

  const bytes = new Uint8Array(finalBuffer);
  await Promise.all(names.map((name) => uploadBytes(accessToken, folderId, name, "image/png", bytes)));
  return names.length;
}

export async function resolveDriveExportProducts(shop: string, rows: Order[]): Promise<DriveExportProduct[]> {
  const groups = new Map<string, Order[]>();
  for (const row of rows) {
    const key = productKey(row);
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  return Promise.all(
    Array.from(groups.values()).map(async (groupRows) => {
      const row = groupRows[0];
      const design = row.designToken
        ? await getDesignByToken(row.shop || shop, row.designToken).catch(() => null)
        : null;

      return {
        row,
        rows: groupRows,
        design,
        frontPrint: firstValue([
          design?.frontPrintUrl,
          ...groupRows.map((r) => r.designFrontPrintUrl),
          ...groupRows.map((r) => r.productionFileUrl),
        ]),
        backPrint: firstValue([
          design?.backPrintUrl,
          ...groupRows.map((r) => r.designBackPrintUrl),
        ]),
        frontPreview: firstValue([
          design?.frontPreviewUrl,
          ...groupRows.map((r) => r.designFrontPreviewUrl),
          ...groupRows.map((r) => r.previewUrl),
        ]),
        backPreview: firstValue([
          design?.backPreviewUrl,
          ...groupRows.map((r) => r.designBackPreviewUrl),
        ]),
        quantity: Math.max(1, groupRows.reduce((sum, r) => sum + (r.quantity ?? 1), 0)),
      };
    }),
  );
}

export function buildOrderDriveSummary(allRows: Order[]): string {
  if (!allRows.length) return "";
  const first = allRows[0];
  const multiProduct = new Set(allRows.map((r) => (r.productName || "").split(" - ")[0])).size > 1;
  const totalQty = allRows.reduce((sum, row) => sum + (row.quantity ?? 1), 0);
  const hasMissingSurcharge = allRows.some((row) => row.missingSurcharge);

  let variantSection: string[];
  if (multiProduct) {
    const productGroups = new Map<string, { variantTitle: string; quantity: number }[]>();
    for (const row of allRows) {
      const productName = (row.productName || "").split(" - ")[0] || "Ürün";
      const rows = productGroups.get(productName) || [];
      rows.push({ variantTitle: row.variantTitle, quantity: row.quantity ?? 1 });
      productGroups.set(productName, rows);
    }

    const lines: string[] = [];
    let index = 1;
    for (const [productName, variants] of productGroups) {
      lines.push(`  ${index++}. ${productName}`);
      for (const variant of variants) {
        lines.push(`     ${(variant.variantTitle || "-").padEnd(18)} x ${variant.quantity}`);
      }
    }
    variantSection = ["URUNLER", "-------------------------------", ...lines];
  } else {
    const variantRows = allRows
      .map((row) => `  ${(row.variantTitle || "-").padEnd(20)} x ${row.quantity ?? 1}`)
      .join("\n");
    variantSection = ["BEDENLER / RENKLER", "-------------------------------", variantRows || "  -"];
  }

  return [
    "SIPARIS",
    "-------------------------------",
    `Siparis No   : ${first.orderNumber || first.shopifyOrderId}`,
    `Musteri      : ${first.customerName || "-"}`,
    `E-posta      : ${first.customerEmail || "-"}`,
    `Urun         : ${(first.productName || "").split(" - ")[0] || "-"}`,
    `Durum        : ${first.productionStatus || "-"}`,
    hasMissingSurcharge ? "UYARI: Baski ucreti eksik" : "",
    `Tarih        : ${new Date(first.createdAt).toLocaleString("tr-TR")}`,
    `Aktarma      : ${new Date().toLocaleString("tr-TR")}`,
    "",
    ...variantSection,
    "-------------------------------",
    `TOPLAM ADET  : ${totalQty}`,
  ].filter(Boolean).join("\n");
}

export async function uploadOrderProductsToDrive(
  accessToken: string,
  folderId: string,
  products: DriveExportProduct[],
  shop?: string,
): Promise<number> {
  let uploaded = 0;
  const totalProducts = products.length;

  await clearGeneratedOrderFiles(accessToken, folderId);

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const quantity = Math.max(1, product.quantity || 1);
    const productId = product.row.productId ?? "";
    const productShop = product.row.shop || shop || "";

    const [frontDims, backDims] = await Promise.all([
      product.frontPrint && productShop && productId
        ? getPrintAreaDimensions(productShop, productId, "front")
        : Promise.resolve(null),
      product.backPrint && productShop && productId
        ? getPrintAreaDimensions(productShop, productId, "back")
        : Promise.resolve(null),
    ]);

    const frontNames = Array.from({ length: product.frontPrint ? quantity : 0 }, (_, copy) =>
      printFileName("front", index, totalProducts, copy, quantity),
    );
    const backNames = Array.from({ length: product.backPrint ? quantity : 0 }, (_, copy) =>
      printFileName("back", index, totalProducts, copy, quantity),
    );

    uploaded += await uploadCopiesFromUrl(accessToken, folderId, frontNames, product.frontPrint, frontDims);
    uploaded += await uploadCopiesFromUrl(accessToken, folderId, backNames, product.backPrint, backDims);

    const prefix = productPrefix(index, totalProducts);
    const sideFiles: Promise<unknown>[] = [];
    if (product.frontPreview) sideFiles.push(uploadFromUrl(accessToken, folderId, `${prefix}front-mockup.png`, product.frontPreview, "image/png"));
    if (product.backPreview) sideFiles.push(uploadFromUrl(accessToken, folderId, `${prefix}back-mockup.png`, product.backPreview, "image/png"));
    if (product.design?.designJson) {
      sideFiles.push(uploadText(accessToken, folderId, `${prefix}design.json`, JSON.stringify(product.design.designJson, null, 2), "application/json"));
    }
    await Promise.all(sideFiles);
    uploaded += sideFiles.length;
  }

  return uploaded;
}
