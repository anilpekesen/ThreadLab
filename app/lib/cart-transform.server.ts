// Ensures the Cart Transform Function is registered (`cartTransformCreate`)
// for the shop. Without this, deploying the function alone has no runtime
// effect — Shopify silently skips it.
//
// Called from the app layout loader so every admin page load self-heals
// stale registrations after a function redeploy.

type Admin = { graphql: (query: string, options?: unknown) => Promise<Response> };

const checkedShops = new Map<string, number>();
const CACHE_MS = 6 * 60 * 60 * 1000; // 6h

export function ensureCartTransformRegistered(admin: Admin, shop: string): void {
  const last = checkedShops.get(shop) ?? 0;
  if (Date.now() - last < CACHE_MS) return;
  checkedShops.set(shop, Date.now());

  (async () => {
    try {
      const res = await admin.graphql(`#graphql
        {
          cartTransforms(first: 10) { nodes { id functionId } }
          shopifyFunctions(first: 50) { nodes { id title apiType } }
        }
      `);
      const data = (await res.json()) as {
        data?: {
          cartTransforms?: { nodes?: Array<{ id: string; functionId: string }> };
          shopifyFunctions?: { nodes?: Array<{ id: string; title: string; apiType: string }> };
        };
      };
      const transforms = data.data?.cartTransforms?.nodes ?? [];
      const functions = data.data?.shopifyFunctions?.nodes ?? [];
      const cartFn = functions.find(
        (f) => f.apiType === "cart_transform" || f.apiType === "purchase.cart-transform.run",
      );
      if (!cartFn) return;

      const alreadyRegistered = transforms.some((t) => t.functionId === cartFn.id);
      if (alreadyRegistered) return;

      for (const t of transforms) {
        await admin.graphql(`#graphql
          mutation { cartTransformDelete(id: "${t.id}") { userErrors { message } } }
        `).catch(() => {});
      }
      await admin.graphql(`#graphql
        mutation { cartTransformCreate(functionId: "${cartFn.id}") {
          cartTransform { id }
          userErrors { message }
        }}
      `).catch(() => {});
    } catch {
      checkedShops.delete(shop);
    }
  })();
}
