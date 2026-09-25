import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";
import type { ProductConfig } from "~/models/product-config.server";
import { getGlobalSettings } from "~/models/global-settings.server";
import { getShopSettings } from "~/models/shop-settings.server";

/**
 * Sepet fonksiyonunun güvendiği fiyat kaydı.
 *
 * Baskı ücreti tasarımcıda (tarayıcıda) hesaplanıp sepete gizli alan olarak
 * yazılıyor; bu alanlar müşteri tarafından değiştirilebilir. Fonksiyon eskiden
 * bu değerleri olduğu gibi fiyat yapıyordu: herhangi bir ürün 0,01'e alınabilirdi.
 *
 * Artık uygulama her PrintLab ürününe yalnız kendisinin yazabildiği bir
 * metafield yazar ($app:printlab / pricing). Fonksiyon:
 *   - ürün fiyatını Shopify'daki gerçek fiyattan alır,
 *   - baskı ücreti ürününü bu kayıttan alır (sepetteki kimliği yok sayar),
 *   - baskı ücretini buradaki en düşük bant fiyatının altına indirmez,
 *   - kaydı olmayan ürüne hiç dokunmaz.
 */

const NAMESPACE = "$app:printlab";
const KEY = "pricing";

export interface PricingRecord {
  v: 1;
  /** Baskı ücreti varyantı (gid) */
  s: string;
  /** Ön ve arka yüz için en düşük bant ücreti (mağaza para birimi, tam birim) */
  f: number;
  b: number;
  /** En yüksek toplu alım indirimi yüzdesi: alt sınır bununla düşürülür */
  d: number;
  /** Kişiselleştirici ek ücretinin zorunlu kısmı (sabit ücret + zorunlu
   *  seçeneklerin en ucuzu); ürüne bağlı şablonlar arasında en düşüğü */
  o: number;
}

function minBand(bands: { surcharge: number }[] | undefined): number {
  const values = (bands ?? []).map((b) => Number(b.surcharge)).filter((n) => Number.isFinite(n) && n >= 0);
  return values.length ? Math.min(...values) : 0;
}

export async function resolveSurchargeVariantId(shop: string, config: Pick<ProductConfig, "surchargeVariantId">): Promise<string> {
  if (config.surchargeVariantId) return String(config.surchargeVariantId);
  const [shopSettings, globalSettings] = await Promise.all([
    getShopSettings(shop).catch(() => null),
    getGlobalSettings().catch(() => null),
  ]);
  return String(shopSettings?.surchargeVariantId || globalSettings?.surchargeVariantId || "");
}

export async function buildPricingRecord(shop: string, config: ProductConfig, optionFloor = 0): Promise<PricingRecord | null> {
  const variantId = (await resolveSurchargeVariantId(shop, config)).split("/").pop() ?? "";
  if (!variantId) return null;
  const discounts = (config.volumeDiscounts ?? []).map((t) => Number(t.percentage)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    v: 1,
    s: `gid://shopify/ProductVariant/${variantId}`,
    f: minBand(config.pricingBands?.front),
    b: minBand(config.pricingBands?.back),
    d: discounts.length ? Math.min(100, Math.max(...discounts)) : 0,
    o: optionFloor,
  };
}

/**
 * Ürünün fiyat kaydını yazar (ya da ücret ürünü yoksa siler). Hata ürün
 * kaydını engellemez; sonuç döner.
 */
export async function syncProductPricingMetafield(
  shop: string,
  productId: string,
  config: ProductConfig,
  optionFloor?: number,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getValidAccessToken(shop);
  if (!token) return { ok: false, error: "no session" };
  const ownerId = String(productId).startsWith("gid://") ? String(productId) : `gid://shopify/Product/${productId}`;
  const floor = optionFloor ?? await optionFloorForProduct(shop, ownerId.split("/").pop() ?? "");
  const record = config.isActive ? await buildPricingRecord(shop, config, floor) : null;

  try {
    if (!record) {
      const res = await shopifyGraphQL(shop, token, `mutation($m: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $m) { userErrors { message } } }`, {
        m: [{ ownerId, namespace: NAMESPACE, key: KEY }],
      });
      const body = await res.json();
      const errs = body?.data?.metafieldsDelete?.userErrors ?? [];
      return errs.length ? { ok: false, error: errs.map((e: { message: string }) => e.message).join(", ") } : { ok: true };
    }
    const res = await shopifyGraphQL(shop, token, `mutation($m: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $m) { userErrors { field message } } }`, {
      m: [{ ownerId, namespace: NAMESPACE, key: KEY, type: "json", value: JSON.stringify(record) }],
    });
    const body = await res.json();
    const errs = body?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) return { ok: false, error: errs.map((e: { message: string }) => e.message).join(", ") };
    if (body?.errors) return { ok: false, error: JSON.stringify(body.errors).slice(0, 200) };
    return { ok: true };
  } catch (err) {
    console.error("[pricing-metafield] yazılamadı:", err);
    return { ok: false, error: "write failed" };
  }
}

/** Ürüne bağlı şablonların zorunlu ek ücretlerinin en düşüğü; şablon yoksa 0 */
async function optionFloorForProduct(shop: string, productNumericId: string): Promise<number> {
  if (!productNumericId) return 0;
  const { optionPricingForProduct } = await import("~/models/personalizer.server");
  const { minimumOptionFee } = await import("~/lib/option-pricing");
  const list = await optionPricingForProduct(shop, productNumericId).catch(() => []);
  return list.length ? Math.min(...list.map(minimumOptionFee)) : 0;
}

/**
 * Bir ürünün fiyat kaydını kayıtlı ayarından ya da (yalnız kişileştirici
 * şablonu bağlıysa) tasarımcının kullandığı varsayılan ayardan yeniden yazar.
 */
export async function syncPricingForProduct(shop: string, productId: string): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const { query } = await import("~/lib/db.server");
  const { buildDefaultConfig, normalizeProductConfig } = await import("~/models/product-config.server");
  const gid = String(productId).startsWith("gid://") ? String(productId) : `gid://shopify/Product/${productId}`;
  const numeric = gid.split("/").pop() ?? "";
  const stored = await query<{ config: unknown }>(
    "SELECT config FROM product_settings WHERE shop = $1 AND (product_id = $2 OR product_id = $3)",
    [shop, gid, numeric],
  );
  const link = await query<{ product_title: string; product_handle: string }>(
    "SELECT product_title, product_handle FROM personalizer_product_links WHERE shop = $1 AND product_id = $2 LIMIT 1",
    [shop, numeric],
  );
  const fallback = buildDefaultConfig({ title: link.rows[0]?.product_title ?? "", handle: link.rows[0]?.product_handle ?? "", productType: "apparel" });
  let config = stored.rows[0] ? normalizeProductConfig(stored.rows[0].config as never, fallback) : null;
  // Ayarı kapalı ya da hiç yok ama şablon bağlı: tasarımcı yine açılır, varsayılan bantlarla
  if ((!config || !config.isActive) && link.rows[0]) config = { ...fallback, isActive: true };
  if (!config) return { ok: true, skipped: true };
  return syncProductPricingMetafield(shop, gid, config);
}

/** Mağazanın tüm PrintLab ürünlerinin fiyat kaydını yeniden yazar (ör. ücret ürünü değişince) */
export async function syncPricingForShop(shop: string): Promise<{ total: number; failed: number }> {
  const { query } = await import("~/lib/db.server");
  const r = await query<{ pid: string }>(
    `SELECT DISTINCT regexp_replace(product_id, '^.*/', '') AS pid FROM product_settings WHERE shop = $1
     UNION SELECT DISTINCT product_id FROM personalizer_product_links WHERE shop = $1`,
    [shop],
  );
  let failed = 0;
  for (const row of r.rows) {
    const res = await syncPricingForProduct(shop, row.pid).catch(() => ({ ok: false }));
    if (!res.ok) failed++;
  }
  return { total: r.rows.length, failed };
}
