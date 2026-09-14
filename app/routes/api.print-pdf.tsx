import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/lib/authenticate.server";
import { query } from "~/lib/db.server";
import { getOrdersByIds } from "~/models/orders.server";
import { getPersonalizerTemplate, templatePieces } from "~/models/personalizer.server";
import { getPrintProduct } from "~/models/print-product.server";
import { getR2KeyFromPublicUrl, getR2Object } from "~/lib/r2.server";
import { buildCutMarkPdf, type PrintPdfSpec } from "~/lib/print-pdf.server";

/**
 * Çerçeve/kolaj siparişinin bir parçasını kesim çizgili PDF olarak verir.
 *
 * PDF sipariş anında üretilmiyor: çoğu sipariş PNG ile basılıyor ve her
 * siparişte fazladan dosya üretmek depoyu ve süreyi boşa harcar. Operatör
 * düğmeye bastığında kayıtlı baskı dosyasından o an üretiliyor.
 *
 * Ölçü, render anında tasarım kaydına yazılan baskı ölçüsünden okunuyor;
 * o bilgiden önceki siparişlerde şablonun bugünkü baskı ölçüsüne düşülüyor.
 */

interface DesignPiece {
  id?: string;
  name?: string;
  url?: string;
  print?: Partial<PrintPdfSpec>;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate(request);
  const shop = session.shop;
  const params = new URL(request.url).searchParams;
  const orderId = params.get("id") ?? "";
  const pieceIndex = Math.max(0, Number(params.get("piece") ?? 0) || 0);

  const [order] = await getOrdersByIds(shop, [orderId]);
  if (!order?.designToken) return new Response("Sipariş ya da tasarım bulunamadı", { status: 404 });

  // Sipariş sayfasıyla aynı kural: önce bu mağazanın tasarımı, yoksa yalnızca
  // token. Üreticiye devredilen siparişte (PrintLabHub) tasarım başka mağazada
  // duruyor; token global benzersiz olduğu için bu güvenli.
  type Row = { shop: string; front_print_url: string; design_json: Record<string, unknown> | null };
  const own = await query<Row>(
    "SELECT shop, front_print_url, design_json FROM designs WHERE token = $1 AND shop = $2 LIMIT 1",
    [order.designToken, shop],
  );
  const design = own.rows[0] ?? (await query<Row>(
    "SELECT shop, front_print_url, design_json FROM designs WHERE token = $1 LIMIT 1",
    [order.designToken],
  )).rows[0];
  const json = design?.design_json ?? null;
  if (!design || json?.type !== "personalizer-slots") {
    return new Response("Kesim çizgili PDF yalnızca çerçeve ve kolaj siparişlerinde var", { status: 400 });
  }

  const pieces: DesignPiece[] = Array.isArray(json.pieces) ? (json.pieces as DesignPiece[]) : [];
  const piece: DesignPiece | undefined = pieces[pieceIndex]
    ?? (pieceIndex === 0 ? { url: design.front_print_url } : undefined);
  if (!piece?.url) return new Response("Parça bulunamadı", { status: 404 });

  const spec = await resolveSpec(piece, String(json.templateId ?? ""), design.shop);
  if (!spec) return new Response("Bu parçanın baskı ölçüsü bulunamadı", { status: 404 });

  // Dosya yalnızca kendi depomuzdaki baskı klasöründen okunuyor
  const key = getR2KeyFromPublicUrl(piece.url, ["personalizer-print/"]);
  if (!key) return new Response("Baskı dosyası beklenen konumda değil", { status: 400 });

  try {
    const png = await getR2Object(key);
    const pdf = await buildCutMarkPdf(png, spec, {
      title: `${order.orderNumber} ${String(json.templateName ?? "")}`.trim(),
      subtitle: pieces.length > 1 ? (piece.name || `${pieceIndex + 1}. parça`) : undefined,
    });
    const base = `${order.orderNumber || "siparis"}${pieces.length > 1 ? `-${pieceIndex + 1}` : ""}`
      .replace(/[^a-zA-Z0-9_\-#]/g, "_");
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[print-pdf] üretilemedi:", err);
    return new Response("PDF üretilemedi", { status: 500 });
  }
};

async function resolveSpec(piece: DesignPiece, templateId: string, shop: string): Promise<PrintPdfSpec | null> {
  const p = piece.print;
  if (p && p.width_mm && p.height_mm && p.dpi) {
    return { width_mm: p.width_mm, height_mm: p.height_mm, bleed_mm: p.bleed_mm ?? 0, dpi: p.dpi };
  }
  if (!templateId) return null;
  const template = await getPersonalizerTemplate(templateId, shop);
  if (!template) return null;
  const all = templatePieces(template);
  const match = all.find((x) => x.id === piece.id) ?? (all.length === 1 ? all[0] : undefined);
  if (!match?.print_product_id) return null;
  const product = await getPrintProduct(match.print_product_id, shop);
  if (!product) return null;
  return { width_mm: product.width_mm, height_mm: product.height_mm, bleed_mm: product.bleed_mm, dpi: product.dpi };
}
