import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDesignByToken } from "~/models/designs.server";
import { readPrintAreas, type PrintAreaRecord } from "~/models/product-config.server";
import { renderPrintFile } from "~/lib/print-file-render.server";

/**
 * Baskı dosyasını tasarım JSON'undan sunucuda yeniden üretir.
 *
 * Tarayıcıda üretilen dosyanın bozuk çıktığı siparişler için kurtarma yolu
 * (bkz. print-file-render.server.ts). Depolanan dosya sağlamsa oraya
 * yönlendirilir — gereksiz yere yeniden çizmiyoruz.
 */

/** designs.product_id sade sayı, product_print_areas.product_id gid:// formatında. */
function sameProduct(a: string, b: string): boolean {
  const idOf = (value: string) => String(value ?? "").trim().split("/").pop() ?? "";
  const left = idOf(a);
  return Boolean(left) && left === idOf(b);
}

/** Ürünün kayıtlı baskı alanı yoksa tasarımcının kullandığı varsayılanlar. */
const FALLBACK_AREA = {
  x: 100,
  y: 130,
  width: 280,
  height: 390,
  placementWidthMm: 280,
  placementHeightMm: 450,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const shop = url.searchParams.get("shop") ?? "";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";

  if (!token) return json({ error: "token required" }, { status: 400 });

  const design = await getDesignByToken(shop, token);
  if (!design) return json({ error: "Design not found" }, { status: 404 });

  const areas: PrintAreaRecord[] = await readPrintAreas(shop).catch(() => []);
  const stored = areas.find(
    (candidate) => candidate.side === side && sameProduct(design.productId ?? "", candidate.productId),
  );
  const area = stored ?? FALLBACK_AREA;

  const placementMm = area.placementWidthMm || FALLBACK_AREA.placementWidthMm;
  const dpi = Number(url.searchParams.get("dpi")) || (stored?.dpi ?? 300);
  const targetWidthPx = Math.round((placementMm / 25.4) * dpi);

  let rendered;
  try {
    rendered = await renderPrintFile({
      designJson: design.designJson,
      side,
      area: { x: area.x, y: area.y, width: area.width, height: area.height },
      targetWidthPx,
    });
  } catch (err) {
    console.error("[print-file] render failed", token, side, err);
    return json({ error: "Render failed" }, { status: 500 });
  }

  if (!rendered) {
    return json({ error: "Nothing to render for this side" }, { status: 404 });
  }

  return new Response(new Uint8Array(rendered.buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="baski-${token}-${side}.png"`,
      "Cache-Control": "private, max-age=3600",
      // Atlanan nesneler varsa çağıran taraf bilsin — dosya eksik olabilir
      "X-Print-Skipped": rendered.skipped.join(",") || "none",
      "X-Print-Size": `${rendered.width}x${rendered.height}`,
    },
  });
};
