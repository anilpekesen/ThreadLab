import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { handleDesignerUpload } from "~/models/uploads.server";
import { authenticate } from "~/shopify.server";
import { findConfigForStorefront, toStorefrontSettings } from "~/models/product-config.server";
import { handleWaveSpeedRemoveBackground } from "~/models/background-removal.server";

const DATA_DIR = nodePath.join(process.cwd(), "data");
const DESIGNS_FILE = nodePath.join(DATA_DIR, "designs.json");

type DesignRecord = {
  token: string;
  [key: string]: unknown;
};

async function readDesigns(): Promise<DesignRecord[]> {
  try {
    return JSON.parse(await readFile(DESIGNS_FILE, "utf8")) as DesignRecord[];
  } catch {
    return [];
  }
}

async function writeDesigns(records: DesignRecord[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DESIGNS_FILE, JSON.stringify(records, null, 2));
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const appProxy = await authenticate.public.appProxy(request);
  const path = params["*"] ?? "";

  if (path === "designer") {
    const url = new URL(request.url);
    const iframeParams = new URLSearchParams(url.searchParams);
    iframeParams.delete("shop"); // will be injected via Liquid below
    const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
    const designerUrl = new URL("/designer-app/", appUrl);
    designerUrl.search = iframeParams.toString();
    const base = designerUrl.toString();
    const sep = base.includes("?") ? "&" : "?";
    // Liquid injects the real shop domain at render time — always reliable
    const iframeSrc = (base + sep + "shop={{ shop.permanent_domain }}").replace(/&/g, "&amp;");

    return appProxy.liquid(
      `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#f3f4f6}
  iframe{display:block;width:100%;height:100vh;border:0;background:#f3f4f6}
</style>
</head>
<body>
<iframe src="${iframeSrc}" allow="camera; microphone"></iframe>
</body>
</html>`,
      { layout: false },
    );
  }

  if (path === "personalization") {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    const config = await findConfigForStorefront(productId, handle);
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
      settings: toStorefrontSettings(config.settings),
      printAreas: config.printAreas,
    });
  }

  // GET /apps/tshirt-designer/designs/<token>
  const designsMatch = path.match(/^designs\/([^/]+)$/);
  if (designsMatch) {
    const token = decodeURIComponent(designsMatch[1]);
    const records = await readDesigns();
    const record = records.find((r) => r.token === token);
    if (!record) return json({ error: "Not found" }, { status: 404 });
    return json(record);
  }

  return json({ ok: true, path });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const proxy = await authenticate.public.appProxy(request);
  const shop = proxy.session?.shop ?? "unknown";
  const path = params["*"] ?? "";

  if (path === "upload") {
    return handleDesignerUpload(request);
  }

  if (path === "remove-background") {
    return handleWaveSpeedRemoveBackground(request, shop);
  }

  // POST /apps/tshirt-designer/designs
  if (path === "designs") {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const token = `d_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    const record: DesignRecord = { token, ...(body as object), createdAt: new Date().toISOString() };
    const records = await readDesigns();
    records.unshift(record);
    await writeDesigns(records.slice(0, 500));
    return json({ token });
  }

  return json({ error: "Not found" }, { status: 404 });
};
