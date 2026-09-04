import { templatePieces, type PersonalizerTemplate } from "~/models/personalizer.server";
import { getPrintProductPublic } from "~/models/print-product.server";
import { printCanvas } from "~/lib/print-spec";
import { isImageSlot, isTextSlot, pickMockup } from "~/lib/slots";
import { scanTemplateHoles } from "~/lib/template-hole.server";

/**
 * Çoklu fotoğraflı ürünlerin müşteri arayüzü.
 *
 * Mevcut `embed.personalizer` tek fotoğraflı akışı sürdürüyor; kolaj ürünleri
 * ayrı bir sayfadan gidiyor ki çalışan akış hiç değişmesin.
 *
 * Arayüzün üç işi var: toplu yükleme, alanlar arası takas ve alan içi kırpma.
 * Yerleşimi müşteri değiştirmez — tasarım sabittir, değişen yalnızca hangi
 * fotoğrafın nerede durduğu ve nasıl kırpıldığıdır.
 *
 * Önizleme tarayıcıda çizilir. On beş fotoğraflı bir tasarımda her kaydırmada
 * sunucuda kompozit üretmek dakikalar sürerdi; istemci ile sunucu aynı
 * normalize koordinatları ve aynı kırpma matematiğini kullandığı için ekranda
 * görünen ile basılan birebir örtüşüyor.
 */

/**
 * Çerçeve görselinin şeffaf açıklığını bulur.
 *
 * Sonuç süreç belleğinde tutuluyor: aynı ürün görseli her müşteri isteğinde
 * yeniden taranmamalı, tarama bir milyon pikseli dolaşıyor.
 */
const openingCache = new Map<string, { x: number; y: number; w: number; h: number; aspect: number } | null>();

async function mockupOpening(url: string) {
  if (openingCache.has(url)) return openingCache.get(url) ?? null;
  let result: { x: number; y: number; w: number; h: number; aspect: number } | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      const scan = await scanTemplateHoles(Buffer.from(await res.arrayBuffer()));
      // En büyük kapalı şeffaf alan çerçevenin içidir; dış kenardaki şeffaflık
      // taramada zaten "dışarısı" sayılıyor.
      const hole = scan.holes[0];
      if (hole) {
        // Açıklık, çerçevenin yumuşatılmış iç kenarı yüzünden görünenden bir
        // tık küçük çıkıyor ve arada ince bir açık çizgi kalıyor. Fotoğrafı
        // az miktarda çerçevenin altına sokuyoruz.
        const bleed = 0.006;
        const x = Math.max(0, hole.x / scan.width - bleed);
        const y = Math.max(0, hole.y / scan.height - bleed);
        result = {
          x,
          y,
          w: Math.min(1 - x, hole.width / scan.width + bleed * 2),
          h: Math.min(1 - y, hole.height / scan.height + bleed * 2),
          aspect: scan.width / scan.height,
        };
      }
    }
  } catch (err) {
    console.error(`[slot-embed] mockup açıklığı bulunamadı (${url}):`, err);
  }
  openingCache.set(url, result);
  return result;
}

export interface SlotEmbedOptions {
  variantId: string;
  shop: string;
  locale: string;
  /** Varyant değişiminde şablonu yeniden çözebilmek için */
  productId?: string;
  /** Müşterinin seçtiği varyantın seçenek değerleri ("Ceviz", "Tam Alan"…) */
  optionValues?: string[];
}

/**
 * Çoklu slotlu şablon için müşteri sayfasını üretir.
 *
 * Ayrı bir fonksiyon olması, eski `embed/personalizer` adresinin de buraya
 * yönlendirebilmesi için: mağaza sahibinin tema koduna dokunması gerekmesin.
 * Şablonun slotu yoksa `null` dönüyor ve çağıran eski akışa devam ediyor.
 */
export async function buildSlotResponse(
  template: PersonalizerTemplate | null,
  opts: SlotEmbedOptions,
): Promise<Response | null> {
  const built = await buildSlotData(template, opts);
  if (!built) return null;
  if ("page" in built) return built.page;

  return new Response(renderSlotPage(built.data, built.t), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

/**
 * Sayfanın verisini üretir.
 *
 * HTML'den ayrı durması, varyant değişiminde aynı veriyi JSON olarak
 * verebilmek için: müşteri rengi ya da bordürü değiştirdiğinde sayfa
 * yeniden yüklenmemeli, yoksa yüklediği fotoğraflar kaybolur.
 */
export async function buildSlotData(
  template: PersonalizerTemplate | null,
  opts: SlotEmbedOptions,
): Promise<{ data: SlotPageData; t: Record<string, any> } | { page: Response } | null> {
  const { variantId, shop, locale } = opts;
  const isTr = !locale.toLowerCase().startsWith("en");

  const t = {
    choosePhotos: isTr ? "Fotoğrafları seç" : "Choose photos",
    chooseMore: isTr ? "Fotoğraf ekle" : "Add photos",
    hint: (n: number) => isTr
      ? `Bu tasarım ${n} fotoğrafla hazırlanıyor. Hepsini tek seferde seçebilirsiniz.`
      : `This design uses ${n} photos. You can select them all at once.`,
    uploading: isTr ? "Yükleniyor…" : "Uploading…",
    swapHint: isTr
      ? "Sırayı değiştirmek için bir fotoğrafı diğerinin üstüne sürükleyin. Kırpmak için üstüne tıklayın."
      : "Drag one photo onto another to swap. Click a photo to crop it.",
    cropTitle: isTr ? "Kırpma" : "Crop",
    cropHint: isTr ? "Sürükleyerek kaydırın" : "Drag to move",
    zoom: isTr ? "Yakınlaştır" : "Zoom",
    replace: isTr ? "Değiştir" : "Replace",
    clear: isTr ? "Kaldır" : "Remove",
    done: isTr ? "Tamam" : "Done",
    // Bu metin tarayıcıda kullanılıyor; fonksiyon olarak bırakılırsa
    // JSON.stringify onu sessizce siler ve arayüz çalışmaz. Yer tutucu
    // istemcide dolduruluyor.
    missing: isTr
      ? "{n} alan boş — sepete eklemek için hepsini doldurun"
      : "{n} slots empty — fill them all to continue",
    ready: isTr ? "Tasarımınız hazır" : "Your design is ready",
    preview: isTr ? "Önizleme al" : "Get preview",
    previewing: isTr ? "Hazırlanıyor…" : "Preparing…",
    addToCart: isTr ? "Sepete ekle" : "Add to cart",
    adding: isTr ? "Ekleniyor…" : "Adding…",
    added: isTr ? "Sepete eklendi" : "Added to cart",
    lowRes: isTr ? "Düşük çözünürlük" : "Low resolution",
    lowResHint: isTr
      ? "Bu fotoğraf bu alan için küçük; baskıda bulanık çıkabilir."
      : "This photo is small for this slot; it may print blurry.",
    pool: isTr ? "Kullanılmayan fotoğraflar" : "Unused photos",
    notFound: isTr ? "Şablon bulunamadı." : "Template not found.",
    noSize: isTr ? "Bu şablona baskı ebadı bağlanmamış." : "This template has no print size.",
    noSlots: isTr ? "Bu şablonda fotoğraf alanı tanımlı değil." : "This template has no photo slots.",
    error: isTr ? "Bir hata oluştu, lütfen tekrar deneyin." : "Something went wrong, please try again.",
    emptyArea: isTr ? "Fotoğraf ekleyin" : "Add a photo",
    heading: isTr ? "Fotoğraflarınızı yerleştirin" : "Place your photos",
    dropHere: isTr ? "Fotoğrafları buraya bırakın" : "Drop your photos here",
    progress: isTr ? "{a} / {b} fotoğraf" : "{a} / {b} photos",
    colorLabel: isTr ? "seçili" : "selected",
  };

  function page(message: string) {
    return { page: new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <body style="font:15px system-ui;padding:24px;color:#444">${message}</body>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "frame-ancestors *" } },
    ) };
  }

  if (!template) return page(t.notFound);

  const pieces = templatePieces(template);
  const totalImageSlots = pieces.reduce(
    (n, piece) => n + piece.slots.filter(isImageSlot).length, 0,
  );
  // Slotu olmayan şablon bu akışa ait değil; çağıran eski arayüze düşsün
  if (totalImageSlots === 0) return null;

  // Parçaların baskı ürünü çözülüyor. Slot var ama ebat bağlanmamışsa şablon
  // eksik kurulmuş demektir; eski arayüze düşmek yanlış olur, çünkü o arayüz
  // slotları bilmiyor ve müşteriye tek fotoğraflık bir akış gösterirdi.
  const piecePayload = [];
  for (const piece of pieces) {
    const product = piece.print_product_id
      ? await getPrintProductPublic(piece.print_product_id)
      : null;
    if (!product) return page(t.noSize);
    const canvas = printCanvas(product);

    piecePayload.push({
      id: piece.id,
      name: piece.name,
      templateUrl: piece.background_url ?? "",
      overlayUrl: piece.overlay_url ?? "",
      canvas: { width: canvas.canvasWidth, height: canvas.canvasHeight },
      slots: piece.slots.filter(isImageSlot)
        .sort((a, b) => a.order - b.order)
        .map((sl) => ({
          id: sl.id, rect: sl.rect, label: sl.label, order: sl.order,
          radius: sl.radius ?? 0, fit: sl.fit, allow: sl.allow,
          // Bu alanı 300 dpi'da dolduran fotoğrafın olması gereken kısa kenarı
          needPx: Math.min(
            Math.round(sl.rect.w * canvas.canvasWidth),
            Math.round(sl.rect.h * canvas.canvasHeight),
          ),
        })),
    });
  }

  // Metin alanları parçalardan toplanıyor; aynı kimlikli alan bir kez sorulur
  const seenText = new Set<string>();
  const texts = [];
  for (const piece of pieces) {
    for (const sl of piece.slots) {
      if (!isTextSlot(sl) || sl.mode === "fixed" || seenText.has(sl.id)) continue;
      seenText.add(sl.id);
      texts.push({
        id: sl.id, label: sl.label, mode: sl.mode,
        maxLength: sl.max_length, defaultValue: sl.default_value,
        options: sl.options ?? [],
      });
    }
  }

  // Bütün varyant görselleri gönderiliyor, yalnızca seçili olan değil: müşteri
  // rengi değiştirdiğinde çerçeve anında değişmeli, sunucuya gidip beklememeli.
  //
  // Alan tanımlanmamış bir mockup "çerçeve" demektir: ortası şeffaf bırakılmış
  // bir ürün görseli. Açıklığı taramayla buluyoruz, çünkü mağaza sahibinden
  // her renk için elle dikdörtgen çizmesini istemek gereksiz bir yük — çerçeve
  // görselleri zaten şeffaf ortalı geliyor.
  const mockups = [];
  for (const m of template.mockups) {
    mockups.push({
      key: m.key,
      label: m.label,
      url: m.url,
      areas: m.areas,
      opening: m.areas.length === 0 ? await mockupOpening(m.url) : null,
    });
  }
  const aktif = pickMockup(template.mockups, opts.optionValues ?? []);

  const data = {
    templateId: template.id,
    productId: opts.productId ?? "",
    name: template.name,
    variantId,
    shop,
    locale: isTr ? "tr" : "en",
    pieces: piecePayload,
    texts,
    mockups,
    activeMockupKey: aktif?.key ?? "",
  };

  return { data, t };
}

export interface SlotPageData {
  templateId: string;
  productId: string;
  name: string;
  variantId: string;
  shop: string;
  locale: string;
  /** Ayrı ayrı basılan parçalar; tek parçalı şablonlarda tek eleman */
  pieces: Array<{
    id: string;
    name: string;
    templateUrl: string;
    overlayUrl: string;
    canvas: { width: number; height: number };
    slots: Array<Record<string, unknown>>;
  }>;
  texts: Array<Record<string, unknown>>;
  /** Bütün varyant görselleri; seçim istemcide yapılır */
  mockups: Array<{
    key: string;
    label: string;
    url: string;
    areas: Array<{ piece_id: string; rect: { x: number; y: number; w: number; h: number }; mask_url?: string }>;
    /** Çerçeve tipi mockup'ta fotoğrafın görüneceği şeffaf açıklık */
    opening: { x: number; y: number; w: number; h: number; aspect: number } | null;
  }>;
  /** Sayfa açılırken hangi görselin seçili olduğu */
  activeMockupKey: string;
}

/**
 * Sayfayı üretir. Loader'dan ayrı durması, arayüzün gerçek bir şablon ve
 * veritabanı olmadan da açılıp denenebilmesi içindir.
 */
export function renderSlotPage(data: SlotPageData, t: Record<string, any>): string {
  const imageSlotCount = data.pieces.reduce((n, p) => n + p.slots.length, 0);
  const multiPiece = data.pieces.length > 1;
  const template = { name: data.name };

  // Sunucu tarafındaki `t` içinde fonksiyonlar var (ör. hint). JSON.stringify
  // onları sessizce düşürdüğü için istemciye yalnızca düz metinleri veriyoruz;
  // eksik bir anahtar çalışma anında hata olarak patlamasın.
  const clientText = Object.fromEntries(
    Object.entries(t).filter(([, v]) => typeof v !== "function"),
  );

  return `<!doctype html>
<html lang="${data.locale === "en" ? "en" : "tr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>${escapeHtml(template.name)}</title>
<style>
  /* Tek aile, sabit rem ölçeği. Ürün arayüzü: tipografi göreve hizmet eder,
     görevin önüne geçmez. */
  :root {
    --bg: #ffffff;
    --surface: #f6f7f8;
    --surface-2: #eef0f2;
    --line: #e2e4e8;
    --line-strong: #cdd1d7;
    --ink: #15171c;
    --ink-2: #565c68;          /* beyaz üstünde 6.4:1 */
    --accent: #15171c;
    --commit: #0b7a43;         /* beyaz üstünde 4.6:1 */
    --commit-hover: #096236;
    --warn: #b02a1f;           /* beyaz üstünde 5.5:1 */
    --focus: #2f6fd0;

    --r-sm: 6px;
    --r: 10px;
    --r-lg: 14px;

    --z-sticky: 20;
    --z-drop: 40;
    --z-dialog: 60;

    --ease: cubic-bezier(.22,.61,.36,1);
  }

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .wrap { max-width: 1080px; margin: 0 auto; padding: 4px 16px 96px; }

  /* ── Başlık şeridi ──────────────────────────────────────────────── */
  .head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin: 4px 0 16px;
  }
  .head h1 { font-size: 17px; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  .progress { font-size: 14px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .progress b { color: var(--ink); font-weight: 600; }
  .progress.done { color: var(--commit); }

  /* ── Varyant seçimi ─────────────────────────────────────────────── */
  .variants { display: grid; gap: 16px; margin-bottom: 20px; }
  @media (min-width: 640px) { .variants { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
  .vlabel {
    font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--ink);
    display: flex; gap: 6px; align-items: baseline;
  }
  .vlabel span { font-weight: 400; color: var(--ink-2); }
  .vopts { display: flex; flex-wrap: wrap; gap: 8px; }

  .vopt {
    appearance: none; cursor: pointer; font: inherit; font-size: 14px;
    border: 1px solid var(--line-strong); background: var(--bg); color: var(--ink);
    border-radius: var(--r); padding: 9px 14px;
    transition: border-color .15s var(--ease), background .15s var(--ease);
  }
  .vopt:hover { border-color: var(--ink-2); }
  .vopt[aria-pressed="true"] { border-color: var(--ink); background: var(--ink); color: #fff; }
  .vopt:disabled { opacity: .38; cursor: not-allowed; }

  /* Renk seçenekleri mağazanın kendi çerçeve görselini gösteriyor:
     müşteri adı değil, alacağı şeyi görüyor. */
  .vopt.swatch { padding: 6px 12px 6px 6px; display: inline-flex; align-items: center; gap: 9px; }
  .vopt.swatch img {
    width: 30px; height: 30px; border-radius: var(--r-sm);
    object-fit: cover; background: var(--surface-2); display: block;
  }

  /* ── Çerçeveler ─────────────────────────────────────────────────── */
  #boards { display: grid; gap: 14px; }
  #boards.set { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
  .piece { min-width: 0; }
  .piece-title {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 500; color: var(--ink-2); margin: 0 0 7px;
  }
  .piece-title .n {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 20px; height: 20px; padding: 0 5px;
    background: var(--surface-2); color: var(--ink-2);
    border-radius: 5px; font-size: 11px; font-weight: 600;
  }
  .piece.dolu .piece-title .n { background: var(--ink); color: #fff; }
  .piece-title .eksik { color: var(--warn); }

  .board-outer { position: relative; width: 100%; border-radius: var(--r); overflow: hidden; }
  .board { position: relative; width: 100%; }
  .board img.bg, .board img.ov {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: fill; pointer-events: none;
  }
  .board img.ov { z-index: 3; }

  .slot {
    position: absolute; overflow: hidden; z-index: 2; cursor: pointer;
    background: var(--surface);
    transition: box-shadow .15s var(--ease);
  }
  .slot:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .slot img { position: absolute; max-width: none; pointer-events: none; user-select: none; }
  .slot.empty {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--line-strong);
  }
  .slot.empty::after {
    content: "+"; font-size: 26px; font-weight: 300; color: var(--ink-2); line-height: 1;
  }
  .slot.empty.missing { border-color: var(--warn); background: #fdf3f2; }
  .slot.empty.missing::after { color: var(--warn); }
  .slot.dragover { box-shadow: inset 0 0 0 3px var(--focus); }
  .slot .num {
    position: absolute; z-index: 2; left: 5px; top: 5px;
    font-size: 11px; font-weight: 600; color: #fff;
    background: rgba(21,23,28,.62); border-radius: 4px; padding: 1px 6px;
    pointer-events: none;
  }
  .slot .warn {
    position: absolute; z-index: 2; right: 5px; top: 5px; font-size: 12px;
    background: rgba(255,255,255,.9); border-radius: 4px; padding: 0 4px;
  }

  /* ── Mockup paneli (alan tanımlı görseller için) ─────────────────── */
  .mockup { position: relative; width: 100%; margin-bottom: 16px; border-radius: var(--r); overflow: hidden; }
  .mockup > img.base { display: block; width: 100%; }
  .mockup .area { position: absolute; overflow: hidden; }
  .mockup .area img { position: absolute; max-width: none; }
  .mockup .bos {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,.6); color: var(--ink-2); font-size: 12px;
  }

  /* ── Eylemler ───────────────────────────────────────────────────── */
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 18px 0 0; }
  .hint { font-size: 13px; color: var(--ink-2); margin: 8px 0 0; max-width: 62ch; }

  .btn {
    appearance: none; cursor: pointer; font: inherit; font-weight: 600; font-size: 15px;
    border: 1px solid transparent; border-radius: var(--r); padding: 11px 18px;
    transition: background .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease);
  }
  .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .btn-primary { background: var(--ink); color: #fff; }
  .btn-primary:hover { background: #000; }
  .btn-outline { background: var(--bg); color: var(--ink); border-color: var(--line-strong); }
  .btn-outline:hover { border-color: var(--ink-2); }
  .btn-commit { background: var(--commit); color: #fff; }
  .btn-commit:hover { background: var(--commit-hover); }
  .btn:disabled { background: var(--surface-2); color: #8c929c; border-color: transparent; cursor: not-allowed; }

  .status { font-size: 14px; }
  .status.warnc { color: var(--warn); }
  .status.okc { color: var(--commit); }

  /* ── Alt eylem çubuğu ───────────────────────────────────────────── */
  .commitbar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line);
  }
  .price { font-size: 17px; font-weight: 600; margin-left: auto; font-variant-numeric: tabular-nums; }
  @media (max-width: 599px) {
    .commitbar {
      position: sticky; bottom: 0; z-index: var(--z-sticky);
      background: var(--bg); margin: 22px -16px 0; padding: 12px 16px;
      border-top: 1px solid var(--line); box-shadow: 0 -6px 18px rgba(0,0,0,.06);
    }
    .commitbar .btn-commit { flex: 1; }
    .price { margin-left: 0; order: -1; width: 100%; }
  }

  /* ── Metin alanları ─────────────────────────────────────────────── */
  .fields { display: grid; gap: 14px; margin: 20px 0 0; }
  @media (min-width: 640px) { .fields { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .field input, .field select {
    width: 100%; padding: 10px 12px; font: inherit;
    border: 1px solid var(--line-strong); border-radius: var(--r); background: var(--bg); color: var(--ink);
  }
  .field input:focus-visible, .field select:focus-visible {
    outline: 2px solid var(--focus); outline-offset: 1px; border-color: var(--focus);
  }

  /* ── Havuz ──────────────────────────────────────────────────────── */
  .pool { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 16px 0 0; }
  .pool .baslik { width: 100%; font-size: 13px; color: var(--ink-2); }
  .pool .chip {
    width: 54px; height: 54px; border-radius: var(--r-sm); overflow: hidden;
    border: 1px solid var(--line); cursor: grab; background: var(--surface);
  }
  .pool .chip img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* ── Sürükleme ──────────────────────────────────────────────────── */
  .slot, .pool .chip { touch-action: manipulation; }
  img.ghost {
    position: fixed; z-index: var(--z-drop); width: 76px; height: 76px;
    object-fit: cover; border-radius: var(--r-sm);
    transform: translate(-50%,-50%); pointer-events: none; opacity: .92;
    box-shadow: 0 8px 22px rgba(0,0,0,.28);
  }

  /* Dosyayı sayfaya bırakma */
  .dropveil {
    position: fixed; inset: 0; z-index: var(--z-drop);
    display: none; align-items: center; justify-content: center;
    background: rgba(255,255,255,.92); font-size: 16px; font-weight: 600; color: var(--ink);
  }
  .dropveil.on { display: flex; }

  /* ── Kırpma penceresi ───────────────────────────────────────────── */
  dialog.crop {
    border: 0; border-radius: var(--r-lg); padding: 0; max-width: min(92vw, 420px); width: 100%;
    box-shadow: 0 12px 40px rgba(0,0,0,.22);
  }
  dialog.crop::backdrop { background: rgba(21,23,28,.5); }
  .crop-body { padding: 18px; }
  .crop-body h2 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
  .crop-stage {
    position: relative; width: 100%; overflow: hidden;
    border-radius: var(--r); background: var(--surface-2); touch-action: none; cursor: grab;
  }
  .crop-stage img { position: absolute; max-width: none; pointer-events: none; }
  .crop-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .crop-row input[type=range] { flex: 1; accent-color: var(--ink); }

  /* ── Önizleme çıktısı ───────────────────────────────────────────── */
  .preview-out { margin-top: 20px; display: grid; gap: 12px; }
  .preview-out.set { grid-template-columns: 1fr; }
  @media (min-width: 560px) { .preview-out.set { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); } }
  .preview-out img { width: 100%; border-radius: var(--r); border: 1px solid var(--line); display: block; }

  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%;
    animation: spin .7s linear infinite; vertical-align: -2px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>${escapeHtml(t.heading)}</h1>
    <p class="progress" id="progress"></p>
  </div>

  <div id="variants" class="variants" hidden></div>
  <div id="mockup" class="mockup" hidden></div>
  <div id="boards"></div>

  <div class="actions">
    <button class="btn btn-primary" id="pickBtn">${escapeHtml(t.choosePhotos)}</button>
    <button class="btn btn-outline" id="previewBtn">${escapeHtml(t.preview)}</button>
    <span class="status" id="status"></span>
  </div>
  <p class="hint" id="swapHint">${escapeHtml(t.swapHint)}</p>
  <p class="hint" id="countHint">${escapeHtml(t.hint(imageSlotCount))}</p>

  <div class="pool" id="pool" hidden></div>
  <div class="fields" id="fields"></div>
  <div class="preview-out" id="previewOut"></div>

  <div class="commitbar">
    <span class="price" id="price"></span>
    <button class="btn btn-commit" id="cartBtn" disabled>${escapeHtml(t.addToCart)}</button>
  </div>
</div>

<div class="dropveil" id="dropveil">${escapeHtml(t.dropHere)}</div>

<input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp" multiple hidden>

<dialog class="crop" id="cropDlg">
  <div class="crop-body">
    <h2 id="cropTitle">${escapeHtml(t.cropTitle)}</h2>
    <div class="crop-stage" id="cropStage"></div>
    <div class="crop-row">
      <span style="font-size:13px">${escapeHtml(t.zoom)}</span>
      <input type="range" id="zoom" min="1" max="3" step="0.02" value="1">
    </div>
    <div class="crop-row">
      <button class="btn btn-outline" id="cropReplace">${escapeHtml(t.replace)}</button>
      <button class="btn btn-outline" id="cropClear">${escapeHtml(t.clear)}</button>
      <button class="btn btn-primary" id="cropDone" style="margin-left:auto">${escapeHtml(t.done)}</button>
    </div>
    <p class="hint">${escapeHtml(t.cropHint)}</p>
  </div>
</dialog>

<script>
(function () {
  var D = ${JSON.stringify(data)};
  var T = ${JSON.stringify(clientText)};
  var APP_URL = window.location.origin;

  // slotId -> { url, localUrl, width, height, offset_x, offset_y, scale }
  var fills = {};
  // Slotlara sığmayan fotoğraflar burada bekler
  var pool = [];
  var texts = {};
  var replaceTarget = null;

  var boardsEl = document.getElementById('boards');
  var statusEl = document.getElementById('status');
  var cartBtn = document.getElementById('cartBtn');
  var previewBtn = document.getElementById('previewBtn');
  var fileInput = document.getElementById('fileInput');
  var poolEl = document.getElementById('pool');

  // Bütün parçaların slotları tek listede: yükleme dağıtımı, eksik sayımı ve
  // takas parçalar arasında çalışabilmeli. Müşteri için üç çerçeve tek bir
  // tasarım; hangi dosyaya bastığımız onu ilgilendirmiyor.
  var ALL = [];
  var pieceOfSlot = {};
  var slotEls = {};
  var pieceTitles = {};
  var FRAME = null;

  // Seçili varyant görseli. Renk değişiminde sunucuya gidilmiyor: bütün
  // görseller açıklıklarıyla birlikte geldi, sadece hangisinin çizileceği
  // değişiyor. buildBoards ve paintMockup ikisi de okuduğu için dış kapsamda.
  var aktifMockup = null;
  function mockupSec(key) {
    var liste = D.mockups || [];
    aktifMockup = null;
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].key === key) { aktifMockup = liste[i]; break; }
    }
    if (!aktifMockup) {
      for (var j = 0; j < liste.length; j++) if (!liste[j].key) { aktifMockup = liste[j]; break; }
    }
    return aktifMockup;
  }
  mockupSec(D.activeMockupKey);

  // Varyant değişiminde tahtalar yeniden kuruluyor; bu yüzden kurulum
  // fonksiyon içinde ve durum her seferinde sıfırlanıyor.
  function buildBoards() {
    ALL = [];
    pieceOfSlot = {};
    slotEls = {};
    pieceTitles = {};
    boardsEl.innerHTML = '';
    boardsEl.className = '';

    D.pieces.forEach(function (p) {
      p.slots.forEach(function (s) { ALL.push(s); pieceOfSlot[s.id] = p; });
    });

    FRAME = (aktifMockup && !aktifMockup.areas.length && aktifMockup.opening) ? aktifMockup : null;

  // ── Tahtaları kur: her parça kendi tuvali ──────────────────────────────
  // Çerçeve tipi mockup: ortası şeffaf tek bir ürün görseli. Her parça
  // tahtası bu çerçevenin içine çiziliyor, yani müşteri fotoğrafını seçtiği
  // renkteki gerçek çerçevede görüyor ve düzenlemesini orada yapıyor.
  if (D.pieces.length > 1) boardsEl.className = 'set';

  D.pieces.forEach(function (piece, pi) {
    var wrap = document.createElement('div');
    wrap.className = 'piece';

    if (D.pieces.length > 1) {
      var title = document.createElement('p');
      title.className = 'piece-title';
      title.innerHTML = '<span class="n">' + (pi + 1) + '</span>' + escapeText(piece.name)
        + ' <span class="eksik" data-eksik="' + piece.id + '"></span>';
      wrap.appendChild(title);
      pieceTitles[piece.id] = title.querySelector('[data-eksik]');
    }

    var outer = document.createElement('div');
    outer.className = 'board-outer';
    var board = document.createElement('div');
    board.className = 'board';
    // Çerçeve varsa tahta çerçevenin oranını alır; slotlar açıklığın içine
    // haritalanır. Yoksa doğrudan baskı tuvali gösterilir.
    board.style.aspectRatio = FRAME
      ? (FRAME.opening.aspect + ' / 1')
      : (piece.canvas.width + ' / ' + piece.canvas.height);
    if (FRAME) outer.style.background = 'transparent';
    outer.appendChild(board);
    wrap.appendChild(outer);
    boardsEl.appendChild(wrap);

    if (piece.templateUrl) {
      var bg = document.createElement('img');
      bg.className = 'bg'; bg.src = piece.templateUrl; bg.alt = '';
      board.appendChild(bg);
    }

    piece.slots.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'slot empty';
      // Slot koordinatları baskı tuvaline göre; çerçeve varsa açıklığın içine
      // yeniden ölçekleniyor
      var o = FRAME ? FRAME.opening : { x: 0, y: 0, w: 1, h: 1 };
      el.style.left = ((o.x + s.rect.x * o.w) * 100) + '%';
      el.style.top = ((o.y + s.rect.y * o.h) * 100) + '%';
      el.style.width = (s.rect.w * o.w * 100) + '%';
      el.style.height = (s.rect.h * o.h * 100) + '%';
    if (s.radius > 0) el.style.borderRadius = (s.radius * 100) + '%';
    el.dataset.slot = s.id;

      // Parçada tek alan varsa numara rozeti bilgi taşımıyor, sadece
      // fotoğrafın üstünü kirletiyor
      if (piece.slots.length > 1) {
        var num = document.createElement('span');
        num.className = 'num'; num.textContent = s.order;
        el.appendChild(num);
      }

    // Klavyeyle de dolaşılabilmeli: alanlar birer düğme gibi davranıyor
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', s.label || 'Fotoğraf alanı');
      el.addEventListener('pointerdown', function (e) { beginDrag(e, { kind: 'slot', id: s.id }); });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (fills[s.id]) onSlotClick(s.id);
        else { replaceTarget = s.id; fileInput.click(); }
      });

      board.appendChild(el);
      slotEls[s.id] = el;
    });

    if (piece.overlayUrl) {
      var ov = document.createElement('img');
      ov.className = 'ov'; ov.src = piece.overlayUrl; ov.alt = '';
      board.appendChild(ov);
    }
    if (FRAME) {
      var fr = document.createElement('img');
      fr.className = 'ov'; fr.src = FRAME.url; fr.alt = FRAME.label || '';
      board.appendChild(fr);
    }
  });
  }

  function escapeText(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Sürükleme ──────────────────────────────────────────────────────────
  // HTML5 drag-and-drop kullanılmıyor: dokunmatik ekranlarda hiç çalışmıyor ve
  // bu ürünün müşterilerinin çoğu telefonda. Pointer olayları fare ile
  // parmağın ikisini de aynı kodla karşılıyor.
  //
  // Dokunmada sürükleme kısa bir basılı tutmadan sonra başlıyor; aksi halde
  // sayfayı kaydırmak isteyen her hareket fotoğrafı sürüklemeye başlardı.
  var HOLD_MS = 200;
  var MOVE_TOLERANCE = 10;
  var drag = null;

  function sourceFill(src) {
    return src.kind === 'slot' ? fills[src.id] : pool[src.index];
  }

  function beginDrag(e, src) {
    if (e.button != null && e.button !== 0) return;
    if (!sourceFill(src)) {
      // Boş alana dokunmak dosya seçtirir
      if (src.kind === 'slot') { replaceTarget = src.id; fileInput.click(); }
      return;
    }
    drag = {
      src: src, x: e.clientX, y: e.clientY, active: false, cancelled: false,
      touch: e.pointerType === 'touch', ghost: null, over: null, timer: 0,
    };
    if (drag.touch) {
      drag.timer = window.setTimeout(function () {
        if (drag && !drag.cancelled) activate(drag.x, drag.y);
      }, HOLD_MS);
    }
  }

  function activate(x, y) {
    if (!drag || drag.active) return;
    drag.active = true;
    var f = sourceFill(drag.src);
    var ghost = document.createElement('img');
    ghost.src = f.localUrl || f.url;
    ghost.className = 'ghost';
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
    if (drag.over) drag.over.classList.remove('dragover');
    var el = document.elementFromPoint(x, y);
    var slot = el && el.closest ? el.closest('.slot') : null;
    drag.over = slot;
    if (slot) slot.classList.add('dragover');
  }

  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dist = Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    if (!drag.active) {
      // Dokunmada eşik aşılırsa bu bir kaydırmadır, sürükleme iptal
      if (drag.touch) { if (dist > MOVE_TOLERANCE) { cancelDrag(); } return; }
      if (dist > MOVE_TOLERANCE) activate(e.clientX, e.clientY); else return;
    }
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
  }, { passive: false });

  // Sürükleme sırasında sayfa kaymasın
  window.addEventListener('touchmove', function (e) {
    if (drag && drag.active) e.preventDefault();
  }, { passive: false });

  window.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag;
    finishDrag();
    if (!d.active) {
      // Hareket etmedi: tıklama sayılır
      if (d.src.kind === 'slot') onSlotClick(d.src.id);
      return;
    }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var target = el && el.closest ? el.closest('.slot') : null;
    if (!target) return;
    drop(d.src, target.dataset.slot);
  });

  window.addEventListener('pointercancel', cancelDrag);

  function cancelDrag() { if (drag) { drag.cancelled = true; finishDrag(); } }

  function finishDrag() {
    if (!drag) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.ghost) drag.ghost.remove();
    if (drag.over) drag.over.classList.remove('dragover');
    drag = null;
  }

  function drop(src, targetId) {
    if (!targetId) return;
    if (src.kind === 'pool') {
      var item = pool[src.index];
      if (!item) return;
      pool.splice(src.index, 1);
      // Hedefte fotoğraf varsa yerinden olmaz, havuza döner
      if (fills[targetId]) pool.push(fills[targetId]);
      fills[targetId] = item;
      renderAll();
      return;
    }
    if (src.id === targetId) return;
    var tmp = fills[src.id];
    fills[src.id] = fills[targetId];
    fills[targetId] = tmp;
    if (!fills[src.id]) delete fills[src.id];
    if (!fills[targetId]) delete fills[targetId];
    renderAll();
  }

  // ── Metin alanları ─────────────────────────────────────────────────────
  var fieldsEl = document.getElementById('fields');
  D.texts.forEach(function (f) {
    texts[f.id] = f.defaultValue || '';
    var wrap = document.createElement('div');
    wrap.className = 'field';
    var lab = document.createElement('label');
    lab.textContent = f.label; lab.htmlFor = 'tx_' + f.id;
    wrap.appendChild(lab);

    var input;
    if (f.mode === 'preset' && f.options.length) {
      input = document.createElement('select');
      f.options.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value; opt.textContent = o.value;
        input.appendChild(opt);
      });
      texts[f.id] = f.options[0].value;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      if (f.maxLength > 0) input.maxLength = f.maxLength;
      input.value = texts[f.id];
    }
    input.id = 'tx_' + f.id;
    input.addEventListener('input', function () { texts[f.id] = input.value; });
    input.addEventListener('change', function () { texts[f.id] = input.value; });
    wrap.appendChild(input);
    fieldsEl.appendChild(wrap);
  });

  // ── Fotoğrafı slota çiz ────────────────────────────────────────────────
  // Sunucudaki kırpma matematiğinin birebir aynısı: aynı k, aynı pencere.
  // İkisi ayrışırsa müşteri onayladığı kadrajdan farklı bir baskı alır.
  function paint(slotId) {
    var el = slotEls[slotId];
    var f = fills[slotId];
    var old = el.querySelector('img');
    if (old) old.remove();
    var warn = el.querySelector('.warn');
    if (warn) warn.remove();

    if (!f) { el.classList.add('empty'); return; }
    el.classList.remove('empty');

    var img = document.createElement('img');
    img.src = f.localUrl || f.url;
    img.alt = '';
    el.insertBefore(img, el.firstChild);

    var slot = slotById(slotId);
    if (slot && f.width && Math.min(f.width, f.height) < slot.needPx * 0.75) {
      var w = document.createElement('span');
      w.className = 'warn'; w.textContent = '⚠'; w.title = T.lowResHint;
      el.appendChild(w);
    }
    layout(slotId);
  }

  function layout(slotId) {
    var el = slotEls[slotId], f = fills[slotId];
    if (!f) return;
    var img = el.querySelector('img');
    if (!img) return;
    var W = el.clientWidth, H = el.clientHeight;
    if (!W || !H || !f.width || !f.height) return;

    var k = Math.max(W / f.width, H / f.height) * (f.scale || 1);
    var rw = f.width * k, rh = f.height * k;
    var left = -clamp((rw - W) / 2 - (f.offset_x || 0) * W, 0, rw - W);
    var top = -clamp((rh - H) / 2 - (f.offset_y || 0) * H, 0, rh - H);
    img.style.width = rw + 'px';
    img.style.height = rh + 'px';
    img.style.left = left + 'px';
    img.style.top = top + 'px';
  }

  // ── Mockup ─────────────────────────────────────────────────────────────
  // Müşteri fotoğrafını seçtiği renkteki gerçek çerçevenin içinde görüyor.
  // Çizim istemcide ve slotlarla aynı kırpma matematiğiyle yapılıyor; sunucuya
  // gidilse her düzeltmede bekleme olurdu.
  var mockupEl = document.getElementById('mockup');
  var areaEls = {};

  function buildMockup() {
    // Çerçeve tipi mockup zaten tahtaların üstünde; ayrı panel açmıyoruz
    if (!aktifMockup || !aktifMockup.areas.length) return;
    mockupEl.hidden = false;
    mockupEl.innerHTML = '';

    var base = document.createElement('img');
    base.className = 'base';
    base.src = aktifMockup.url;
    base.alt = aktifMockup.label || '';
    base.addEventListener('load', paintMockup);
    mockupEl.appendChild(base);

    aktifMockup.areas.forEach(function (a) {
      var el = document.createElement('div');
      el.className = 'area';
      el.style.left = (a.rect.x * 100) + '%';
      el.style.top = (a.rect.y * 100) + '%';
      el.style.width = (a.rect.w * 100) + '%';
      el.style.height = (a.rect.h * 100) + '%';
      if (a.mask_url) {
        el.style.webkitMaskImage = 'url(' + a.mask_url + ')';
        el.style.maskImage = 'url(' + a.mask_url + ')';
        el.style.webkitMaskSize = '100% 100%';
        el.style.maskSize = '100% 100%';
      }
      mockupEl.appendChild(el);
      areaEls[a.piece_id] = el;
    });
  }

  /** Parçanın ilk dolu fotoğraf alanı — mockup o fotoğrafı gösterir */
  function pieceFill(pieceId) {
    for (var i = 0; i < D.pieces.length; i++) {
      if (D.pieces[i].id !== pieceId) continue;
      var slots = D.pieces[i].slots;
      for (var k = 0; k < slots.length; k++) {
        if (fills[slots[k].id]) return fills[slots[k].id];
      }
    }
    return null;
  }

  function paintMockup() {
    if (!aktifMockup) return;
    aktifMockup.areas.forEach(function (a) {
      var el = areaEls[a.piece_id];
      if (!el) return;
      el.innerHTML = '';
      var f = pieceFill(a.piece_id);
      if (!f) {
        var bos = document.createElement('span');
        bos.className = 'bos';
        bos.textContent = T.emptyArea || '';
        el.appendChild(bos);
        return;
      }
      var img = document.createElement('img');
      img.src = f.localUrl || f.url;
      img.alt = '';
      el.appendChild(img);

      var W = el.clientWidth, H = el.clientHeight;
      if (!W || !H || !f.width || !f.height) return;
      var k = Math.max(W / f.width, H / f.height) * (f.scale || 1);
      var rw = f.width * k, rh = f.height * k;
      img.style.width = rw + 'px';
      img.style.height = rh + 'px';
      img.style.left = (-clamp((rw - W) / 2 - (f.offset_x || 0) * W, 0, rw - W)) + 'px';
      img.style.top = (-clamp((rh - H) / 2 - (f.offset_y || 0) * H, 0, rh - H)) + 'px';
    });
  }

  function renderAll() {
    ALL.forEach(function (s) { paint(s.id); });
    paintMockup();
    renderPool();
    updateStatus();
  }

  window.addEventListener('resize', function () {
    ALL.forEach(function (s) { layout(s.id); });
    paintMockup();
  });

  function renderPool() {
    poolEl.innerHTML = '';
    poolEl.hidden = pool.length === 0;
    if (pool.length === 0) return;
    var title = document.createElement('div');
    title.className = 'baslik';
    title.textContent = T.pool;
    poolEl.appendChild(title);
    pool.forEach(function (p, i) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.addEventListener('pointerdown', function (e) { beginDrag(e, { kind: 'pool', index: i }); });
      var im = document.createElement('img');
      im.src = p.localUrl || p.url; im.alt = '';
      chip.appendChild(im);
      poolEl.appendChild(chip);
    });
  }

  function missingCount() {
    var n = 0;
    ALL.forEach(function (s) { if (!fills[s.id]) n++; });
    return n;
  }

  function uploadsPending() {
    return Object.keys(fills).some(function (id) { return !fills[id].url; })
      || pool.some(function (p) { return !p.url; });
  }

  function updateStatus() {
    var miss = missingCount();
    ALL.forEach(function (s) {
      slotEls[s.id].classList.toggle('missing', !fills[s.id] && miss < ALL.length);
    });
    // Her parçanın kendi eksik sayısı başlığında görünsün: üç çerçevelik bir
    // sette hangisinin boş kaldığı aşağı kaydırmadan anlaşılmalı
    D.pieces.forEach(function (p) {
      var el = pieceTitles[p.id];
      if (!el) return;
      var n = 0;
      p.slots.forEach(function (s) { if (!fills[s.id]) n++; });
      el.textContent = n > 0 ? '· ' + n + ' boş' : '';
    });
    if (miss > 0) {
      statusEl.className = 'status warnc';
      statusEl.textContent = String(T.missing).replace('{n}', miss);
    } else if (uploadsPending()) {
      statusEl.className = 'status';
      statusEl.innerHTML = T.uploading;
    } else {
      statusEl.className = 'status okc';
      statusEl.textContent = T.ready;
    }
    cartBtn.disabled = miss > 0 || uploadsPending();

    var dolu = ALL.length - miss;
    var prog = document.getElementById('progress');
    if (prog) {
      prog.innerHTML = String(T.progress).replace('{a}', '<b>' + dolu + '</b>').replace('{b}', ALL.length);
      prog.classList.toggle('done', miss === 0 && ALL.length > 0);
    }

    // Yükleme ana eylem olmaktan çıkınca ikincil görünüme geçiyor
    var pick = document.getElementById('pickBtn');
    pick.textContent = Object.keys(fills).length ? T.chooseMore : T.choosePhotos;
    pick.className = miss === 0 && ALL.length > 0 ? 'btn btn-outline' : 'btn btn-primary';

    // Dolu parçalar başlıkta belli olsun
    D.pieces.forEach(function (p) {
      var bos = 0;
      p.slots.forEach(function (sl) { if (!fills[sl.id]) bos++; });
      var ilk = p.slots[0] ? slotEls[p.slots[0].id] : null;
      var wrap = ilk ? ilk.closest('.piece') : null;
      if (wrap) wrap.classList.toggle('dolu', bos === 0);
    });
  }

  // ── Yükleme ────────────────────────────────────────────────────────────
  document.getElementById('pickBtn').addEventListener('click', function () {
    replaceTarget = null;
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;
    if (replaceTarget) { assignFiles([files[0]], replaceTarget); replaceTarget = null; }
    else assignFiles(files, null);
  });

  function assignFiles(files, targetSlot) {
    var entries = files.map(function (file) {
      return {
        file: file,
        localUrl: URL.createObjectURL(file),
        width: 0, height: 0, url: '',
        offset_x: 0, offset_y: 0, scale: 1,
      };
    });

    // Ölçüyü yerel dosyadan okuyoruz: sunucu cevabını beklemeden doğru kadraj
    // çizilebilsin ve müşteri yükleme sürerken sıralamaya devam edebilsin.
    var pending = entries.length;
    entries.forEach(function (e) {
      var probe = new Image();
      probe.onload = function () {
        e.width = probe.naturalWidth; e.height = probe.naturalHeight;
        if (--pending === 0) { place(entries, targetSlot); }
      };
      probe.onerror = function () { if (--pending === 0) place(entries, targetSlot); };
      probe.src = e.localUrl;
    });

    upload(entries);
  }

  function place(entries, targetSlot) {
    if (targetSlot) {
      fills[targetSlot] = entries[0];
    } else {
      entries.forEach(function (e) {
        var free = null;
        for (var i = 0; i < ALL.length; i++) {
          if (!fills[ALL[i].id]) { free = ALL[i].id; break; }
        }
        if (free) fills[free] = e; else pool.push(e);
      });
    }
    renderAll();
  }

  function upload(entries) {
    var fd = new FormData();
    entries.forEach(function (e) { fd.append('photos', e.file); });
    updateStatus();
    fetch(APP_URL + '/api/personalizer/slot-upload?locale=' + D.locale, { method: 'POST', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.photos) throw new Error(res.error || 'upload');
        res.photos.forEach(function (p, i) {
          if (p && p.url && entries[i]) {
            entries[i].url = p.url;
            if (!entries[i].width) { entries[i].width = p.width; entries[i].height = p.height; }
          }
        });
        renderAll();
      })
      .catch(function (err) {
        console.error('[slot-personalizer] yukleme hatasi', err);
        statusEl.className = 'status warnc';
        statusEl.textContent = T.error;
      });
  }

  // ── Dosyayı sayfaya bırakma ────────────────────────────────────────────
  // Masaüstünde beklenen davranış: fotoğrafları pencereye sürükleyip bırakmak.
  // Dosya seçme düğmesi duruyor; bu onun yerine değil, yanına.
  var veil = document.getElementById('dropveil');
  var veilSayac = 0;

  window.addEventListener('dragenter', function (e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
    e.preventDefault();
    if (++veilSayac === 1) veil.classList.add('on');
  });
  window.addEventListener('dragover', function (e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
    e.preventDefault();
  });
  window.addEventListener('dragleave', function () {
    if (--veilSayac <= 0) { veilSayac = 0; veil.classList.remove('on'); }
  });
  window.addEventListener('drop', function (e) {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    veilSayac = 0;
    veil.classList.remove('on');
    var dosyalar = Array.prototype.filter.call(e.dataTransfer.files, function (f) {
      // Şablon dizisi içinde regex kaçışı kayboluyor; dize karşılaştırması
      // aynı işi görüyor ve kırılgan değil.
      return String(f.type).indexOf('image/') === 0;
    });
    if (dosyalar.length) assignFiles(dosyalar, null);
  });

  // ── Kırpma ─────────────────────────────────────────────────────────────
  var dlg = document.getElementById('cropDlg');
  var stage = document.getElementById('cropStage');
  var zoom = document.getElementById('zoom');
  var cropSlot = null;

  function onSlotClick(slotId) {
    if (!fills[slotId]) return;
    var slot = slotById(slotId);
    if (slot && !slot.allow.pan && !slot.allow.zoom) return;
    cropSlot = slotId;
    document.getElementById('cropTitle').textContent = T.cropTitle + ' — ' + (slot ? slot.label : '');
    var f = fills[slotId];
    zoom.value = String(f.scale || 1);
    zoom.disabled = !(slot && slot.allow.zoom);
    var pc = (pieceOfSlot[slotId] || D.pieces[0]).canvas;
    stage.style.aspectRatio = (slot.rect.w * pc.width) + ' / ' + (slot.rect.h * pc.height);
    stage.innerHTML = '';
    var img = document.createElement('img');
    img.src = f.localUrl || f.url; img.alt = '';
    stage.appendChild(img);
    dlg.showModal();
    requestAnimationFrame(layoutCrop);
  }

  function layoutCrop() {
    var f = fills[cropSlot];
    if (!f) return;
    var img = stage.querySelector('img');
    if (!img) return;
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H || !f.width) return;
    var k = Math.max(W / f.width, H / f.height) * (f.scale || 1);
    var rw = f.width * k, rh = f.height * k;
    img.style.width = rw + 'px'; img.style.height = rh + 'px';
    img.style.left = (-clamp((rw - W) / 2 - f.offset_x * W, 0, rw - W)) + 'px';
    img.style.top = (-clamp((rh - H) / 2 - f.offset_y * H, 0, rh - H)) + 'px';
  }

  var panning = false, lastX = 0, lastY = 0;
  function panStart(x, y) {
    var slot = slotById(cropSlot);
    if (!slot || !slot.allow.pan) return;
    panning = true; lastX = x; lastY = y; stage.style.cursor = 'grabbing';
  }
  function panMove(x, y) {
    if (!panning) return;
    var f = fills[cropSlot];
    var W = stage.clientWidth, H = stage.clientHeight;
    f.offset_x = clamp(f.offset_x + (x - lastX) / W, -1, 1);
    f.offset_y = clamp(f.offset_y + (y - lastY) / H, -1, 1);
    lastX = x; lastY = y;
    layoutCrop();
  }
  function panEnd() { panning = false; stage.style.cursor = 'grab'; }

  stage.addEventListener('mousedown', function (e) { panStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { panMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', panEnd);
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) panStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1) { panMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
  stage.addEventListener('touchend', panEnd);

  zoom.addEventListener('input', function () {
    if (!fills[cropSlot]) return;
    fills[cropSlot].scale = parseFloat(zoom.value) || 1;
    layoutCrop();
  });

  document.getElementById('cropDone').addEventListener('click', function () {
    dlg.close(); paint(cropSlot); paintMockup(); updateStatus();
  });
  document.getElementById('cropReplace').addEventListener('click', function () {
    replaceTarget = cropSlot; dlg.close(); fileInput.click();
  });
  document.getElementById('cropClear').addEventListener('click', function () {
    delete fills[cropSlot]; dlg.close(); renderAll();
  });
  dlg.addEventListener('close', function () { paint(cropSlot); paintMockup(); updateStatus(); });

  // ── Önizleme ve sepet ──────────────────────────────────────────────────
  function payload(mode) {
    return {
      templateId: D.templateId,
      productId: D.productId,
      variantId: seciliVaryant || D.variantId,
      shop: D.shop,
      locale: D.locale,
      mode: mode,
      texts: texts,
      fills: ALL.filter(function (s) { return fills[s.id] && fills[s.id].url; })
        .map(function (s) {
          var f = fills[s.id];
          return { slot_id: s.id, url: f.url, offset_x: f.offset_x, offset_y: f.offset_y, scale: f.scale };
        }),
    };
  }

  function post(mode) {
    return fetch(APP_URL + '/api/personalizer/slot-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(mode)),
    }).then(function (r) { return r.json(); });
  }

  previewBtn.addEventListener('click', function () {
    previewBtn.disabled = true;
    previewBtn.innerHTML = '<span class="spinner"></span> ' + T.previewing;
    post('preview')
      .then(function (res) {
        if (res.error) throw new Error(res.error);
        var out = document.getElementById('previewOut');
        out.innerHTML = '';
        // Set ürünlerinde her parçanın önizlemesi ayrı gösteriliyor: müşteri
        // üç çerçeveyi de onaylamadan sepete gitmemeli
        var list = (res.pieces && res.pieces.length) ? res.pieces : [{ name: '', url: res.url }];
        if (list.length > 1) out.className = 'preview-out set';
        list.forEach(function (p, i) {
          var cell = document.createElement('div');
          if (list.length > 1) {
            var cap = document.createElement('p');
            cap.className = 'hint';
            cap.style.margin = '0 0 4px';
            // Parça adı zaten "1. Çerçeve" gibi numaralı geliyor; başına bir
            // numara daha koymak "1. 1. Çerçeve" üretiyordu
            cap.textContent = p.name || (i + 1) + '.';
            cell.appendChild(cap);
          }
          var im = document.createElement('img');
          im.src = p.url; im.alt = '';
          cell.appendChild(im);
          out.appendChild(cell);
        });
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function (err) {
        statusEl.className = 'status warnc';
        statusEl.textContent = err.message || T.error;
      })
      .finally(function () {
        previewBtn.disabled = false;
        previewBtn.textContent = T.preview;
        scheduleHeight();
      });
  });

  cartBtn.addEventListener('click', function () {
    cartBtn.disabled = true;
    cartBtn.innerHTML = '<span class="spinner"></span> ' + T.adding;
    post('render')
      .then(function (res) {
        if (res.error) throw new Error(res.error);
        // Sipariş satırına tasarım kaydının anahtarı ve şablon sürümü yazılıyor:
        // baskı dosyası bozulursa tasarım aynı sürümle yeniden üretilebilsin.
        var props = { _personalizer_template: D.templateId, _print_file: res.url };
        if (res.designToken) props._design_token = res.designToken;
        if (res.templateVersion) props._template_version = String(res.templateVersion);
        // Set ürününde üretime birden fazla dosya gidiyor; hepsi sipariş
        // satırında olmalı, yoksa üretim yalnızca ilk çerçeveyi basar
        if (res.pieces && res.pieces.length > 1) {
          props._print_files = res.pieces.map(function (p) { return p.url; }).join(',');
          props._piece_count = String(res.pieces.length);
        }
        D.texts.forEach(function (f) { if (texts[f.id]) props[f.label] = texts[f.id]; });

        var msg = {
          type: 'PERSONALIZER_ADD_TO_CART',
          variantId: seciliVaryant || D.variantId,
          quantity: 1,
          designToken: res.designToken || '',
          properties: props,
        };
        if (window.parent !== window) {
          window.parent.postMessage(msg, '*');
          cartBtn.innerHTML = '&#10003; ' + T.added;
        } else if (D.variantId && D.shop) {
          return fetch(APP_URL + '/api/embed/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop: D.shop, variantId: seciliVaryant || D.variantId, quantity: 1, designToken: res.designToken || '', properties: props }),
          }).then(function (r) { return r.json(); }).then(function (c) {
            if (c.checkoutUrl) window.location.href = c.checkoutUrl;
            else cartBtn.innerHTML = '&#10003; ' + T.added;
          });
        } else {
          cartBtn.innerHTML = '&#10003; ' + T.added;
        }
      })
      .catch(function (err) {
        statusEl.className = 'status warnc';
        statusEl.textContent = err.message || T.error;
        cartBtn.disabled = false;
        cartBtn.textContent = T.addToCart;
      });
  });

  // ── Yardımcılar ────────────────────────────────────────────────────────
  function slotById(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
    return null;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Yükseklik bildirimi kendi kendini besleyebiliyor: documentElement.scrollHeight
  // iframe'in KENDİ yüksekliğini de kapsıyor, ana sayfa onu iframe'e yazınca
  // ölçüm bir sonraki turda daha büyük çıkıyor ve MutationObserver her turu
  // tetiklediği için yükseklik büyüyerek gidiyor (canlıda 28940 px'e çıktı).
  //
  // Bu yüzden iframe'in değil, İÇERİĞİN yüksekliği ölçülüyor ve değer
  // gerçekten değişmedikçe mesaj gönderilmiyor.
  var sonYukseklik = 0;
  var yukseklikZamani = 0;

  function notifyHeight() {
    if (window.parent === window) return;
    var h = Math.ceil(document.body.getBoundingClientRect().height) + 16;
    if (Math.abs(h - sonYukseklik) < 4) return;
    sonYukseklik = h;
    window.parent.postMessage({ type: 'PERSONALIZER_RESIZE', height: h }, '*');
  }

  /** Art arda gelen DOM değişimlerinde tek ölçüm yapılsın */
  function scheduleHeight() {
    clearTimeout(yukseklikZamani);
    yukseklikZamani = window.setTimeout(notifyHeight, 120);
  }

  window.addEventListener('load', scheduleHeight);
  window.addEventListener('resize', scheduleHeight);
  new MutationObserver(scheduleHeight).observe(document.body, { childList: true, subtree: true });

  // ── Varyant seçimi ─────────────────────────────────────────────────────
  // Renk ve bordür seçimi kutunun içinde yapılıyor. Seçim doğrudan görüneni
  // değiştirdiği için önizlemenin yanında olması gerekiyor; ayrıca temanın
  // kendi sepet butonuyla iki ayrı "Sepete ekle" olmasının önüne geçiyor.
  var URUN = null;         // { options:[{name,values}], variants:[...] }
  var secim = {};          // seçenek adı -> değer
  var seciliVaryant = D.variantId || '';
  var variantsEl = document.getElementById('variants');
  var priceEl = document.getElementById('price');

  function varyantBul() {
    if (!URUN) return null;
    var adlar = URUN.options.map(function (o) { return o.name; });
    for (var i = 0; i < URUN.variants.length; i++) {
      var v = URUN.variants[i];
      var uyar = true;
      for (var k = 0; k < adlar.length; k++) {
        if (v.options[k] !== secim[adlar[k]]) { uyar = false; break; }
      }
      if (uyar) return v;
    }
    return null;
  }

  function fiyatYaz(v) {
    if (!priceEl) return;
    priceEl.textContent = v && v.price ? v.price : '';
  }

  function varyantArayuzuKur() {
    if (!URUN || !URUN.options.length) return;
    variantsEl.hidden = false;
    variantsEl.innerHTML = '';

    URUN.options.forEach(function (opt) {
      var grup = document.createElement('div');
      grup.className = 'vgroup';
      var lab = document.createElement('p');
      lab.className = 'vlabel';
      lab.textContent = opt.name;
      var secLbl = document.createElement('span');
      secLbl.textContent = secim[opt.name] || '';
      lab.appendChild(secLbl);
      grup.appendChild(lab);

      var kutu = document.createElement('div');
      kutu.className = 'vopts';
      opt.values.forEach(function (deger) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'vopt';

        // Seçenek bir ürün görseline karşılık geliyorsa adını değil kendisini
        // gösteriyoruz: müşteri "Ceviz" kelimesini değil, alacağı çerçeveyi
        // görmeli.
        var gorsel = null;
        (D.mockups || []).forEach(function (m) {
          if (m.key && m.key.toLocaleLowerCase('tr') === String(deger).toLocaleLowerCase('tr')) gorsel = m;
        });
        if (gorsel) {
          b.className = 'vopt swatch';
          var im = document.createElement('img');
          im.src = gorsel.url; im.alt = '';
          b.appendChild(im);
          b.appendChild(document.createTextNode(deger));
        } else {
          b.textContent = deger;
        }
        b.setAttribute('aria-pressed', String(secim[opt.name] === deger));
        b.addEventListener('click', function () {
          if (secim[opt.name] === deger) return;
          secim[opt.name] = deger;
          varyantDegisti();
        });
        kutu.appendChild(b);
      });
      grup.appendChild(kutu);
      variantsEl.appendChild(grup);
    });
    scheduleHeight();
  }

  function seciliGorunumuTazele() {
    variantsEl.querySelectorAll('.vgroup').forEach(function (grup, i) {
      var ad = URUN.options[i].name;
      grup.querySelectorAll('.vopt').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.textContent.trim() === secim[ad]));
      });
      var sec = grup.querySelector('.vlabel span');
      if (sec) sec.textContent = secim[ad] || '';
    });
  }

  var yapilandirmaIstegi = 0;

  function varyantDegisti() {
    var v = varyantBul();
    seciliGorunumuTazele();
    if (!v) { fiyatYaz(null); return; }
    seciliVaryant = String(v.id);
    fiyatYaz(v);

    // Renk değişimi anında: çerçeve görseli zaten elimizde
    var yeniKey = null;
    for (var i = 0; i < v.options.length; i++) {
      for (var k = 0; k < (D.mockups || []).length; k++) {
        if (D.mockups[k].key && D.mockups[k].key.toLowerCase() === String(v.options[i]).toLowerCase()) {
          yeniKey = D.mockups[k].key;
        }
      }
    }
    if (yeniKey) { mockupSec(yeniKey); buildBoards(); renderAll(); }

    // Yerleşim değişmiş olabilir (bordürlü/bordürsüz ayrı şablon). Sunucudan
    // yeni yapılandırma alınıyor ama SAYFA YENİLENMİYOR: müşterinin yüklediği
    // fotoğraflar korunuyor.
    var istek = ++yapilandirmaIstegi;
    fetch(APP_URL + '/api/personalizer/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: D.templateId, productId: D.productId, variantId: seciliVaryant,
        shop: D.shop, locale: D.locale, optionValues: v.options,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        // Arka arkaya tıklanırsa yalnızca son isteğin sonucu uygulanmalı
        if (istek !== yapilandirmaIstegi || !res.data) return;
        yenidenYapilandir(res.data);
      })
      .catch(function (err) { console.error('[slot] yapılandırma alınamadı', err); });
  }

  /**
   * Yeni yerleşime geçerken fotoğrafları korur.
   *
   * Eşleme slot kimliğine göre değil, parça ve alan SIRASINA göre yapılıyor:
   * iki şablonun slot kimlikleri farklı olabilir ama müşteri için "birinci
   * çerçevenin fotoğrafı" aynı fotoğraftır.
   */
  function yenidenYapilandir(yeni) {
    var eski = [];
    D.pieces.forEach(function (p) {
      p.slots.forEach(function (sl, i) { eski.push({ piece: p.id, idx: i, fill: fills[sl.id] }); });
    });

    D.pieces = yeni.pieces;
    D.mockups = yeni.mockups;
    D.texts = yeni.texts;
    D.templateId = yeni.templateId;
    mockupSec(yeni.activeMockupKey);

    var yeniFills = {};
    var sayac = 0;
    yeni.pieces.forEach(function (p, pi) {
      p.slots.forEach(function (sl, si) {
        var kaynak = eski[sayac++];
        if (kaynak && kaynak.fill) yeniFills[sl.id] = kaynak.fill;
      });
    });
    fills = yeniFills;

    buildBoards();
    buildMockup();
    renderAll();
    scheduleHeight();
  }

  // Tema, ürünün varyantlarını yükleme sonrası gönderiyor. URL ile göndermek
  // uzun varyant listelerinde adres sınırına takılıyordu.
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'PERSONALIZER_PRODUCT') return;
    URUN = { options: e.data.options || [], variants: e.data.variants || [] };
    var mevcut = null;
    for (var i = 0; i < URUN.variants.length; i++) {
      if (String(URUN.variants[i].id) === String(seciliVaryant)) mevcut = URUN.variants[i];
    }
    if (!mevcut) mevcut = URUN.variants[0];
    if (!mevcut) return;
    URUN.options.forEach(function (o, i) { secim[o.name] = mevcut.options[i]; });
    seciliVaryant = String(mevcut.id);
    fiyatYaz(mevcut);
    varyantArayuzuKur();
  });

  buildBoards();
  buildMockup();
  renderAll();
  // Temaya hazır olduğumuzu bildiriyoruz; varyant listesini o zaman gönderiyor
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'PERSONALIZER_READY' }, '*');
  }
})();
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
