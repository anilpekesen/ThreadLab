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
  };

  function page(message: string) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <body style="font:15px system-ui;padding:24px;color:#444">${message}</body>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "frame-ancestors *" } },
    );
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

  // Müşterinin seçtiği varyanta uyan ürün görseli. Yoksa yalnızca baskı
  // tuvalleri gösterilir; mockup zorunlu değil.
  const mockup = pickMockup(template.mockups, opts.optionValues ?? []);

  // Alan tanımlanmamış bir mockup "çerçeve" demektir: ortası şeffaf bırakılmış
  // bir ürün görseli. Açıklığı taramayla buluyoruz, çünkü mağaza sahibinden
  // her renk için elle dikdörtgen çizmesini istemek gereksiz bir yük — çerçeve
  // görselleri zaten şeffaf ortalı geliyor.
  const opening = mockup && mockup.areas.length === 0
    ? await mockupOpening(mockup.url)
    : null;

  const data = {
    templateId: template.id,
    name: template.name,
    variantId,
    shop,
    locale: isTr ? "tr" : "en",
    pieces: piecePayload,
    texts,
    mockup: mockup
      ? { url: mockup.url, label: mockup.label, areas: mockup.areas, opening }
      : null,
  };

  return new Response(renderSlotPage(data, t), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

export interface SlotPageData {
  templateId: string;
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
  /** Seçili varyantın ürün görseli ve üzerindeki gösterim alanları */
  mockup: {
    url: string;
    label: string;
    areas: Array<{ piece_id: string; rect: { x: number; y: number; w: number; h: number }; mask_url?: string }>;
    /** Çerçeve tipi mockup'ta fotoğrafın görüneceği şeffaf açıklık */
    opening: { x: number; y: number; w: number; h: number; aspect: number } | null;
  } | null;
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
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; color:#1d2129; background:#fff; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
  .board-outer { position: relative; width: 100%; background:#f6f6f6; border:1px solid #e3e3e3; border-radius:8px; overflow:hidden; }
  .mockup { position:relative; width:100%; margin-bottom:16px; border-radius:10px; overflow:hidden; background:#f6f6f6; }
  .mockup > img.base { display:block; width:100%; }
  .mockup .area { position:absolute; overflow:hidden; }
  .mockup .area img { position:absolute; max-width:none; }
  .mockup .bos { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
                 background:rgba(255,255,255,.55); color:#6b7280; font-size:12px; }
  .piece { margin-bottom: 18px; }
  /* Set ürünlerinde parçalar yan yana: müşteri üç çerçeveyi bir arada görmeli,
     duvarda da öyle duracak. Dar ekranda alt alta iner. */
  #boards.set { display: grid; gap: 14px; grid-template-columns: 1fr; }
  @media (min-width: 560px) { #boards.set { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); } }
  #boards.set .piece { margin-bottom: 0; }
  .piece-title { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:#4b5563; margin:0 0 6px; }
  .piece-title .n { background:#1d2129; color:#fff; border-radius:4px; padding:1px 7px; font-size:11px; }
  .piece-title .eksik { color:#b3261e; font-weight:500; }
  .board { position: relative; width: 100%; }
  .board img.bg, .board img.ov { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; pointer-events:none; }
  .board img.ov { z-index: 3; }
  .slot { position:absolute; overflow:hidden; z-index:2; background:rgba(0,0,0,.045); cursor:pointer; }
  .slot.empty { outline:2px dashed #c4c9d0; outline-offset:-2px; }
  .slot.missing { outline-color:#e23b4a; background:rgba(226,59,74,.08); }
  .slot img { position:absolute; max-width:none; pointer-events:none; user-select:none; }
  .slot .num { position:absolute; z-index:2; left:4px; top:4px; font-size:11px; font-weight:600; color:#fff;
               background:rgba(30,34,40,.62); border-radius:3px; padding:1px 5px; pointer-events:none; }
  .slot .warn { position:absolute; z-index:2; right:4px; top:4px; font-size:12px; }
  .slot.dragover { outline:3px solid #2f6fd0; outline-offset:-3px; }
  .slot, .pool .chip { touch-action: manipulation; }
  img.ghost { position:fixed; z-index:99; width:84px; height:84px; object-fit:cover; border-radius:6px;
              transform:translate(-50%,-50%); pointer-events:none; opacity:.9;
              box-shadow:0 6px 18px rgba(0,0,0,.3); }
  .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:14px 0; }
  .btn { appearance:none; border:0; border-radius:8px; padding:11px 18px; font:600 15px system-ui; cursor:pointer; }
  .btn-primary { background:#1d2129; color:#fff; }
  .btn-primary:disabled, .btn-success:disabled, .btn-ghost:disabled { background:#c8ccd1; color:#6b7280; cursor:not-allowed; }
  .btn-ghost { background:#eef0f2; color:#1d2129; }
  .btn-success { background:#0f8a4d; color:#fff; }
  .status { font-size:14px; }
  .status.warnc { color:#b3261e; }
  .status.okc { color:#0f8a4d; }
  .hint { font-size:13px; color:#6b7280; margin:6px 0 0; }
  .fields { display:grid; gap:12px; margin:18px 0; }
  .field label { display:block; font-size:13px; font-weight:600; margin-bottom:5px; }
  .field input, .field select { width:100%; padding:10px 12px; border:1px solid #d5d9de; border-radius:8px; font:15px system-ui; }
  .pool { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }
  .pool .chip { width:56px; height:56px; border-radius:6px; overflow:hidden; border:1px solid #d5d9de; cursor:grab; }
  .pool .chip img { width:100%; height:100%; object-fit:cover; }
  dialog.crop { border:0; border-radius:12px; padding:0; max-width:min(92vw,420px); width:100%; }
  dialog.crop::backdrop { background:rgba(0,0,0,.45); }
  .crop-body { padding:16px; }
  .crop-stage { position:relative; width:100%; overflow:hidden; border-radius:8px; background:#f0f0f0; touch-action:none; cursor:grab; }
  .crop-stage img { position:absolute; max-width:none; pointer-events:none; }
  .crop-row { display:flex; align-items:center; gap:10px; margin-top:12px; }
  .crop-row input[type=range] { flex:1; }
  .preview-out { margin-top:16px; }
  .preview-out.set { display:grid; gap:12px; grid-template-columns: 1fr; }
  @media (min-width: 560px) { .preview-out.set { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); } }
  .preview-out img { width:100%; border-radius:8px; border:1px solid #e3e3e3; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.4);
             border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:-2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
</head>
<body>
<div class="wrap">
  <div id="mockup" class="mockup" hidden></div>
  <div id="boards"></div>

  <p class="hint" id="swapHint">${escapeHtml(t.swapHint)}</p>

  <div class="bar">
    <button class="btn btn-primary" id="pickBtn">${escapeHtml(t.choosePhotos)}</button>
    <span class="status" id="status"></span>
  </div>
  <p class="hint" id="countHint">${escapeHtml(t.hint(imageSlotCount))}</p>

  <div class="pool" id="pool" hidden></div>

  <div class="fields" id="fields"></div>

  <div class="bar">
    <button class="btn btn-ghost" id="previewBtn">${escapeHtml(t.preview)}</button>
    <button class="btn btn-success" id="cartBtn" disabled>${escapeHtml(t.addToCart)}</button>
  </div>

  <div class="preview-out" id="previewOut"></div>
</div>

<input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp" multiple hidden>

<dialog class="crop" id="cropDlg">
  <div class="crop-body">
    <strong id="cropTitle">${escapeHtml(t.cropTitle)}</strong>
    <div class="crop-stage" id="cropStage"></div>
    <div class="crop-row">
      <span style="font-size:13px">${escapeHtml(t.zoom)}</span>
      <input type="range" id="zoom" min="1" max="3" step="0.02" value="1">
    </div>
    <div class="crop-row">
      <button class="btn btn-ghost" id="cropReplace">${escapeHtml(t.replace)}</button>
      <button class="btn btn-ghost" id="cropClear">${escapeHtml(t.clear)}</button>
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
  D.pieces.forEach(function (p) {
    p.slots.forEach(function (s) { ALL.push(s); pieceOfSlot[s.id] = p; });
  });

  var slotEls = {};
  var pieceTitles = {};

  // ── Tahtaları kur: her parça kendi tuvali ──────────────────────────────
  // Çerçeve tipi mockup: ortası şeffaf tek bir ürün görseli. Her parça
  // tahtası bu çerçevenin içine çiziliyor, yani müşteri fotoğrafını seçtiği
  // renkteki gerçek çerçevede görüyor ve düzenlemesini orada yapıyor.
  var FRAME = (D.mockup && !D.mockup.areas.length && D.mockup.opening) ? D.mockup : null;

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

    el.addEventListener('pointerdown', function (e) { beginDrag(e, { kind: 'slot', id: s.id }); });

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
    if (!D.mockup || !D.mockup.areas.length) return;
    mockupEl.hidden = false;
    mockupEl.innerHTML = '';

    var base = document.createElement('img');
    base.className = 'base';
    base.src = D.mockup.url;
    base.alt = D.mockup.label || '';
    base.addEventListener('load', paintMockup);
    mockupEl.appendChild(base);

    D.mockup.areas.forEach(function (a) {
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
    if (!D.mockup) return;
    D.mockup.areas.forEach(function (a) {
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
    title.style.cssText = 'width:100%;font-size:13px;color:#6b7280';
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
    document.getElementById('pickBtn').textContent =
      Object.keys(fills).length ? T.chooseMore : T.choosePhotos;
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
          variantId: D.variantId,
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
            body: JSON.stringify({ shop: D.shop, variantId: D.variantId, quantity: 1, designToken: res.designToken || '', properties: props }),
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

  buildMockup();
  renderAll();
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
