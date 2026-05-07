import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { handleDesignerUpload } from "~/models/uploads.server";
import { authenticate } from "~/shopify.server";
import { findConfigByHandle } from "~/models/product-config.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const path = params["*"] ?? "";
  if (path === "personalization") {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    const config = findConfigByHandle(handle);
    if (!config) {
      return json({ error: "Not found" }, { status: 404 });
    }

    return json({
      product: {
        id: config.productId,
        title: config.settings.productTitle,
        handle: config.settings.productHandle,
        productType: config.settings.productType,
        surfaceMode: config.settings.surfaceMode,
      },
      settings: config.settings,
      printAreas: config.printAreas,
    });
  }

  return json({ ok: true, path });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const path = params["*"] ?? "";
  if (path === "upload") {
    return handleDesignerUpload(request);
  }
  return json({ error: "Not found" }, { status: 404 });
};
