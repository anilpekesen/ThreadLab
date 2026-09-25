import { query } from "~/lib/db.server";
import { getValidAccessToken } from "~/lib/session.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import { getShopSettings } from "~/models/shop-settings.server";
import { sendEmail } from "~/lib/email.server";
import { sendWhatsAppMessage } from "~/lib/whatsapp.server";

/**
 * Sipariş sonrası baskı ücreti kontrolü (fiyat güvenliğinin 2. aşaması).
 *
 * Baskı ücreti tarayıcıda hesaplanıyor; sepet fonksiyonu yalnız en ucuz bant
 * alt sınırını zorlayabiliyor. Müşteri baskısını küçük gösterirse büyük bir
 * baskı için ucuz bandı ödeyebilir. Sipariş gelince tasarım kayıtlı Fabric
 * verisinden, tasarımcıyla aynı formüllerle yeniden fiyatlanır; ödenen ücret
 * belirgin biçimde düşükse siparişe etiket eklenir ve kayda geçer.
 *
 * Yanlış alarm vermemek için hesap müşteri lehine yapılır: her beden denenip
 * en düşük sonuç alınır, ölçüler %3 küçük kabul edilir, 0,5 birim tolerans.
 */

// Tasarımcı tuvali (designer-ui App.tsx: CANVAS_W/H)
const CANVAS_W = 480;
const CANVAS_H = 580;
const LENIENCY = 0.97;
const ABS_TOLERANCE = 0.5;
export const PRICE_CHECK_TAG = "PrintLab-price-check";

interface Band { maxWidthCm: number | null; maxHeightCm: number | null; maxAreaCm2?: number | null; surcharge: number; label?: string }
interface Area { x: number; y: number; width: number; height: number; placementWidthMm: number; placementHeightMm: number; realWidthMm: number; realHeightMm: number }
interface SizeChart { referenceSize?: string; entries?: { size: string; widthCm: number; heightCm: number }[] }
interface FabricObj { width?: number; height?: number; scaleX?: number; scaleY?: number; angle?: number; strokeWidth?: number; strokeUniform?: boolean; isTemplatePlaceholder?: boolean }

const round1 = (v: number) => Math.round(v * 10) / 10;

function scaleAreaForSize(area: Area, chart: SizeChart | undefined, size: string | null): Area {
  if (!chart?.entries?.length || !size) return area;
  const ref = chart.entries.find((e) => e.size === chart.referenceSize) ?? chart.entries[0];
  const target = chart.entries.find((e) => e.size === size);
  if (!ref || !target || !(ref.widthCm > 0) || !(target.widthCm > 0)) return area;
  const wr = target.widthCm / ref.widthCm;
  const hr = ref.heightCm > 0 && target.heightCm > 0 ? target.heightCm / ref.heightCm : wr;
  return {
    ...area,
    placementWidthMm: (area.placementWidthMm || area.realWidthMm) * wr,
    placementHeightMm: (area.placementHeightMm || area.realHeightMm) * hr,
  };
}

/** Fabric getBoundingRect(true, true) karşılığı: ölçek, çizgi ve dönüş dahil dış sınır */
function boundingSize(o: FabricObj): { w: number; h: number } {
  const sw = Number(o.strokeWidth ?? 0) || 0;
  const sx = Math.abs(Number(o.scaleX ?? 1));
  const sy = Math.abs(Number(o.scaleY ?? 1));
  const w = o.strokeUniform ? Number(o.width ?? 0) * sx + sw : (Number(o.width ?? 0) + sw) * sx;
  const h = o.strokeUniform ? Number(o.height ?? 0) * sy + sw : (Number(o.height ?? 0) + sw) * sy;
  const a = (Number(o.angle ?? 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { w: w * c + h * s, h: w * s + h * c };
}

function bandFor(bands: Band[], widthCm: number, heightCm: number): Band | null {
  const area = widthCm * heightCm;
  for (const b of bands) {
    const hasDim = b.maxWidthCm != null && b.maxHeightCm != null;
    if (hasDim && widthCm <= Number(b.maxWidthCm) && heightCm <= Number(b.maxHeightCm)) return b;
    if (!hasDim && (b.maxAreaCm2 == null || area <= Number(b.maxAreaCm2))) return b;
  }
  return bands[bands.length - 1] ?? null;
}

/** Bir yüzün ham (indirimsiz) birim baskı ücreti */
function sideSurcharge(canvasJson: string | undefined, area: Area, bands: Band[]): { amount: number; pieces: { w: number; h: number; band: string }[] } {
  if (!canvasJson) return { amount: 0, pieces: [] };
  let parsed: { objects?: FabricObj[] };
  try { parsed = JSON.parse(canvasJson); } catch { return { amount: 0, pieces: [] }; }
  const areaW = (area.width / 480) * CANVAS_W;
  const areaH = (area.height / 580) * CANVAS_H;
  const pieces: { w: number; h: number; band: string }[] = [];
  let amount = 0;
  for (const o of parsed.objects ?? []) {
    if (o.isTemplatePlaceholder === true) continue;
    const { w, h } = boundingSize(o);
    if (!(w > 0) || !(h > 0)) continue;
    const widthCm = round1(w * ((area.placementWidthMm / 10) / Math.max(areaW, 1)) * LENIENCY);
    const heightCm = round1(h * ((area.placementHeightMm / 10) / Math.max(areaH, 1)) * LENIENCY);
    const band = bandFor(bands, widthCm, heightCm);
    const fee = Number(band?.surcharge ?? 0);
    amount += fee;
    pieces.push({ w: widthCm, h: heightCm, band: band?.label ?? "" });
  }
  return { amount, pieces };
}

function discountFor(tiers: { minQuantity: number; percentage: number }[] | undefined, qty: number): number {
  const t = (tiers ?? []).filter((x) => x.minQuantity > 0 && x.percentage > 0 && qty >= x.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0];
  return t?.percentage ?? 0;
}

/** Tasarımcının bu ürün için kullandığı ayarlar: aynı kaynaktan (designer-config) */
async function designerContext(shop: string, productNumericId: string) {
  const { loader } = await import("~/routes/api.designer-config");
  const url = `http://internal/api/designer-config?shop=${encodeURIComponent(shop)}&productId=${productNumericId}&handle=`;
  const res = (await loader({ request: new Request(url), params: {}, context: {} } as never)) as Response;
  if (!res.ok) return null;
  return (await res.json()) as {
    settings?: { pricingBands?: { front?: Band[]; back?: Band[] }; volumeDiscounts?: { minQuantity: number; percentage: number }[]; sizeChart?: SizeChart };
    printAreas?: (Area & { side: "front" | "back" })[];
  };
}

export interface LineCheck {
  token: string;
  quantity: number;
  paid: number;
  expected: number;
  underpaid: boolean;
  detail: unknown;
}

/**
 * Siparişi yeniden fiyatlar. Eksik ödenen satır varsa siparişe etiket
 * ekler; sonucu order_price_checks tablosuna yazar.
 */
export async function checkOrderPrintPricing(shop: string, orderId: string, opts: { dryRun?: boolean } = {}): Promise<LineCheck[]> {
  const token = await getValidAccessToken(shop);
  if (!token) return [];
  const orderGid = String(orderId).startsWith("gid://") ? String(orderId) : `gid://shopify/Order/${orderId}`;
  const r = await (await shopifyGraphQL(shop, token, `query($id: ID!) { order(id: $id) { id name
    lineItems(first: 100) { nodes { quantity product { id } variant { title }
      originalUnitPriceSet { shopMoney { amount } }
      lineItemGroup { id } customAttributes { key value } } } } }`, { id: orderGid })).json();
  const order = r?.data?.order;
  if (!order) return [];

  type Li = { quantity: number; product?: { id: string }; variant?: { title?: string }; originalUnitPriceSet: { shopMoney: { amount: string } }; lineItemGroup?: { id: string }; customAttributes: { key: string; value: string }[] };
  const items = order.lineItems.nodes as Li[];
  const attr = (li: Li, k: string) => li.customAttributes.find((a) => a.key === k)?.value ?? "";
  const groups = new Map<string, { base?: Li; fee?: Li }>();
  for (const [i, li] of items.entries()) {
    const gid = li.lineItemGroup?.id;
    if (!gid) {
      // Bölünmemiş ama tasarımlı satır: ek ücretli kişiselleştirici satırı
      // sepet fonksiyonundan kaçırılmış olabilir (ödenen ücret 0)
      if (attr(li, "_design_token")) groups.set(`single:${i}`, { base: li });
      continue;
    }
    const g = groups.get(gid) ?? {};
    const role = attr(li, "_design_role");
    if (role === "base_expanded") g.base = li;
    else if (role === "surcharge_child") g.fee = li;
    groups.set(gid, g);
  }

  // Toplu indirim, aynı tasarımın tüm bedenlerinin toplam adedine göre seçilir
  const qtyByToken = new Map<string, number>();
  for (const g of groups.values()) {
    const t = g.base ? attr(g.base, "_design_token") : "";
    if (t) qtyByToken.set(t, (qtyByToken.get(t) ?? 0) + g.base!.quantity);
  }

  const results: LineCheck[] = [];
  for (const g of groups.values()) {
    if (!g.base) continue;
    const designToken = attr(g.base, "_design_token");
    const productNumeric = g.base.product?.id?.split("/").pop() ?? "";
    if (!designToken || !productNumeric) continue;
    const d = (await query<{ design_json: { type?: string; optionFee?: number; front?: string; back?: string } | null }>(
      "SELECT design_json FROM designs WHERE token = $1 AND shop = $2", [designToken, shop])).rows[0];
    if (!d?.design_json) continue;

    // Kişiselleştirici: ek ücreti sunucu sepete eklerken hesaplayıp kayda yazdı
    if (d.design_json.type === "personalizer-slots") {
      const expected = Math.round(Number(d.design_json.optionFee ?? 0) * 100) / 100;
      if (!(expected > 0)) continue;
      const paid = g.fee ? Number(g.fee.originalUnitPriceSet.shopMoney.amount) : 0;
      results.push({ token: designToken, quantity: g.base.quantity, paid, expected, underpaid: paid + ABS_TOLERANCE < expected, detail: { kind: "options", measurable: true } });
      continue;
    }
    // Tasarımcı satırı: ücret satırı yoksa ürün baskı ücretli değildir
    if (!g.fee) continue;
    const ctx = await designerContext(shop, productNumeric).catch(() => null);
    if (!ctx) continue;
    const bands = ctx.settings?.pricingBands ?? {};
    const areas = new Map((ctx.printAreas ?? []).map((a) => [a.side, a]));
    const chart = ctx.settings?.sizeChart;
    const sizes: (string | null)[] = [null, ...(chart?.entries ?? []).map((e) => e.size)];

    // Önizlenen beden bilinmiyor: her beden için hesaplayıp müşteri lehine en düşüğü al
    let best: { total: number; front: unknown; back: unknown } | null = null;
    for (const size of sizes) {
      const fa = areas.get("front"), ba = areas.get("back");
      const front = fa ? sideSurcharge(d.design_json.front, scaleAreaForSize(fa, chart, size), bands.front ?? []) : { amount: 0, pieces: [] };
      const back = ba ? sideSurcharge(d.design_json.back, scaleAreaForSize(ba, chart, size), bands.back ?? []) : { amount: 0, pieces: [] };
      const total = front.amount + back.amount;
      if (!best || total < best.total) best = { total, front, back };
    }
    const pct = discountFor(ctx.settings?.volumeDiscounts, qtyByToken.get(designToken) ?? g.base.quantity);
    const expected = Math.round(best!.total * (1 - pct / 100) * 100) / 100;
    const paid = Number(g.fee.originalUnitPriceSet.shopMoney.amount);
    // Kayıtlı tasarımda ölçülebilir baskı nesnesi yoksa (ör. sunucuda üretilen
    // şablon tasarımları) doğrulanamaz: işaretlenmez, öyle kaydedilir
    const measurable = (best!.front as { pieces: unknown[] }).pieces.length + (best!.back as { pieces: unknown[] }).pieces.length > 0;
    const underpaid = measurable && paid + ABS_TOLERANCE < expected;
    results.push({ token: designToken, quantity: g.base.quantity, paid, expected, underpaid, detail: { front: best!.front, back: best!.back, discount: pct, measurable } });
  }

  if (opts.dryRun) return results;
  for (const res of results) {
    await query(
      `INSERT INTO order_price_checks (shop, order_id, order_name, design_token, quantity, paid, expected, underpaid, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (shop, order_id, design_token) DO UPDATE SET paid = $6, expected = $7, underpaid = $8, detail = $9, checked_at = now()`,
      [shop, order.id, order.name, res.token, res.quantity, res.paid, res.expected, res.underpaid, JSON.stringify(res.detail)],
    );
  }

  if (results.some((x) => x.underpaid)) {
    await shopifyGraphQL(shop, token, `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
      { id: order.id, tags: [PRICE_CHECK_TAG] }).catch((err) => console.error("[price-check] etiket eklenemedi:", err));
    await notifyMerchant(shop, order.name, results.filter((x) => x.underpaid)).catch((err) => console.error("[price-check] bildirim gönderilemedi:", err));
    console.warn(`[price-check] ${shop} ${order.name}: eksik baskı ücreti`, results.filter((x) => x.underpaid).map((x) => `${x.token} ödenen ${x.paid} beklenen ${x.expected}`).join(", "));
  }
  return results;
}

/** Eksik baskı ücreti: mağaza sahibine sipariş bildirim kanallarından haber ver */
async function notifyMerchant(shop: string, orderName: string, lines: LineCheck[]) {
  const settings = await getShopSettings(shop).catch(() => null);
  const diff = lines.reduce((sum, l) => sum + (l.expected - l.paid) * l.quantity, 0);
  const tr = [
    `⚠️ ${orderName}: baskı ücreti eksik ödenmiş olabilir`,
    ...lines.map((l) => `• Tasarım ${l.token}: ödenen ${l.paid.toFixed(2)}, tasarıma göre ${l.expected.toFixed(2)} (×${l.quantity})`),
    `Toplam fark yaklaşık ${diff.toFixed(2)}. Baskıdan önce siparişi kontrol edin. Siparişe "${PRICE_CHECK_TAG}" etiketi eklendi.`,
    ``,
    `⚠️ ${orderName}: the print fee may have been underpaid`,
    ...lines.map((l) => `• Design ${l.token}: paid ${l.paid.toFixed(2)}, the design prices at ${l.expected.toFixed(2)} (×${l.quantity})`),
    `Total difference about ${diff.toFixed(2)}. Check the order before printing. The order was tagged "${PRICE_CHECK_TAG}".`,
  ].join("\n");
  if (settings?.notificationEmail) {
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    await sendEmail({
      to: settings.notificationEmail,
      subject: `${orderName}: baskı ücreti kontrolü / print fee check`,
      html: `<p style="white-space:pre-line">${esc(tr)}</p>`,
      fromName: settings.emailSenderName || undefined,
    });
  }
  const phone = (settings?.notificationWhatsapp ?? "").replace(/\D/g, "");
  if (phone) await sendWhatsAppMessage(phone, tr);
}
