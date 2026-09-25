import { randomBytes } from "node:crypto";
import { query } from "~/lib/db.server";
import {
  assertCanAddProduct,
  buildDefaultConfig,
  normalizeProductConfig,
  ProductLimitError,
  readPrintAreas,
  readSettingsMap,
  saveProductConfig,
  saveProductPrintAreas,
} from "~/models/product-config.server";
import { ensureCategoryForProduct } from "~/models/product-types.server";

/**
 * Toplu ürün kurulumu: bir ürünün kayıtlı tasarımcı ayarını (baskı alanları,
 * fiyat bantları, beden tablosu, kurallar, renk mockup'ları) seçilen ürünlere
 * kopyalar. Her hedefe kaynakla aynı adlı kategori satırı açılır: ayar o
 * satır olmadan yeniden başlatmada kapanıyor, aynı ad da plan sınırında tek
 * tür sayılıyor (bkz. getActiveProductTypeCount).
 *
 * Planın ürün sınırı (Ücretsiz planda 2) aşılıyorsa o ürün atlanır.
 */
export async function copyProductSetup(
  shop: string,
  sourceId: string,
  targets: Array<{ id: string; title: string; handle: string }>,
): Promise<{ copied: string[]; limited: string[]; missingSource?: boolean }> {
  const source = (await readSettingsMap(shop))[sourceId];
  if (!source || source.isActive === false) return { copied: [], limited: [], missingSource: true };

  const cat = (await query<{ name: string; product_type: string; surface_mode: "front_only" | "front_back" }>(
    "SELECT name, product_type, surface_mode FROM product_categories WHERE shop = $1 AND shopify_product_id = $2 AND deleted_at IS NULL LIMIT 1",
    [shop, sourceId],
  )).rows[0];
  const type = {
    name: cat?.name || String(source.productType || "apparel"),
    product_type: cat?.product_type || String(source.productType || "apparel"),
    surface_mode: cat?.surface_mode || (source.surfaceMode === "front_only" ? "front_only" as const : "front_back" as const),
  };
  const areas = (await readPrintAreas(shop)).filter((a) => a.productId === sourceId);

  const copied: string[] = [];
  const limited: string[] = [];
  for (const t of targets) {
    const label = t.title || t.id;
    try {
      await assertCanAddProduct(shop, t.id);
    } catch (err) {
      if (err instanceof ProductLimitError) { limited.push(label); continue; }
      throw err;
    }
    // Önce kategori: ayar kaydı ile yeniden başlatma arasında kapanmasın
    await ensureCategoryForProduct(shop, t, type);
    const fallback = buildDefaultConfig({ title: t.title, handle: t.handle, productType: type.product_type });
    const cfg = normalizeProductConfig(
      { ...source, isActive: true, productTitle: t.title, productHandle: t.handle, updatedAt: new Date().toISOString() },
      fallback,
    );
    try {
      await saveProductConfig(shop, t.id, cfg);
    } catch (err) {
      if (err instanceof ProductLimitError) { limited.push(label); continue; }
      throw err;
    }
    if (areas.length) {
      await saveProductPrintAreas(shop, t.id, areas.map((a) => ({
        ...a,
        id: `${a.side}_${randomBytes(5).toString("hex")}`,
        productId: t.id,
      })));
    }
    copied.push(label);
  }
  return { copied, limited };
}
