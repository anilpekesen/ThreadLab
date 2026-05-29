// v40
// cache-bust-line-2
// cache-bust-line-3
// cache-bust-line-4
// cache-bust-line-5
// cache-bust-line-6
// cache-bust-line-7
// cache-bust-line-8
// cache-bust-line-9
// cache-bust-line-10
(function () {
  'use strict';

  // ── Shirt color palette (fallback) ───────────────────────────────────────
  var SHIRT_COLORS = [
    { name: 'Beyaz',   hex: '#ffffff' },
    { name: 'Siyah',   hex: '#111111' },
    { name: 'Lacivert',hex: '#1e3a5f' },
    { name: 'Kırmızı', hex: '#dc2626' },
    { name: 'Gri',     hex: '#6b7280' },
    { name: 'Yeşil',   hex: '#16a34a' },
    { name: 'Bordo',   hex: '#7f1d1d' },
    { name: 'Sarı',    hex: '#f59e0b' },
  ];

  // ── Renk adı → hex haritası (ürün varyantlarındaki renk adlarını eşleştirmek için) ───
  var COLOR_HEX_MAP = {
    'beyaz': '#ffffff', 'white': '#ffffff', 'ak': '#ffffff',
    'siyah': '#111111', 'black': '#111111',
    'lacivert': '#1e3a5f', 'navy': '#1e3a5f', 'navy blue': '#1e3a5f', 'dark navy': '#1e3a5f',
    'kırmızı': '#dc2626', 'kirmizi': '#dc2626', 'red': '#dc2626',
    'gri': '#6b7280', 'gray': '#6b7280', 'grey': '#6b7280',
    'antrasit': '#374151', 'anthracite': '#374151', 'koyu gri': '#374151', 'dark grey': '#374151', 'dark gray': '#374151',
    'açık gri': '#9ca3af', 'acik gri': '#9ca3af', 'light grey': '#9ca3af', 'light gray': '#9ca3af',
    'yeşil': '#16a34a', 'yesil': '#16a34a', 'green': '#16a34a',
    'koyu yeşil': '#15803d', 'koyu yesil': '#15803d', 'dark green': '#15803d',
    'açık yeşil': '#4ade80', 'acik yesil': '#4ade80', 'light green': '#4ade80',
    'bordo': '#7f1d1d', 'burgundy': '#7f1d1d', 'claret': '#7f1d1d',
    'sarı': '#f59e0b', 'sari': '#f59e0b', 'yellow': '#f59e0b',
    'mavi': '#2563eb', 'blue': '#2563eb',
    'açık mavi': '#38bdf8', 'acik mavi': '#38bdf8', 'light blue': '#38bdf8', 'bebe mavi': '#38bdf8', 'sky blue': '#38bdf8',
    'petrol': '#0e7490', 'petrol mavi': '#0e7490', 'teal': '#0d9488',
    'turuncu': '#f97316', 'orange': '#f97316',
    'pembe': '#ec4899', 'pink': '#ec4899',
    'açık pembe': '#f9a8d4', 'acik pembe': '#f9a8d4', 'light pink': '#f9a8d4', 'pudra': '#f9a8d4',
    'mor': '#7c3aed', 'purple': '#7c3aed', 'lila': '#a855f7', 'violet': '#8b5cf6',
    'bej': '#d4a574', 'beige': '#d4a574', 'krem': '#fef3c7', 'cream': '#fef3c7', 'ekru': '#f5f0e8', 'ecru': '#f5f0e8',
    'kahverengi': '#92400e', 'brown': '#92400e', 'camel': '#b45309',
    'haki': '#65a30d', 'khaki': '#65a30d', 'olive': '#4d7c0f', 'zeytin': '#4d7c0f',
    'indigo': '#4338ca', 'çivit': '#4338ca',
    'mercan': '#f43f5e', 'coral': '#f43f5e',
    'mint': '#6ee7b7', 'mint yeşil': '#6ee7b7',
    'füme': '#52525b', 'fume': '#52525b', 'smoke': '#52525b',
  };

  // ── Filter definitions ────────────────────────────────────────────────────
  var FILTER_DEFS = [
    { id: 'none',        label: 'Orijinal',   filters: [] },
    { id: 'grayscale',   label: 'Gri',        filters: [{ type: 'Grayscale' }] },
    { id: 'sepia',       label: 'Sepya',      filters: [{ type: 'Sepia' }] },
    { id: 'invert',      label: 'Ters',       filters: [{ type: 'Invert' }] },
    { id: 'vintage',     label: 'Vintage',    filters: [{ type: 'Sepia', sepia: 0.5 }, { type: 'Noise', noise: 30 }] },
    { id: 'kodachrome',  label: 'Kodachrome', filters: [{ type: 'Saturation', saturation: 0.3 }, { type: 'Contrast', contrast: 0.1 }] },
    { id: 'technicolor', label: 'Techni',     filters: [{ type: 'Saturation', saturation: 0.5 }, { type: 'Brightness', brightness: 0.05 }] },
    { id: 'polaroid',    label: 'Polaroid',   filters: [{ type: 'Brightness', brightness: 0.1 }, { type: 'Sepia', sepia: 0.2 }] },
    { id: 'brownie',     label: 'Brownie',    filters: [{ type: 'Sepia', sepia: 0.8 }, { type: 'Brightness', brightness: -0.1 }] },
  ];

  // ── Template designs ──────────────────────────────────────────────────────
  var TEMPLATE_DESIGNS = [
    {
      id: 'original', label: '100% Orijinal',
      build: function (canvas) {
        var rect = new fabric.Rect({ left: 10, top: 10, width: canvas.width - 20, height: canvas.height - 20,
          fill: 'transparent', stroke: '#111827', strokeWidth: 2, rx: 6, selectable: false, evented: false });
        var txt = new fabric.IText('100%\nORİJİNAL', {
          left: canvas.width / 2, top: canvas.height / 2,
          originX: 'center', originY: 'center',
          fontFamily: 'Impact', fontSize: 38, fill: '#111827',
          textAlign: 'center', lineHeight: 1.1,
        });
        canvas.add(rect, txt);
        if (canvas.setActiveObject) canvas.setActiveObject(txt);
      },
    },
    {
      id: 'nofear', label: 'No Fear',
      build: function (canvas) {
        var txt = new fabric.IText('NO\nFEAR', {
          left: canvas.width / 2, top: canvas.height / 2,
          originX: 'center', originY: 'center',
          fontFamily: 'Impact', fontSize: 52, fill: '#dc2626',
          textAlign: 'center', lineHeight: 1,
        });
        canvas.add(txt);
        if (canvas.setActiveObject) canvas.setActiveObject(txt);
      },
    },
    {
      id: 'limited', label: 'Limited Edition',
      build: function (canvas) {
        var rect = new fabric.Rect({ left: canvas.width / 2, top: canvas.height / 2,
          originX: 'center', originY: 'center',
          width: canvas.width - 30, height: 50,
          fill: '#111827', rx: 4, selectable: false, evented: false });
        var txt = new fabric.IText('LIMITED EDITION', {
          left: canvas.width / 2, top: canvas.height / 2,
          originX: 'center', originY: 'center',
          fontFamily: 'Impact', fontSize: 24, fill: '#ffffff',
          textAlign: 'center', charSpacing: 80,
        });
        canvas.add(rect, txt);
        if (canvas.setActiveObject) canvas.setActiveObject(txt);
      },
    },
    {
      id: 'circle', label: 'Daire + Yazı',
      build: function (canvas) {
        var cx = canvas.width / 2, cy = canvas.height / 2;
        var circle = new fabric.Circle({ left: cx, top: cy, originX: 'center', originY: 'center',
          radius: 60, fill: 'transparent', stroke: '#0f766e', strokeWidth: 3 });
        var txt = new fabric.IText('Yazı', {
          left: cx, top: cy, originX: 'center', originY: 'center',
          fontFamily: 'Arial', fontSize: 28, fill: '#0f766e', textAlign: 'center',
        });
        canvas.add(circle, txt);
        if (canvas.setActiveObject) canvas.setActiveObject(txt);
      },
    },
  ];

  // ── Per-designer initialization ───────────────────────────────────────────
  document.querySelectorAll('.designer').forEach(function (root) {

    // ── Config ──────────────────────────────────────────────────────────────
    // Shopify fiyatları kuruş/sent cinsinden gelir → /100 ile TL'ye çevir
    var _productPrice = +(root.dataset.productPrice || 0) / 100;
    var cfg = {
      currency: root.dataset.currency || 'TRY',
      locale:   root.dataset.locale   || 'tr-TR',
      prices: {
        front:  0,
        back:   0,
        double: 0,
      },
      variantMap:     {},   // colorKey -> size -> mode -> variantId
      variantPrices:  {},  // variantId → fiyat (TL)
      uploadEndpoint: root.dataset.uploadEndpoint || '/apps/tshirt-designer/upload',
      productHandle:  root.dataset.productHandle || '',
      backImage:      root.dataset.backImage  || '',
      frontImage:     root.dataset.frontImage || '',
      singleVariantId: root.dataset.singleVariantId || '',
      doubleVariantId: root.dataset.doubleVariantId || '',
    };

    var STORAGE_KEY = 'dsgn_imgs_' + (cfg.productHandle || 'global');

    // Parse variant map + prices from data-product-variants
    (function () {
      try {
        var variants = productVariants();
        if (!Array.isArray(variants)) return;
        var cOpt = colorOption();
        variants.forEach(function (v) {
          // Her varyantın fiyatını kaydet
          var price = parseVariantPrice(v.price);
          if (v.id && price) cfg.variantPrices[String(v.id)] = price;
          var opts = variantOptions(v);
          var colorKey = colorKeyFromVariant(v, cOpt) || '__default';
          var size = detectSize(opts);
          var mode = detectPrintMode(opts);
          if (!size || !mode || !v.id) return;
          cfg.variantMap[colorKey] = cfg.variantMap[colorKey] || {};
          cfg.variantMap[colorKey][size] = cfg.variantMap[colorKey][size] || {};
          cfg.variantMap[colorKey][size][mode] = String(v.id);
          if (price && !cfg.prices[mode]) cfg.prices[mode] = price;
        });
        if (!cfg.prices.front)  cfg.prices.front  = _productPrice || +(root.dataset.singlePrice || 0);
        if (!cfg.prices.back)   cfg.prices.back   = _productPrice || +(root.dataset.singlePrice || 0);
        if (!cfg.prices.double) cfg.prices.double = +(root.dataset.doublePrice || 0) || _productPrice || 0;
      } catch (e) { /* ignore */ }
    }());

    // ── State ────────────────────────────────────────────────────────────────
    var S = {
      canvas: null,
      viewIdx: 0,
      views: ['front', 'back'],
      shirtColor: root.dataset.shirtColor || '#ffffff',
      activeTool: null,
      activePopup: null,
      saved: { front: null, back: null },
      history: { front: [], back: [] },
      redo:    { front: [], back: [] },
      uploadedImages: [],    // [{dataUrl, name}]
      activeFilter: 'none',
      size: 'M',
      quantity: 1,
      zoom: 1,
      floatTarget: null,     // currently selected object for float toolbar
      colorKey: '',
      colorName: '',
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    function viewName() { return S.views[S.viewIdx]; }

    function money(n) {
      return new Intl.NumberFormat(cfg.locale, {
        style: 'currency', currency: cfg.currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(n);
    }

    function parseVariantPrice(v) {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'number') return v > 999 ? v / 100 : v;
      var n = +String(v).replace(',', '.');
      if (!Number.isFinite(n)) return 0;
      return n > 999 ? n / 100 : n;
    }

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    function normalizeOption(v) {
      return String(v || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
    }

    function detectSize(opts) {
      var known = ['XXL', 'XL', 'L', 'M', 'S', 'XS'];
      for (var i = 0; i < opts.length; i++) {
        var u = String(opts[i] || '').trim().toUpperCase();
        if (known.indexOf(u) !== -1) return u;
      }
      return '';
    }

    function variantOptions(v) {
      return Array.isArray(v.options) ? v.options : [v.option1, v.option2, v.option3].filter(Boolean);
    }

    function productOptions() {
      try {
        var opts = JSON.parse(root.dataset.productOptions || '[]');
        return Array.isArray(opts) ? opts : [];
      } catch (e) { return []; }
    }

    function productVariants() {
      try {
        var variants = JSON.parse(root.dataset.productVariants || '[]');
        return Array.isArray(variants) ? variants : [];
      } catch (e) { return []; }
    }

    function selectedVariant() {
      try { return JSON.parse(root.dataset.selectedVariant || '{}') || {}; } catch (e) { return {}; }
    }

    function findOption(predicate) {
      var opts = productOptions();
      for (var i = 0; i < opts.length; i++) {
        if (predicate(opts[i], normalizeOption(opts[i].name || ''))) return opts[i];
      }
      return null;
    }

    function colorOption() {
      return findOption(function (opt, name) {
        return name === 'renk' || name === 'color' || name === 'colour' || name.indexOf('renk') !== -1 || name.indexOf('color') !== -1;
      });
    }

    function colorKeyFromVariant(v, colorOpt) {
      var opts = variantOptions(v);
      if (colorOpt && colorOpt.position) return normalizeOption(opts[colorOpt.position - 1] || '');
      return '';
    }

    function variantImageSrc(v) {
      var img = v && (v.featured_image || v.image);
      var src = img && img.src ? img.src : '';
      return src && src.indexOf('//') === 0 ? 'https:' + src : src;
    }

    function productImageById(imageId) {
      if (!imageId) return '';
      try {
        var imgs = JSON.parse(root.dataset.productImages || '[]');
        for (var i = 0; i < imgs.length; i++) {
          if (String(imgs[i].id) === String(imageId) && imgs[i].src) {
            return imgs[i].src.indexOf('//') === 0 ? 'https:' + imgs[i].src : imgs[i].src;
          }
        }
      } catch (e) { /* ignore */ }
      return '';
    }

    function variantProductImageSrc(v) {
      return variantImageSrc(v) || productImageById(v && v.image_id);
    }

    function detectPrintMode(opts) {
      var text = normalizeOption(opts.join(' / '));
      var hasFront = text.indexOf('ön') !== -1 || text.indexOf('on') !== -1 || text.indexOf('front') !== -1;
      var hasBack  = text.indexOf('arka') !== -1 || text.indexOf('back') !== -1;
      if (hasFront && hasBack) return 'double';
      if (hasBack)  return 'back';
      if (hasFront) return 'front';
      return '';
    }

    function printMode() {
      var frontHas = sideHasContent('front');
      var backHas  = sideHasContent('back');
      if (frontHas && backHas) return 'double';
      if (backHas)  return 'back';
      if (frontHas) return 'front';
      return '';
    }

    function sideHasContent(view) {
      if (view === viewName() && S.canvas) return S.canvas.getObjects().length > 0;
      var saved = S.saved[view];
      if (!saved) return false;
      try {
        var j = JSON.parse(saved);
        return !!(j.objects && j.objects.length > 0);
      } catch (e) { return false; }
    }

    function variantId(mode) {
      var byColor = cfg.variantMap[S.colorKey] || cfg.variantMap.__default || {};
      var map = byColor[S.size] || {};
      return map[mode] || (mode === 'double' ? cfg.doubleVariantId : cfg.singleVariantId) || null;
    }

    function modeLabelText(mode) {
      if (!mode) return 'Tasarım ekleyin';
      return mode === 'double' ? 'Ön + arka baskı' : mode === 'back' ? 'Arka baskı' : 'Ön baskı';
    }

    function q(selector) { return root.querySelector(selector); }
    function qa(selector) { return root.querySelectorAll(selector); }

    // ── Canvas init ──────────────────────────────────────────────────────────
    function initCanvas() {
      if (S.canvas) return;
      var overlay = q('[data-canvas-overlay]');
      if (!overlay) return;
      var w = overlay.offsetWidth  || 140;
      var h = overlay.offsetHeight || 195;
      var canvasEl = q('[data-fabric-canvas]');
      if (!canvasEl) return;
      S.canvas = new fabric.Canvas(canvasEl, {
        width: w,
        height: h,
        backgroundColor: null,
        preserveObjectStacking: true,
      });
      overlay.classList.add('ready');
      bindCanvasEvents();
      buildFilterStrip();
      updatePriceLabel();

      // Sayfa yenilemeden sonra canvas durumunu geri yükle
      var savedJson = S.saved[viewName()];
      if (savedJson) {
        _historyLock = true;
        S.canvas.loadFromJSON(savedJson, function () {
          S.canvas.renderAll();
          _historyLock = false;
          pushHistory();
          updateStatusBadges();
        });
      }
    }

    function bindCanvasEvents() {
      if (!S.canvas) return;
      S.canvas.on('object:added',   pushHistory);
      S.canvas.on('object:removed', pushHistory);
      S.canvas.on('object:modified',pushHistory);
      S.canvas.on('selection:created', onSelectionChange);
      S.canvas.on('selection:updated', onSelectionChange);
      S.canvas.on('selection:cleared',  onSelectionCleared);
    }

    function onSelectionChange() {
      var obj = S.canvas.getActiveObject();
      if (!obj) return;
      S.floatTarget = obj;
      // Text dışı bir obje seçilince son yazı referansını temizle
      if (obj.type !== 'i-text' && obj.type !== 'text' && obj.type !== 'textbox') {
        S._lastTextObj = null;
      }
      positionFloatToolbar(obj);
      updateTransformPopupValues(obj);
      syncTextControls(obj);
      updateStatusBadges();
    }

    function onSelectionCleared() {
      S.floatTarget = null;
      // S._lastTextObj temizleme — panel kontrollerine tıklayınca da cleared tetikleniyor
      var ftb = q('[data-float-tb]');
      if (ftb) ftb.style.display = 'none';
      closePopup();
      updateStatusBadges();
    }

    // ── Product display ──────────────────────────────────────────────────────
    function setupProductDisplay() {
      var productImg = q('[data-product-img]');
      var svgWrap    = q('[data-shirt-svg-wrap]');
      var imgSrc     = S.viewIdx === 0 ? cfg.frontImage : cfg.backImage;

      // hidden attribute'u her iki elementten temizle
      if (productImg) productImg.removeAttribute('hidden');
      if (svgWrap)    svgWrap.removeAttribute('hidden');

      if (imgSrc) {
        svgWrap.style.display = 'none';
        productImg.style.display = '';
        productImg.classList.remove('loaded');
        var done = false;
        function onImgReady() {
          if (done) return;
          done = true;
          productImg.classList.add('loaded');
          positionCanvasOverlayOnImage(productImg);
          if (!S.canvas) initCanvas();
          else resizeCanvas();
        }
        productImg.onload  = onImgReady;
        productImg.onerror = function () {
          // Görsel yüklenemedi — SVG'ye düş
          productImg.style.display = 'none';
          svgWrap.style.display = 'block';
          positionCanvasOverlayOnSvg();
          if (!S.canvas) initCanvas(); else resizeCanvas();
        };
        productImg.src = imgSrc;
        if (productImg.complete && productImg.naturalWidth > 0) { onImgReady(); }
      } else {
        // Ürün görseli yok — SVG tisört göster
        productImg.style.display = 'none';
        svgWrap.style.display = 'block';
        // SVG render olduktan sonra konumlandır
        setTimeout(function () {
          positionCanvasOverlayOnSvg();
          if (!S.canvas) initCanvas(); else resizeCanvas();
        }, 50);
      }
    }

    function positionCanvasOverlayOnSvg() {
      var overlay = q('[data-canvas-overlay]');
      var svgWrap = q('[data-shirt-svg-wrap]');
      var wrap    = q('[data-product-wrap]');
      if (!overlay || !svgWrap || !wrap) return;
      var svgR  = svgWrap.getBoundingClientRect();
      var wrapR = wrap.getBoundingClientRect();
      if (!svgR.width || !svgR.height) return;
      // SVG viewBox 0 0 480 540, print rect x=135 y=176 w=210 h=292
      var sx = svgR.width  / 480;
      var sy = svgR.height / 540;
      var ox = svgR.left - wrapR.left;
      var oy = svgR.top  - wrapR.top;
      overlay.style.left   = (ox + 135 * sx) + 'px';
      overlay.style.top    = (oy + 176 * sy) + 'px';
      overlay.style.width  = (210 * sx) + 'px';
      overlay.style.height = (292 * sy) + 'px';
    }

    function positionCanvasOverlayOnImage(productImg) {
      var overlay = q('[data-canvas-overlay]');
      var wrap    = q('[data-product-wrap]');
      if (!overlay || !wrap) return;

      var imgRect  = productImg.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();

      // Default print area: left=22%, top=13%, w=56%, h=72%
      var pctLeft = 0.22, pctTop = 0.13, pctW = 0.56, pctH = 0.72;

      var iw = imgRect.width, ih = imgRect.height;
      var il = imgRect.left - wrapRect.left;
      var it = imgRect.top  - wrapRect.top;

      overlay.style.left   = (il + iw * pctLeft) + 'px';
      overlay.style.top    = (it + ih * pctTop)  + 'px';
      overlay.style.width  = (iw * pctW) + 'px';
      overlay.style.height = (ih * pctH) + 'px';
    }

    function resizeCanvas() {
      if (!S.canvas) return;
      var overlay = q('[data-canvas-overlay]');
      if (!overlay) return;
      var w = overlay.offsetWidth  || 140;
      var h = overlay.offsetHeight || 195;
      S.canvas.setWidth(w);
      S.canvas.setHeight(h);
      S.canvas.renderAll();
    }

    // ── View switching ────────────────────────────────────────────────────────
    function switchView(idx) {
      // Save current canvas state
      if (S.canvas) {
        S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(['id', 'name']));
        saveCanvasToStorage();
      }
      S.viewIdx = clamp(idx, 0, S.views.length - 1);

      var viewLbl = q('[data-view-label]');
      if (viewLbl) viewLbl.textContent = S.viewIdx === 0 ? 'Ön' : 'Arka';

      // Re-init product image for new view
      setupProductDisplay();

      // Restore saved canvas state for this view
      var savedJson = S.saved[viewName()];
      if (S.canvas && savedJson) {
        S.canvas.loadFromJSON(savedJson, function () {
          S.canvas.renderAll();
        });
      } else if (S.canvas) {
        S.canvas.clear();
        S.canvas.renderAll();
      }

      updateStatusBadges();
      updatePriceLabel();
    }

    // ── Shirt color ───────────────────────────────────────────────────────────

    // Ürün görsellerini varyant ID'sine göre grupla
    // Dönen: variantId → { front: src, back: src }
    function buildVariantImageIndex() {
      var idx = {}; // variantId → { front, back, all: [] }
      try {
        var variants = productVariants();
        var variantMode = {};
        variants.forEach(function (v) {
          if (v.id) variantMode[String(v.id)] = detectPrintMode(variantOptions(v));
        });
        var imgs = JSON.parse(root.dataset.productImages || '[]');
        var imageById = {};
        imgs.forEach(function (img) {
          if (!img.src) return;
          var src = img.src.indexOf('//') === 0 ? 'https:' + img.src : img.src;
          if (img.id) imageById[String(img.id)] = src;
          var alt = String(img.alt || '').toLowerCase();
          var isFront = alt.indexOf('ön') !== -1 || alt.indexOf('front') !== -1 || alt.indexOf('on') !== -1;
          var isBack  = alt.indexOf('arka') !== -1 || alt.indexOf('back') !== -1;

          (img.variant_ids || []).forEach(function (vid) {
            if (!idx[vid]) idx[vid] = { front: '', back: '', all: [] };
            idx[vid].all.push(src);
            var mode = variantMode[String(vid)] || '';
            if ((mode === 'front' || isFront) && !idx[vid].front) idx[vid].front = src;
            if ((mode === 'back'  || isBack)  && !idx[vid].back)  idx[vid].back  = src;
            if (mode === 'double') {
              if (!idx[vid].front) idx[vid].front = src;
              if (!idx[vid].back)  idx[vid].back  = src;
            }
          });
        });

        variants.forEach(function (v) {
          if (!v.id || !v.image_id || !imageById[String(v.image_id)]) return;
          var vid = String(v.id);
          var src = imageById[String(v.image_id)];
          var mode = variantMode[vid] || '';
          if (!idx[vid]) idx[vid] = { front: '', back: '', all: [] };
          if (idx[vid].all.indexOf(src) === -1) idx[vid].all.push(src);
          if (mode === 'front' && !idx[vid].front) idx[vid].front = src;
          if (mode === 'back' && !idx[vid].back) idx[vid].back = src;
          if (mode === 'double') {
            if (!idx[vid].front) idx[vid].front = src;
            if (!idx[vid].back) idx[vid].back = src;
          }
        });

        // Alt text yoksa tek varyant görselini ilgili yüz için kullan
        Object.keys(idx).forEach(function (vid) {
          var e = idx[vid];
          if (!e.front && e.all[0]) e.front = e.all[0];
          if (!e.back  && e.all[1]) e.back  = e.all[1];
        });
      } catch (e) { /* yoksay */ }
      return idx;
    }

    function buildColorSwatches() {
      var row = q('[data-color-row]');
      if (!row) return;
      row.innerHTML = '';

      // Ürün seçeneklerinden renk opsiyonunu bul
      var colorOpt = colorOption();

      // Renk adı → {front, back} haritası — varyant görsellerinden
      var colorImgMap = {};
      if (colorOpt) {
        var varImgIdx = buildVariantImageIndex(); // variantId → {front, back}
        var variants = productVariants();
        var colorPos = colorOpt.position - 1;
        variants.forEach(function (v) {
          var opts = [v.option1, v.option2, v.option3];
          var colorName = opts[colorPos];
          if (!colorName) return;
          var key = normalizeOption(colorName);
          colorImgMap[key] = colorImgMap[key] || { front: '', back: '', double: '' };
          var entry = varImgIdx[v.id] || {};
          var fiSrc = variantProductImageSrc(v);
          var mode = detectPrintMode(variantOptions(v));
          if (mode === 'front' && !colorImgMap[key].front) colorImgMap[key].front = entry.front || fiSrc;
          if (mode === 'back'  && !colorImgMap[key].back)  colorImgMap[key].back  = entry.back  || fiSrc;
          if (mode === 'double' && !colorImgMap[key].double) colorImgMap[key].double = entry.front || entry.back || fiSrc;
        });
      }

      // Aktif rengi seçili varyanttan belirle
      var activeKey = '';
      try {
        var sv = selectedVariant();
        var svOpts = variantOptions(sv);
        if (colorOpt) activeKey = normalizeOption(svOpts[colorOpt.position - 1] || '');
      } catch (e) {}

      // Gösterilecek renk listesini hazırla
      var colors = [];
      if (colorOpt && colorOpt.values && colorOpt.values.length) {
        colorOpt.values.forEach(function (val) {
          var key = normalizeOption(val);
          colors.push({ name: val, key: key, hex: COLOR_HEX_MAP[key] || '#cccccc', imgs: colorImgMap[key] || null });
        });
      } else {
        SHIRT_COLORS.forEach(function (c) {
          colors.push({ name: c.name, key: normalizeOption(c.name), hex: c.hex, imgs: null });
        });
      }

      colors.forEach(function (c) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsgn-swatch';
        btn.style.background = c.hex;
        btn.title = c.name;

        var isActive = activeKey ? (c.key === activeKey) : (c.hex.toLowerCase() === S.shirtColor.toLowerCase());
        if (isActive) { btn.classList.add('active'); S.shirtColor = c.hex; S.colorKey = c.key; S.colorName = c.name; }

        btn.addEventListener('click', function () {
          S.shirtColor = c.hex;
          S.colorKey = c.key;
          S.colorName = c.name;
          applyShirtColor(c.hex);
          row.querySelectorAll('.dsgn-swatch').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');

          // Ürün görselini bu renk varyantına göre güncelle
          if (c.imgs && (c.imgs.front || c.imgs.back || c.imgs.double)) {
            if (c.imgs.front) cfg.frontImage = c.imgs.front;
            else if (c.imgs.double) cfg.frontImage = c.imgs.double;
            if (c.imgs.back)  cfg.backImage  = c.imgs.back;
            else if (c.imgs.double) cfg.backImage = c.imgs.double;
            var productImg = q('[data-product-img]');
            if (productImg) productImg.classList.remove('loaded');
            setupProductDisplay();
          }
          updatePriceLabel();
        });
        row.appendChild(btn);
      });

      if (!S.colorKey && colors[0]) {
        S.colorKey = colors[0].key;
        S.colorName = colors[0].name;
      }
    }

    function applyShirtColor(hex) {
      var shirtPath = q('#dsgnShirtBody');
      if (shirtPath) shirtPath.setAttribute('fill', hex);
    }

    // ── Tool nav ──────────────────────────────────────────────────────────────
    function activateTool(toolName) {
      var panel = q('[data-tool-panel]');
      if (!panel) return;

      if (S.activeTool === toolName) {
        // Toggle off
        S.activeTool = null;
        panel.classList.remove('open');
        qa('[data-tool]').forEach(function (b) { b.classList.remove('active'); });
        qa('[data-tp]').forEach(function (p) { p.classList.remove('active'); });
        return;
      }

      S.activeTool = toolName;
      panel.classList.add('open');

      qa('[data-tool]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.tool === toolName);
      });

      qa('[data-tp]').forEach(function (p) {
        p.classList.toggle('active', p.dataset.tp === toolName);
      });
    }

    // ── Image upload ──────────────────────────────────────────────────────────

    // Resmi localStorage kotasına sığacak şekilde küçültüp sıkıştır.
    function compressImage(dataUrl, callback) {
      var img = new window.Image();
      img.onload = function () {
        var maxSide = 700;
        var w = img.width, h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
          else       { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        callback(c.toDataURL('image/jpeg', 0.70));
      };
      img.onerror = function () { callback(dataUrl); };
      img.src = dataUrl;
    }

    function saveImagesToStorage() {
      try {
        var list = S.uploadedImages
          .filter(Boolean)
          .slice(-12)
          .map(function (img) { return { dataUrl: img.storedUrl || img.dataUrl, name: img.name }; });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(
          list
        ));
      } catch (e) {
        setMsg('Tarayıcı depolama alanı dolu, yüklenen resimler kaydedilemedi.', 'error');
      }
    }

    function loadImagesFromStorage() {
      var rows = [];
      function appendFromRaw(raw) {
        var stored;
        if (!raw) return;
        try { stored = JSON.parse(raw); } catch (e) { return; }
        if (Array.isArray(stored)) rows = rows.concat(stored);
        else if (stored && Array.isArray(stored.images)) rows = rows.concat(stored.images);
      }

      try { appendFromRaw(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* ignore */ }
      if (!rows.length) {
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf('dsgn_imgs_') === 0 && key !== STORAGE_KEY) {
              appendFromRaw(localStorage.getItem(key));
            }
          }
        } catch (e2) { /* ignore */ }
      }

      console.log('[designer] loadImages: toplam satır =', rows.length, '| key =', STORAGE_KEY);
      var seen = {};
      rows.forEach(function (img, i) {
        try {
          var dataUrl = img && (img.dataUrl || img.storedUrl || img.src || img.url);
          var name    = (img && img.name) || 'Yüklenen resim';
          dataUrl = String(dataUrl || '').trim();
          if (!dataUrl || dataUrl.indexOf('data:image') !== 0) {
            console.warn('[designer] resim', i, 'geçersiz dataUrl');
            return;
          }
          if (seen[dataUrl]) return;
          seen[dataUrl] = true;
          var container = q('[data-img-thumbs]');
          console.log('[designer] resim', i, 'ekleniyor, container:', !!container);
          S.uploadedImages.push({ dataUrl: dataUrl, storedUrl: dataUrl, name: name });
          addThumbItem(dataUrl, name, S.uploadedImages.length - 1);
        } catch (e2) { console.error('[designer] resim hatası:', e2); }
      });
    }

    function handleFiles(files) {
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) continue;
        if (f.size > 8 * 1024 * 1024) { setMsg('Dosya 8 MB\'dan büyük.', 'error'); continue; }
        (function (file) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var originalUrl = String(e.target.result);
            compressImage(originalUrl, function (storedUrl) {
              placeImageOnCanvas(storedUrl);
              S.uploadedImages.push({ dataUrl: storedUrl, storedUrl: storedUrl, name: file.name });
              addThumbItem(storedUrl, file.name, S.uploadedImages.length - 1);
              saveImagesToStorage();
              saveCanvasToStorage();
            });
          };
          reader.readAsDataURL(file);
        }(f));
      }
    }

    function addThumbItem(dataUrl, name, idx) {
      var container = q('[data-img-thumbs]');
      if (!container) return;
      var item = document.createElement('div');
      item.className = 'dsgn-thumb-item';
      item.dataset.imgIdx = idx;

      var img = document.createElement('img');
      img.className = 'dsgn-thumb-img';
      img.src = dataUrl;
      img.alt = name;

      var nameEl = document.createElement('span');
      nameEl.className = 'dsgn-thumb-name';
      nameEl.textContent = name;

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'dsgn-thumb-del';
      del.title = 'Kaldır';
      del.innerHTML = '&times;';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var pos = S.uploadedImages.findIndex(function (img) { return img.dataUrl === dataUrl; });
        if (pos !== -1) S.uploadedImages.splice(pos, 1);
        item.remove();
        saveImagesToStorage();
      });

      item.addEventListener('click', function () {
        placeImageOnCanvas(dataUrl);
      });

      item.appendChild(img);
      item.appendChild(nameEl);
      item.appendChild(del);
      container.appendChild(item);
    }

    function placeImageOnCanvas(dataUrl) {
      if (!S.canvas) return;
      fabric.Image.fromURL(dataUrl, function (img) {
        var cw = S.canvas.width, ch = S.canvas.height;
        var scale = Math.min(cw / img.width, ch / img.height, 1) * 0.8;
        img.set({
          left: cw / 2, top: ch / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
        });
        S.canvas.add(img);
        S.canvas.setActiveObject(img);
        S.canvas.renderAll();
        pushHistory();
      }, { crossOrigin: 'anonymous' });
    }

    // ── Add text ──────────────────────────────────────────────────────────────
    function addText() {
      if (!S.canvas) return;
      var input    = q('[data-text-input]');
      var fontFam  = q('[data-font-family]');
      var fontSize = q('[data-text-size]');
      var fontColor= q('[data-text-color]');
      var boldBtn  = q('[data-style="bold"]');
      var italicBtn= q('[data-style="italic"]');
      var ulBtn    = q('[data-style="underline"]');

      var text = (input ? input.value.trim() : '') || 'Yazı';
      var txt = new fabric.IText(text, {
        left: S.canvas.width / 2,
        top:  S.canvas.height / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: fontFam  ? fontFam.value  : 'Arial',
        fontSize:   fontSize ? +fontSize.value: 30,
        fill:       fontColor? fontColor.value: '#111111',
        fontWeight: (boldBtn   && boldBtn.classList.contains('active'))   ? 'bold'   : 'normal',
        fontStyle:  (italicBtn && italicBtn.classList.contains('active'))  ? 'italic' : 'normal',
        underline:  !!(ulBtn   && ulBtn.classList.contains('active')),
        textAlign: 'center',
      });
      S.canvas.add(txt);
      S.canvas.setActiveObject(txt);
      S.canvas.renderAll();
      pushHistory();
    }

    function activeTextObject() {
      if (!S.canvas) return null;
      var obj = S.canvas.getActiveObject();
      if (obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox')) {
        S._lastTextObj = obj;
        return obj;
      }
      // Kullanıcı panel kontrolüne tıklayınca fokus kaybolabilir; son bilinen yazıya dön
      if (S._lastTextObj && S._lastTextObj.canvas === S.canvas) return S._lastTextObj;
      return null;
    }

    function syncTextControls(obj) {
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'text' && obj.type !== 'textbox')) return;
      var fontFam  = q('[data-font-family]');
      var fontSize = q('[data-text-size]');
      var fontSizeVal = q('[data-text-size-val]');
      var fontColor = q('[data-text-color]');
      var boldBtn = q('[data-style="bold"]');
      var italicBtn = q('[data-style="italic"]');
      var ulBtn = q('[data-style="underline"]');
      if (fontFam && obj.fontFamily) fontFam.value = obj.fontFamily;
      if (fontSize && obj.fontSize) fontSize.value = Math.round(obj.fontSize);
      if (fontSizeVal && obj.fontSize) fontSizeVal.textContent = Math.round(obj.fontSize);
      if (fontColor && typeof obj.fill === 'string' && obj.fill.charAt(0) === '#') fontColor.value = obj.fill;
      if (boldBtn) boldBtn.classList.toggle('active', obj.fontWeight === 'bold' || +obj.fontWeight >= 600);
      if (italicBtn) italicBtn.classList.toggle('active', obj.fontStyle === 'italic');
      if (ulBtn) ulBtn.classList.toggle('active', !!obj.underline);
    }

    function applyTextChange(props) {
      var obj = activeTextObject();
      if (!obj || !S.canvas) return false;
      obj.set(props);
      obj.setCoords();
      S.canvas.renderAll();
      pushHistory();
      return true;
    }

    // ── Templates ─────────────────────────────────────────────────────────────
    function buildTemplates() {
      var grid = q('[data-design-grid]');
      if (!grid) return;
      grid.innerHTML = '';
      TEMPLATE_DESIGNS.forEach(function (tpl) {
        var card = document.createElement('div');
        card.className = 'dsgn-design-card';
        card.title = tpl.label;

        // Render mini preview
        var previewCanvas = document.createElement('canvas');
        previewCanvas.width  = 100;
        previewCanvas.height = 100;
        card.appendChild(previewCanvas);

        var lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:10px;color:#6b7280;text-align:center;padding:3px 4px';
        lbl.textContent = tpl.label;
        card.appendChild(lbl);

        try {
          var previewFabric = new fabric.StaticCanvas(previewCanvas, {
            width: 100, height: 100, backgroundColor: null,
          });
          tpl.build(previewFabric);
          previewFabric.renderAll();
        } catch (e) { /* StaticCanvas setActiveObject desteklemiyor, yoksay */ }

        card.addEventListener('click', function () {
          applyTemplate(tpl);
        });

        grid.appendChild(card);
      });
    }

    function applyTemplate(tpl) {
      if (!S.canvas) return;
      S.canvas.clear();
      tpl.build(S.canvas);
      S.canvas.renderAll();
      pushHistory();
    }

    // ── Saved designs ─────────────────────────────────────────────────────────
    var SAVED_KEY  = 'fpd_saved_'   + (cfg.productHandle || 'designer');
    var CANVAS_KEY = 'dsgn_canvas_' + (cfg.productHandle || 'global');

    function saveDesign() {
      if (!S.canvas) return;
      var json = JSON.stringify(S.canvas.toJSON(['id', 'name']));
      var dataUrl = S.canvas.toDataURL({ format: 'png', quality: 0.7, multiplier: 0.5 });
      var item = { json: json, preview: dataUrl, ts: Date.now() };
      var list = loadSavedList();
      list.push(item);
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
      renderSavedGrid();
      setMsg('Tasarım kaydedildi.', 'success');
    }

    function loadSavedList() {
      try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; }
    }

    function renderSavedGrid() {
      var grid = q('[data-saved-grid]');
      if (!grid) return;
      grid.innerHTML = '';
      var list = loadSavedList();
      if (!list.length) {
        grid.innerHTML = '<p style="font-size:11px;color:#9ca3af;padding:4px 0">Henüz kayıt yok.</p>';
        return;
      }
      list.forEach(function (item, i) {
        var row = document.createElement('div');
        row.className = 'dsgn-saved-item';

        var img = document.createElement('img');
        img.className = 'dsgn-saved-preview';
        img.src = item.preview || '';
        img.alt = 'Kayıt ' + (i + 1);

        var name = document.createElement('span');
        name.className = 'dsgn-saved-name';
        name.textContent = 'Kayıt ' + (i + 1);

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'dsgn-saved-del';
        del.title = 'Sil';
        del.innerHTML = '&times;';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          var list2 = loadSavedList();
          list2.splice(i, 1);
          try { localStorage.setItem(SAVED_KEY, JSON.stringify(list2)); } catch (e2) { /* ignore */ }
          renderSavedGrid();
        });

        row.addEventListener('click', function () {
          if (!S.canvas) return;
          S.canvas.loadFromJSON(item.json, function () {
            S.canvas.renderAll();
            pushHistory();
          });
        });

        row.appendChild(img);
        row.appendChild(name);
        row.appendChild(del);
        grid.appendChild(row);
      });
    }

    // ── Canvas state persistence ──────────────────────────────────────────────
    var _saveCanvasTimer = null;

    // Canvas JSON'ındaki büyük base64 image src'lerini sıkıştırarak string döndürür
    function compressCanvasJSON(jsonStr, callback) {
      try {
        var obj = JSON.parse(jsonStr);
        var images = (obj.objects || []).filter(function (o) {
          return o.type === 'image' && o.src && o.src.indexOf('data:image') === 0;
        });
        if (!images.length) { callback(jsonStr); return; }
        var pending = images.length;
        images.forEach(function (imgObj) {
          compressImage(imgObj.src, function (compressed) {
            imgObj.src = compressed;
            pending--;
            if (pending === 0) callback(JSON.stringify(obj));
          });
        });
      } catch (e) { callback(jsonStr); }
    }

    function saveCanvasToStorage() {
      clearTimeout(_saveCanvasTimer);
      _saveCanvasTimer = setTimeout(function () {
        if (!S.canvas) return;
        var cur   = viewName();
        var other = cur === 'front' ? 'back' : 'front';
        var curJson = JSON.stringify(S.canvas.toJSON(['id', 'name']));
        compressCanvasJSON(curJson, function (compressed) {
          try {
            var state = {};
            state[cur] = compressed;
            if (S.saved[other]) state[other] = S.saved[other];
            localStorage.setItem(CANVAS_KEY, JSON.stringify(state));
          } catch (e) {
            // storage dolu — sessizce yoksay, kullanıcı zaten resim yükleme hatası görüyor
          }
        });
      }, 500);
    }

    function loadCanvasFromStorage() {
      try {
        var state = JSON.parse(localStorage.getItem(CANVAS_KEY) || 'null');
        if (!state) return;
        if (state.front) S.saved.front = state.front;
        if (state.back)  S.saved.back  = state.back;
      } catch (e) { /* yoksay */ }
    }

    // ── History / undo / redo ─────────────────────────────────────────────────
    var _historyLock = false;
    function pushHistory() {
      if (_historyLock || !S.canvas) return;
      var view = viewName();
      var json = JSON.stringify(S.canvas.toJSON(['id', 'name']));
      S.history[view].push(json);
      if (S.history[view].length > 40) S.history[view].shift();
      S.redo[view] = [];
      updateStatusBadges();
      updatePriceLabel();
      saveCanvasToStorage();
    }

    function undo() {
      if (!S.canvas) return;
      var view = viewName();
      if (S.history[view].length <= 1) return;
      S.redo[view].push(S.history[view].pop());
      var prev = S.history[view][S.history[view].length - 1];
      _historyLock = true;
      S.canvas.loadFromJSON(prev, function () {
        S.canvas.renderAll();
        _historyLock = false;
        updateStatusBadges();
        updatePriceLabel();
        saveCanvasToStorage();
      });
    }

    function redo() {
      if (!S.canvas) return;
      var view = viewName();
      if (!S.redo[view].length) return;
      var next = S.redo[view].pop();
      S.history[view].push(next);
      _historyLock = true;
      S.canvas.loadFromJSON(next, function () {
        S.canvas.renderAll();
        _historyLock = false;
        updateStatusBadges();
        updatePriceLabel();
        saveCanvasToStorage();
      });
    }

    // ── Delete selected ───────────────────────────────────────────────────────
    function deleteSelected() {
      if (!S.canvas) return;
      var obj = S.canvas.getActiveObject();
      if (!obj) return;
      if (obj.type === 'activeSelection') {
        obj.forEachObject(function (o) { S.canvas.remove(o); });
      } else {
        S.canvas.remove(obj);
      }
      S.canvas.discardActiveObject();
      S.canvas.renderAll();
      pushHistory();
    }

    // ── Zoom ─────────────────────────────────────────────────────────────────
    function applyZoom(delta) {
      S.zoom = clamp(S.zoom + delta * 0.1, 0.3, 3);
      if (!S.canvas) return;
      var cx = S.canvas.width / 2, cy = S.canvas.height / 2;
      S.canvas.zoomToPoint({ x: cx, y: cy }, S.zoom);
      var lbl = q('[data-zoom-label]');
      if (lbl) lbl.textContent = Math.round(S.zoom * 100) + '%';
    }

    // ── Floating toolbar ──────────────────────────────────────────────────────
    function positionFloatToolbar(obj) {
      var ftb  = q('[data-float-tb]');
      var wrap = q('[data-product-wrap]');
      if (!ftb || !wrap || !S.canvas) return;

      var bounds = obj.getBoundingRect(true);
      var overlay = q('[data-canvas-overlay]');
      var overlayRect = overlay.getBoundingClientRect();
      var wrapRect    = wrap.getBoundingClientRect();

      var ox = overlayRect.left - wrapRect.left;
      var oy = overlayRect.top  - wrapRect.top;

      var scaleX = overlay.offsetWidth  / S.canvas.width;
      var scaleY = overlay.offsetHeight / S.canvas.height;

      var bx = ox + bounds.left  * scaleX + (bounds.width * scaleX) / 2;
      var by = oy + bounds.top   * scaleY - 44;

      ftb.style.left    = bx + 'px';
      ftb.style.top     = Math.max(4, by) + 'px';
      ftb.style.display = 'flex';
    }

    // ── Popups ────────────────────────────────────────────────────────────────
    function openPopup(name) {
      closePopup();
      S.activePopup = name;
      var popup = q('[data-popup="' + name + '"]');
      if (!popup) return;

      var ftb = q('[data-float-tb]');
      if (ftb && ftb.style.display !== 'none') {
        var ftbRect = ftb.getBoundingClientRect();
        var wrap    = q('[data-product-wrap]');
        var wrapRect = wrap.getBoundingClientRect();
        popup.style.left = (ftbRect.left - wrapRect.left) + 'px';
        popup.style.top  = (ftbRect.bottom - wrapRect.top + 6) + 'px';
      }

      popup.style.display = 'block';

      // Mark active ft button
      qa('[data-ft]').forEach(function (b) {
        b.classList.toggle('active', b.dataset.ft === name);
      });
    }

    function closePopup() {
      if (S.activePopup) {
        var popup = q('[data-popup="' + S.activePopup + '"]');
        if (popup) popup.style.display = 'none';
      }
      S.activePopup = null;
      qa('[data-ft]').forEach(function (b) { b.classList.remove('active'); });
    }

    // ── Transform popup ───────────────────────────────────────────────────────
    function updateTransformPopupValues(obj) {
      if (!obj) return;
      var angleRange = q('[data-angle]');
      var angleVal   = q('[data-angle-val]');
      var opacityRange = q('[data-opacity]');
      var opacityVal   = q('[data-opacity-val]');
      var angle = Math.round(obj.angle || 0);
      var opacity = Math.round((obj.opacity !== undefined ? obj.opacity : 1) * 100);
      if (angleRange) angleRange.value = angle;
      if (angleVal)   angleVal.textContent = angle;
      if (opacityRange) opacityRange.value = opacity;
      if (opacityVal)   opacityVal.textContent = opacity;
    }

    // ── Position / align ──────────────────────────────────────────────────────
    function alignObject(type) {
      if (!S.canvas) return;
      var obj = S.canvas.getActiveObject();
      if (!obj) return;
      var cw = S.canvas.width, ch = S.canvas.height;
      var bw = obj.getBoundingRect(true).width;
      var bh = obj.getBoundingRect(true).height;
      switch (type) {
        case 'left':    obj.set({ left: 0, originX: 'left' });   break;
        case 'right':   obj.set({ left: cw, originX: 'right' }); break;
        case 'centerH': obj.set({ left: cw / 2, originX: 'center' }); break;
        case 'top':     obj.set({ top: 0, originY: 'top' });    break;
        case 'bottom':  obj.set({ top: ch, originY: 'bottom' }); break;
        case 'centerV': obj.set({ top: ch / 2, originY: 'center' }); break;
        case 'center':
          obj.set({ left: cw / 2, top: ch / 2, originX: 'center', originY: 'center' });
          break;
      }
      obj.setCoords();
      S.canvas.renderAll();
      pushHistory();
    }

    // ── Filter strip ──────────────────────────────────────────────────────────
    function buildFilterStrip() {
      var strip = q('[data-filter-strip]');
      if (!strip) return;
      strip.innerHTML = '';

      FILTER_DEFS.forEach(function (fdef) {
        var item = document.createElement('div');
        item.className = 'dsgn-filter-item' + (fdef.id === S.activeFilter ? ' active' : '');

        var previewCanvas = document.createElement('canvas');
        previewCanvas.width  = 50;
        previewCanvas.height = 50;

        var lbl = document.createElement('span');
        lbl.textContent = fdef.label;

        item.appendChild(previewCanvas);
        item.appendChild(lbl);

        // Draw a simple colored swatch as preview
        var ctx = previewCanvas.getContext('2d');
        if (fdef.id === 'none') {
          var grad = ctx.createLinearGradient(0, 0, 50, 50);
          grad.addColorStop(0, '#f59e0b');
          grad.addColorStop(1, '#0f766e');
          ctx.fillStyle = grad;
        } else if (fdef.id === 'grayscale') {
          ctx.fillStyle = '#888';
        } else if (fdef.id === 'sepia') {
          ctx.fillStyle = '#c4a882';
        } else if (fdef.id === 'invert') {
          ctx.fillStyle = '#1e3a5f';
        } else {
          // generic tint
          ctx.fillStyle = '#6b7280';
        }
        ctx.fillRect(0, 0, 50, 50);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fdef.label, 25, 30);

        item.addEventListener('click', function () {
          S.activeFilter = fdef.id;
          applyFilter(fdef);
          strip.querySelectorAll('.dsgn-filter-item').forEach(function (el) { el.classList.remove('active'); });
          item.classList.add('active');
        });

        strip.appendChild(item);
      });
    }

    function applyFilter(fdef) {
      if (!S.canvas) return;
      var obj = S.canvas.getActiveObject();
      if (!obj || obj.type !== 'image') return;
      obj.filters = [];
      fdef.filters.forEach(function (f) {
        var FilterClass = fabric.Image.filters[f.type];
        if (!FilterClass) return;
        var opts = {};
        if (f.type === 'Sepia'      && f.sepia      !== undefined) opts.sepia      = f.sepia;
        if (f.type === 'Noise'      && f.noise      !== undefined) opts.noise      = f.noise;
        if (f.type === 'Saturation' && f.saturation !== undefined) opts.saturation = f.saturation;
        if (f.type === 'Brightness' && f.brightness !== undefined) opts.brightness = f.brightness;
        if (f.type === 'Contrast'   && f.contrast   !== undefined) opts.contrast   = f.contrast;
        obj.filters.push(new FilterClass(opts));
      });
      obj.applyFilters();
      S.canvas.renderAll();
      pushHistory();
    }

    // ── Remove background ─────────────────────────────────────────────────────
    function removeBg() {
      if (!S.canvas) return;
      var obj = S.canvas.getActiveObject();
      if (!obj || obj.type !== 'image') {
        setMsg('Önce bir resim seçin.', 'error'); return;
      }
      var imgEl = obj._element;
      var tmpCanvas = document.createElement('canvas');
      tmpCanvas.width  = imgEl.width  || imgEl.naturalWidth  || 200;
      tmpCanvas.height = imgEl.height || imgEl.naturalHeight || 200;
      var ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(imgEl, 0, 0, tmpCanvas.width, tmpCanvas.height);
      var imageData = ctx.getImageData(0, 0, tmpCanvas.width, tmpCanvas.height);
      floodRemove(imageData.data, tmpCanvas.width, tmpCanvas.height, 55);
      ctx.putImageData(imageData, 0, 0);
      var newSrc = tmpCanvas.toDataURL('image/png');
      fabric.Image.fromURL(newSrc, function (newImg) {
        newImg.set({
          left: obj.left, top: obj.top,
          scaleX: obj.scaleX, scaleY: obj.scaleY,
          angle: obj.angle, originX: obj.originX, originY: obj.originY,
        });
        S.canvas.remove(obj);
        S.canvas.add(newImg);
        S.canvas.setActiveObject(newImg);
        S.canvas.renderAll();
        pushHistory();
      });
    }

    function floodRemove(pixels, width, height, tolerance) {
      // Estimate background from corners
      var samples = [
        [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
        [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
        [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
      ];
      var sumR = 0, sumG = 0, sumB = 0;
      samples.forEach(function (pt) {
        var p = (pt[1] * width + pt[0]) * 4;
        sumR += pixels[p]; sumG += pixels[p + 1]; sumB += pixels[p + 2];
      });
      var bg = { r: sumR / samples.length, g: sumG / samples.length, b: sumB / samples.length };

      var visited = new Uint8Array(width * height);
      var queue = [];

      function enqueue(x, y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        var idx = y * width + x;
        if (visited[idx]) return;
        visited[idx] = 1;
        queue.push(idx);
      }

      for (var x = 0; x < width; x++) { enqueue(x, 0); enqueue(x, height - 1); }
      for (var y = 0; y < height; y++) { enqueue(0, y); enqueue(width - 1, y); }

      while (queue.length) {
        var idx = queue.shift();
        var p   = idx * 4;
        if (pixels[p + 3] < 20) continue;
        var dr = pixels[p]     - bg.r;
        var dg = pixels[p + 1] - bg.g;
        var db = pixels[p + 2] - bg.b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) > tolerance) continue;
        pixels[p + 3] = 0;
        var px = idx % width, py = Math.floor(idx / width);
        enqueue(px + 1, py); enqueue(px - 1, py);
        enqueue(px, py + 1); enqueue(px, py - 1);
      }
    }

    // ── QR code ───────────────────────────────────────────────────────────────
    function generateQRPreview() {
      var urlInput = q('[data-qr-url]');
      var preview  = q('[data-qr-preview]');
      if (!urlInput || !preview) return;
      var url = urlInput.value.trim();
      if (!url) return;
      preview.innerHTML = '';
      if (typeof QRCode === 'undefined') { setMsg('QR kütüphanesi yüklenmedi.', 'error'); return; }
      try {
        new QRCode(preview, { text: url, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.M });
      } catch (e) { /* ignore */ }
    }

    function addQRToCanvas() {
      var preview = q('[data-qr-preview]');
      if (!preview || !S.canvas) return;
      var img = preview.querySelector('img');
      if (!img) { setMsg('Önce URL girin.', 'error'); return; }
      fabric.Image.fromURL(img.src, function (fImg) {
        var scale = Math.min(S.canvas.width, S.canvas.height) * 0.4 / Math.max(fImg.width, fImg.height);
        fImg.set({
          left: S.canvas.width / 2, top: S.canvas.height / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
        });
        S.canvas.add(fImg);
        S.canvas.setActiveObject(fImg);
        S.canvas.renderAll();
        pushHistory();
        closeQRModal();
      });
    }

    function openQRModal() {
      var modal = q('[data-qr-modal]');
      if (modal) modal.style.display = 'flex';
    }

    function closeQRModal() {
      var modal = q('[data-qr-modal]');
      if (modal) modal.style.display = 'none';
    }

    // ── Export canvas to blob ─────────────────────────────────────────────────
    function canvasToBlob(side, callback) {
      if (!S.canvas) { callback(null); return; }
      var savedCurrent = S.saved[viewName()];
      var targetJSON   = S.saved[side];

      function doExport() {
        var dataUrl = S.canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
        var parts = dataUrl.split(',');
        var binary = atob(parts[1]);
        var arr = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        var blob = new Blob([arr], { type: 'image/png' });
        callback(blob);
      }

      if (side === viewName()) {
        doExport();
      } else if (targetJSON) {
        _historyLock = true;
        S.canvas.loadFromJSON(targetJSON, function () {
          S.canvas.renderAll();
          doExport();
          // restore
          if (savedCurrent) {
            S.canvas.loadFromJSON(savedCurrent, function () {
              S.canvas.renderAll();
              _historyLock = false;
            });
          } else {
            S.canvas.clear();
            _historyLock = false;
          }
        });
      } else {
        callback(null);
      }
    }

    // ── Price label ───────────────────────────────────────────────────────────
    function updatePriceLabel() {
      var mode  = printMode();
      var price = mode ? (cfg.prices[mode] || cfg.prices.front) : 0;

      // Seçili beden + mod için gerçek varyant fiyatına bak
      var vid = mode ? variantId(mode) : null;
      if (vid && cfg.variantPrices[vid]) {
        price = cfg.variantPrices[vid];
      }

      var priceLbl = q('[data-designer-price-label]');
      var modeLbl  = q('[data-designer-mode-label]');
      if (priceLbl) priceLbl.textContent = price ? money(price) : '';
      if (modeLbl)  modeLbl.textContent  = modeLabelText(mode);
    }

    // ── Status badges ─────────────────────────────────────────────────────────
    function updateStatusBadges() {
      var front = q('[data-front-status]');
      var back  = q('[data-back-status]');
      if (front) {
        var fReady = sideHasContent('front');
        front.textContent = fReady ? 'Ön hazır ✓' : 'Ön boş';
        front.classList.toggle('ready', fReady);
      }
      if (back) {
        var bReady = sideHasContent('back');
        back.textContent = bReady ? 'Arka hazır ✓' : 'Arka boş';
        back.classList.toggle('ready', bReady);
      }
    }

    // ── Cart ──────────────────────────────────────────────────────────────────
    function addToCart() {
      var cartBtn = q('[data-add-to-cart]');
      var qtyInput = q('[data-qty-input]');
      var qty   = Math.max(1, +(qtyInput ? qtyInput.value : 1) || 1);

      if (S.canvas) S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(['id', 'name']));
      if (!sideHasContent('front') && !sideHasContent('back')) {
        setMsg('En az bir yüze tasarım ekleyin.', 'error'); return;
      }
      var mode  = printMode();
      var vId   = mode ? variantId(mode) : null;
      if (!vId) {
        setMsg('Bu renk, beden ve baskı tipi için variant bulunamadı.', 'error'); return;
      }

      setLoading(true);

      // Upload previews then add to cart
      var properties = { 'Baskı tipi': modeLabelText(mode), 'Beden': S.size };
      if (S.colorName) properties['Renk'] = S.colorName;

      function doCartAdd(frontUrl, backUrl) {
        if (frontUrl) properties['Ön önizleme'] = frontUrl;
        if (backUrl)  properties['Arka önizleme'] = backUrl;

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            items: [{ id: String(vId), quantity: qty, properties: properties }],
          }),
        })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (j) { throw new Error(j.description || j.message || 'Hata oluştu'); });
          return res.json();
        })
        .then(function () {
          window.location.href = '/cart';
        })
        .catch(function (err) {
          setMsg(err.message || 'Hata oluştu', 'error');
          setLoading(false);
        });
      }

      if (cfg.uploadEndpoint) {
        var tasks = [];
        var frontUrl = null, backUrl = null;

        function uploadSide(side, done) {
          canvasToBlob(side, function (blob) {
            if (!blob) { done(); return; }
            var fd = new FormData();
            fd.append('side', side + '-preview');
            fd.append('image', blob, side + '-preview.png');
            fetch(cfg.uploadEndpoint, { method: 'POST', body: fd })
              .then(function (r) { return r.ok ? r.json() : Promise.resolve({}); })
              .then(function (j) { if (side === 'front') frontUrl = j.url || null; else backUrl = j.url || null; done(); })
              .catch(function () { done(); });
          });
        }

        var pending = 2;
        function done() { pending--; if (pending === 0) doCartAdd(frontUrl, backUrl); }
        uploadSide('front', done);
        uploadSide('back',  done);
      } else {
        doCartAdd(null, null);
      }
    }

    function setLoading(on) {
      var cartBtn = q('[data-add-to-cart]');
      if (!cartBtn) return;
      cartBtn.disabled = on;
      cartBtn.innerHTML = on
        ? '<span class="dsgn-spinner"></span> Yükleniyor…'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Sepete Ekle';
    }

    function setMsg(text, type) {
      var msg = q('[data-designer-message]');
      if (!msg) return;
      msg.textContent = text;
      msg.className   = 'dsgn-msg' + (type ? ' ' + type : '');
      if (type === 'error') {
        setTimeout(function () { if (msg.textContent === text) msg.textContent = ''; }, 4000);
      }
    }

    // ── Size buttons from product options ─────────────────────────────────────
    function buildSizeButtons() {
      var sizeGroup = q('[data-size-group]');

      // Ürün seçeneklerinden beden opsiyonunu bul
      var optsList = productOptions();
      var sizeOpt = null;
      for (var i = 0; i < optsList.length; i++) {
        var n = normalizeOption(optsList[i].name);
        if (n === 'beden' || n === 'size' || n === 'boyut' || n === 'numara' || n === 'tip') {
          sizeOpt = optsList[i]; break;
        }
        // Değerler beden gibi görünüyorsa da kabul et
        var vals = optsList[i].values || [];
        var looksLikeSize = vals.length > 0 && vals.every(function (v) {
          return /^(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|\d{2,3})$/i.test(String(v).trim());
        });
        if (looksLikeSize) { sizeOpt = optsList[i]; break; }
      }

      // Seçili varyanttan aktif bedeni belirle
      var activeSize = '';
      try {
        var sv = selectedVariant();
        var svOpts = variantOptions(sv);
        if (sizeOpt) activeSize = svOpts[sizeOpt.position - 1] || '';
        if (!activeSize) activeSize = detectSize(svOpts);
      } catch (e) {}

      if (sizeOpt && sizeOpt.values && sizeOpt.values.length && sizeGroup) {
        // Ürün beden seçeneklerinden buton oluştur
        sizeGroup.innerHTML = '';
        sizeOpt.values.forEach(function (val, idx) {
          var isActive = activeSize ? (val === activeSize) : (idx === 0);
          if (isActive) S.size = val;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'dsgn-size-btn' + (isActive ? ' active' : '');
          btn.dataset.size = val;
          btn.textContent = val;
          btn.addEventListener('click', function () {
            S.size = val;
            sizeGroup.querySelectorAll('[data-size]').forEach(function (b) {
              b.classList.toggle('active', b.dataset.size === val);
            });
            updatePriceLabel();
          });
          sizeGroup.appendChild(btn);
        });
      } else {
        // Ürün bedeni yoksa mevcut hardcoded butonlara event ekle
        qa('[data-size]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            S.size = btn.dataset.size;
            qa('[data-size]').forEach(function (b) { b.classList.toggle('active', b.dataset.size === S.size); });
            updatePriceLabel();
          });
        });
        if (activeSize) {
          S.size = activeSize;
          qa('[data-size]').forEach(function (b) { b.classList.toggle('active', b.dataset.size === activeSize); });
        }
      }
    }

    // ── Bind all events ───────────────────────────────────────────────────────
    function bind() {

      // Nav tool buttons
      qa('[data-tool]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          activateTool(btn.dataset.tool);
          if (btn.dataset.tool === 'saved') renderSavedGrid();
        });
      });

      // Dropzone
      var dropzone = q('[data-dropzone]');
      var fileInput = q('[data-file-input]');
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
          if (e.target.files) handleFiles(e.target.files);
          fileInput.value = '';
        });
        dropzone.addEventListener('dragover', function (e) {
          e.preventDefault();
          dropzone.classList.add('drag-over');
        });
        dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
        dropzone.addEventListener('drop', function (e) {
          e.preventDefault();
          dropzone.classList.remove('drag-over');
          if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        });
      }

      // Text size slider
      var textSizeRange = q('[data-text-size]');
      var textSizeVal   = q('[data-text-size-val]');
      if (textSizeRange && textSizeVal) {
        textSizeRange.addEventListener('input', function () {
          textSizeVal.textContent = textSizeRange.value;
          applyTextChange({ fontSize: +textSizeRange.value });
        });
      }

      var fontFamilySelect = q('[data-font-family]');
      if (fontFamilySelect) {
        fontFamilySelect.addEventListener('change', function () {
          applyTextChange({ fontFamily: fontFamilySelect.value });
        });
      }

      var textColorInput = q('[data-text-color]');
      if (textColorInput) {
        textColorInput.addEventListener('input', function () {
          applyTextChange({ fill: textColorInput.value });
        });
      }

      // Style buttons (bold/italic/underline)
      qa('[data-style]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          btn.classList.toggle('active');
          var style = btn.dataset.style;
          if (style === 'bold') applyTextChange({ fontWeight: btn.classList.contains('active') ? 'bold' : 'normal' });
          if (style === 'italic') applyTextChange({ fontStyle: btn.classList.contains('active') ? 'italic' : 'normal' });
          if (style === 'underline') applyTextChange({ underline: btn.classList.contains('active') });
        });
      });

      // Add text button
      var addTextBtn = q('[data-add-text]');
      if (addTextBtn) addTextBtn.addEventListener('click', addText);

      // Save design button
      var saveBtn = q('[data-save-design]');
      if (saveBtn) saveBtn.addEventListener('click', saveDesign);

      // Canvas toolbar buttons
      var undoBtn = q('[data-undo]');
      var redoBtn = q('[data-redo]');
      var delBtn  = q('[data-delete-obj]');
      var prevView = q('[data-prev-view]');
      var nextView = q('[data-next-view]');
      var zoomOut  = q('[data-zoom-out]');
      var zoomIn   = q('[data-zoom-in]');
      var qrBtn    = q('[data-qr-btn]');
      var resetBtn = q('[data-reset-btn]');

      if (undoBtn)   undoBtn.addEventListener('click', undo);
      if (redoBtn)   redoBtn.addEventListener('click', redo);
      if (delBtn)    delBtn.addEventListener('mousedown', function (e) { e.preventDefault(); deleteSelected(); });
      if (prevView)  prevView.addEventListener('click', function () { switchView((S.viewIdx - 1 + S.views.length) % S.views.length); });
      if (nextView)  nextView.addEventListener('click', function () { switchView((S.viewIdx + 1) % S.views.length); });
      if (zoomOut)   zoomOut.addEventListener('click',  function () { applyZoom(-1); });
      if (zoomIn)    zoomIn.addEventListener('click',   function () { applyZoom(1); });
      if (qrBtn)     qrBtn.addEventListener('click',    openQRModal);
      if (resetBtn)  resetBtn.addEventListener('click', function () {
        if (S.canvas) { S.canvas.clear(); S.canvas.renderAll(); pushHistory(); }
      });

      // Floating toolbar buttons
      qa('[data-ft]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var name = btn.dataset.ft;
          if (name === 'removebg') { removeBg(); return; }
          if (S.activePopup === name) { closePopup(); return; }
          openPopup(name);
        });
      });

      var ftClose = q('[data-ft-close]');
      if (ftClose) ftClose.addEventListener('click', function () {
        closePopup();
        var ftb = q('[data-float-tb]');
        if (ftb) ftb.style.display = 'none';
        if (S.canvas) S.canvas.discardActiveObject().renderAll();
      });

      var ftDel = q('[data-ft-delete]');
      if (ftDel) ftDel.addEventListener('mousedown', function (e) { e.preventDefault(); deleteSelected(); });

      // Transform popup sliders/buttons
      var angleRange  = q('[data-angle]');
      var angleVal    = q('[data-angle-val]');
      var opacityRange = q('[data-opacity]');
      var opacityVal   = q('[data-opacity-val]');

      if (angleRange) {
        angleRange.addEventListener('input', function () {
          if (angleVal) angleVal.textContent = angleRange.value;
          var obj = S.canvas && S.canvas.getActiveObject();
          if (obj) { obj.set('angle', +angleRange.value); S.canvas.renderAll(); }
        });
        angleRange.addEventListener('change', pushHistory);
      }

      if (opacityRange) {
        opacityRange.addEventListener('input', function () {
          if (opacityVal) opacityVal.textContent = opacityRange.value;
          var obj = S.canvas && S.canvas.getActiveObject();
          if (obj) { obj.set('opacity', +opacityRange.value / 100); S.canvas.renderAll(); }
        });
        opacityRange.addEventListener('change', pushHistory);
      }

      var flipX = q('[data-flip-x]');
      var flipY = q('[data-flip-y]');
      var rotateCW  = q('[data-rotate-cw]');
      var rotateCCW = q('[data-rotate-ccw]');

      if (flipX) flipX.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { obj.set('flipX', !obj.flipX); S.canvas.renderAll(); pushHistory(); }
      });
      if (flipY) flipY.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { obj.set('flipY', !obj.flipY); S.canvas.renderAll(); pushHistory(); }
      });
      if (rotateCW) rotateCW.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { obj.set('angle', ((obj.angle || 0) + 90) % 360); S.canvas.renderAll(); pushHistory(); }
      });
      if (rotateCCW) rotateCCW.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { obj.set('angle', ((obj.angle || 0) - 90 + 360) % 360); S.canvas.renderAll(); pushHistory(); }
      });

      // Position popup buttons
      qa('[data-align]').forEach(function (btn) {
        btn.addEventListener('click', function () { alignObject(btn.dataset.align); });
      });

      var bringFwd = q('[data-bring-fwd]');
      var sendBk   = q('[data-send-bk]');
      if (bringFwd) bringFwd.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { S.canvas.bringForward(obj); S.canvas.renderAll(); pushHistory(); }
      });
      if (sendBk) sendBk.addEventListener('click', function () {
        var obj = S.canvas && S.canvas.getActiveObject();
        if (obj) { S.canvas.sendBackwards(obj); S.canvas.renderAll(); pushHistory(); }
      });

      // Advanced popup: filter strip built in initCanvas
      // Adjustment sliders
      var brightnessRange  = q('[data-brightness]');
      var brightnessVal    = q('[data-brightness-val]');
      var contrastRange    = q('[data-contrast]');
      var contrastVal      = q('[data-contrast-val]');
      var saturationRange  = q('[data-saturation]');
      var saturationVal    = q('[data-saturation-val]');

      function bindAdjSlider(range, valEl, filterType, scale) {
        if (!range) return;
        range.addEventListener('input', function () {
          if (valEl) valEl.textContent = range.value;
          var obj = S.canvas && S.canvas.getActiveObject();
          if (!obj || obj.type !== 'image') return;
          // Remove existing filter of same type
          obj.filters = (obj.filters || []).filter(function (f) { return !(f instanceof fabric.Image.filters[filterType]); });
          var v = +range.value / 100 * scale;
          if (v !== 0) {
            var opts = {};
            opts[filterType.toLowerCase()] = v;
            var F = fabric.Image.filters[filterType];
            if (F) obj.filters.push(new F(opts));
          }
          obj.applyFilters();
          S.canvas.renderAll();
        });
        if (range) range.addEventListener('change', pushHistory);
      }

      bindAdjSlider(brightnessRange,  brightnessVal,  'Brightness', 1);
      bindAdjSlider(contrastRange,    contrastVal,    'Contrast',   1);
      bindAdjSlider(saturationRange,  saturationVal,  'Saturation', 2);

      // QR modal
      var qrUrlInput = q('[data-qr-url]');
      if (qrUrlInput) {
        qrUrlInput.addEventListener('input', generateQRPreview);
        qrUrlInput.addEventListener('change', generateQRPreview);
      }
      var qrAdd   = q('[data-qr-add]');
      var qrClose = q('[data-qr-close]');
      if (qrAdd)   qrAdd.addEventListener('click', addQRToCanvas);
      if (qrClose) qrClose.addEventListener('click', closeQRModal);

      // Quantity +/-
      qa('[data-qty]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qtyInput = q('[data-qty-input]');
          if (!qtyInput) return;
          var cur = +(qtyInput.value) || 1;
          qtyInput.value = Math.max(1, cur + +btn.dataset.qty);
          S.quantity = +qtyInput.value;
        });
      });

      // Cart
      var cartBtn = q('[data-add-to-cart]');
      if (cartBtn) cartBtn.addEventListener('click', addToCart);

      // Keyboard shortcuts
      document.addEventListener('keydown', function (e) {
        // Only handle if canvas is focused / inside this designer
        if (!root.contains(document.activeElement) && document.activeElement !== document.body) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
          if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') return;
          deleteSelected();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo(); else undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault(); redo();
        }
        if (e.key === 'Escape') {
          closePopup();
          if (S.canvas) S.canvas.discardActiveObject().renderAll();
        }
      });

      // Close popups on outside click
      document.addEventListener('click', function (e) {
        if (!S.activePopup) return;
        var popup = q('[data-popup="' + S.activePopup + '"]');
        var ftb   = q('[data-float-tb]');
        if (popup && !popup.contains(e.target) && ftb && !ftb.contains(e.target)) {
          closePopup();
        }
      });

      // Window resize: reposition canvas overlay
      window.addEventListener('resize', function () {
        var productImg = q('[data-product-img]');
        if (productImg && productImg.classList.contains('loaded')) {
          positionCanvasOverlayOnImage(productImg);
          resizeCanvas();
        }
      });

      window.addEventListener('beforeunload', function () {
        if (!S.canvas) return;
        try {
          S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(['id', 'name']));
          var state = {};
          if (S.saved.front) state.front = S.saved.front;
          if (S.saved.back) state.back = S.saved.back;
          localStorage.setItem(CANVAS_KEY, JSON.stringify(state));
        } catch (e) { /* ignore */ }
      });
    }

    // ── Seçili varyanta göre ön/arka görsel ──────────────────────────────────
    function initVariantImages() {
      try {
        var sv = selectedVariant();
        if (!sv.id) return;

        var cOpt = colorOption();
        var selectedColorKey = colorKeyFromVariant(sv, cOpt);
        var varImgIdx = buildVariantImageIndex();
        var variants = productVariants();
        var front = '', back = '', doubleImg = '';

        variants.forEach(function (v) {
          if (selectedColorKey && colorKeyFromVariant(v, cOpt) !== selectedColorKey) return;
          var entry = varImgIdx[v.id] || {};
          var src = variantProductImageSrc(v);
          var mode = detectPrintMode(variantOptions(v));
          if (mode === 'front' && !front) front = entry.front || src;
          if (mode === 'back'  && !back)  back  = entry.back  || src;
          if (mode === 'double' && !doubleImg) doubleImg = entry.front || entry.back || src;
        });

        if (!front) {
          var selectedEntry = varImgIdx[sv.id] || {};
          front = selectedEntry.front || variantProductImageSrc(sv);
        }
        if (!back && doubleImg) back = doubleImg;

        // cfg güncelle (Liquid'den gelen boşsa, varyant görselini kullan)
        if (front) cfg.frontImage = front;
        if (back)  cfg.backImage  = back;
      } catch (e) { /* yoksay */ }
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    function init() {
      try { bind(); } catch(e) {}
      try { initVariantImages(); } catch(e) {}
      try { buildColorSwatches(); } catch(e) {}
      try { applyShirtColor(S.shirtColor); } catch(e) {}
      try { buildSizeButtons(); } catch(e) {}
      try { buildTemplates(); } catch(e) {}   // StaticCanvas setActiveObject hatası burada yakalanır
      try { renderSavedGrid(); } catch(e) {}
      loadCanvasFromStorage();
      setupProductDisplay();
      updatePriceLabel();
      // Resimleri en son yükle — panel ve canvas hazır olsun
      loadImagesFromStorage();
      if (S.uploadedImages.length > 0) activateTool('image');
    }

    init();

  }); // end forEach
}());
