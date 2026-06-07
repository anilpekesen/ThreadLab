import type { Order } from "~/models/orders.server";
import { getDesignByToken, type DesignRecord } from "~/models/designs.server";
import { uploadBytes, uploadFromUrl, uploadText } from "~/lib/google-drive.server";

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

async function uploadCopiesFromUrl(
  accessToken: string,
  folderId: string,
  names: string[],
  url: string,
  fallbackMime = "image/png",
): Promise<number> {
  if (!names.length || !url) return 0;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Source fetch failed (${res.status}): ${url}`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  const bytes = new Uint8Array(await res.arrayBuffer());

  await Promise.all(names.map((name) => uploadBytes(accessToken, folderId, name, mime, bytes)));
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
): Promise<number> {
  let uploaded = 0;
  const totalProducts = products.length;

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const quantity = Math.max(1, product.quantity || 1);
    const frontNames = Array.from({ length: product.frontPrint ? quantity : 0 }, (_, copy) =>
      printFileName("front", index, totalProducts, copy, quantity),
    );
    const backNames = Array.from({ length: product.backPrint ? quantity : 0 }, (_, copy) =>
      printFileName("back", index, totalProducts, copy, quantity),
    );

    uploaded += await uploadCopiesFromUrl(accessToken, folderId, frontNames, product.frontPrint);
    uploaded += await uploadCopiesFromUrl(accessToken, folderId, backNames, product.backPrint);

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
