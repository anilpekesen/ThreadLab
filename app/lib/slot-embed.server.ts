import { templatePieces, type PersonalizerTemplate } from "~/models/personalizer.server";
import { getPrintProductPublic } from "~/models/print-product.server";
import { printCanvas } from "~/lib/print-spec";
import { TEXT_SIZE_STEPS, isImageSlot, isTextSlot, pickMockup } from "~/lib/slots";
import { maskPathUrl, shapeMaskUrl } from "~/lib/slot-shapes";
import { findLibraryFont } from "~/lib/font-library";
import { colorLabel, isLightColor } from "~/lib/text-palette";
import { scanTemplateHoles } from "~/lib/template-hole.server";
import { hasOptionPricing, type OptionPricing } from "~/lib/option-pricing";

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

export async function mockupOpening(url: string) {
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
    rotate: isTr ? "Döndür" : "Rotate",
    // Bu metin tarayıcıda kullanılıyor; fonksiyon olarak bırakılırsa
    // JSON.stringify onu sessizce siler ve arayüz çalışmaz. Yer tutucu
    // istemcide dolduruluyor.
    missing: isTr
      ? "{n} alan boş. Sepete eklemek için tümünü doldurun."
      : "{n} slots empty. Fill them all to continue.",
    ready: isTr ? "Tasarımınız hazır" : "Your design is ready",
    addToCart: isTr ? "Sepete ekle" : "Add to cart",
    fontLabel: isTr ? "Yazı tipi" : "Font",
    fontDefault: isTr ? "Varsayılan" : "Default",
    yaziRengi: isTr ? "Renk" : "Color",
    yaziRengiVarsayilan: isTr ? "Varsayılan renk" : "Default color",
    yaziBoyutu: isTr ? "Boyut" : "Size",
    digerRenk: isTr ? "Başka bir renk seç" : "Pick another color",
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
    photoSection: isTr ? "Fotoğrafları ekleyin" : "Add your photos",
    textSection: isTr ? "Yazıları düzenleyin" : "Edit the text",
    setHint: isTr ? "Diğer çerçeveler için yana kaydırın" : "Swipe sideways for the other frames",
    captionPlaceholder: isTr ? "yazı ekle" : "add text",
    extrasSection: isTr ? "Ek seçenekler" : "Extras",
    choose: isTr ? "Seçin" : "Choose",
    none: isTr ? "Yok" : "None",
    feeLabel: isTr ? "Kişiselleştirme" : "Personalization",
    feePerChar: isTr ? "karakter başı" : "per character",
    feeFree: isTr ? "ilk {n} karakter ücretsiz" : "first {n} characters free",
    feeFont: isTr ? "font değişikliği" : "font change",
    feeColor: isTr ? "renk değişikliği" : "color change",
    feeSize: isTr ? "boyut değişikliği" : "size change",
    chooseOption: isTr ? "Lütfen seçin: {x}" : "Please choose: {x}",
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
  /** İlk parçanın tasarım ölçüsü (taşma dahil, mm); yan yüz şeridi buna oranlanıyor */
  let ilkOlcuMm: { w: number; h: number } | null = null;
  for (const piece of pieces) {
    const product = piece.print_product_id
      ? await getPrintProductPublic(piece.print_product_id)
      : null;
    if (!product) return page(t.noSize);
    if (!ilkOlcuMm) {
      ilkOlcuMm = { w: product.width_mm + product.bleed_mm * 2, h: product.height_mm + product.bleed_mm * 2 };
    }
    const canvas = printCanvas(product);

    const parcaVerisi = {
      id: piece.id,
      name: piece.name,
      templateUrl: piece.background_url ?? "",
      overlayUrl: piece.overlay_url ?? "",
      canvas: { width: canvas.canvasWidth, height: canvas.canvasHeight },
      // Kesim dikdörtgeni (tuvalin oranı olarak). Yan yüzü olan üründe ön yüzde
      // yalnızca kesim alanı görünür; taşma payı tuvalin yanına sarılır.
      trim: {
        x: canvas.trim.x / canvas.canvasWidth,
        y: canvas.trim.y / canvas.canvasHeight,
        w: canvas.trim.width / canvas.canvasWidth,
        h: canvas.trim.height / canvas.canvasHeight,
      },
      slots: piece.slots.filter(isImageSlot)
        .sort((a, b) => a.order - b.order)
        .map((sl) => ({
          id: sl.id, rect: sl.rect, label: sl.label, order: sl.order,
          radius: sl.radius ?? 0, fit: sl.fit, allow: sl.allow,
          rotation: sl.rotation ?? 0,
          letter: Boolean(sl.mask_path),
          // Şekil maskesi sunucuda, alanın baskı pikseli oranında üretiliyor;
          // tarayıcı yalnızca CSS maskesi olarak uyguluyor. Baskıdaki kesimle
          // aynı yol olsun diye istemcide ayrıca hesaplanmıyor.
          mask: sl.mask_url
            ? `url("${sl.mask_url}")`
            : sl.mask_path
              ? maskPathUrl(sl.mask_path, sl.rect.w * canvas.canvasWidth, sl.rect.h * canvas.canvasHeight)
              : sl.shape
              ? shapeMaskUrl(sl.shape, sl.rect.w * canvas.canvasWidth, sl.rect.h * canvas.canvasHeight)
              : "",
          // Bu alanı 300 dpi'da dolduran fotoğrafın olması gereken kısa kenarı
          needPx: Math.min(
            Math.round(sl.rect.w * canvas.canvasWidth),
            Math.round(sl.rect.h * canvas.canvasHeight),
          ),
        })),
      // Metin alanlarının geometrisi de gidiyor: müşteri yazdıkça yazı
      // tasarımın üstünde görünmeli, önizleme düğmesini beklememeli.
      textSlots: piece.slots.filter(isTextSlot).map((sl) => ({
        id: sl.id,
        captionOf: sl.caption_of ?? "",
        // Kart yazısı kartın üstünde yazıldığı için sınır da orada gerekiyor
        maxLength: sl.max_length,
        rect: sl.rect,
        fontSize: sl.font_size,
        fontFamily: sl.font_family,
        fontUrl: sl.font_url ?? "",
        rotation: sl.rotation ?? 0,
        color: sl.color,
        bold: sl.bold,
        align: sl.align,
        overflow: sl.overflow,
        mode: sl.mode,
        defaultValue: sl.default_value,
      })),
    };

    // Tabakadan kesilen kart ürünü: müşteriye tabaka değil kartlar gösteriliyor.
    // Her kart kendi tuvali olan küçük bir parçaya dönüşüyor; baskı tarafı yine
    // tabakayı basıyor, çünkü render şablonun kendi alanlarıyla yapılıyor.
    const kartlar = piece.slots.filter(isImageSlot).filter((sl) => sl.card_rect);
    if (kartlar.length === 0) {
      piecePayload.push(parcaVerisi);
      continue;
    }
    for (const kart of kartlar) {
      const cr = kart.card_rect!;
      const icerde = (r: { x: number; y: number; w: number; h: number }) => ({
        x: (r.x - cr.x) / cr.w,
        y: (r.y - cr.y) / cr.h,
        w: r.w / cr.w,
        h: r.h / cr.h,
      });
      const foto = parcaVerisi.slots.find((x) => x.id === kart.id);
      if (!foto) continue;
      const yazi = parcaVerisi.textSlots.find((x) => x.captionOf === kart.id);
      piecePayload.push({
        ...parcaVerisi,
        id: `${piece.id}::${kart.id}`,
        name: String(kart.order),
        templateUrl: "",
        overlayUrl: "",
        card: true,
        canvas: {
          width: Math.round(cr.w * canvas.canvasWidth),
          height: Math.round(cr.h * canvas.canvasHeight),
        },
        trim: { x: 0, y: 0, w: 1, h: 1 },
        slots: [{ ...foto, rect: icerde(foto.rect) }],
        // Punto tuval YÜKSEKLİĞİNE oran; kart tuvali tabakadan küçük
        textSlots: yazi ? [{ ...yazi, rect: icerde(yazi.rect), fontSize: yazi.fontSize / cr.h }] : [],
      });
    }
  }

  // Metin alanları parçalardan toplanıyor; aynı kimlikli alan bir kez sorulur
  const seenText = new Set<string>();
  const texts = [];
  for (const piece of pieces) {
    for (const sl of piece.slots) {
      // Kart yazıları kartın üstünde yazılıyor; yan panelde 35 kutu olmaz
      if (!isTextSlot(sl) || sl.mode === "fixed" || sl.caption_of || seenText.has(sl.id)) continue;
      seenText.add(sl.id);
      texts.push({
        id: sl.id, label: sl.label, mode: sl.mode,
        maxLength: sl.max_length, defaultValue: sl.default_value,
        options: sl.options ?? [],
        // Mağaza bu alan için font seçimi açtıysa müşteriye liste çıkıyor.
        // Şablonun kendi fontu listenin başında "varsayılan" olarak duruyor,
        // müşteri denedikten sonra geri dönebilsin.
        fontChoices: (sl.font_choices ?? [])
          .map((u) => findLibraryFont(u))
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
          .map((f) => ({ url: f.url, label: f.label, family: f.family })),
        fontUrl: sl.font_url ?? "",
        fontFamily: sl.font_family,
        colorChoices: (sl.color_choices ?? []).map((c) => ({
          hex: c, label: colorLabel(c, isTr ? "tr" : "en"), light: isLightColor(c),
        })),
        colorFree: sl.color_free === true,
        // Boyut kademeleri: Normal her zaman ilk sırada, mağazanın açtıkları küçükten büyüğe
        sizeChoices: sl.size_choices?.length
          ? TEXT_SIZE_STEPS.filter((step) => step.value === 1 || sl.size_choices!.includes(step.value))
          : [],
        color: sl.color,
        fontUrlDefault: sl.font_url ?? "",
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
      blend: m.blend ?? "",
      // Yan yüz: tasarımın kenar şeridi buraya yansıyor. Şeridin oranı
      // tasarımın gerçek ölçüsüne göre, ilk parçanın tuvalinden hesaplanıyor.
      wrap: m.wrap && ilkOlcuMm
        ? {
            side: m.wrap.side,
            rect: m.wrap.rect,
            // Şerit: tuval kalınlığının tasarım ölçüsüne oranı
            slice: Math.min(0.5, m.wrap.depth_mm / (
              m.wrap.side === "left" || m.wrap.side === "right" ? ilkOlcuMm.w : ilkOlcuMm.h
            )),
          }
        : null,
      // Elle çizilmiş açıklık taramadan önce gelir
      opening: m.areas.length === 0 ? (m.opening ?? await mockupOpening(m.url)) : null,
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
    // Ek ücret kuralı yoksa gönderilmez; sayfa ücret arayüzünü hiç kurmaz
    pricing: hasOptionPricing(template.option_pricing) ? template.option_pricing : null,
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
    textSlots: Array<Record<string, unknown>>;
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
  /** Seçeneğe göre ek ücret kuralları; yoksa null */
  pricing?: OptionPricing | null;
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

  .wrap { max-width: 1180px; margin: 0 auto; padding: 4px 18px 36px; }

  /* ── Başlık şeridi ──────────────────────────────────────────────── */
  .head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin: 4px 0 20px;
  }
  .head h1 { font-size: 17px; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  .progress { font-size: 14px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .progress b { color: var(--ink); font-weight: 600; }
  .progress.done { color: var(--commit); }

  /* Masaüstünde ürün önizlemesi hep görünür, karar ve girişler sağdaki
     görev sütununda kalır. Mobilde aynı DOM doğal okuma sırasına döner. */
  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(330px, .85fr);
    gap: 28px;
    align-items: start;
  }
  .preview-panel { min-width: 0; position: sticky; top: 12px; }
  .control-column { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .controls-panel {
    min-width: 0; padding: 18px;
    background: var(--surface); border-radius: var(--r-lg);
  }
  .section-head { margin: 0 0 12px; font-size: 15px; font-weight: 600; }

  /* ── Varyant seçimi ─────────────────────────────────────────────── */
  .variants { display: grid; gap: 14px; margin: 0; }
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
  #boards.set { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  /* Kart ürünlerinde müşteri tabakayı değil kartları görüyor */
  #boards.cards { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 10px; }
  #boards.cards .board-outer {
    background: #fff; box-shadow: 0 1px 3px rgba(20,24,31,.13);
  }
  .set-hint { display: none; }
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
  /* Ürünün ön yüzü: tasarım katmanları bunun içinde, dışarı taşan taşma payı
     kırpılıyor. Çerçeve yoksa tahtanın tamamı ön yüzdür. */
  .face { position: absolute; inset: 0; overflow: hidden; }
  /* Gerdirmeli tuvalin görünen yan yüzü: tasarımın kenar şeridi buraya
     sıkıştırılıyor, ürün görseli de üstüne binip gölgesini veriyor. */
  .wrapedge { position: absolute; overflow: hidden; z-index: 2; pointer-events: none; }
  .wrapedge .wrapclone { position: absolute; inset: 0; }

  /* display:none bir dosya girdisini Safari bazı sürümlerde hiç açmıyor;
     görünmez ama yerleşimde duran bir kutu güvenli. */
  .gizli-dosya {
    position: absolute; width: 1px; height: 1px;
    opacity: 0; pointer-events: none; overflow: hidden;
    clip-path: inset(50%); border: 0; padding: 0; margin: -1px;
  }

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
  /* Kalp, yıldız gibi şekillerde köşe maskenin dışında kalıyor ve rozet
     görünmüyordu; şekilli alanda numara ortada, boş alanın "+" işaretinin üstünde. */
  /* Harf ve şekil alanları boşken belirgin olmalı: açık zemin rengi beyaz
     tasarımda LOVE'ı neredeyse görünmez yapıyordu. "+" işareti harfin
     ortası boşsa (L, O, V) maskede kayboluyor; şeklin kendisi yeterli ipucu. */
  .slot.shaped.empty { background: #c9d0d9; border: 0; }
  .slot.shaped.empty.missing { background: #e8b9b3; }
  .slot.shaped.empty::after { content: none; }
  .slot.shaped .num { left: 50%; top: calc(50% - 30px); transform: translateX(-50%); }
  .slot.letter .num { display: none; }
  /* Canlı yazı: tasarımın üstünde, baskıdakiyle aynı kutuda */
  .tslot {
    position: absolute; z-index: 4; display: flex; align-items: center;
    pointer-events: none; overflow: hidden; line-height: 1.1;
    white-space: pre; text-wrap: nowrap;
  }
  /* Kartın yazısı doğrudan kartın üstünde yazılıyor */
  .tslot.edit { pointer-events: auto; cursor: text; border-radius: 3px; }
  .tslot.edit:hover { background: rgba(20,24,31,.05); }
  .tslot.edit:focus { outline: 2px solid var(--focus); outline-offset: 1px; background: #fff; }
  .tslot.edit:empty::before {
    content: attr(data-ph); color: #b3b9c2; font-style: italic;
  }
  .tslot.l { justify-content: flex-start; }
  .tslot.c { justify-content: center; }
  .tslot.r { justify-content: flex-end; }

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
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; }
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
  .fee-note { width: 100%; text-align: right; font-size: 13px; color: var(--ink-2); margin: -6px 0 0; }
  .fee-hint { font-size: 12px; color: var(--ink-2); margin: 4px 0 0; }
  .extras { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
  .extras .field + .field { margin-top: 14px; }
  .extras .check { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; cursor: pointer; }
  .extras .check input { width: 18px; height: 18px; margin: 0; }
  /* ── Metin alanları ─────────────────────────────────────────────── */
  .text-settings { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
  .fields { display: grid; gap: 16px; margin: 0; }
  @media (min-width: 640px) { .fields { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); } }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .field input, .field select {
    width: 100%; padding: 10px 12px; font: inherit;
    border: 1px solid var(--line-strong); border-radius: var(--r); background: var(--bg); color: var(--ink);
  }
  .field input:focus-visible, .field select:focus-visible {
    outline: 2px solid var(--focus); outline-offset: 1px; border-color: var(--focus);
  }

  /* Yazı tipi seçimi metin kutusunun altına, ona bağlı bir satır olarak
     giriyor: ayrı bir alan gibi görünürse müşteri hangi yazıya ait olduğunu
     çıkaramıyor. Etiket küçük ve soluk, asıl alan metnin kendisi. */
  .fontsatir { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .fontsatir label {
    margin: 0; flex: none; font-size: 12px; font-weight: 500; color: var(--ink-2);
  }
  .field .fontsec { padding: 7px 10px; font-size: 13px; }
  .fontsatir .renketiket {
    flex: none; font-size: 12px; font-weight: 500; color: var(--ink-2);
  }
  .renkler { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  /* Serbest renk seçici: kutucuklarla aynı boyda, içi renk tekerleği */
  /* ".field input" kuralı genişliği %100 yapıp kutuyu şeride çeviriyordu;
     seçici o kuraldan daha özgül olmalı */
  .field .renkler input.renk-serbest {
    -webkit-appearance: none; appearance: none; flex: none;
    width: 26px; height: 26px; min-height: 0; padding: 0; border-radius: 50%; cursor: pointer;
    border: 1px solid rgba(0,0,0,.18); overflow: hidden;
    background: conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935);
  }
  .field .renkler input.renk-serbest::-webkit-color-swatch-wrapper { padding: 0; }
  .field .renkler input.renk-serbest::-webkit-color-swatch { border: 0; opacity: 0; }
  .field .renkler input.renk-serbest::-moz-color-swatch { border: 0; opacity: 0; }
  .field .renkler input.renk-serbest.secili { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--ink); }
  .boyutlar { display: flex; gap: 6px; flex-wrap: wrap; }
  .boyutlar .vopt { padding: 6px 10px; font-size: 13px; }
  .renk {
    width: 26px; height: 26px; padding: 0; border-radius: 50%;
    border: 1px solid rgba(0,0,0,.18); cursor: pointer;
    /* Seçili halka rengin kendisinden bağımsız olmalı: koyu bir kenarlık
       siyah kutucukta görünmüyordu. */
    box-shadow: 0 0 0 0 var(--focus); transition: box-shadow .12s ease;
  }
  .renk.acik { border-color: rgba(0,0,0,.32); }
  .renk.secili { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ink); }
  .renk:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

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
  .crop-row .btn { white-space: nowrap; }

  /* ── Önizleme çıktısı ───────────────────────────────────────────── */

  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%;
    animation: spin .7s linear infinite; vertical-align: -2px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }

  @media (max-width: 799px) {
    .wrap { padding: 4px 16px 28px; }
    .head { margin-bottom: 18px; }
    .editor { display: flex; flex-direction: column; gap: 18px; }
    .control-column { display: contents; }
    .variants { order: 1; width: 100%; }
    .preview-panel { order: 2; position: static; width: 100%; }
    .controls-panel {
      order: 3; width: 100%; margin: 0; padding: 16px;
      border-radius: var(--r);
    }
    #boards.set {
      display: grid; grid-template-columns: none;
      grid-auto-flow: column; grid-auto-columns: calc(86% - 8px);
      gap: 12px; overflow-x: auto; overscroll-behavior-inline: contain;
      scroll-snap-type: inline mandatory; scroll-padding-inline: 16px;
      margin-inline: -16px; padding: 0 16px 10px;
      -webkit-overflow-scrolling: touch;
    }
    #boards.set .piece { scroll-snap-align: start; }
    .set-hint {
      display: flex; align-items: center; justify-content: space-between;
      margin: 8px 0 0; color: var(--ink-2); font-size: 12px;
    }
    .set-hint::after { content: "→"; font-size: 17px; color: var(--ink); }
    .actions { align-items: stretch; }
    .actions .btn { width: 100%; min-height: 48px; }
    .status { width: 100%; }
    .fields { grid-template-columns: minmax(0, 1fr); }
    .commitbar { align-items: stretch; }
    .commitbar .btn-commit { width: 100%; min-height: 48px; }
    .price { margin-left: 0; width: 100%; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>${escapeHtml(t.heading)}</h1>
    <p class="progress" id="progress"></p>
  </div>

  <div class="editor">
    <section class="preview-panel" aria-label="${escapeHtml(t.heading)}">
      <div id="mockup" class="mockup" hidden></div>
      <div id="boards"></div>
      ${multiPiece ? `<p class="set-hint">${escapeHtml(t.setHint)}</p>` : ""}
    </section>

    <div class="control-column">
      <div id="variants" class="variants" hidden></div>
      <aside class="controls-panel">
      <h2 class="section-head">${escapeHtml(t.photoSection)}</h2>
      <div class="actions">
        <button class="btn btn-primary" id="pickBtn">${escapeHtml(t.choosePhotos)}</button>
        <span class="status" id="status"></span>
      </div>
      <p class="hint" id="countHint">${escapeHtml(t.hint(imageSlotCount))}</p>
      <p class="hint" id="swapHint">${escapeHtml(t.swapHint)}</p>

      <div class="pool" id="pool" hidden></div>
      <section class="text-settings"${data.texts.length ? "" : " hidden"}>
        <h2 class="section-head">${escapeHtml(t.textSection)}</h2>
        <div class="fields" id="fields"></div>
      </section>

      <section class="extras" id="extras" hidden>
        <h2 class="section-head">${escapeHtml(t.extrasSection)}</h2>
        <div id="extrasList"></div>
      </section>

      <div class="commitbar">
        <span class="price" id="price"></span>
        <p class="fee-note" id="feeNote" hidden></p>
        <button class="btn btn-commit" id="cartBtn" disabled>${escapeHtml(t.addToCart)}</button>
      </div>
      </aside>
    </div>
  </div>
</div>

<div class="dropveil" id="dropveil">${escapeHtml(t.dropHere)}</div>

<input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp" multiple class="gizli-dosya">

<dialog class="crop" id="cropDlg">
  <div class="crop-body">
    <h2 id="cropTitle">${escapeHtml(t.cropTitle)}</h2>
    <div class="crop-stage" id="cropStage"></div>
    <div class="crop-row">
      <span style="font-size:13px">${escapeHtml(t.zoom)}</span>
      <input type="range" id="zoom" min="1" max="3" step="0.02" value="1">
    </div>
    <div class="crop-row">
      <button class="btn btn-outline" id="cropRotate" hidden>↻ ${escapeHtml(t.rotate)}</button>
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
  var fileInput = document.getElementById('fileInput');
  var poolEl = document.getElementById('pool');

  // Bütün parçaların slotları tek listede: yükleme dağıtımı, eksik sayımı ve
  // takas parçalar arasında çalışabilmeli. Müşteri için üç çerçeve tek bir
  // tasarım; hangi dosyaya bastığımız onu ilgilendirmiyor.
  var ALL = [];
  var pieceOfSlot = {};
  var slotEls = {};
  var pieceTitles = {};
  var boardEls = {};
  var faceEls = {};
  /** Parça başına: tuvalin (taşma dahil) ön yüz içindeki konumu */
  var canvasRects = {};
  var FRAME = null;
  var wrapEls = {};

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
    // Sunucudaki pickMockup ile aynı: eşleşme ve varsayılan yoksa ilk görsel
    if (!aktifMockup && liste.length) aktifMockup = liste[0];
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
    boardEls = {};
    faceEls = {};
    canvasRects = {};
    wrapEls = {};
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
  var KART_MODU = D.pieces.some(function (p) { return p.card; });
  if (KART_MODU) boardsEl.className = 'cards';
  else if (D.pieces.length > 1) boardsEl.className = 'set';

  D.pieces.forEach(function (piece, pi) {
    var wrap = document.createElement('div');
    wrap.className = 'piece';

    if (D.pieces.length > 1 && !KART_MODU) {
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
    boardEls[piece.id] = board;

    // Ön yüz kutusu: çerçeve varsa açıklığın yeri, yoksa tahtanın tamamı
    var face = document.createElement('div');
    face.className = 'face';
    if (FRAME) {
      face.style.left = (FRAME.opening.x * 100) + '%';
      face.style.top = (FRAME.opening.y * 100) + '%';
      face.style.width = (FRAME.opening.w * 100) + '%';
      face.style.height = (FRAME.opening.h * 100) + '%';
    }
    board.appendChild(face);
    faceEls[piece.id] = face;

    // Tuvalin ön yüz içindeki yeri. Yan yüzü olan üründe ön yüzde yalnızca
    // kesim alanı görünür: tasarım taşma payı kadar büyür ve kenarları kırpılır,
    // o pay tuvalin yanına sarılır. Yan yüz yoksa tasarım olduğu gibi oturur.
    var trim = (FRAME && FRAME.wrap && piece.trim && piece.trim.w > 0 && piece.trim.h > 0)
      ? piece.trim
      : { x: 0, y: 0, w: 1, h: 1 };
    var o = { x: -trim.x / trim.w, y: -trim.y / trim.h, w: 1 / trim.w, h: 1 / trim.h };
    canvasRects[piece.id] = o;

    if (piece.templateUrl) {
      var bg = document.createElement('img');
      bg.className = 'bg'; bg.src = piece.templateUrl; bg.alt = '';
      bg.style.left = (o.x * 100) + '%';
      bg.style.top = (o.y * 100) + '%';
      bg.style.width = (o.w * 100) + '%';
      bg.style.height = (o.h * 100) + '%';
      face.appendChild(bg);
    }

    piece.slots.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'slot empty';
      // Slot koordinatları baskı tuvaline göre; tuval de ön yüzün içine
      // yerleştiriliyor
      el.style.left = ((o.x + s.rect.x * o.w) * 100) + '%';
      el.style.top = ((o.y + s.rect.y * o.h) * 100) + '%';
      el.style.width = (s.rect.w * o.w * 100) + '%';
      el.style.height = (s.rect.h * o.h * 100) + '%';
    // Yarıçap tuval GENİŞLİĞİNE oran olarak saklanıyor ve baskıda alanın kısa
    // kenarının yarısıyla sınırlanıyor. Yüzde olarak doğrudan basınca alanın
    // kendi boyutuna göre yorumlanıyordu: köşeler baskıdakinden farklı, daire
    // ise elips görünüyordu. Aynı hesap burada da yapılıyor.
    if (s.mask) {
      el.classList.add('shaped');
      if (s.letter) el.classList.add('letter');
      el.style.webkitMaskImage = s.mask;
      el.style.maskImage = s.mask;
      el.style.webkitMaskSize = '100% 100%';
      el.style.maskSize = '100% 100%';
      el.style.webkitMaskRepeat = 'no-repeat';
      el.style.maskRepeat = 'no-repeat';
    } else if (s.radius > 0) {
      var wPx = s.rect.w * piece.canvas.width;
      var hPx = s.rect.h * piece.canvas.height;
      var rPx = Math.min(s.radius * piece.canvas.width, Math.min(wPx, hPx) / 2);
      el.style.borderRadius = (rPx / wPx * 100) + '% / ' + (rPx / hPx * 100) + '%';
    }
    // Döndürme alanın merkezinde; tahta oranı korunarak ölçeklendiği için
    // ekrandaki açı baskıdakiyle aynı
    if (s.rotation) el.style.transform = 'rotate(' + s.rotation + 'deg)';
    el.dataset.slot = s.id;

      // Parçada tek alan varsa numara rozeti bilgi taşımıyor, sadece
      // fotoğrafın üstünü kirletiyor. Kartlarda ise kaçıncı kart olduğu
      // toplu yüklemede sıranın karşılığı: duruyor.
      if (piece.slots.length > 1 || piece.card) {
        var num = document.createElement('span');
        num.className = 'num'; num.textContent = s.order;
        el.appendChild(num);
      }

    // Klavyeyle de dolaşılabilmeli: alanlar birer düğme gibi davranıyor
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', s.label || 'Fotoğraf alanı');
      el.addEventListener('pointerdown', function (e) { beginDrag(e, { kind: 'slot', id: s.id }); });
      // Boş alana tıklamak/dokunmak dosya seçtirir. Dolu alanla ilgilenmiyor:
      // onu pointerup zaten kırpma penceresine götürüyor, buradan da açsak
      // pencere iki kez tetiklenirdi.
      el.addEventListener('click', function () {
        if (fills[s.id]) return;
        replaceTarget = s.id;
        fileInput.click();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (fills[s.id]) onSlotClick(s.id);
        else { replaceTarget = s.id; fileInput.click(); }
      });

      face.appendChild(el);
      slotEls[s.id] = el;
    });

    if (piece.overlayUrl) {
      var ov = document.createElement('img');
      ov.className = 'ov'; ov.src = piece.overlayUrl; ov.alt = '';
      ov.style.left = (o.x * 100) + '%';
      ov.style.top = (o.y * 100) + '%';
      ov.style.width = (o.w * 100) + '%';
      ov.style.height = (o.h * 100) + '%';
      face.appendChild(ov);
    }
    if (FRAME && FRAME.wrap && FRAME.opening) {
      var we = document.createElement('div');
      we.className = 'wrapedge';
      we.style.left = (FRAME.wrap.rect.x * 100) + '%';
      we.style.top = (FRAME.wrap.rect.y * 100) + '%';
      we.style.width = (FRAME.wrap.rect.w * 100) + '%';
      we.style.height = (FRAME.wrap.rect.h * 100) + '%';
      var wi = document.createElement('div');
      wi.className = 'wrapclone';
      we.appendChild(wi);
      board.appendChild(we);
      wrapEls[piece.id] = { board: board, face: face, inner: wi };
    }
    if (FRAME) {
      var fr = document.createElement('img');
      fr.className = 'ov'; fr.src = FRAME.url; fr.alt = FRAME.label || '';
      // Kanvas gibi delinmemiş yüzeylerde görsel fotoğrafın üstüne çarpılır:
      // beyaz yüzey fotoğrafı olduğu gibi bırakır, doku ve gölge üstüne işlenir
      if (FRAME.blend === 'multiply') fr.style.mixBlendMode = 'multiply';
      board.appendChild(fr);
    }
  });
  }

  // ── Canlı yazı ─────────────────────────────────────────────────────────
  // Müşteri yazdıkça yazı tasarımın üstünde görünüyor. Sunucu baskıda aynı
  // fontu yazı yoluna çevirerek basıyor; burada aynı font @font-face ile
  // yükleniyor, aynı kutuya aynı oranla yerleştiriliyor. İkisi görsel olarak
  // örtüşüyor.
  var textEls = {};
  var yuklenenFontlar = {};

  function fontYukle(url, aile) {
    if (!url || yuklenenFontlar[url]) return;
    yuklenenFontlar[url] = true;
    var st = document.createElement('style');
    st.textContent = '@font-face{font-family:"' + aile.replace(/"/g, '') + '";'
      + 'src:url("' + url + '");font-display:swap;}';
    document.head.appendChild(st);
    // Font geldiğinde yazıların yeniden ölçülmesi gerekiyor
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { paintTexts(); });
    }
  }

  // Müşterinin seçtiği fontlar; slot kimliği → kütüphane adresi. Sunucuya da
  // aynı sözlük gidiyor, yani ekranda görülen ile basılan aynı font.
  var secilenFontlar = {};
  // Seçenek adresinden aile adına harita — canlı yazıda font-family gerekiyor
  var fontAileleri = {};

  /** Bu metin alanının o an geçerli font ailesi */
  function aktifAile(ts) {
    var secim = secilenFontlar[ts.id];
    if (secim && fontAileleri[secim]) return fontAileleri[secim];
    return ts.fontFamily || 'inherit';
  }

  // Müşterinin seçtiği yazı renkleri; slot kimliği → #rrggbb
  var secilenRenkler = {};
  /** Müşterinin seçtiği boyut çarpanı; yoksa 1 */
  var secilenBoyutlar = {};

  /** Sunucudaki scaledTextRect'in aynısı: kutu merkezinden büyür, tuvalden taşmaz */
  function boyutluKutu(r, k) {
    if (!k || k === 1) return r;
    var w = Math.min(1, r.w * k), h = Math.min(1, r.h * k);
    return {
      x: Math.min(1 - w, Math.max(0, r.x + (r.w - w) / 2)),
      y: Math.min(1 - h, Math.max(0, r.y + (r.h - h) / 2)),
      w: w, h: h,
    };
  }

  /** Bu metin alanının o an geçerli rengi */
  function aktifRenk(ts) {
    return secilenRenkler[ts.id] || ts.color;
  }

  function buildTexts() {
    textEls = {};
    D.pieces.forEach(function (piece) {
      (piece.textSlots || []).forEach(function (ts) {
        var face = faceEls[piece.id];
        if (!face) return;
        var o = canvasRects[piece.id] || { x: 0, y: 0, w: 1, h: 1 };
        if (ts.fontUrl) fontYukle(ts.fontUrl, ts.fontFamily || 'PLFont-' + ts.id);

        var el = document.createElement('div');
        el.className = 'tslot ' + (ts.align === 'left' ? 'l' : ts.align === 'right' ? 'r' : 'c');
        el.style.left = ((o.x + ts.rect.x * o.w) * 100) + '%';
        el.style.top = ((o.y + ts.rect.y * o.h) * 100) + '%';
        el.style.width = (ts.rect.w * o.w * 100) + '%';
        el.style.height = (ts.rect.h * o.h * 100) + '%';
        el.style.color = aktifRenk(ts);
        el.style.fontWeight = ts.bold ? '700' : '400';
        el.style.fontFamily = aktifAile(ts);
        if (ts.rotation) el.style.transform = 'rotate(' + ts.rotation + 'deg)';
        // Kartın yazısı kartın üstüne tıklanarak yazılıyor: müşteri 35 kutuluk
        // bir liste yerine hangi kartı yazdığını görerek yazıyor
        if (piece.card && ts.mode !== 'fixed') {
          el.className += ' edit';
          el.contentEditable = 'true';
          el.setAttribute('role', 'textbox');
          el.setAttribute('aria-label', ts.label || T.captionPlaceholder);
          el.setAttribute('data-ph', T.captionPlaceholder);
          el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
          });
          el.addEventListener('input', function () {
            var v = (el.textContent || '').split('\\n').join(' ').split('\\r').join('');
            var sinir = ts.maxLength || 40;
            if (v.length > sinir) {
              v = v.slice(0, sinir);
              el.textContent = v;
              imlecSona(el);
            }
            texts[ts.id] = v;
            paintTexts();
            updateStatus();
          });
          el.addEventListener('blur', paintTexts);
        }
        face.appendChild(el);
        textEls[piece.id + '::' + ts.id] = { el: el, ts: ts, piece: piece };
      });
    });
  }

  /** Yazı kırpıldığında imleç sona alınır, yoksa yazmaya baştan devam ediliyor */
  function imlecSona(el) {
    var aralik = document.createRange();
    aralik.selectNodeContents(el);
    aralik.collapse(false);
    var sec = window.getSelection();
    if (!sec) return;
    sec.removeAllRanges();
    sec.addRange(aralik);
  }

  var olcumCanvas = null;

  /** Metnin verilen puntodaki gerçek genişliği */
  function metinGenisligi(metin, px, ts) {
    if (!olcumCanvas) olcumCanvas = document.createElement('canvas');
    var ctx = olcumCanvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = (ts.bold ? '700 ' : '400 ') + px + 'px ' + aktifAile(ts);
    return ctx.measureText(metin).width;
  }

  function paintTexts() {
    Object.keys(textEls).forEach(function (k) {
      var kayit = textEls[k];
      var ts = kayit.ts;
      var el = kayit.el;
      var deger = (texts[ts.id] != null ? texts[ts.id] : ts.defaultValue) || '';
      // Yazarken metni geri yazmak imleci başa atıyor
      if (el !== document.activeElement) el.textContent = deger;
      // Font ve renk seçimi değişmiş olabilir; ölçümden önce uygulanmalı
      el.style.fontFamily = aktifAile(ts);
      el.style.color = aktifRenk(ts);
      if (!deger) return;

      var boardH = el.parentElement ? el.parentElement.clientHeight : 0;
      var o = canvasRects[kayit.piece.id] || { x: 0, y: 0, w: 1, h: 1 };
      // Boyut seçimi kutuyu ve puntoyu birlikte büyütüyor; baskı da aynı kuralla
      var k = secilenBoyutlar[ts.id] || 1;
      var kutuR = boyutluKutu(ts.rect, k);
      el.style.left = ((o.x + kutuR.x * o.w) * 100) + '%';
      el.style.top = ((o.y + kutuR.y * o.h) * 100) + '%';
      el.style.width = (kutuR.w * o.w * 100) + '%';
      el.style.height = (kutuR.h * o.h * 100) + '%';
      // Punto tuval YÜKSEKLİĞİNE oran; çerçeve varsa açıklık kadar ölçekleniyor
      var px = ts.fontSize * k * boardH * o.h;
      el.style.fontSize = px + 'px';

      // Taşarsa küçült. Ölçüm canvas ile yapılıyor: ortalanmış bir esnek
      // kutuda scrollWidth gerçek metin genişliğini vermiyor, metin iki uçtan
      // kırpılıyor ve tek geçişlik küçültme yetmiyordu. Sunucu da metni fontun
      // kendi genişliğiyle ölçüyor; aynı yöntem iki tarafı hizalı tutuyor.
      if (ts.overflow !== 'clip') {
        var kutu = el.clientWidth;
        var gercek = metinGenisligi(deger, px, ts);
        if (kutu > 0 && gercek > kutu) {
          el.style.fontSize = Math.max(6, Math.floor(px * (kutu / gercek))) + 'px';
        }
      }
    });
    planWrap();
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
    // Boş alanda sürükleyecek bir şey yok. Dosya seçici BURADA açılmıyor:
    // iOS Safari dosya penceresini yalnızca click/touchend içinden açtırıyor,
    // pointerdown'dan çağrıldığında sessizce yutuyordu — telefonda alanın
    // ortasındaki + işaretine basmak hiçbir şey yapmıyordu. Açma işi aşağıdaki
    // click dinleyicisinde.
    if (!sourceFill(src)) return;
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
    input.addEventListener('input', function () { texts[f.id] = input.value; paintTexts(); });
    input.addEventListener('change', function () { texts[f.id] = input.value; paintTexts(); });
    wrap.appendChild(input);

    // Mağaza bu alan için font seçimi açtıysa listeyi kur. Seçenekler kendi
    // yazı tipiyle görünüyor: adı okumak yerine harfleri görmek, telefonda
    // tek bakışta karar verdiriyor.
    if (f.fontChoices && f.fontChoices.length) {
      var fs = document.createElement('select');
      fs.className = 'fontsec';
      fs.id = 'fnt_' + f.id;
      fs.setAttribute('aria-label', (f.label || '') + ' ' + T.fontLabel);

      var varsayilan = document.createElement('option');
      varsayilan.value = '';
      varsayilan.textContent = T.fontDefault;
      if (f.fontFamily) varsayilan.style.fontFamily = f.fontFamily;
      fs.appendChild(varsayilan);

      f.fontChoices.forEach(function (c) {
        fontAileleri[c.url] = c.family;
        // Seçenek listesi açılmadan önce yüklensin, tıklayınca gecikme olmasın
        fontYukle(c.url, c.family);
        var opt = document.createElement('option');
        opt.value = c.url;
        opt.textContent = c.label;
        opt.style.fontFamily = '"' + c.family.replace(/"/g, '') + '", inherit';
        fs.appendChild(opt);
      });

      fs.addEventListener('change', function () {
        if (fs.value) secilenFontlar[f.id] = fs.value;
        else delete secilenFontlar[f.id];
        paintTexts();
      });

      var fw = document.createElement('div');
      fw.className = 'fontsatir';
      var fl = document.createElement('label');
      fl.textContent = T.fontLabel; fl.htmlFor = fs.id;
      fw.appendChild(fl); fw.appendChild(fs);
      wrap.appendChild(fw);
    }

    // Boyut seçimi: birkaç kademe, düğme olarak. Kaydırıcı telefonda hassas
    // ayar gerektiriyor ve baskıda doğrulanamayan ara değerler üretiyordu.
    if (f.sizeChoices && f.sizeChoices.length > 1) {
      var bw = document.createElement('div');
      bw.className = 'fontsatir';
      var bl = document.createElement('span');
      bl.className = 'renketiket';
      bl.textContent = T.yaziBoyutu;
      bw.appendChild(bl);
      var bg = document.createElement('div');
      bg.className = 'boyutlar';
      bg.setAttribute('role', 'group');
      bg.setAttribute('aria-label', (f.label || '') + ' ' + T.yaziBoyutu);
      f.sizeChoices.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'vopt';
        b.textContent = c.label;
        b.setAttribute('aria-pressed', c.value === 1 ? 'true' : 'false');
        b.addEventListener('click', function () {
          [].forEach.call(bg.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          if (c.value === 1) delete secilenBoyutlar[f.id];
          else secilenBoyutlar[f.id] = c.value;
          paintTexts();
        });
        bg.appendChild(b);
      });
      bw.appendChild(bg);
      wrap.appendChild(bw);
    }

    // Renk seçimi. Liste yerine kutucuk: renk okunacak bir şey değil,
    // görülecek bir şey — telefonda da tek dokunuşla değişiyor.
    if ((f.colorChoices && f.colorChoices.length) || f.colorFree) {
      var rw = document.createElement('div');
      rw.className = 'fontsatir';
      var rl = document.createElement('span');
      rl.className = 'renketiket';
      rl.textContent = T.yaziRengi;
      rw.appendChild(rl);

      var kutular = document.createElement('div');
      kutular.className = 'renkler';
      kutular.setAttribute('role', 'group');
      kutular.setAttribute('aria-label', (f.label || '') + ' ' + T.yaziRengi);

      var hepsi = [{ hex: f.color, label: T.yaziRengiVarsayilan, light: false, varsayilan: true }]
        .concat(f.colorChoices.filter(function (c) { return c.hex !== f.color; }));

      hepsi.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'renk' + (c.light ? ' acik' : '');
        b.style.background = c.hex;
        b.title = c.label;
        b.setAttribute('aria-label', c.label);
        b.dataset.hex = c.varsayilan ? '' : c.hex;
        if (c.varsayilan) b.classList.add('secili');
        b.addEventListener('click', function () {
          [].forEach.call(kutular.children, function (x) { x.classList.remove('secili'); });
          b.classList.add('secili');
          if (b.dataset.hex) secilenRenkler[f.id] = b.dataset.hex;
          else delete secilenRenkler[f.id];
          paintTexts();
        });
        kutular.appendChild(b);
      });

      // Mağaza serbest renge izin verdiyse listenin sonunda renk seçici
      if (f.colorFree) {
        var serbest = document.createElement('input');
        serbest.type = 'color';
        serbest.className = 'renk-serbest';
        serbest.value = f.color && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#1a1a1a';
        serbest.title = T.digerRenk;
        serbest.setAttribute('aria-label', T.digerRenk);
        serbest.addEventListener('input', function () {
          [].forEach.call(kutular.children, function (x) { x.classList.remove('secili'); });
          serbest.classList.add('secili');
          serbest.style.background = serbest.value;
          secilenRenkler[f.id] = serbest.value.toLowerCase();
          paintTexts();
        });
        kutular.appendChild(serbest);
      }

      rw.appendChild(kutular);
      wrap.appendChild(rw);
    }

    fieldsEl.appendChild(wrap);
  });

  // ── Seçeneğe göre ek ücret ─────────────────────────────────────────────
  // Hesabın aslı sunucuda (~/lib/option-pricing → computeOptionFee); burada
  // yalnız müşteriye canlı göstermek için aynı kurallar tekrarlanıyor.
  // Sepete eklerken sunucunun hesapladığı tutar kullanılır.
  var FIYAT = D.pricing || null;
  var PARA_BIRIMI = '';
  var secilenEkler = {};

  function para(n) {
    var x = Math.round(n * 100) / 100;
    if (PARA_BIRIMI) {
      try {
        return new Intl.NumberFormat(D.locale === 'en' ? 'en' : 'tr', { style: 'currency', currency: PARA_BIRIMI }).format(x);
      } catch (_) { /* tanınmayan para birimi */ }
    }
    return x.toFixed(2);
  }

  function secenekUcreti() {
    if (!FIYAT) return 0;
    var top = FIYAT.base || 0;
    D.texts.forEach(function (f) {
      var r = FIYAT.texts[f.id];
      if (!r) return;
      var deger = String(texts[f.id] || '').trim();
      var degisti = deger !== '' && deger !== String(f.defaultValue || '').trim();
      if (degisti && r.fee) top += r.fee;
      if (degisti && r.per_char) {
        var n = Array.from(deger.replace(/\\s+/g, '')).length - (r.free_chars || 0);
        if (n > 0) top += Math.round(n * r.per_char * 100) / 100;
      }
      var fnt = secilenFontlar[f.id];
      if (r.font && fnt && fnt !== f.fontUrlDefault) top += r.font;
      var rnk = secilenRenkler[f.id];
      if (r.color && rnk && rnk.toLowerCase() !== String(f.color || '').toLowerCase()) top += r.color;
      var byt = Number(secilenBoyutlar[f.id]);
      if (r.size && byt > 0 && byt !== 1) top += r.size;
    });
    FIYAT.extras.forEach(function (e) {
      var c = e.choices.filter(function (x) { return x.id === secilenEkler[e.id]; })[0];
      if (c) top += c.price;
    });
    return Math.round(top * 100) / 100;
  }

  function eksikSecenekler() {
    if (!FIYAT) return [];
    return FIYAT.extras
      .filter(function (e) { return e.required && !secilenEkler[e.id]; })
      .map(function (e) { return e.label; });
  }

  function ucretTazele() { if (FIYAT) fiyatYaz(sonVaryant); }

  function ucretliEtiket(label, price) {
    return price > 0 ? label + ' (+' + para(price) + ')' : label;
  }

  function ekSecenekleriKur() {
    var kutu = document.getElementById('extras');
    var liste = document.getElementById('extrasList');
    if (!FIYAT || !FIYAT.extras.length || !kutu || !liste) return;
    kutu.hidden = false;
    liste.innerHTML = '';
    FIYAT.extras.forEach(function (e) {
      var wrap = document.createElement('div');
      wrap.className = 'field';
      if (e.type === 'checkbox') {
        var c = e.choices[0];
        var lab = document.createElement('label');
        lab.className = 'check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = secilenEkler[e.id] === c.id;
        cb.addEventListener('change', function () {
          if (cb.checked) secilenEkler[e.id] = c.id; else delete secilenEkler[e.id];
          ucretTazele();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(ucretliEtiket(e.label, c.price)));
        wrap.appendChild(lab);
      } else {
        var l = document.createElement('label');
        l.textContent = e.label; l.htmlFor = 'ek_' + e.id;
        wrap.appendChild(l);
        var sel = document.createElement('select');
        sel.id = 'ek_' + e.id;
        var bos = document.createElement('option');
        bos.value = ''; bos.textContent = e.required ? T.choose : T.none;
        sel.appendChild(bos);
        e.choices.forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.id; o.textContent = ucretliEtiket(c.label, c.price);
          sel.appendChild(o);
        });
        sel.value = secilenEkler[e.id] || '';
        sel.addEventListener('change', function () {
          if (sel.value) secilenEkler[e.id] = sel.value; else delete secilenEkler[e.id];
          ucretTazele();
        });
        wrap.appendChild(sel);
      }
      liste.appendChild(wrap);
    });
  }

  /** Yazı alanının altında ücret ipucu: "+10 ₺ · karakter başı 1 ₺ (ilk 5 ücretsiz)" */
  function yaziUcretIpucu(f) {
    var r = FIYAT && FIYAT.texts[f.id];
    if (!r) return '';
    var p = [];
    if (r.fee) p.push('+' + para(r.fee));
    if (r.per_char) {
      p.push(T.feePerChar + ' ' + para(r.per_char)
        + (r.free_chars ? ' (' + String(T.feeFree).replace('{n}', r.free_chars) + ')' : ''));
    }
    if (r.font && f.fontChoices && f.fontChoices.length) p.push(T.feeFont + ' +' + para(r.font));
    if (r.color && ((f.colorChoices && f.colorChoices.length) || f.colorFree)) p.push(T.feeColor + ' +' + para(r.color));
    if (r.size && f.sizeChoices && f.sizeChoices.length > 1) p.push(T.feeSize + ' +' + para(r.size));
    return p.join(' · ');
  }

  function yaziIpuclariniYaz() {
    if (!FIYAT) return;
    D.texts.forEach(function (f) {
      var girdi = document.getElementById('tx_' + f.id);
      var alan = girdi && girdi.closest('.field');
      if (!alan) return;
      var metin = yaziUcretIpucu(f);
      var el = alan.querySelector('.fee-hint');
      if (!metin) { if (el) el.remove(); return; }
      if (!el) {
        el = document.createElement('p');
        el.className = 'fee-hint';
        girdi.insertAdjacentElement('afterend', el);
      }
      el.textContent = metin;
    });
  }

  if (FIYAT) {
    // Yazı, font, renk ve boyut değişikliklerinin hepsi ücreti etkileyebilir;
    // her birine ayrı ayrı bağlanmak yerine sayfadaki girdiler dinleniyor
    ['input', 'change', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () { setTimeout(ucretTazele, 0); }, true);
    });
  }

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

    if (!f) { el.classList.add('empty'); planWrap(); return; }
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
    yerlestir(img, f, W, H);
    planWrap();
  }

  /**
   * Fotoğrafı W×H kutusuna kırparak yerleştirir — alan, ürün görseli ve
   * kırpma penceresi aynı hesabı kullanıyor, baskı motoru da (slot-compose).
   *
   * Müşteri fotoğrafı çeyrek çevirdiyse kırpma DÖNMÜŞ fotoğrafın ölçüsüyle
   * yapılır; görsel ise ham yönünde boyutlanıp ortasından CSS ile döndürülür.
   */
  function yerlestir(img, f, W, H) {
    var q = f.rotate || 0;
    var yan = q === 90 || q === 270;
    var ew = yan ? f.height : f.width;
    var eh = yan ? f.width : f.height;
    var k = Math.max(W / ew, H / eh) * (f.scale || 1);
    var rw = ew * k, rh = eh * k;
    var left = -clamp((rw - W) / 2 - (f.offset_x || 0) * W, 0, rw - W);
    var top = -clamp((rh - H) / 2 - (f.offset_y || 0) * H, 0, rh - H);
    var iw = yan ? rh : rw, ih = yan ? rw : rh;
    img.style.width = iw + 'px';
    img.style.height = ih + 'px';
    img.style.left = (left + (rw - iw) / 2) + 'px';
    img.style.top = (top + (rh - ih) / 2) + 'px';
    img.style.transform = q ? 'rotate(' + q + 'deg)' : '';
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
      yerlestir(img, f, W, H);
    });
  }

  /**
   * Yan yüz: tahtanın kenardaki şeridinin kopyası, yan yüz alanına
   * sıkıştırılıyor. Kopya her çizimde yenileniyor; fotoğraf değişince yan yüz
   * de değişmeli.
   */
  var wrapTimer = 0;
  /** Yan yüz tasarım her değiştiğinde tazelenir; kare başına bir kez */
  function planWrap() {
    if (wrapTimer) return;
    wrapTimer = requestAnimationFrame(function () { wrapTimer = 0; paintWrap(); });
  }

  function paintWrap() {
    if (!FRAME || !FRAME.wrap || !FRAME.opening) return;
    var wr = FRAME.wrap;
    var yatay = wr.side === 'left' || wr.side === 'right';
    Object.keys(wrapEls).forEach(function (pid) {
      var kayit = wrapEls[pid];
      var face = kayit.face;
      var fw = face.clientWidth, fh = face.clientHeight;
      if (!fw || !fh) return;
      var o = canvasRects[pid] || { x: 0, y: 0, w: 1, h: 1 };

      // Yana sarılan şerit tasarımın taşma payıdır: ön yüzün dışında kalan
      // kısım. Pay tanımlı değilse ön yüzün kenarından bir şerit alınıyor —
      // matbaa da o durumda kenarı aynalayarak sarıyor.
      var dis = yatay
        ? (wr.side === 'right' ? o.x + o.w - 1 : -o.x)
        : (wr.side === 'bottom' ? o.y + o.h - 1 : -o.y);
      var payVar = dis > 0.0005;
      var oran = payVar ? dis : Math.min(0.5, wr.slice > 0 ? wr.slice : 0.05);
      var sw = yatay ? oran * fw : fw;
      var sh = yatay ? fh : oran * fh;
      var sx = !yatay ? 0
        : wr.side === 'right' ? (payVar ? fw : fw - sw)
        : (payVar ? -sw : 0);
      var sy = yatay ? 0
        : wr.side === 'bottom' ? (payVar ? fh : fh - sh)
        : (payVar ? -sh : 0);
      if (!(sw > 0) || !(sh > 0)) return;

      var kopya = document.createElement('div');
      kopya.style.position = 'absolute';
      kopya.style.width = fw + 'px';
      kopya.style.height = fh + 'px';
      for (var i = 0; i < face.children.length; i++) {
        kopya.appendChild(face.children[i].cloneNode(true));
      }

      var kx = (wr.rect.w * kayit.board.clientWidth) / sw;
      var ky = (wr.rect.h * kayit.board.clientHeight) / sh;
      kopya.style.transformOrigin = '0 0';
      kopya.style.transform = 'scale(' + kx + ',' + ky + ')';
      kopya.style.left = (-sx * kx) + 'px';
      kopya.style.top = (-sy * ky) + 'px';

      kayit.inner.innerHTML = '';
      kayit.inner.appendChild(kopya);
    });
  }

  function renderAll() {
    ALL.forEach(function (s) { paint(s.id); });
    paintTexts();
    paintMockup();
    paintWrap();
    renderPool();
    updateStatus();
  }

  window.addEventListener('resize', function () {
    ALL.forEach(function (s) { layout(s.id); });
    paintTexts();
    paintMockup();
    paintWrap();
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
    if (slot && !slot.allow.pan && !slot.allow.zoom && !slot.allow.rotate) return;
    cropSlot = slotId;
    document.getElementById('cropTitle').textContent = T.cropTitle + ' — ' + (slot ? slot.label : '');
    var f = fills[slotId];
    zoom.value = String(f.scale || 1);
    zoom.disabled = !(slot && slot.allow.zoom);
    document.getElementById('cropRotate').hidden = !(slot && slot.allow.rotate);
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
    yerlestir(img, f, W, H);
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
    dlg.close(); paint(cropSlot); paintMockup(); paintWrap(); updateStatus();
  });
  // Çeyrek dönüş: kaydırma dönmüş fotoğrafa göre tutulduğu için sıfırlanıyor,
  // yoksa eski kadraj yeni yönde anlamsız bir yere düşüyordu.
  document.getElementById('cropRotate').addEventListener('click', function () {
    var f = fills[cropSlot];
    if (!f) return;
    f.rotate = ((f.rotate || 0) + 90) % 360;
    f.offset_x = 0; f.offset_y = 0;
    layoutCrop();
  });
  document.getElementById('cropReplace').addEventListener('click', function () {
    replaceTarget = cropSlot; dlg.close(); fileInput.click();
  });
  document.getElementById('cropClear').addEventListener('click', function () {
    delete fills[cropSlot]; dlg.close(); renderAll();
  });
  dlg.addEventListener('close', function () { paint(cropSlot); paintMockup(); paintWrap(); updateStatus(); });

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
      fonts: secilenFontlar,
      colors: secilenRenkler,
      sizes: secilenBoyutlar,
      extras: secilenEkler,
      // Sipariş önizlemesinde doğru renk çerçevesi seçilebilsin
      optionValues: URUN ? URUN.options.map(function (o) { return secim[o.name]; }) : [],
      fills: ALL.filter(function (s) { return fills[s.id] && fills[s.id].url; })
        .map(function (s) {
          var f = fills[s.id];
          return { slot_id: s.id, url: f.url, offset_x: f.offset_x, offset_y: f.offset_y, scale: f.scale, rotate: f.rotate || 0 };
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

  cartBtn.addEventListener('click', function () {
    var eksikEk = eksikSecenekler();
    if (eksikEk.length) {
      statusEl.className = 'status warnc';
      statusEl.textContent = String(T.chooseOption).replace('{x}', eksikEk.join(', '));
      return;
    }
    cartBtn.disabled = true;
    cartBtn.innerHTML = '<span class="spinner"></span> ' + T.adding;
    post('render')
      .then(function (res) {
        if (res.error) throw new Error(res.error);
        // Sipariş satırına tasarım kaydının anahtarı ve şablon sürümü yazılıyor:
        // baskı dosyası bozulursa tasarım aynı sürümle yeniden üretilebilsin.
        var props = { _personalizer_template: D.templateId, _print_file: res.url };
        if (res.designToken) props._design_token = res.designToken;
        // Sipariş ekranında müşterinin gördüğü hâl görünsün
        if (res.previewUrl) props._front_preview_url = res.previewUrl;
        if (res.templateVersion) props._template_version = String(res.templateVersion);
        // Seçeneğe göre ek ücret: tutar sunucunun hesapladığı. Sepet fonksiyonu
        // satırı "ürün + kişiselleştirme ücreti" olarak ikiye böler.
        if (res.optionFee > 0) {
          props._design_role = 'pending_options';
          props._surcharge_unit_total = Number(res.optionFee).toFixed(2);
        }
        (res.extras || []).forEach(function (x) { props[x.label] = x.value; });
        // Set ürününde üretime birden fazla dosya gidiyor; hepsi sipariş
        // satırında olmalı, yoksa üretim yalnızca ilk çerçeveyi basar
        if (res.pieces && res.pieces.length > 1) {
          props._print_files = res.pieces.map(function (p) { return p.url; }).join(',');
          props._piece_count = String(res.pieces.length);
        }
        D.texts.forEach(function (f) {
          if (texts[f.id]) props[f.label] = texts[f.id];
          // Seçilen yazı tipi sipariş satırında da görünsün: üretimde bir şey
          // ters giderse operatör dosyayı açmadan hangi fontla basıldığını
          // görebilmeli.
          var sec = secilenFontlar[f.id];
          if (sec && f.fontChoices) {
            var bulunan = f.fontChoices.filter(function (c) { return c.url === sec; })[0];
            if (bulunan) props[f.label + ' — ' + T.fontLabel] = bulunan.label;
          }
          var renk = secilenRenkler[f.id];
          if (renk) {
            var rBul = (f.colorChoices || []).filter(function (c) { return c.hex === renk; })[0];
            props[f.label + ' — ' + T.yaziRengi] = rBul ? rBul.label : renk;
          }
          var boy = secilenBoyutlar[f.id];
          if (boy && f.sizeChoices) {
            var bBul = f.sizeChoices.filter(function (c) { return c.value === boy; })[0];
            if (bBul) props[f.label + ' — ' + T.yaziBoyutu] = bBul.label;
          }
        });

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

  var sonVaryant = null;
  function fiyatYaz(v) {
    sonVaryant = v || null;
    if (!priceEl) return;
    var ucret = secenekUcreti();
    var not = document.getElementById('feeNote');
    if (not) {
      not.hidden = !(ucret > 0);
      not.textContent = ucret > 0 ? T.feeLabel + ': +' + para(ucret) : '';
    }
    if (!v || !v.price) { priceEl.textContent = ''; return; }
    // Tema yeni sürümdeyse sayısal fiyat ve para birimi gelir; eski temada
    // ürün fiyatı olduğu gibi yazılır, ücret altta ayrıca görünür
    priceEl.textContent = ucret > 0 && typeof v.price_cents === 'number' && PARA_BIRIMI
      ? para(v.price_cents / 100 + ucret)
      : v.price;
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
    buildTexts();
    buildMockup();
    renderAll();
    scheduleHeight();
  }

  // Tema, ürünün varyantlarını yükleme sonrası gönderiyor. URL ile göndermek
  // uzun varyant listelerinde adres sınırına takılıyordu.
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'PERSONALIZER_PRODUCT') return;
    URUN = { options: e.data.options || [], variants: e.data.variants || [] };
    if (e.data.currency) PARA_BIRIMI = String(e.data.currency);
    // Para birimi gelince ipuçları ve seçenek fiyatları doğru biçimle yeniden yazılsın
    ekSecenekleriKur();
    yaziIpuclariniYaz();
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
  buildTexts();
  buildMockup();
  renderAll();
  ekSecenekleriKur();
  yaziIpuclariniYaz();
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
