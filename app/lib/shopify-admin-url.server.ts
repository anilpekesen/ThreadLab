const DEFAULT_EMBEDDED_APP_HANDLE = "printlabapp";

function storeHandleFromShop(shop: string): string {
  return shop
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.myshopify\.com$/i, "")
    .trim();
}

export function buildEmbeddedAppAdminUrl(shop: string, appPath: string): string | null {
  const storeHandle = storeHandleFromShop(shop);
  if (!storeHandle) return null;

  const appHandle = process.env.SHOPIFY_ADMIN_APP_HANDLE || DEFAULT_EMBEDDED_APP_HANDLE;
  const path = appPath.startsWith("/") ? appPath : `/${appPath}`;

  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(appHandle)}${path}`;
}
