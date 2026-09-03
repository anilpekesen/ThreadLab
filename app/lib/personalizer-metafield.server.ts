import { shopifyGraphQL } from "~/lib/shopify.server";
import { getValidAccessToken } from "~/lib/session.server";

/**
 * Şablonu Shopify ürününe bağlayan metafield.
 *
 * Tema snippet'i `product.metafields.personalizer.template_id` okuyor. Bu değer
 * yazılmazsa uygulamadaki bağlantı mağaza tarafında hiçbir şey yapmıyor:
 * kişiselleştirme kutusu ürün sayfasında görünmüyor ve mağaza sahibi neden
 * çalışmadığını anlamıyor.
 *
 * Bu yüzden bağlama işlemi iki yere birden yazıyor — uygulamanın kendi
 * tablosuna (hangi şablonun hangi ürüne ait olduğu) ve Shopify metafield'ına
 * (temanın okuyacağı değer).
 */

const NAMESPACE = "personalizer";
const KEY = "template_id";

function productGid(productId: string): string {
  const clean = String(productId).trim();
  return clean.startsWith("gid://") ? clean : `gid://shopify/Product/${clean}`;
}

export interface MetafieldResult {
  ok: boolean;
  error?: string;
}

/** Ürüne şablon kimliğini yazar */
export async function setProductTemplateMetafield(
  shop: string,
  productId: string,
  templateId: string,
): Promise<MetafieldResult> {
  const token = await getValidAccessToken(shop);
  if (!token) return { ok: false, error: "Mağaza oturumu bulunamadı" };

  const mutation = `
    mutation setTemplate($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`;

  try {
    const res = await shopifyGraphQL(shop, token, mutation, {
      metafields: [{
        ownerId: productGid(productId),
        namespace: NAMESPACE,
        key: KEY,
        type: "single_line_text_field",
        value: templateId,
      }],
    });
    const body = await res.json();
    const errors = body?.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      return { ok: false, error: errors.map((e: { message: string }) => e.message).join(", ") };
    }
    if (body?.errors) {
      return { ok: false, error: JSON.stringify(body.errors).slice(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    console.error("[personalizer-metafield] yazılamadı:", err);
    return { ok: false, error: "Shopify'a yazılamadı" };
  }
}

/** Bağlantı kaldırılınca metafield da silinir; yoksa ürün sayfasında kutu asılı kalır */
export async function clearProductTemplateMetafield(
  shop: string,
  productId: string,
): Promise<MetafieldResult> {
  const token = await getValidAccessToken(shop);
  if (!token) return { ok: false, error: "Mağaza oturumu bulunamadı" };

  const mutation = `
    mutation clearTemplate($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields { key }
        userErrors { field message }
      }
    }`;

  try {
    const res = await shopifyGraphQL(shop, token, mutation, {
      metafields: [{ ownerId: productGid(productId), namespace: NAMESPACE, key: KEY }],
    });
    const body = await res.json();
    const errors = body?.data?.metafieldsDelete?.userErrors ?? [];
    if (errors.length > 0) {
      return { ok: false, error: errors.map((e: { message: string }) => e.message).join(", ") };
    }
    return { ok: true };
  } catch (err) {
    console.error("[personalizer-metafield] silinemedi:", err);
    return { ok: false, error: "Shopify'a yazılamadı" };
  }
}
