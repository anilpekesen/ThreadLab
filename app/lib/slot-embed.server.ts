import { type PersonalizerTemplate } from "~/models/personalizer.server";
import { getPrintProductPublic } from "~/models/print-product.server";
import { printCanvas } from "~/lib/print-spec";
import { normalizeSlots, isImageSlot, isTextSlot } from "~/lib/slots";

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

export interface SlotEmbedOptions {
  variantId: string;
  shop: string;
  locale: string;
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
  };

  function page(message: string) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <body style="font:15px system-ui;padding:24px;color:#444">${message}</body>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "frame-ancestors *" } },
    );
  }

  if (!template) return page(t.notFound);

  const slots = normalizeSlots(template.slots);
  const imageSlots = slots.filter(isImageSlot).sort((a, b) => a.order - b.order);
  // Slotu olmayan şablon bu akışa ait değil; çağıran eski arayüze düşsün
  if (imageSlots.length === 0) return null;

  // Slot var ama ebat bağlanmamışsa şablon eksik kurulmuş demektir. Eski
  // arayüze düşmek burada yanlış olur: o arayüz slotları bilmiyor ve müşteriye
  // tek fotoğraflık bir akış gösterirdi.
  const product = template.print_product_id
    ? await getPrintProductPublic(template.print_product_id)
    : null;
  if (!product) return page(t.noSize);

  const textSlots = slots.filter(isTextSlot).filter((s) => s.mode !== "fixed");
  const canvas = printCanvas(product);

  const data = {
    templateId: template.id,
    name: template.name,
    variantId,
    shop,
    locale: isTr ? "tr" : "en",
    templateUrl: template.template_url,
    overlayUrl: template.overlay_url,
    canvas: { width: canvas.canvasWidth, height: canvas.canvasHeight },
    slots: imageSlots.map((s) => ({
      id: s.id, rect: s.rect, label: s.label, order: s.order,
      radius: s.radius ?? 0, fit: s.fit, allow: s.allow,
      // 300 dpi'da bu alanı dolduran fotoğrafın olması gereken kısa kenarı
      needPx: Math.min(
        Math.round(s.rect.w * canvas.canvasWidth),
        Math.round(s.rect.h * canvas.canvasHeight),
      ),
    })),
    texts: textSlots.map((s) => ({
      id: s.id, label: s.label, mode: s.mode,
      maxLength: s.max_length, defaultValue: s.default_value,
      options: s.options ?? [],
    })),
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
  templateUrl: string;
  overlayUrl: string;
  canvas: { width: number; height: number };
  slots: Array<Record<string, unknown>>;
  texts: Array<Record<string, unknown>>;
}

/**
 * Sayfayı üretir. Loader'dan ayrı durması, arayüzün gerçek bir şablon ve
 * veritabanı olmadan da açılıp denenebilmesi içindir.
 */
export function renderSlotPage(data: SlotPageData, t: Record<string, any>): string {
  const imageSlotCount = data.slots.length;
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
  .preview-out img { width:100%; border-radius:8px; border:1px solid #e3e3e3; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.4);
             border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:-2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="board-outer">
    <div class="board" id="board"></div>
  </div>

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

  var board = document.getElementById('board');
  var statusEl = document.getElementById('status');
  var cartBtn = document.getElementById('cartBtn');
  var previewBtn = document.getElementById('previewBtn');
  var fileInput = document.getElementById('fileInput');
  var poolEl = document.getElementById('pool');

  board.style.aspectRatio = D.canvas.width + ' / ' + D.canvas.height;

  // ── Tahtayı kur ────────────────────────────────────────────────────────
  if (D.templateUrl) {
    var bg = document.createElement('img');
    bg.className = 'bg'; bg.src = D.templateUrl; bg.alt = '';
    board.appendChild(bg);
  }

  var slotEls = {};
  D.slots.forEach(function (s) {
    var el = document.createElement('div');
    el.className = 'slot empty';
    el.style.left = (s.rect.x * 100) + '%';
    el.style.top = (s.rect.y * 100) + '%';
    el.style.width = (s.rect.w * 100) + '%';
    el.style.height = (s.rect.h * 100) + '%';
    if (s.radius > 0) el.style.borderRadius = (s.radius * 100) + '%';
    el.dataset.slot = s.id;

    var num = document.createElement('span');
    num.className = 'num'; num.textContent = s.order;
    el.appendChild(num);

    el.addEventListener('pointerdown', function (e) { beginDrag(e, { kind: 'slot', id: s.id }); });

    board.appendChild(el);
    slotEls[s.id] = el;
  });

  if (D.overlayUrl) {
    var ov = document.createElement('img');
    ov.className = 'ov'; ov.src = D.overlayUrl; ov.alt = '';
    board.appendChild(ov);
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

  function renderAll() {
    D.slots.forEach(function (s) { paint(s.id); });
    renderPool();
    updateStatus();
  }

  window.addEventListener('resize', function () {
    D.slots.forEach(function (s) { layout(s.id); });
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
    D.slots.forEach(function (s) { if (!fills[s.id]) n++; });
    return n;
  }

  function uploadsPending() {
    return Object.keys(fills).some(function (id) { return !fills[id].url; })
      || pool.some(function (p) { return !p.url; });
  }

  function updateStatus() {
    var miss = missingCount();
    D.slots.forEach(function (s) {
      slotEls[s.id].classList.toggle('missing', !fills[s.id] && miss < D.slots.length);
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
        for (var i = 0; i < D.slots.length; i++) {
          if (!fills[D.slots[i].id]) { free = D.slots[i].id; break; }
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
    stage.style.aspectRatio = (slot.rect.w * D.canvas.width) + ' / ' + (slot.rect.h * D.canvas.height);
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
    dlg.close(); paint(cropSlot); updateStatus();
  });
  document.getElementById('cropReplace').addEventListener('click', function () {
    replaceTarget = cropSlot; dlg.close(); fileInput.click();
  });
  document.getElementById('cropClear').addEventListener('click', function () {
    delete fills[cropSlot]; dlg.close(); renderAll();
  });
  dlg.addEventListener('close', function () { paint(cropSlot); updateStatus(); });

  // ── Önizleme ve sepet ──────────────────────────────────────────────────
  function payload(mode) {
    return {
      templateId: D.templateId,
      locale: D.locale,
      mode: mode,
      texts: texts,
      fills: D.slots.filter(function (s) { return fills[s.id] && fills[s.id].url; })
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
        var im = document.createElement('img');
        im.src = res.url; im.alt = '';
        out.appendChild(im);
        out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      })
      .catch(function (err) {
        statusEl.className = 'status warnc';
        statusEl.textContent = err.message || T.error;
      })
      .finally(function () {
        previewBtn.disabled = false;
        previewBtn.textContent = T.preview;
        notifyHeight();
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
    for (var i = 0; i < D.slots.length; i++) if (D.slots[i].id === id) return D.slots[i];
    return null;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function notifyHeight() {
    if (window.parent === window) return;
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'PERSONALIZER_RESIZE', height: h }, '*');
  }
  window.addEventListener('load', notifyHeight);
  window.addEventListener('resize', notifyHeight);
  new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true });

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
