// v41
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

  var DESIGN_JSON_PROPS = [
    'id', 'name', 'assetId', 'originalUrl', 'originalFilename',
    'originalWidth', 'originalHeight', 'originalMime', 'originalSize',
  ];

  function buildDefaultPricingBands() {
    var sizes = [
      { widthCm: 10, heightCm: 15, label: '10 x 15 cm' },
      { widthCm: 21, heightCm: 29, label: '21 x 29 cm' },
      { widthCm: 29, heightCm: 42, label: '29 x 42 cm' },
    ];
    var bands = sizes.map(function (s) {
      return {
        key: s.widthCm + 'x' + s.heightCm,
        maxWidthCm: s.widthCm,
        maxHeightCm: s.heightCm,
        maxAreaCm2: s.widthCm * s.heightCm,
        label: s.label,
        surcharge: 0,
      };
    });
    return { front: bands, back: bands.slice() };
  }

  function defaultOverlayForType(productType) {
    if (productType === 'bag') {
      return { leftPct: 0.22, topPct: 0.24, widthPct: 0.56, heightPct: 0.58 };
    }
    if (productType === 'mug') {
      return { leftPct: 0.18, topPct: 0.35, widthPct: 0.64, heightPct: 0.24 };
    }
    if (productType === 'boxer') {
      return { leftPct: 0.32, topPct: 0.44, widthPct: 0.37, heightPct: 0.23 };
    }
    if (productType === 'other') {
      return { leftPct: 0.23, topPct: 0.28, widthPct: 0.54, heightPct: 0.48 };
    }
    return { leftPct: 0.29, topPct: 0.27, widthPct: 0.42, heightPct: 0.56 };
  }


  function parseHexColor(hex) {
    var value = String(hex || '').replace('#', '').trim();
    if (value.length === 3) value = value.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function preferredTextColor() {
    var rgb = parseHexColor(S.shirtColor || '#ffffff');
    if (!rgb) return '#111111';
    var luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance < 0.45 ? '#ffffff' : '#111111';
  }

  // ── Template designs ──────────────────────────────────────────────────────
  function createText(text, opts) {
    return new fabric.IText(text, Object.assign({
      originX: 'center',
      originY: 'center',
      textAlign: 'center',
      lineHeight: 1.05,
      fill: '#111827',
      fontFamily: 'Impact',
      selectable: true,
    }, opts || {}));
  }

  function addFrame(canvas, opts) {
    return new fabric.Rect(Object.assign({
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
      width: canvas.width - 28,
      height: canvas.height - 28,
      fill: 'transparent',
      stroke: '#111827',
      strokeWidth: 2,
      rx: 10,
      selectable: false,
      evented: false,
    }, opts || {}));
  }

  function addBadgeRing(canvas, opts) {
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    return [
      new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: opts.outer || 76, fill: 'transparent', stroke: opts.stroke || '#111827',
        strokeWidth: opts.strokeWidth || 4, selectable: false, evented: false,
      }),
      new fabric.Circle({
        left: cx, top: cy, originX: 'center', originY: 'center',
        radius: opts.inner || 60, fill: 'transparent', stroke: opts.stroke || '#111827',
        strokeWidth: 1.5, strokeDashArray: opts.dash || null, selectable: false, evented: false,
      }),
    ];
  }

  function starPoints(cx, cy, outerR, innerR, count) {
    var pts = [];
    for (var i = 0; i < count * 2; i++) {
      var angle = -Math.PI / 2 + i * Math.PI / count;
      var r = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    return pts;
  }

  function addStar(cx, cy, outerR, innerR, fill) {
    return new fabric.Polygon(starPoints(cx, cy, outerR, innerR, 5), {
      fill: fill || '#111827',
      selectable: false,
      evented: false,
      objectCaching: false,
    });
  }

  function stackTemplate(id, label, lines, opts) {
    return {
      id: id,
      label: label,
      build: function (canvas) {
        var items = [];
        if (opts && opts.frame) items.push(addFrame(canvas, opts.frame === true ? {} : opts.frame));
        if (opts && opts.badge) items = items.concat(addBadgeRing(canvas, opts.badge));
        if (opts && opts.ribbon) {
          items.push(new fabric.Rect({
            left: canvas.width / 2,
            top: opts.ribbon.top || canvas.height / 2,
            originX: 'center',
            originY: 'center',
            width: opts.ribbon.width || canvas.width - 36,
            height: opts.ribbon.height || 36,
            fill: opts.ribbon.fill || '#111827',
            rx: 4,
            selectable: false,
            evented: false,
          }));
        }
        if (opts && opts.stars) {
          for (var i = 0; i < opts.stars.length; i++) {
            var s = opts.stars[i];
            items.push(addStar(s.x, s.y, s.outer || 10, s.inner || 5, s.fill || '#111827'));
          }
        }

        var active = null;
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          active = createText(line.text, {
            left: canvas.width / 2 + (line.dx || 0),
            top: line.top,
            fontFamily: line.font || 'Impact',
            fontSize: line.size || 28,
            fill: line.fill || '#111827',
            fontWeight: line.weight || 'normal',
            fontStyle: line.style || 'normal',
            underline: !!line.underline,
            charSpacing: line.spacing || 0,
            angle: line.angle || 0,
          });
          items.push(active);
        }
        canvas.add.apply(canvas, items);
        if (active && canvas.setActiveObject) canvas.setActiveObject(active);
      },
    };
  }

  function shirtSilhouetteTemplate(id, label, title, subtitle, accent) {
    return {
      id: id,
      label: label,
      build: function (canvas) {
        var cx = canvas.width / 2;
        var cy = canvas.height / 2;
        var body = new fabric.Path('M -40 -44 L -64 -22 L -50 0 L -34 -8 L -34 54 L 34 54 L 34 -8 L 50 0 L 64 -22 L 40 -44 L 18 -32 Q 0 -16 -18 -32 Z', {
          left: cx,
          top: cy + 16,
          originX: 'center',
          originY: 'center',
          fill: accent || '#dc2626',
          selectable: false,
          evented: false,
          scaleX: 1.35,
          scaleY: 1.35,
        });
        var titleTxt = createText(title, { left: cx, top: cy - 52, fontSize: 26, fill: '#111827', fontFamily: 'Impact' });
        var subTxt = createText(subtitle, { left: cx, top: cy + 96, fontSize: 14, fill: '#6b7280', fontFamily: 'Arial', charSpacing: 80 });
        canvas.add(titleTxt, body, subTxt);
        if (canvas.setActiveObject) canvas.setActiveObject(titleTxt);
      },
    };
  }

  var TEMPLATE_DESIGNS = [
    stackTemplate('birthday-1', 'Dogum Gunu 01', [
      { text: 'BIRTHDAY', top: 84, size: 26, spacing: 130 },
      { text: 'QUEEN', top: 124, size: 52, fill: '#db2777' },
      { text: 'EST. TODAY', top: 168, size: 16, font: 'Arial', spacing: 120 },
    ], { frame: true }),
    stackTemplate('birthday-2', 'Dogum Gunu 02', [
      { text: 'IT TOOK', top: 78, size: 20, font: 'Arial', spacing: 100 },
      { text: '30 YEARS', top: 122, size: 44, fill: '#ea580c' },
      { text: 'TO LOOK THIS GOOD', top: 164, size: 16, font: 'Arial', spacing: 80 },
    ], { badge: { stroke: '#ea580c', outer: 80, inner: 66 } }),
    stackTemplate('birthday-3', 'Dogum Gunu 03', [
      { text: 'LIMITED', top: 90, size: 20, font: 'Arial', spacing: 120 },
      { text: 'BIRTHDAY', top: 126, size: 38, fill: '#7c3aed' },
      { text: 'EDITION', top: 162, size: 28, fill: '#111827' },
    ], { ribbon: { top: 126, width: 180, height: 32, fill: '#ede9fe' } }),
    stackTemplate('birthday-4', 'Dogum Gunu 04', [
      { text: 'MADE IN', top: 84, size: 18, font: 'Arial', spacing: 150 },
      { text: 'MAY', top: 122, size: 56, fill: '#dc2626' },
      { text: 'PREMIUM QUALITY', top: 166, size: 15, font: 'Arial', spacing: 120 },
    ], { frame: { stroke: '#dc2626', strokeWidth: 3 } }),

    stackTemplate('couple-1', 'Cift 01', [
      { text: 'BETTER', top: 90, size: 28 },
      { text: 'TOGETHER', top: 128, size: 34, fill: '#0f766e' },
      { text: 'SINCE FOREVER', top: 168, size: 14, font: 'Arial', spacing: 100 },
    ], { badge: { stroke: '#0f766e', outer: 78, inner: 64 } }),
    stackTemplate('couple-2', 'Cift 02', [
      { text: 'KING', top: 92, size: 46, fill: '#111827' },
      { text: '&', top: 130, size: 22, fill: '#dc2626', font: 'Georgia' },
      { text: 'QUEEN', top: 164, size: 42, fill: '#111827' },
    ], { stars: [{ x: 98, y: 98 }, { x: 202, y: 98 }] }),
    stackTemplate('couple-3', 'Cift 03', [
      { text: 'YOU ARE MY', top: 88, size: 17, font: 'Arial', spacing: 100 },
      { text: 'FAVORITE', top: 126, size: 36, fill: '#2563eb' },
      { text: 'PERSON', top: 164, size: 32, fill: '#111827' },
    ], { frame: true }),
    stackTemplate('couple-4', 'Cift 04', [
      { text: 'MATCH', top: 98, size: 30 },
      { text: 'MADE IN', top: 132, size: 22, font: 'Arial', spacing: 80 },
      { text: 'CHAOS', top: 166, size: 34, fill: '#f43f5e' },
    ], { badge: { stroke: '#f43f5e', outer: 76, inner: 58, dash: [6, 4] } }),

    stackTemplate('teacher-1', 'Ogretmen 01', [
      { text: 'TEACH', top: 86, size: 28 },
      { text: 'LOVE', top: 122, size: 36, fill: '#2563eb' },
      { text: 'INSPIRE', top: 160, size: 30, fill: '#111827' },
    ], { frame: { stroke: '#2563eb' } }),
    stackTemplate('teacher-2', 'Ogretmen 02', [
      { text: 'BEST', top: 90, size: 18, font: 'Arial', spacing: 140 },
      { text: 'TEACHER', top: 128, size: 40, fill: '#16a34a' },
      { text: 'EVER', top: 166, size: 28 },
    ], { stars: [{ x: 88, y: 126, fill: '#16a34a' }, { x: 212, y: 126, fill: '#16a34a' }] }),
    stackTemplate('teacher-3', 'Ogretmen 03', [
      { text: 'ABC', top: 88, size: 18, font: 'Courier New', spacing: 150 },
      { text: 'MY CLASS', top: 126, size: 34, fill: '#9333ea' },
      { text: 'MY RULES', top: 164, size: 28 },
    ], { badge: { stroke: '#9333ea', outer: 76, inner: 64 } }),
    stackTemplate('teacher-4', 'Ogretmen 04', [
      { text: 'PATIENCE', top: 86, size: 20, font: 'Arial', spacing: 90 },
      { text: '+ COFFEE', top: 124, size: 36, fill: '#92400e' },
      { text: '= TEACHER', top: 162, size: 26 },
    ], { ribbon: { top: 124, width: 190, height: 34, fill: '#fef3c7' } }),

    stackTemplate('mom-1', 'Anne 01', [
      { text: 'MAMA', top: 92, size: 48, fill: '#db2777' },
      { text: 'CLUB', top: 140, size: 32 },
      { text: 'EST. FOREVER', top: 176, size: 14, font: 'Arial', spacing: 100 },
    ], { badge: { stroke: '#db2777' } }),
    stackTemplate('mom-2', 'Anne 02', [
      { text: 'COOL', top: 86, size: 22, font: 'Arial', spacing: 120 },
      { text: 'MOM', top: 126, size: 56, fill: '#ec4899' },
      { text: 'ENERGY', top: 168, size: 22 },
    ], { frame: true }),
    stackTemplate('dad-1', 'Baba 01', [
      { text: 'DAD', top: 92, size: 54, fill: '#1d4ed8' },
      { text: 'MODE', top: 136, size: 30 },
      { text: 'ON', top: 170, size: 24, fill: '#111827' },
    ], { badge: { stroke: '#1d4ed8', outer: 78, inner: 64 } }),
    stackTemplate('dad-2', 'Baba 02', [
      { text: 'THE MAN', top: 88, size: 20, font: 'Arial', spacing: 130 },
      { text: 'THE MYTH', top: 124, size: 28 },
      { text: 'THE DAD', top: 162, size: 34, fill: '#ea580c' },
    ], { frame: { stroke: '#ea580c', strokeWidth: 3 } }),

    stackTemplate('gym-1', 'Gym 01', [
      { text: 'NO PAIN', top: 92, size: 34 },
      { text: 'MORE GAIN', top: 132, size: 30, fill: '#dc2626' },
      { text: 'REPEAT', top: 170, size: 20, font: 'Arial', spacing: 180 },
    ], { frame: true }),
    stackTemplate('gym-2', 'Gym 02', [
      { text: 'TRAIN', top: 86, size: 20, font: 'Arial', spacing: 140 },
      { text: 'HEAVY', top: 126, size: 50, fill: '#111827' },
      { text: 'STAY HUMBLE', top: 168, size: 18, fill: '#16a34a', font: 'Arial', spacing: 100 },
    ], { badge: { stroke: '#16a34a' } }),
    stackTemplate('gym-3', 'Gym 03', [
      { text: 'EAT', top: 84, size: 18, font: 'Arial', spacing: 110 },
      { text: 'SLEEP', top: 116, size: 28, fill: '#2563eb' },
      { text: 'LIFT', top: 148, size: 38, fill: '#111827' },
      { text: 'REPEAT', top: 184, size: 22, font: 'Arial', spacing: 80 },
    ], { ribbon: { top: 148, width: 150, height: 28, fill: '#dbeafe' } }),
    stackTemplate('gym-4', 'Gym 04', [
      { text: 'STRONGER', top: 92, size: 28, fill: '#7c2d12' },
      { text: 'EVERYDAY', top: 128, size: 34 },
      { text: 'MINDSET', top: 166, size: 22, fill: '#ea580c' },
    ], { stars: [{ x: 93, y: 166, fill: '#ea580c' }, { x: 207, y: 166, fill: '#ea580c' }] }),

    stackTemplate('car-1', 'Car 01', [
      { text: 'LOW', top: 88, size: 24, font: 'Arial', spacing: 150 },
      { text: 'SLOW', top: 122, size: 44, fill: '#111827' },
      { text: '& LOUD', top: 158, size: 30, fill: '#dc2626' },
    ], { frame: { stroke: '#111827' } }),
    stackTemplate('car-2', 'Car 02', [
      { text: 'BOOST', top: 92, size: 38, fill: '#2563eb' },
      { text: 'MODE', top: 130, size: 34 },
      { text: 'ACTIVE', top: 168, size: 18, font: 'Arial', spacing: 100 },
    ], { badge: { stroke: '#2563eb', outer: 80, inner: 64 } }),
    stackTemplate('moto-1', 'Moto 01', [
      { text: 'RIDE', top: 88, size: 44, fill: '#111827' },
      { text: 'FAST', top: 128, size: 34, fill: '#ea580c' },
      { text: 'LIVE FREE', top: 168, size: 18, font: 'Arial', spacing: 90 },
    ], { stars: [{ x: 94, y: 92, fill: '#ea580c' }, { x: 206, y: 92, fill: '#ea580c' }] }),
    stackTemplate('moto-2', 'Moto 02', [
      { text: 'TWO', top: 90, size: 20, font: 'Arial', spacing: 120 },
      { text: 'WHEELS', top: 126, size: 40, fill: '#0f766e' },
      { text: 'FOREVER', top: 164, size: 24 },
    ], { frame: true }),

    stackTemplate('funny-1', 'Komik 01', [
      { text: 'I NEED', top: 92, size: 24, font: 'Arial', spacing: 130 },
      { text: 'A NAP', top: 126, size: 42, fill: '#db2777' },
      { text: 'AND A PAY RAISE', top: 164, size: 15, font: 'Arial', spacing: 60 },
    ], { frame: { stroke: '#db2777' } }),
    stackTemplate('funny-2', 'Komik 02', [
      { text: 'SOCIAL', top: 88, size: 20, font: 'Arial', spacing: 120 },
      { text: 'BATTERY', top: 124, size: 36, fill: '#111827' },
      { text: '0%', top: 166, size: 44, fill: '#ef4444' },
    ], { badge: { stroke: '#ef4444' } }),
    stackTemplate('funny-3', 'Komik 03', [
      { text: 'CURRENTLY', top: 88, size: 18, font: 'Arial', spacing: 120 },
      { text: 'UNMOTIVATED', top: 126, size: 32, fill: '#7c3aed' },
      { text: 'PLEASE RETURN LATER', top: 166, size: 14, font: 'Arial', spacing: 50 },
    ], { ribbon: { top: 126, width: 190, height: 32, fill: '#ede9fe' } }),
    stackTemplate('funny-4', 'Komik 04', [
      { text: 'PROBABLY', top: 88, size: 18, font: 'Arial', spacing: 120 },
      { text: 'LATE', top: 128, size: 56, fill: '#f97316' },
      { text: 'BUT WORTH IT', top: 170, size: 18, font: 'Arial', spacing: 60 },
    ], { frame: true }),

    stackTemplate('minimal-1', 'Minimal 01', [
      { text: 'STUDIO', top: 108, size: 24, font: 'Trebuchet MS', spacing: 180 },
      { text: 'NORTH', top: 146, size: 34, font: 'Trebuchet MS', spacing: 90 },
    ], { frame: { stroke: '#111827', strokeWidth: 1.5 } }),
    stackTemplate('minimal-2', 'Minimal 02', [
      { text: 'ATELIER', top: 108, size: 22, font: 'Verdana', spacing: 160 },
      { text: '01', top: 150, size: 46, font: 'Georgia', fill: '#2563eb' },
    ], { badge: { stroke: '#2563eb', outer: 72, inner: 58 } }),
    stackTemplate('minimal-3', 'Minimal 03', [
      { text: 'LINE', top: 110, size: 24, font: 'Arial', spacing: 160 },
      { text: 'FORM', top: 146, size: 30, font: 'Arial', spacing: 110, fill: '#0f766e' },
    ], { ribbon: { top: 146, width: 140, height: 24, fill: '#ecfeff' } }),
    stackTemplate('minimal-4', 'Minimal 04', [
      { text: 'VOID', top: 112, size: 36, font: 'Georgia' },
      { text: 'STUDIO', top: 148, size: 18, font: 'Arial', spacing: 150 },
    ], { frame: { stroke: '#6b7280', strokeWidth: 1.5 } }),

    stackTemplate('retro-1', 'Retro 01', [
      { text: 'VINTAGE', top: 86, size: 18, font: 'Arial', spacing: 140 },
      { text: 'GARAGE', top: 122, size: 34, fill: '#92400e' },
      { text: 'SINCE 1987', top: 160, size: 18, font: 'Arial', spacing: 90 },
    ], { badge: { stroke: '#92400e', outer: 80, inner: 64 }, stars: [{ x: 98, y: 160, fill: '#92400e' }, { x: 202, y: 160, fill: '#92400e' }] }),
    stackTemplate('retro-2', 'Retro 02', [
      { text: 'CLASSIC', top: 90, size: 20, font: 'Arial', spacing: 130 },
      { text: 'MOTEL', top: 126, size: 40, fill: '#dc2626' },
      { text: 'ROADSIDE CLUB', top: 164, size: 14, font: 'Arial', spacing: 60 },
    ], { frame: { stroke: '#dc2626', strokeWidth: 3 } }),
    stackTemplate('retro-3', 'Retro 03', [
      { text: 'SUNSET', top: 94, size: 22, font: 'Arial', spacing: 120 },
      { text: 'SURF', top: 130, size: 46, fill: '#0ea5e9' },
      { text: 'PARADISE', top: 166, size: 22, fill: '#f97316' },
    ], { badge: { stroke: '#0ea5e9', outer: 76, inner: 62, dash: [4, 4] } }),
    stackTemplate('retro-4', 'Retro 04', [
      { text: 'MIDNIGHT', top: 88, size: 20, font: 'Arial', spacing: 110 },
      { text: 'DRIVE', top: 126, size: 42, fill: '#7c3aed' },
      { text: 'CITY CLUB', top: 164, size: 16, font: 'Arial', spacing: 90 },
    ], { ribbon: { top: 126, width: 150, height: 28, fill: '#ede9fe' } }),
    stackTemplate('retro-5', 'Retro 05', [
      { text: 'OLD', top: 94, size: 18, font: 'Arial', spacing: 140 },
      { text: 'SCHOOL', top: 128, size: 38, fill: '#111827' },
      { text: 'ATHLETIC', top: 164, size: 24, fill: '#16a34a' },
    ], { stars: [{ x: 90, y: 126, fill: '#16a34a' }, { x: 210, y: 126, fill: '#16a34a' }] }),

    stackTemplate('typo-1', 'Tipografi 01', [
      { text: 'CREATE', top: 88, size: 52, fill: '#111827' },
      { text: 'WITHOUT FEAR', top: 136, size: 16, font: 'Arial', spacing: 110 },
    ], { frame: true }),
    stackTemplate('typo-2', 'Tipografi 02', [
      { text: 'MOVE', top: 90, size: 22, font: 'Arial', spacing: 120 },
      { text: 'QUIETLY', top: 128, size: 40, fill: '#1d4ed8' },
      { text: 'MAKE NOISE', top: 164, size: 18, font: 'Arial', spacing: 70 },
    ], { badge: { stroke: '#1d4ed8' } }),
    stackTemplate('typo-3', 'Tipografi 03', [
      { text: 'LESS', top: 90, size: 28, fill: '#111827' },
      { text: 'TALK', top: 126, size: 48, fill: '#ef4444' },
      { text: 'MORE DO', top: 168, size: 28, fill: '#111827' },
    ], { ribbon: { top: 126, width: 132, height: 30, fill: '#fee2e2' } }),
    stackTemplate('typo-4', 'Tipografi 04', [
      { text: 'KEEP', top: 92, size: 24, font: 'Arial', spacing: 150 },
      { text: 'GOING', top: 128, size: 44, fill: '#16a34a' },
      { text: 'ANYWAY', top: 168, size: 24 },
    ], { frame: { stroke: '#16a34a' } }),
    stackTemplate('typo-5', 'Tipografi 05', [
      { text: 'CALM', top: 94, size: 20, font: 'Arial', spacing: 120 },
      { text: 'IS A', top: 126, size: 24, font: 'Georgia' },
      { text: 'SUPERPOWER', top: 162, size: 30, fill: '#0f766e' },
    ], { badge: { stroke: '#0f766e', outer: 78, inner: 60 } }),

    shirtSilhouetteTemplate('team-1', 'Takim Formasi', 'TEAM 07', 'CUSTOM BACK PRINT', '#dc2626'),
    shirtSilhouetteTemplate('photo-1', 'Foto + Yazi', 'PHOTO', 'ADD YOUR IMAGE HERE', '#2563eb'),
    stackTemplate('qr-1', 'Instagram QR', [
      { text: '@YOURBRAND', top: 94, size: 22, font: 'Arial', spacing: 70 },
      { text: 'SCAN ME', top: 132, size: 34, fill: '#111827' },
      { text: 'USE QR TOOL', top: 170, size: 16, font: 'Arial', spacing: 90 },
    ], { frame: { stroke: '#111827', strokeWidth: 2 } }),
    stackTemplate('logo-1', 'Sirket Logosu', [
      { text: 'ACME', top: 110, size: 40, font: 'Trebuchet MS', spacing: 120 },
      { text: 'STUDIO GOODS', top: 152, size: 16, font: 'Arial', spacing: 120 },
    ], { badge: { stroke: '#111827', outer: 68, inner: 54 } }),
  ];

  // ── Per-designer initialization ───────────────────────────────────────────
  document.querySelectorAll('.designer').forEach(function (root) {

    // ── Config ──────────────────────────────────────────────────────────────
    // Shopify fiyatları kuruş/sent cinsinden gelir → /100 ile TL'ye çevir
    var _productPrice = +(root.dataset.productPrice || 0) / 100;
    var defaultPrintWidthCm = +(root.dataset.printWidthCm || 28) || 28;
    var defaultPrintHeightCm = +(root.dataset.printHeightCm || 45) || 45;
    var defaultOverlayArea = defaultOverlayForType('apparel');
    var cfg = {
      currency: root.dataset.currency || 'TRY',
      locale:   root.dataset.locale   || 'tr-TR',
      productId: root.dataset.productId || '',
      productType: 'apparel',
      surfaceMode: 'front_back',
      printAreaBySide: {
        front: { widthCm: defaultPrintWidthCm, heightCm: defaultPrintHeightCm },
        back: { widthCm: defaultPrintWidthCm, heightCm: defaultPrintHeightCm },
      },
      overlayAreaBySide: {
        front: defaultOverlayArea,
        back: defaultOverlayArea,
      },
      pricingBands: null,
      surchargeVariantId: '',
      prices: {
        front:  0,
        back:   0,
        double: 0,
      },
      variantMap:     {},   // colorKey -> size -> mode -> variantId
      baseVariantMap: {},
      variantPrices:  {},  // variantId → fiyat (TL)
      uploadEndpoint: root.dataset.uploadEndpoint || '/apps/tshirt-designer/upload',
      productHandle:  root.dataset.productHandle || '',
      backImage:      root.dataset.backImage  || '',
      frontImage:     root.dataset.frontImage || '',
      singleVariantId: root.dataset.singleVariantId || '',
      doubleVariantId: root.dataset.doubleVariantId || '',
    };
    cfg.pricingBands = buildDefaultPricingBands();

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
          if (size && v.id) {
            cfg.baseVariantMap[colorKey] = cfg.baseVariantMap[colorKey] || {};
            if (!cfg.baseVariantMap[colorKey][size]) cfg.baseVariantMap[colorKey][size] = String(v.id);
          }
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
      activeTextPanel: null,
      saved: { front: null, back: null },
      history: { front: [], back: [] },
      redo:    { front: [], back: [] },
      uploadedImages: [],    // [{dataUrl, name}]
      activeFilter: 'none',
      size: 'M',
      sizeQty: {},
      quantity: 1,
      zoom: 1,
      floatTarget: null,     // currently selected object for float toolbar
      colorKey: '',
      colorName: '',
      quickbarLock: false,
      suppressQuickbarRestore: false,
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    function viewName() { return S.views[S.viewIdx]; }

    function printAreaForSide(side) {
      var area = cfg.printAreaBySide[side] || cfg.printAreaBySide.front || { widthCm: defaultPrintWidthCm, heightCm: defaultPrintHeightCm };
      return {
        widthCm: +(area.widthCm || defaultPrintWidthCm) || defaultPrintWidthCm,
        heightCm: +(area.heightCm || defaultPrintHeightCm) || defaultPrintHeightCm,
      };
    }

    function overlayAreaForSide(side) {
      var area = cfg.overlayAreaBySide[side] || cfg.overlayAreaBySide.front || defaultOverlayArea;
      return {
        leftPct: +(area.leftPct || defaultOverlayArea.leftPct),
        topPct: +(area.topPct || defaultOverlayArea.topPct),
        widthPct: +(area.widthPct || defaultOverlayArea.widthPct),
        heightPct: +(area.heightPct || defaultOverlayArea.heightPct),
      };
    }

    function applySurfaceMode() {
      S.views = cfg.surfaceMode === 'front_only' ? ['front'] : ['front', 'back'];
      if (S.viewIdx >= S.views.length) S.viewIdx = 0;
      qa('[data-view-card]').forEach(function (btn) {
        var isFront = btn.dataset.viewCard === 'front';
        btn.style.display = (isFront || cfg.surfaceMode !== 'front_only') ? '' : 'none';
      });
      var prevView = q('[data-prev-view]');
      var nextView = q('[data-next-view]');
      var multiple = S.views.length > 1;
      if (prevView) prevView.style.display = multiple ? '' : 'none';
      if (nextView) nextView.style.display = multiple ? '' : 'none';
    }

    function normalizeRemoteBandList(sideBands, fallbackBands) {
      var source = Array.isArray(sideBands) ? sideBands : [];
      var normalized = source.map(function (band, index) {
        var width = band && band.maxWidthCm != null && band.maxWidthCm !== '' ? Number(band.maxWidthCm) : null;
        var height = band && band.maxHeightCm != null && band.maxHeightCm !== '' ? Number(band.maxHeightCm) : null;
        var area = band && band.maxAreaCm2 != null && band.maxAreaCm2 !== '' ? Number(band.maxAreaCm2) : null;
        var fallbackKey = (width != null && height != null) ? (String(width) + 'x' + String(height)) : String(index);
        return {
          key: String((band && band.key) || fallbackKey),
          maxWidthCm: width,
          maxHeightCm: height,
          maxAreaCm2: area != null ? area : (width != null && height != null ? width * height : null),
          label: String((band && band.label) || fallbackKey),
          surcharge: Number(band && band.surcharge || 0),
        };
      }).filter(function (band) {
        return (band.maxWidthCm != null && band.maxHeightCm != null) || band.maxAreaCm2 != null;
      });

      normalized.sort(function (a, b) {
        var aArea = Number(a.maxAreaCm2 != null ? a.maxAreaCm2 : ((a.maxWidthCm || 0) * (a.maxHeightCm || 0)));
        var bArea = Number(b.maxAreaCm2 != null ? b.maxAreaCm2 : ((b.maxWidthCm || 0) * (b.maxHeightCm || 0)));
        return aArea - bArea;
      });

      return normalized.length ? normalized : fallbackBands;
    }

    function normalizeRemoteBands(bands) {
      if (!bands || typeof bands !== 'object') return cfg.pricingBands;
      return {
        front: normalizeRemoteBandList(bands.front, cfg.pricingBands.front),
        back: normalizeRemoteBandList(bands.back, cfg.pricingBands.back),
      };
    }

    function normalizeRemoteOverlay(printAreas) {
      var fallback = defaultOverlayForType(cfg.productType);
      var next = {
        front: fallback,
        back: fallback,
      };
      (Array.isArray(printAreas) ? printAreas : []).forEach(function (area) {
        if (!area || !area.side || !area.width || !area.height) return;
        next[area.side] = {
          leftPct: Number(area.x || 0) / 480,
          topPct: Number(area.y || 0) / 580,
          widthPct: Number(area.width || 0) / 480,
          heightPct: Number(area.height || 0) / 580,
        };
      });
      return next;
    }

    function applyPersonalizationSettings(settings, printAreas, productMeta) {
      if (!settings) return;
      var areas = Array.isArray(printAreas) ? printAreas : [];
      function areaFor(side) {
        for (var i = 0; i < areas.length; i++) {
          if (areas[i] && areas[i].side === side) return areas[i];
        }
        return null;
      }
      var frontArea = areaFor('front');
      var backArea = areaFor('back');
      cfg.productId = productMeta && productMeta.id ? String(productMeta.id) : cfg.productId;
      cfg.productType = settings.productType || (productMeta && productMeta.productType) || cfg.productType;
      cfg.surfaceMode = settings.surfaceMode || (productMeta && productMeta.surfaceMode) || cfg.surfaceMode;
      cfg.pricingBands = normalizeRemoteBands(settings.pricingBands) || cfg.pricingBands;
      if (settings.surchargeVariantId) cfg.surchargeVariantId = String(settings.surchargeVariantId);
      cfg.printAreaBySide = {
        front: {
          widthCm: Number((frontArea && frontArea.realWidthMm / 10) || settings.frontPrintWidthCm || defaultPrintWidthCm),
          heightCm: Number((frontArea && frontArea.realHeightMm / 10) || settings.frontPrintHeightCm || defaultPrintHeightCm),
        },
        back: {
          widthCm: Number((backArea && backArea.realWidthMm / 10) || settings.backPrintWidthCm || settings.frontPrintWidthCm || defaultPrintWidthCm),
          heightCm: Number((backArea && backArea.realHeightMm / 10) || settings.backPrintHeightCm || settings.frontPrintHeightCm || defaultPrintHeightCm),
        },
      };
      cfg.overlayAreaBySide = normalizeRemoteOverlay(areas);
      applySurfaceMode();
    }

    function loadRemotePersonalization(done) {
      if (!cfg.productHandle || !window.fetch) {
        applySurfaceMode();
        done();
        return;
      }
      var params = new URLSearchParams({
        handle: cfg.productHandle || '',
        productId: cfg.productId || '',
      });
      fetch('/apps/tshirt-designer/personalization?' + params.toString(), {
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (res.status === 404) { root.style.display = 'none'; done(); return null; }
          return res.ok ? res.json() : null;
        })
        .then(function (payload) {
          if (payload === null) return;
          if (payload && payload.settings) applyPersonalizationSettings(payload.settings, payload.printAreas, payload.product);
          else applySurfaceMode();
          done();
        })
        .catch(function () {
          applySurfaceMode();
          done();
        });
    }

    function isImageObject(obj) {
      return obj && obj.type === 'image';
    }

    function lockImageProportions(obj) {
      if (!isImageObject(obj)) return;
      obj.set({
        lockUniScaling: true,
        lockScalingFlip: true,
      });
      if (obj.setControlsVisibility) {
        obj.setControlsVisibility({
          mt: false,
          mb: false,
          ml: false,
          mr: false,
        });
      }
    }

    function keepImageUniform(obj) {
      if (!isImageObject(obj)) return;
      var scale = Math.max(Math.abs(obj.scaleX || 1), Math.abs(obj.scaleY || 1));
      obj.set({
        scaleX: (obj.scaleX || 1) < 0 ? -scale : scale,
        scaleY: (obj.scaleY || 1) < 0 ? -scale : scale,
      });
      obj.setCoords();
    }

    function containImageInCanvas(obj) {
      if (!isImageObject(obj) || !S.canvas) return;
      obj.setCoords();
      var cw = S.canvas.getWidth();
      var ch = S.canvas.getHeight();
      var rect = imageBounds(obj);

      if (rect.width > cw || rect.height > ch) {
        var fit = Math.min(cw / rect.width, ch / rect.height) * 0.98;
        var sx = (obj.scaleX || 1) * fit;
        var sy = (obj.scaleY || 1) * fit;
        obj.set({
          scaleX: sx,
          scaleY: sy,
        });
        keepImageUniform(obj);
        obj.setCoords();
        rect = imageBounds(obj);
      }

      clampObjectByBounds(obj, rect, cw, ch);
      rect = imageBounds(obj);
      clampObjectByBounds(obj, rect, cw, ch);
      if (S.canvas.requestRenderAll) S.canvas.requestRenderAll();
      else S.canvas.renderAll();
    }

    function imageBounds(obj) {
      if (!obj) return { left: 0, top: 0, width: 0, height: 0 };
      if (typeof obj.setCoords !== 'function') return objectRectFromSaved(obj);
      obj.setCoords();
      var c = obj.aCoords;
      if (c && c.tl && c.tr && c.bl && c.br) {
        var xs = [c.tl.x, c.tr.x, c.bl.x, c.br.x];
        var ys = [c.tl.y, c.tr.y, c.bl.y, c.br.y];
        var minX = Math.min.apply(null, xs);
        var maxX = Math.max.apply(null, xs);
        var minY = Math.min.apply(null, ys);
        var maxY = Math.max.apply(null, ys);
        return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
      }
      return obj.getBoundingRect(true, true);
    }

    function isFabricCanvasObject(obj) {
      return !!(obj && typeof obj.setCoords === 'function' && typeof obj.getBoundingRect === 'function');
    }

    function clampObjectByBounds(obj, rect, cw, ch) {
      var dx = 0;
      var dy = 0;
      if (rect.left < 0) dx = -rect.left;
      if (rect.left + rect.width > cw) dx = Math.min(dx, cw - (rect.left + rect.width));
      if (rect.top < 0) dy = -rect.top;
      if (rect.top + rect.height > ch) dy = Math.min(dy, ch - (rect.top + rect.height));
      if (!dx && !dy) return;
      obj.set({
        left: (obj.left || 0) + dx,
        top: (obj.top || 0) + dy,
      });
      obj.setCoords();
    }

    function normalizeCanvasImages() {
      if (!S.canvas) return;
      S.canvas.getObjects().forEach(function (obj) {
        lockImageProportions(obj);
        containImageInCanvas(obj);
      });
    }

    function canvasJSON() {
      return S.canvas ? JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS)) : '';
    }

    function assetFromFabricObject(obj) {
      if (!obj || !obj.assetId) return null;
      return {
        assetId: obj.assetId,
        originalUrl: obj.originalUrl || '',
        url: obj.originalUrl || obj.src || '',
        filename: obj.originalFilename || 'image',
        mime: obj.originalMime || '',
        width: obj.originalWidth || 0,
        height: obj.originalHeight || 0,
        size: obj.originalSize || 0,
      };
    }

    function collectDesignAssets() {
      var assets = [];
      var seen = {};
      ['front', 'back'].forEach(function (side) {
        var jsonStr = S.saved[side] || '';
        var parsed;
        try { parsed = jsonStr ? JSON.parse(jsonStr) : null; } catch (e) { parsed = null; }
        ((parsed && parsed.objects) || []).forEach(function (obj) {
          var asset = assetFromFabricObject(obj);
          if (!asset || seen[asset.assetId]) return;
          seen[asset.assetId] = true;
          assets.push(asset);
        });
      });
      return assets;
    }

    function roundMetric(value) {
      return Math.round((Number(value) || 0) * 10) / 10;
    }

    function formatMetricSize(metrics) {
      if (!metrics || !metrics.widthCm || !metrics.heightCm) return '';
      return roundMetric(metrics.widthCm) + ' x ' + roundMetric(metrics.heightCm) + ' cm';
    }

    function rectToPhysicalMetrics(rect, side) {
      if (!S.canvas || !rect) {
        return { widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 };
      }
      var canvasW = S.canvas.getWidth() || 1;
      var canvasH = S.canvas.getHeight() || 1;
      var printArea = printAreaForSide(side || viewName());
      var widthCm = (rect.width || 0) * (printArea.widthCm / canvasW);
      var heightCm = (rect.height || 0) * (printArea.heightCm / canvasH);
      var areaCm2 = widthCm * heightCm;
      var coverage = canvasW && canvasH ? ((rect.width || 0) * (rect.height || 0)) / (canvasW * canvasH) : 0;
      return {
        widthCm: roundMetric(widthCm),
        heightCm: roundMetric(heightCm),
        areaCm2: roundMetric(areaCm2),
        coverage: Math.round(coverage * 1000) / 1000,
      };
    }

    function activeObjectMetrics(obj) {
      if (!obj) return null;
      var rect = imageBounds(obj);
      var metrics = rectToPhysicalMetrics(rect, viewName());
      metrics.left = roundMetric(rect.left || 0);
      metrics.top = roundMetric(rect.top || 0);
      metrics.widthPx = roundMetric(rect.width || 0);
      metrics.heightPx = roundMetric(rect.height || 0);
      return metrics;
    }

    function objectRectFromSaved(obj) {
      if (!obj) return null;
      var width = Math.abs((obj.width || 0) * (obj.scaleX || 1));
      var height = Math.abs((obj.height || 0) * (obj.scaleY || 1));
      var left = Number(obj.left || 0);
      var top = Number(obj.top || 0);
      var originX = obj.originX || 'left';
      var originY = obj.originY || 'top';
      if (originX === 'center') left -= width / 2;
      else if (originX === 'right') left -= width;
      if (originY === 'center') top -= height / 2;
      else if (originY === 'bottom') top -= height;
      return { left: left, top: top, width: width, height: height };
    }

    function sideMetricsFromObjects(objects, side) {
      if (!objects || !objects.length) {
        return { objectCount: 0, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 };
      }
      var bounds = [];
      objects.forEach(function (obj) {
        var rect = isFabricCanvasObject(obj) ? imageBounds(obj) : objectRectFromSaved(obj);
        if (rect && rect.width > 0 && rect.height > 0) bounds.push(rect);
      });
      if (!bounds.length) return { objectCount: objects.length, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 };
      var left = Math.min.apply(null, bounds.map(function (rect) { return rect.left; }));
      var top = Math.min.apply(null, bounds.map(function (rect) { return rect.top; }));
      var right = Math.max.apply(null, bounds.map(function (rect) { return rect.left + rect.width; }));
      var bottom = Math.max.apply(null, bounds.map(function (rect) { return rect.top + rect.height; }));
      var metrics = rectToPhysicalMetrics({
        left: left,
        top: top,
        width: right - left,
        height: bottom - top,
      }, side);
      metrics.objectCount = objects.length;
      return metrics;
    }

    function currentDesignMetrics() {
      var metrics = {};
      ['front', 'back'].forEach(function (side) {
        if (side === viewName() && S.canvas) {
          metrics[side] = sideMetricsFromObjects(S.canvas.getObjects(), side);
          return;
        }
        var parsed = null;
        try { parsed = S.saved[side] ? JSON.parse(S.saved[side]) : null; } catch (e) { parsed = null; }
        metrics[side] = sideMetricsFromObjects((parsed && parsed.objects) || [], side);
      });
      return metrics;
    }

    function pricingBandForSide(side, metrics) {
      var bands = (cfg.pricingBands && cfg.pricingBands[side]) || [];
      var widthCm = Number(metrics && metrics.widthCm || 0);
      var heightCm = Number(metrics && metrics.heightCm || 0);
      var areaCm2 = Number(metrics && metrics.areaCm2 || 0);
      for (var i = 0; i < bands.length; i++) {
        var band = bands[i] || {};
        var hasDimensions = band.maxWidthCm != null && band.maxHeightCm != null;
        if (hasDimensions && widthCm <= Number(band.maxWidthCm) && heightCm <= Number(band.maxHeightCm)) return band;
        if (!hasDimensions && (band.maxAreaCm2 == null || areaCm2 <= Number(band.maxAreaCm2))) return band;
      }
      return bands[bands.length - 1] || { key: 'max', maxWidthCm: null, maxHeightCm: null, maxAreaCm2: null, label: 'Tam Alan', surcharge: 0 };
    }


    function calculatePricing() {
      var lines = selectedSizeLines();
      var totalQty = totalSelectedQuantity();
      var metrics = currentDesignMetrics();
      var baseSubtotal = 0;
      var frontHas = sideHasContent('front');
      var backHas = cfg.surfaceMode === 'front_only' ? false : sideHasContent('back');

      lines.forEach(function (line) {
        baseSubtotal += unitBasePriceForSize(line.size) * line.quantity;
      });

      if (!frontHas) metrics.front = { objectCount: 0, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 };
      if (!backHas) metrics.back = { objectCount: 0, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 };

      var frontBand = pricingBandForSide('front', metrics.front || null);
      var backBand = pricingBandForSide('back', metrics.back || null);
      var frontUnit = frontHas ? (frontBand.surcharge || 0) : 0;
      var backUnit = backHas ? (backBand.surcharge || 0) : 0;
      var frontSubtotal = frontUnit * totalQty;
      var backSubtotal = backUnit * totalQty;
      var total = baseSubtotal + frontSubtotal + backSubtotal;

      return {
        totalQuantity: totalQty,
        baseSubtotal: Math.round(baseSubtotal * 100) / 100,
        frontSubtotal: Math.round(frontSubtotal * 100) / 100,
        backSubtotal: Math.round(backSubtotal * 100) / 100,
        total: Math.round(total * 100) / 100,
        averageBaseUnit: totalQty ? Math.round((baseSubtotal / totalQty) * 100) / 100 : (_productPrice || 0),
        front: {
          hasContent: frontHas,
          metrics: metrics.front || { objectCount: 0, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 },
          band: frontBand,
          surcharge: frontUnit,
        },
        back: {
          hasContent: backHas,
          metrics: metrics.back || { objectCount: 0, widthCm: 0, heightCm: 0, areaCm2: 0, coverage: 0 },
          band: backBand,
          surcharge: backUnit,
        },
      };
    }

    function sidePricingSummary(sideName, pricingSide) {
      if (!pricingSide || !pricingSide.hasContent) return sideName + ': yok';
      return sideName + ': ' + formatMetricSize(pricingSide.metrics) + ' · ' + pricingSide.band.label;
    }

    function currentDesignPayload(frontUrl, backUrl, variantId) {
      var metrics = currentDesignMetrics();
      var pricing = calculatePricing();
      return {
        productId: cfg.productId || cfg.productHandle || '',
        productTitle: root.dataset.productTitle || '',
        variantId: String(variantId || ''),
        size: selectedSizeSummary(),
        sizes: selectedSizeLines(),
        totalQuantity: totalSelectedQuantity(),
        color: S.colorName || '',
        printMode: printMode() || '',
        designJson: {
          front: S.saved.front || '',
          back: S.saved.back || '',
        },
        previewUrls: {
          front: frontUrl || '',
          back: backUrl || '',
        },
        previewUrl: frontUrl || backUrl || '',
        assets: collectDesignAssets(),
        printArea: {
          front: printAreaForSide('front'),
          back: printAreaForSide('back'),
        },
        sideMetrics: metrics,
        pricing: pricing,
      };
    }

    function editDesignUrl(token) {
      var url = new URL(window.location.href);
      url.searchParams.set('design_token', token);
      return url.pathname + url.search + url.hash;
    }

    function designTokenFromUrl() {
      try { return new URLSearchParams(window.location.search).get('design_token') || ''; }
      catch (e) { return ''; }
    }

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
      var known = ['XXXL', '3XL', 'XXL', '2XL', 'XL', 'L', 'M', 'S', 'XS'];
      for (var i = 0; i < opts.length; i++) {
        var u = String(opts[i] || '').trim().toUpperCase();
        if (known.indexOf(u) !== -1) return u;
        if (/^\d{2,3}$/.test(u)) return u;
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

    function variantIdForSize(mode, size) {
      var byColor = cfg.variantMap[S.colorKey] || cfg.variantMap.__default || {};
      var map = byColor[size] || {};
      if (map[mode]) return map[mode];
      if (Object.keys(byColor).length) return null;
      return (mode === 'double' ? cfg.doubleVariantId : cfg.singleVariantId) || null;
    }

    function baseVariantIdForSize(size) {
      var byColor = cfg.baseVariantMap[S.colorKey] || cfg.baseVariantMap.__default || {};
      if (size && byColor[size]) return byColor[size];
      var selected = selectedVariant();
      if (selected && selected.id) return String(selected.id);
      if (cfg.singleVariantId) return String(cfg.singleVariantId);
      if (cfg.doubleVariantId) return String(cfg.doubleVariantId);
      return null;
    }

    function variantId(mode) {
      return variantIdForSize(mode, S.size);
    }

    function unitPriceFor(mode, variantId) {
      if (variantId && cfg.variantPrices[variantId]) return cfg.variantPrices[variantId];
      return mode ? (cfg.prices[mode] || cfg.prices.front || 0) : 0;
    }

    function unitBasePriceForSize(size) {
      var variantId = baseVariantIdForSize(size);
      if (variantId && cfg.variantPrices[variantId]) return cfg.variantPrices[variantId];
      return _productPrice || cfg.prices.front || 0;
    }

    function setSizeQty(size, qty) {
      qty = Math.max(0, Math.floor(Number(qty) || 0));
      S.sizeQty[size] = qty;
      if (qty > 0) S.size = size;
      var input = q('[data-size-input="' + cssEscape(size) + '"]');
      if (input && Number(input.value) !== qty) input.value = qty;
      var row = q('[data-size-row="' + cssEscape(size) + '"]');
      if (row) row.classList.toggle('active', qty > 0);
      var name = row && row.querySelector('.dsgn-size-name');
      if (name) name.dataset.qty = String(qty);
      updatePriceLabel();
    }

    function selectedSizeLines() {
      return Object.keys(S.sizeQty)
        .map(function (size) { return { size: size, quantity: Math.max(0, Math.floor(Number(S.sizeQty[size]) || 0)) }; })
        .filter(function (line) { return line.quantity > 0; });
    }

    function totalSelectedQuantity() {
      return selectedSizeLines().reduce(function (sum, line) { return sum + line.quantity; }, 0);
    }

    function selectedSizeSummary() {
      var lines = selectedSizeLines();
      return lines.map(function (line) { return line.size + ' x ' + line.quantity; }).join(', ');
    }

    function cssEscape(value) {
      if (window.CSS && window.CSS.escape) return window.CSS.escape(String(value));
      return String(value).replace(/"/g, '\\"');
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
          normalizeCanvasImages();
          S.canvas.renderAll();
          _historyLock = false;
          pushHistory();
          updateSelectionMetrics();
          updateStatusBadges();
        });
      }
    }

    function bindCanvasEvents() {
      if (!S.canvas) return;
      S.canvas.on('object:added', function (e) {
        lockImageProportions(e && e.target);
        pushHistory();
        updateSelectionMetrics();
      });
      S.canvas.on('object:removed', function () {
        pushHistory();
        updateSelectionMetrics();
      });
      S.canvas.on('object:moving', function (e) {
        containImageInCanvas(e && e.target);
        updateSelectionMetrics(e && e.target);
        updatePriceLabel();
      });
      S.canvas.on('object:scaling', function (e) {
        keepImageUniform(e && e.target);
        containImageInCanvas(e && e.target);
        updateSelectionMetrics(e && e.target);
        updatePriceLabel();
      });
      S.canvas.on('object:rotating', function (e) {
        containImageInCanvas(e && e.target);
        updateSelectionMetrics(e && e.target);
        updatePriceLabel();
      });
      S.canvas.on('object:modified', function (e) {
        containImageInCanvas(e && e.target);
        pushHistory();
        updateSelectionMetrics(e && e.target);
      });
      S.canvas.on('selection:created', onSelectionChange);
      S.canvas.on('selection:updated', onSelectionChange);
      S.canvas.on('selection:cleared',  onSelectionCleared);
    }

    function updateSelectionMetrics(target) {
      var badge = q('[data-selection-metrics]');
      var overlay = q('[data-canvas-overlay]');
      var wrap = q('[data-product-wrap]');
      if (!badge || !overlay || !wrap || !S.canvas) return;
      var obj = target || S.canvas.getActiveObject();
      if (!obj) {
        badge.style.display = 'none';
        return;
      }

      var metrics = activeObjectMetrics(obj);
      if (!metrics || !metrics.widthCm || !metrics.heightCm) {
        badge.style.display = 'none';
        return;
      }

      badge.textContent = formatMetricSize(metrics);
      badge.style.display = '';

      var wrapRect = wrap.getBoundingClientRect();
      var overlayRect = overlay.getBoundingClientRect();
      var rect = imageBounds(obj);
      var left = overlayRect.left - wrapRect.left + rect.left;
      var top = overlayRect.top - wrapRect.top + rect.top + rect.height + 8;
      var maxLeft = Math.max(8, wrap.clientWidth - badge.offsetWidth - 8);
      var maxTop = Math.max(8, wrap.clientHeight - badge.offsetHeight - 8);
      badge.style.left = clamp(left, 8, maxLeft) + 'px';
      badge.style.top = clamp(top, 8, maxTop) + 'px';
    }

    function onSelectionChange() {
      var obj = S.canvas.getActiveObject();
      if (!obj) return;
      S.suppressQuickbarRestore = false;
      S.floatTarget = obj;
      // Text dışı bir obje seçilince son yazı referansını temizle
      if (obj.type !== 'i-text' && obj.type !== 'text' && obj.type !== 'textbox') {
        S._lastTextObj = null;
      }
      positionFloatToolbar(obj);
      positionTextQuickbar(obj);
      updateTransformPopupValues(obj);
      syncTextControls(obj);
      updateSelectionMetrics(obj);
      updateSelectionActions();
      updateStatusBadges();
      refreshWorkspaceState();
    }

    function onSelectionCleared() {
      if (S.suppressQuickbarRestore) {
        S.suppressQuickbarRestore = false;
      } else if (S.quickbarLock && S._lastTextObj && S._lastTextObj.canvas === S.canvas) {
        setTimeout(function () {
          if (!S.canvas || !S._lastTextObj || S._lastTextObj.canvas !== S.canvas) return;
          S.canvas.setActiveObject(S._lastTextObj);
          S.canvas.renderAll();
          positionTextQuickbar(S._lastTextObj);
          updateSelectionActions();
          refreshWorkspaceState();
        }, 0);
        return;
      }
      S.floatTarget = null;
      // S._lastTextObj temizleme — panel kontrollerine tıklayınca da cleared tetikleniyor
      var ftb = q('[data-float-tb]');
      if (ftb) ftb.style.display = 'none';
      var tq = q('[data-text-quickbar]');
      if (tq) tq.style.display = 'none';
      var badge = q('[data-selection-metrics]');
      if (badge) badge.style.display = 'none';
      closeTextQuickbarPanels();
      closePopup();
      updateSelectionActions();
      updateStatusBadges();
      refreshWorkspaceState();
    }

    // ── Product display ──────────────────────────────────────────────────────
    function setupProductDisplay() {
      var productImg = q('[data-product-img]');
      var svgWrap    = q('[data-shirt-svg-wrap]');
      var imgSrc     = S.viewIdx === 0 ? cfg.frontImage : cfg.backImage;
      updateViewSwitcher();

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
      var area = overlayAreaForSide(viewName());
      var ox = svgR.left - wrapR.left;
      var oy = svgR.top  - wrapR.top;
      overlay.style.left   = (ox + svgR.width * area.leftPct) + 'px';
      overlay.style.top    = (oy + svgR.height * area.topPct) + 'px';
      overlay.style.width  = (svgR.width * area.widthPct) + 'px';
      overlay.style.height = (svgR.height * area.heightPct) + 'px';
    }

    function positionCanvasOverlayOnImage(productImg) {
      var overlay = q('[data-canvas-overlay]');
      var wrap    = q('[data-product-wrap]');
      if (!overlay || !wrap) return;

      var imgRect  = productImg.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();

      var area = overlayAreaForSide(viewName());

      var iw = imgRect.width, ih = imgRect.height;
      var il = imgRect.left - wrapRect.left;
      var it = imgRect.top  - wrapRect.top;

      overlay.style.left   = (il + iw * area.leftPct) + 'px';
      overlay.style.top    = (it + ih * area.topPct)  + 'px';
      overlay.style.width  = (iw * area.widthPct) + 'px';
      overlay.style.height = (ih * area.heightPct) + 'px';
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
      updateSelectionMetrics();
    }

    // ── View switching ────────────────────────────────────────────────────────
    function switchView(idx) {
      // Save current canvas state
      if (S.canvas) {
        S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
        saveCanvasToStorage();
      }
      S.viewIdx = clamp(idx, 0, S.views.length - 1);

      var viewLbl = q('[data-view-label]');
      if (viewLbl) viewLbl.textContent = S.viewIdx === 0 ? 'Ön' : 'Arka';
      updateViewSwitcher();

      // Re-init product image for new view
      setupProductDisplay();

      // Restore saved canvas state for this view
      var savedJson = S.saved[viewName()];
      if (S.canvas && savedJson) {
        S.canvas.loadFromJSON(savedJson, function () {
          normalizeCanvasImages();
          S.canvas.renderAll();
          updateSelectionMetrics();
        });
      } else if (S.canvas) {
        S.canvas.clear();
        S.canvas.renderAll();
        updateSelectionMetrics();
      }

      updateStatusBadges();
      updatePriceLabel();
    }

    function updateViewSwitcher() {
      qa('[data-view-card]').forEach(function (btn) {
        var side = btn.dataset.viewCard;
        var active = side === viewName();
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      // Thumbnail images: sync with current front/back product images
      var tFront = q('[data-view-thumb="front"]');
      var tBack  = q('[data-view-thumb="back"]');
      if (tFront && cfg.frontImage && tFront.src !== cfg.frontImage) tFront.src = cfg.frontImage;
      if (tBack  && cfg.backImage  && tBack.src  !== cfg.backImage)  tBack.src  = cfg.backImage;

      var frontStatus = q('[data-view-card-status="front"]');
      var backStatus  = q('[data-view-card-status="back"]');
      if (frontStatus) frontStatus.textContent = sideHasContent('front') ? '●' : '';
      if (backStatus)  backStatus.textContent  = sideHasContent('back')  ? '●' : '';
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
          syncSuggestedTextColor();
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

    function syncSuggestedTextColor() {
      var active = activeTextObject();
      if (active) return;
      var next = preferredTextColor();
      var textColorInput = q('[data-text-color]');
      var quickColorInput = q('[data-tq-color]');
      if (textColorInput) textColorInput.value = next;
      if (quickColorInput) quickColorInput.value = next;
    }

    function updateSelectionActions() {
      var hasSelection = !!(S.canvas && S.canvas.getActiveObject());
      qa('[data-delete-obj]').forEach(function (btn) {
        btn.disabled = !hasSelection;
      });
    }

    function refreshWorkspaceState() {
      var workspace = q('.dsgn-workspace');
      if (!workspace) return;
      var hasContent = sideHasContent(viewName());
      workspace.classList.toggle('dsgn-workspace--has-content', hasContent);
      workspace.classList.toggle('dsgn-workspace--empty', !hasContent);
      workspace.classList.toggle('dsgn-workspace--tool-open', !!S.activeTool);
    }

    function activeCanvasObject() {
      if (!S.canvas) return null;
      return S.canvas.getActiveObject() || null;
    }

    function restoreLastTextSelection() {
      if (!S.canvas || !S._lastTextObj || S._lastTextObj.canvas !== S.canvas) return null;
      try {
        S.canvas.setActiveObject(S._lastTextObj);
        S.canvas.renderAll();
      } catch (e) { return null; }
      return S._lastTextObj;
    }

    // ── Tool nav ──────────────────────────────────────────────────────────────
    function closeToolPanel() {
      var panel = q('[data-tool-panel]');
      if (!panel) return;
      S.activeTool = null;
      panel.classList.remove('open');
      qa('[data-tool]').forEach(function (b) { b.classList.remove('active'); });
      qa('[data-tp]').forEach(function (p) { p.classList.remove('active'); });
      refreshWorkspaceState();
    }

    function activateTool(toolName) {
      var panel = q('[data-tool-panel]');
      if (!panel) return;

      if (!toolName || S.activeTool === toolName) {
        closeToolPanel();
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

      if (toolName === 'text') {
        syncSuggestedTextColor();
        var input = q('[data-text-input]');
        if (input) input.focus();
      }
      refreshWorkspaceState();
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
          .map(function (img) { return { dataUrl: img.storedUrl || img.dataUrl, name: img.name, asset: img.asset || null }; });
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
          if (!dataUrl || !/^(data:image|https?:\/\/|\/uploads\/)/.test(dataUrl)) {
            console.warn('[designer] resim', i, 'geçersiz dataUrl');
            return;
          }
          if (seen[dataUrl]) return;
          seen[dataUrl] = true;
          var container = q('[data-img-thumbs]');
          console.log('[designer] resim', i, 'ekleniyor, container:', !!container);
          S.uploadedImages.push({ dataUrl: dataUrl, storedUrl: dataUrl, name: name, asset: img.asset || null });
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
            imageDataSize(originalUrl, function (dims) {
              uploadOriginalAsset(file, dims, function (asset) {
                var displayUrl = asset && asset.url ? asset.url : originalUrl;
                compressImage(originalUrl, function (storedUrl) {
                  var thumbUrl = asset && asset.url ? asset.url : storedUrl;
                  placeImageOnCanvas(displayUrl, asset);
                  S.uploadedImages.push({ dataUrl: thumbUrl, storedUrl: thumbUrl, name: file.name, asset: asset || null });
                  addThumbItem(thumbUrl, file.name, S.uploadedImages.length - 1);
                  saveImagesToStorage();
                  saveCanvasToStorage();
                  setMsg('Gorsel urune eklendi. Surukleyip buyutebilir veya kucultebilirsin.', 'success');
                });
              });
            });
          };
          reader.readAsDataURL(file);
        }(f));
      }
    }

    function imageDataSize(src, callback) {
      var img = new window.Image();
      img.onload = function () { callback({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 }); };
      img.onerror = function () { callback({ width: 0, height: 0 }); };
      img.src = src;
    }

    function uploadOriginalAsset(file, dims, callback) {
      if (!cfg.uploadEndpoint || file.type === 'image/svg+xml') { callback(null); return; }
      var fd = new FormData();
      fd.append('purpose', 'original');
      fd.append('side', viewName() + '-original');
      fd.append('width', String(dims.width || 0));
      fd.append('height', String(dims.height || 0));
      fd.append('image', file, file.name);
      fetch(cfg.uploadEndpoint, { method: 'POST', body: fd })
        .then(function (r) { return r.ok ? r.json() : Promise.resolve({}); })
        .then(function (j) { callback(j.asset || null); })
        .catch(function () { callback(null); });
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
        var uploaded = S.uploadedImages.find(function (img) { return img && (img.dataUrl === dataUrl || img.storedUrl === dataUrl); });
        placeImageOnCanvas(dataUrl, uploaded && uploaded.asset);
      });

      item.appendChild(img);
      item.appendChild(nameEl);
      item.appendChild(del);
      container.appendChild(item);
    }

    function placeImageOnCanvas(dataUrl, asset) {
      if (!S.canvas) return;
      fabric.Image.fromURL(dataUrl, function (img) {
        var cw = S.canvas.width, ch = S.canvas.height;
        var scale = Math.min(cw / img.width, ch / img.height, 1) * 0.72;
        img.set({
          left: cw / 2, top: ch / 2,
          originX: 'center', originY: 'center',
          scaleX: scale, scaleY: scale,
        });
        if (asset) {
          img.set({
            assetId: asset.assetId || '',
            originalUrl: asset.originalUrl || asset.url || '',
            originalFilename: asset.filename || '',
            originalWidth: asset.width || 0,
            originalHeight: asset.height || 0,
            originalMime: asset.mime || '',
            originalSize: asset.size || 0,
          });
        }
        lockImageProportions(img);
        S.canvas.add(img);
        S.canvas.setActiveObject(img);
        S.canvas.renderAll();
        closeToolPanel();
        positionFloatToolbar(img);
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
      var lineBtn  = q('[data-style="linethrough"]');

      var text = (input ? input.value.trim() : '') || 'Yazı';
      var chosenColor = fontColor && fontColor.value ? fontColor.value : preferredTextColor();
      var txt = new fabric.IText(text, {
        left: S.canvas.width / 2,
        top:  S.canvas.height / 2,
        originX: 'center',
        originY: 'center',
        fontFamily: fontFam  ? fontFam.value  : 'Arial',
        fontSize:   fontSize ? +fontSize.value: 30,
        fill: chosenColor,
        fontWeight: (boldBtn   && boldBtn.classList.contains('active'))   ? 'bold'   : 'normal',
        fontStyle:  (italicBtn && italicBtn.classList.contains('active'))  ? 'italic' : 'normal',
        underline:  !!(ulBtn   && ulBtn.classList.contains('active')),
        linethrough: !!(lineBtn && lineBtn.classList.contains('active')),
        textAlign: 'center',
      });
      S.canvas.add(txt);
      S.canvas.setActiveObject(txt);
      S.canvas.renderAll();
      if (typeof txt.enterEditing === 'function') txt.enterEditing();
      if (typeof txt.selectAll === 'function') txt.selectAll();
      closeToolPanel();
      positionTextQuickbar(txt);
      syncTextControls(txt);
      syncTextQuickbar(txt);
      updateSelectionActions();
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
      var lineBtn = q('[data-style="linethrough"]');
      if (fontFam && obj.fontFamily) fontFam.value = obj.fontFamily;
      if (fontSize && obj.fontSize) fontSize.value = Math.round(obj.fontSize);
      if (fontSizeVal && obj.fontSize) fontSizeVal.textContent = Math.round(obj.fontSize);
      if (fontColor && typeof obj.fill === 'string' && obj.fill.charAt(0) === '#') fontColor.value = obj.fill;
      if (boldBtn) boldBtn.classList.toggle('active', obj.fontWeight === 'bold' || +obj.fontWeight >= 600);
      if (italicBtn) italicBtn.classList.toggle('active', obj.fontStyle === 'italic');
      if (ulBtn) ulBtn.classList.toggle('active', !!obj.underline);
      if (lineBtn) lineBtn.classList.toggle('active', !!obj.linethrough);
    }

    function applyTextChange(props) {
      var obj = activeTextObject();
      if (!obj || !S.canvas) return false;
      obj.set(props);
      obj.setCoords();
      S.canvas.renderAll();
      updateSelectionMetrics(obj);
      positionTextQuickbar(obj);
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
      closeToolPanel();
      pushHistory();
    }

    // ── Saved designs ─────────────────────────────────────────────────────────
    var SAVED_KEY  = 'fpd_saved_'   + (cfg.productHandle || 'designer');
    var CANVAS_KEY = 'dsgn_canvas_' + (cfg.productHandle || 'global');

    function saveDesign() {
      if (!S.canvas) return;
      var json = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
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
            normalizeCanvasImages();
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
        var curJson = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
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

    function loadDesignFromToken() {
      var token = designTokenFromUrl();
      if (!token) return;
      fetch('/apps/tshirt-designer/designs/' + encodeURIComponent(token), {
        headers: { 'Accept': 'application/json' },
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (design) {
          if (!design || !design.designJson) return;
          if (design.designJson.front) S.saved.front = design.designJson.front;
          if (design.designJson.back) S.saved.back = design.designJson.back;
          if (Array.isArray(design.sizes)) {
            S.sizeQty = {};
            design.sizes.forEach(function (line) {
              if (line && line.size) S.sizeQty[line.size] = Math.max(0, Math.floor(Number(line.quantity) || 0));
            });
            Object.keys(S.sizeQty).forEach(function (size) {
              var input = q('[data-size-input="' + cssEscape(size) + '"]');
              var row = q('[data-size-row="' + cssEscape(size) + '"]');
              if (input) input.value = S.sizeQty[size];
              if (row) row.classList.toggle('active', S.sizeQty[size] > 0);
            });
          }
          if (S.canvas) {
            var savedJson = S.saved[viewName()];
            if (savedJson) {
              _historyLock = true;
              S.canvas.loadFromJSON(savedJson, function () {
                normalizeCanvasImages();
                S.canvas.renderAll();
                _historyLock = false;
                pushHistory();
                updateStatusBadges();
                updatePriceLabel();
              });
            }
          }
          setMsg('Tasarım düzenleme için yüklendi.', 'success');
        })
        .catch(function () { /* ignore */ });
    }

    // ── History / undo / redo ─────────────────────────────────────────────────
    var _historyLock = false;
    function pushHistory() {
      if (_historyLock || !S.canvas) return;
      var view = viewName();
      var json = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
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
        normalizeCanvasImages();
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
        normalizeCanvasImages();
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
      var ftb = q('[data-float-tb]');
      var tq  = q('[data-text-quickbar]');
      if (!ftb || !S.canvas) return;
      var isText = obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox');
      if (!obj || isText) {
        ftb.style.display = 'none';
        return;
      }
      if (tq) tq.style.display = 'none';
      ftb.style.display = 'flex';
    }

    function positionTextQuickbar(obj) {
      var tq  = q('[data-text-quickbar]');
      var ftb = q('[data-float-tb]');
      if (!tq || !S.canvas) return;
      var isText = obj && (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox');
      if (!isText) { tq.style.display = 'none'; return; }
      if (ftb) ftb.style.display = 'none';
      tq.style.display = '';
      syncTextQuickbar(obj);
    }

    function syncTextQuickbar(obj) {
      var color = q('[data-tq-color]');
      var size = q('[data-tq-size]');
      var font = q('[data-tq-font]');
      var sizeValue = q('[data-tq-size-value]');
      var sizeReadout = q('[data-tq-size-readout]');
      var alignReadout = q('[data-tq-align-readout]');
      if (color && typeof obj.fill === 'string' && obj.fill.charAt(0) === '#') color.value = obj.fill;
      if (size && obj.fontSize) size.value = Math.round(obj.fontSize);
      if (font && obj.fontFamily) font.value = obj.fontFamily;
      if (sizeValue && obj.fontSize) sizeValue.textContent = Math.round(obj.fontSize) + ' px';
      if (sizeReadout && obj.fontSize) sizeReadout.textContent = Math.round(obj.fontSize) + ' px';
      if (alignReadout) alignReadout.textContent = quickbarAlignLabel(obj.textAlign || 'left');
      qa('[data-tq-style]').forEach(function (btn) {
        var style = btn.dataset.tqStyle;
        var active = false;
        if (style === 'bold') active = obj.fontWeight === 'bold' || Number(obj.fontWeight) >= 600;
        if (style === 'italic') active = obj.fontStyle === 'italic';
        if (style === 'underline') active = !!obj.underline;
        if (style === 'linethrough') active = !!obj.linethrough;
        btn.classList.toggle('active', active);
      });
      qa('[data-tq-align]').forEach(function (btn) {
        btn.classList.toggle('active', (obj.textAlign || 'left') === btn.dataset.tqAlign);
      });
    }

    function quickbarAlignLabel(value) {
      if (value === 'left') return 'Sol';
      if (value === 'right') return 'Sağ';
      return 'Orta';
    }

    function closeTextQuickbarPanels() {
      S.activeTextPanel = null;
      qa('[data-tq-panel]').forEach(function (panel) {
        panel.classList.remove('active');
      });
      qa('[data-tq-toggle]').forEach(function (btn) {
        btn.classList.remove('is-open');
      });
    }

    function toggleTextQuickbarPanel(name) {
      var panel = q('[data-tq-panel="' + name + '"]');
      var button = q('[data-tq-toggle="' + name + '"]');
      if (!panel || !button) return;
      if (S.activeTextPanel === name) {
        closeTextQuickbarPanels();
        return;
      }
      closeTextQuickbarPanels();
      S.activeTextPanel = name;
      panel.classList.add('active');
      button.classList.add('is-open');
      var obj = activeTextObject();
      if (obj) syncTextQuickbar(obj);
    }

    function toggleTextStyle(style) {
      var obj = activeTextObject() || restoreLastTextSelection();
      if (!obj) return;
      if (style === 'bold') {
        applyTextChange({ fontWeight: (obj.fontWeight === 'bold' || Number(obj.fontWeight) >= 600) ? 'normal' : 'bold' });
      } else if (style === 'italic') {
        applyTextChange({ fontStyle: obj.fontStyle === 'italic' ? 'normal' : 'italic' });
      } else if (style === 'underline') {
        applyTextChange({ underline: !obj.underline });
      } else if (style === 'linethrough') {
        applyTextChange({ linethrough: !obj.linethrough });
      }
      syncTextQuickbar(activeTextObject() || obj);
    }

    function setTextAlignment(value) {
      if (!activeTextObject() && !restoreLastTextSelection()) return;
      applyTextChange({ textAlign: value });
      var obj = activeTextObject();
      if (obj) syncTextQuickbar(obj);
    }

    // ── Popups ────────────────────────────────────────────────────────────────
    function openPopup(name) {
      closePopup();
      S.activePopup = name;
      var popup = q('[data-popup="' + name + '"]');
      if (!popup) return;
      popup.style.display = 'block';
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
      var obj = activeCanvasObject() || restoreLastTextSelection();
      if (!obj) return;
      var cw = S.canvas.width, ch = S.canvas.height;
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

    function positionObject(slot) {
      if (!S.canvas) return;
      var obj = activeCanvasObject() || restoreLastTextSelection();
      if (!obj) return;
      var inset = 6;
      var cw = S.canvas.width;
      var ch = S.canvas.height;
      var horizontal = 'center';
      var vertical = 'middle';
      var parts = String(slot || '').split('-');
      if (parts.length === 2) {
        vertical = parts[0];
        horizontal = parts[1];
      }

      var props = {};
      if (horizontal === 'left') {
        props.left = inset;
        props.originX = 'left';
      } else if (horizontal === 'right') {
        props.left = cw - inset;
        props.originX = 'right';
      } else {
        props.left = cw / 2;
        props.originX = 'center';
      }

      if (vertical === 'top') {
        props.top = inset;
        props.originY = 'top';
      } else if (vertical === 'bottom') {
        props.top = ch - inset;
        props.originY = 'bottom';
      } else {
        props.top = ch / 2;
        props.originY = 'center';
      }

      obj.set(props);
      obj.setCoords();
      S.canvas.renderAll();
      pushHistory();
      qa('[data-tq-position]').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.tqPosition === slot);
      });
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
        keepImageUniform(newImg);
        lockImageProportions(newImg);
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
        lockImageProportions(fImg);
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
          normalizeCanvasImages();
          S.canvas.renderAll();
          doExport();
          // restore
          if (savedCurrent) {
            S.canvas.loadFromJSON(savedCurrent, function () {
              normalizeCanvasImages();
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
      var pricing = calculatePricing();
      var totalQty = pricing.totalQuantity;
      var previewQty = totalQty || 1;
      var previewBase = totalQty ? pricing.baseSubtotal : unitBasePriceForSize(S.size);
      var previewFront = totalQty ? pricing.frontSubtotal : (pricing.front.hasContent ? pricing.front.surcharge : 0);
      var previewBack = totalQty ? pricing.backSubtotal : (pricing.back.hasContent ? pricing.back.surcharge : 0);
      var previewTotal = totalQty ? pricing.total : (previewBase + previewFront + previewBack);
      var priceLbl = q('[data-designer-price-label]');
      var modeLbl  = q('[data-designer-mode-label]');
      var totalQtyLbl = q('[data-total-qty]');
      var breakdown = q('[data-price-breakdown]');
      if (priceLbl) priceLbl.textContent = money(previewTotal);
      if (modeLbl) {
        if (!sideHasContent('front') && !sideHasContent('back')) modeLbl.textContent = 'Tasarım ekleyin';
        else if (!totalQty) modeLbl.textContent = '1 adet tahmini fiyat · ' + (S.size || 'varsayılan beden');
        else modeLbl.textContent = cfg.surfaceMode === 'front_only'
          ? sidePricingSummary('Ön', pricing.front)
          : sidePricingSummary('Ön', pricing.front) + ' | ' + sidePricingSummary('Arka', pricing.back);
      }
      if (totalQtyLbl) totalQtyLbl.textContent = totalQty + ' adet';
      if (breakdown) {
        var rows = [
          '<div class="dsgn-price-breakdown-row"><span>Urun x ' + previewQty + '</span><strong>' + money(previewBase) + '</strong></div>'
        ];
        if (pricing.front.hasContent) {
          rows.push('<div class="dsgn-price-breakdown-row"><span>On baski ' + pricing.front.band.label + ' (' + formatMetricSize(pricing.front.metrics) + ')</span><strong>' + money(previewFront) + '</strong></div>');
        }
        if (pricing.back.hasContent) {
          rows.push('<div class="dsgn-price-breakdown-row"><span>Arka baski ' + pricing.back.band.label + ' (' + formatMetricSize(pricing.back.metrics) + ')</span><strong>' + money(previewBack) + '</strong></div>');
        }
        breakdown.innerHTML = rows.join('');
      }
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
      updateViewSwitcher();
      refreshWorkspaceState();
    }

    // ── Cart ──────────────────────────────────────────────────────────────────
    function addToCart() {
      if (S.canvas) S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
      if (!sideHasContent('front') && !sideHasContent('back')) {
        setMsg('En az bir yüze tasarım ekleyin.', 'error'); return;
      }
      var lines = selectedSizeLines();
      if (!lines.length) {
        setMsg('En az bir beden için adet seçin.', 'error'); return;
      }
      var invalidLine = lines.find(function (line) { return !baseVariantIdForSize(line.size); });
      if (invalidLine) {
        setMsg(invalidLine.size + ' bedeni için ana ürün variantı bulunamadı.', 'error'); return;
      }
      var pricing = calculatePricing();
      var primaryVariantId = baseVariantIdForSize(lines[0].size);
      var mode = printMode();

      setLoading(true);

      // Upload previews then add to cart
      var properties = {
        'Baskı tipi': modeLabelText(mode),
        'Bedenler': selectedSizeSummary(),
        'Toplam adet': String(totalSelectedQuantity()),
        'Urun ara toplam': money(pricing.baseSubtotal),
        'Toplam fiyat': money(pricing.total),
      };
      if (S.colorName) properties['Renk'] = S.colorName;
      if (pricing.front.hasContent) {
        properties['Ön ölçü'] = formatMetricSize(pricing.front.metrics);
        properties['Ön alan'] = roundMetric(pricing.front.metrics.areaCm2) + ' cm²';
        properties['Ön fiyat bandı'] = pricing.front.band.label;
      }
      if (pricing.back.hasContent) {
        properties['Arka ölçü'] = formatMetricSize(pricing.back.metrics);
        properties['Arka alan'] = roundMetric(pricing.back.metrics.areaCm2) + ' cm²';
        properties['Arka fiyat bandı'] = pricing.back.band.label;
      }

      function doCartAdd(frontUrl, backUrl, design) {
        if (!design || !design.token) {
          setMsg('Tasarım kaydedilemedi, lütfen tekrar deneyin.', 'error');
          setLoading(false);
          return;
        }
        if (frontUrl) properties['Ön önizleme'] = frontUrl;
        if (backUrl)  properties['Arka önizleme'] = backUrl;
        if (design && design.token) properties.design_token = design.token;
        if (design && design.downloadUrl) properties['Tasarımı indir'] = design.downloadUrl;
        if (design && design.editUrl) properties['Tasarımı düzenle'] = design.editUrl;
        var frontUnitSurcharge = (cfg.surchargeVariantId && pricing.front.hasContent && pricing.front.surcharge > 0)
          ? pricing.front.surcharge : 0;
        var backUnitSurcharge  = (cfg.surchargeVariantId && pricing.back.hasContent  && pricing.back.surcharge  > 0)
          ? pricing.back.surcharge  : 0;

        var items = lines.map(function (line) {
          var lineProps = Object.assign({}, properties, { 'Beden': line.size, '_design_role': 'base' });
          if (cfg.surchargeVariantId && (frontUnitSurcharge > 0 || backUnitSurcharge > 0)) {
            lineProps['_surcharge_qty_front'] = String(Math.round(frontUnitSurcharge * 100) / 100);
            lineProps['_surcharge_qty_back']  = String(Math.round(backUnitSurcharge  * 100) / 100);
          }
          return {
            id: String(baseVariantIdForSize(line.size)),
            quantity: line.quantity,
            properties: lineProps,
          };
        });

        var totalSurcharge = (frontUnitSurcharge + backUnitSurcharge) * totalSelectedQuantity();
        if (cfg.surchargeVariantId && totalSurcharge > 0) {
          items.push({
            id: String(cfg.surchargeVariantId),
            quantity: 1,
            properties: {
              '_design_role': 'pending_surcharge',
              '_surcharge_total': totalSurcharge.toFixed(2),
            },
          });
        }

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            items: items,
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

      function createDesign(frontUrl, backUrl, done) {
        var payload = currentDesignPayload(frontUrl, backUrl, primaryVariantId);
        fetch('/apps/tshirt-designer/designs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) { return r.ok ? r.json() : Promise.resolve({}); })
          .then(function (j) {
            done({
              token: j.token || '',
              downloadUrl: j.token ? ('/apps/tshirt-designer/designs/' + encodeURIComponent(j.token) + '/download') : '',
              editUrl: j.token ? editDesignUrl(j.token) : '',
            });
          })
          .catch(function () { done(null); });
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
        function done() {
          pending--;
          if (pending === 0) {
            createDesign(frontUrl, backUrl, function (design) {
              doCartAdd(frontUrl, backUrl, design);
            });
          }
        }
        uploadSide('front', done);
        uploadSide('back',  done);
      } else {
        createDesign(null, null, function (design) {
          doCartAdd(null, null, design);
        });
      }
    }

    function downloadCurrentDesign() {
      if (!S.canvas) return;
      S.saved[viewName()] = canvasJSON();
      if (!sideHasContent(viewName())) {
        setMsg('İndirmek için önce tasarım ekleyin.', 'error');
        return;
      }
      exportMockupDataUrl(function (dataUrl) {
        var link = document.createElement('a');
        var side = viewName() === 'front' ? 'on' : 'arka';
        link.href = dataUrl;
        link.download = 'tisort-mockup-' + side + '.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    }

    function exportMockupDataUrl(callback) {
      var wrap = q('[data-product-wrap]');
      var overlay = q('[data-canvas-overlay]');
      var productImg = q('[data-product-img]');
      var svgWrap = q('[data-shirt-svg-wrap]');
      if (!wrap || !overlay || !S.canvas) {
        callback(S.canvas.toDataURL({ format: 'png', quality: 1, multiplier: 3 }));
        return;
      }

      var outW = 1200;
      var outH = 1500;
      var out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      var ctx = out.getContext('2d');
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(0, 0, outW, outH);

      var wrapRect = wrap.getBoundingClientRect();
      var target = null;
      if (productImg && productImg.classList.contains('loaded') && productImg.naturalWidth) target = productImg;
      else if (svgWrap && svgWrap.style.display !== 'none') target = svgWrap;

      var targetRect = target ? target.getBoundingClientRect() : wrapRect;
      var scale = Math.min(outW * 0.9 / targetRect.width, outH * 0.9 / targetRect.height);
      var drawW = targetRect.width * scale;
      var drawH = targetRect.height * scale;
      var drawX = (outW - drawW) / 2;
      var drawY = (outH - drawH) / 2;

      function finish() {
        var overlayRect = overlay.getBoundingClientRect();
        var ox = drawX + (overlayRect.left - targetRect.left) * scale;
        var oy = drawY + (overlayRect.top - targetRect.top) * scale;
        var ow = overlayRect.width * scale;
        var oh = overlayRect.height * scale;
        var designUrl = S.canvas.toDataURL({ format: 'png', quality: 1, multiplier: 3 });
        loadImageForExport(designUrl, function (designImg) {
          ctx.drawImage(designImg, ox, oy, ow, oh);
          callback(out.toDataURL('image/png'));
        }, function () {
          callback(S.canvas.toDataURL({ format: 'png', quality: 1, multiplier: 3 }));
        });
      }

      if (target === productImg) {
        loadImageForExport(productImg.currentSrc || productImg.src, function (img) {
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          finish();
        }, function () {
          drawFallbackShirt(ctx, drawX, drawY, drawW, drawH);
          finish();
        });
      } else {
        drawFallbackShirt(ctx, drawX, drawY, drawW, drawH);
        finish();
      }
    }

    function loadImageForExport(src, onload, onerror) {
      var img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { onload(img); };
      img.onerror = function () { if (onerror) onerror(); };
      img.src = src;
    }

    function drawFallbackShirt(ctx, x, y, w, h) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(w / 480, h / 540);
      ctx.fillStyle = S.shirtColor || '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(148, 60);
      ctx.lineTo(206, 128);
      ctx.quadraticCurveTo(240, 168, 274, 128);
      ctx.lineTo(332, 60);
      ctx.lineTo(446, 168);
      ctx.lineTo(410, 282);
      ctx.lineTo(368, 256);
      ctx.lineTo(368, 496);
      ctx.lineTo(112, 496);
      ctx.lineTo(112, 256);
      ctx.lineTo(70, 282);
      ctx.lineTo(34, 168);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath();
      ctx.moveTo(206, 128);
      ctx.quadraticCurveTo(240, 175, 274, 128);
      ctx.stroke();
      ctx.restore();
    }

    function waitForPreviewSceneReady(done, tries) {
      tries = tries || 0;
      var overlay = q('[data-canvas-overlay]');
      var productImg = q('[data-product-img]');
      var svgWrap = q('[data-shirt-svg-wrap]');
      var hasOverlay = overlay && overlay.offsetWidth > 0 && overlay.offsetHeight > 0;
      var hasProductImg = productImg && productImg.classList.contains('loaded') && productImg.naturalWidth > 0;
      var hasSvg = svgWrap && svgWrap.style.display !== 'none';
      if (hasOverlay && (hasProductImg || hasSvg || tries > 12)) {
        setTimeout(done, 40);
        return;
      }
      setTimeout(function () {
        waitForPreviewSceneReady(done, tries + 1);
      }, 40);
    }

    // Polls until all fabric.Image pixel data is loaded (needed before toDataURL)
    function waitForCanvasImagesLoaded(canvas, done, tries) {
      tries = tries || 0;
      if (tries > 25) { done(); return; }
      var objs = canvas ? canvas.getObjects('image') : [];
      var allReady = objs.every(function (obj) {
        var el = obj._originalElement || (obj.getElement && obj.getElement());
        return !el || (el.complete && el.naturalWidth > 0);
      });
      if (!objs.length || allReady) { done(); return; }
      setTimeout(function () { waitForCanvasImagesLoaded(canvas, done, tries + 1); }, 40);
    }

    function switchViewForPreview(side, done) {
      var idx = S.views.indexOf(side);
      if (idx === -1) {
        done();
        return;
      }
      if (S.canvas) {
        S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
        saveCanvasToStorage();
      }
      S.viewIdx = idx;
      updateViewSwitcher();
      setupProductDisplay();

      var savedJson = S.saved[viewName()];
      function finishSwitch() {
        updateStatusBadges();
        updatePriceLabel();
        waitForPreviewSceneReady(done);
      }

      if (S.canvas && savedJson) {
        S.canvas.loadFromJSON(savedJson, function () {
          normalizeCanvasImages();
          S.canvas.renderAll();
          updateSelectionMetrics();
          waitForCanvasImagesLoaded(S.canvas, finishSwitch);
        });
      } else if (S.canvas) {
        S.canvas.clear();
        S.canvas.renderAll();
        updateSelectionMetrics();
        finishSwitch();
      } else {
        finishSwitch();
      }
    }

    function exportPreviewPair(callback) {
      var originalSide = viewName();
      if (S.canvas) S.saved[originalSide] = canvasJSON();
      switchViewForPreview('front', function () {
        exportMockupDataUrl(function (frontUrl) {
          switchViewForPreview('back', function () {
            exportMockupDataUrl(function (backUrl) {
              switchViewForPreview(originalSide, function () {
                callback({
                  front: frontUrl,
                  back: backUrl,
                });
              });
            });
          });
        });
      });
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
        // Ürün beden seçeneklerinden adet satırları oluştur
        sizeGroup.innerHTML = '';
        sizeOpt.values.forEach(function (val, idx) {
          var isActive = activeSize ? (val === activeSize) : (idx === 0);
          if (isActive) S.size = val;
          if (S.sizeQty[val] === undefined) S.sizeQty[val] = 0;
          sizeGroup.appendChild(createSizeQtyRow(val, S.sizeQty[val]));
        });
      } else {
        var existing = Array.prototype.slice.call(qa('[data-size-row]')).map(function (row) { return row.dataset.sizeRow; }).filter(Boolean);
        if (!existing.length) existing = ['M', 'L', 'XL', 'XXL'];
        if (sizeGroup) {
          sizeGroup.innerHTML = '';
          existing.forEach(function (val, idx) {
            var isActive = activeSize ? (val === activeSize) : (idx === 0);
            if (isActive) S.size = val;
            if (S.sizeQty[val] === undefined) S.sizeQty[val] = 0;
            sizeGroup.appendChild(createSizeQtyRow(val, S.sizeQty[val]));
          });
        }
      }
      updatePriceLabel();
    }

    function createSizeQtyRow(size, qty) {
      var row = document.createElement('div');
      row.className = 'dsgn-size-row' + (qty > 0 ? ' active' : '');
      row.dataset.sizeRow = size;
      var name = document.createElement('span');
      name.className = 'dsgn-size-name';
      name.textContent = size;
      name.dataset.qty = String(qty);
      var qtyWrap = document.createElement('div');
      qtyWrap.className = 'dsgn-size-qty';
      var dec = document.createElement('button');
      dec.type = 'button';
      dec.dataset.sizeQty = '-1';
      dec.dataset.size = size;
      dec.setAttribute('aria-label', size + ' azalt');
      dec.textContent = '−';
      var input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.value = String(qty);
      input.dataset.sizeInput = size;
      input.setAttribute('aria-label', size + ' adet');
      var inc = document.createElement('button');
      inc.type = 'button';
      inc.dataset.sizeQty = '1';
      inc.dataset.size = size;
      inc.setAttribute('aria-label', size + ' artır');
      inc.textContent = '+';
      qtyWrap.appendChild(dec);
      qtyWrap.appendChild(input);
      qtyWrap.appendChild(inc);
      row.appendChild(name);
      row.appendChild(qtyWrap);
      row.querySelectorAll('[data-size-qty]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setSizeQty(size, (S.sizeQty[size] || 0) + Number(btn.dataset.sizeQty || 0));
        });
      });
      if (input) {
        input.addEventListener('input', function () {
          setSizeQty(size, input.value);
        });
      }
      return row;
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

      qa('[data-close-tool]').forEach(function (closeToolBtn) {
        function handleCloseTool(e) {
          e.preventDefault();
          e.stopPropagation();
          closeToolPanel();
        }
        closeToolBtn.addEventListener('mousedown', handleCloseTool);
        closeToolBtn.addEventListener('click', handleCloseTool);
      });

      qa('[data-media-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          qa('[data-media-tab]').forEach(function (b) { b.classList.toggle('active', b === btn); });
          qa('[data-media-pane]').forEach(function (pane) {
            pane.classList.toggle('active', pane.dataset.mediaPane === btn.dataset.mediaTab);
          });
        });
      });

      qa('[data-aspect]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          qa('[data-aspect]').forEach(function (b) { b.classList.toggle('active', b === btn); });
        });
      });

      var aiBtn = q('[data-ai-generate]');
      if (aiBtn) aiBtn.addEventListener('click', function () {
        setMsg('AI görsel oluşturma için backend bağlantısı henüz eklenmedi.', 'error');
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
          if (style === 'linethrough') applyTextChange({ linethrough: btn.classList.contains('active') });
        });
      });

      // Add text button
      var addTextBtn = q('[data-add-text]');
      if (addTextBtn) addTextBtn.addEventListener('click', addText);

      var tqColor = q('[data-tq-color]');
      if (tqColor) tqColor.addEventListener('input', function () { applyTextChange({ fill: tqColor.value }); });
      var tqSize = q('[data-tq-size]');
      if (tqSize) tqSize.addEventListener('input', function () {
        var value = Number(tqSize.value) || 30;
        var sizeValue = q('[data-tq-size-value]');
        var sizeReadout = q('[data-tq-size-readout]');
        if (sizeValue) sizeValue.textContent = value + ' px';
        if (sizeReadout) sizeReadout.textContent = value + ' px';
        applyTextChange({ fontSize: value });
      });
      var tqFont = q('[data-tq-font]');
      if (tqFont) tqFont.addEventListener('change', function () { applyTextChange({ fontFamily: tqFont.value }); });
      qa('[data-tq-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleTextQuickbarPanel(btn.dataset.tqToggle);
        });
      });
      var tqClose = q('[data-tq-close]');
      if (tqClose) tqClose.addEventListener('click', function () {
        var tq = q('[data-text-quickbar]');
        S.suppressQuickbarRestore = true;
        if (tq) tq.style.display = 'none';
        closeTextQuickbarPanels();
        if (S.canvas) S.canvas.discardActiveObject().renderAll();
      });
      qa('[data-tq-style]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleTextStyle(btn.dataset.tqStyle);
        });
      });
      qa('[data-tq-align]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setTextAlignment(btn.dataset.tqAlign);
        });
      });
      qa('[data-tq-position]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          positionObject(btn.dataset.tqPosition);
        });
      });
      var tqDelete = q('[data-tq-delete]');
      if (tqDelete) tqDelete.addEventListener('click', function () {
        var obj = activeCanvasObject() || restoreLastTextSelection();
        if (!obj) return;
        deleteSelected();
      });

      // Save design button
      var saveBtn = q('[data-save-design]');
      if (saveBtn) saveBtn.addEventListener('click', saveDesign);

      // Canvas toolbar buttons
      var undoBtn = q('[data-undo]');
      var redoBtn = q('[data-redo]');
      var delBtns = qa('[data-delete-obj]');
      var viewCards = qa('[data-view-card]');
      var downloadBtn = q('[data-download-design]');

      if (undoBtn)   undoBtn.addEventListener('click', undo);
      if (redoBtn)   redoBtn.addEventListener('click', redo);

      // Zoom buttons (right toolbar)
      qa('[data-zoom]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          applyZoom(parseInt(btn.dataset.zoom, 10));
        });
      });

      // View thumb images: populate from front/back image data attributes
      (function () {
        var tFront = q('[data-view-thumb="front"]');
        var tBack  = q('[data-view-thumb="back"]');
        var frontSrc = root.dataset.frontImage;
        var backSrc  = root.dataset.backImage;
        if (tFront && frontSrc) tFront.src = frontSrc;
        if (tBack  && backSrc)  tBack.src  = backSrc;
      }());

      delBtns.forEach(function (delBtn) {
        delBtn.addEventListener('mousedown', function (e) { e.preventDefault(); deleteSelected(); });
      });
      viewCards.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = S.views.indexOf(btn.dataset.viewCard);
          if (idx !== -1) switchView(idx);
        });
      });
      if (downloadBtn) downloadBtn.addEventListener('click', downloadCurrentDesign);

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
        S.suppressQuickbarRestore = true;
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

      document.addEventListener('click', function (e) {
        var tq = q('[data-text-quickbar]');
        if (!tq || tq.style.display === 'none') return;
        if (!tq.contains(e.target)) closeTextQuickbarPanels();
      });

      var tqWrap = q('[data-text-quickbar]');
      if (tqWrap) {
        tqWrap.addEventListener('mousedown', function () {
          S.quickbarLock = true;
          setTimeout(function () { S.quickbarLock = false; }, 80);
        }, true);
      }

      // Preview button
      var previewBtn = q('[data-preview-btn]');
      var previewModal = document.querySelector('[data-preview-modal]');
      var previewClose = document.querySelector('[data-preview-close]');
      var previewFrontImg = document.querySelector('[data-preview-img="front"]');
      var previewBackImg = document.querySelector('[data-preview-img="back"]');
      function closePreviewModal() {
        if (!previewModal) return;
        previewModal.style.display = 'none';
        document.body.style.overflow = '';
      }
      if (previewBtn && previewModal) {
        previewBtn.addEventListener('click', function () {
          if (!S.canvas) return;
          document.body.style.overflow = 'hidden';
          previewModal.style.display = 'flex';
          if (previewFrontImg) previewFrontImg.src = '';
          if (previewBackImg) previewBackImg.src = '';
          exportPreviewPair(function (previews) {
            if (previewFrontImg && previews.front) previewFrontImg.src = previews.front;
            if (previewBackImg && previews.back) previewBackImg.src = previews.back;
          });
        });
        if (previewClose) {
          previewClose.addEventListener('click', closePreviewModal);
        }
        previewModal.addEventListener('click', function (e) {
          if (e.target === previewModal) closePreviewModal();
        });
      }

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
          S.saved[viewName()] = JSON.stringify(S.canvas.toJSON(DESIGN_JSON_PROPS));
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
      loadRemotePersonalization(function () {
        try { bind(); } catch(e) {}
        try { initVariantImages(); } catch(e) {}
        try { buildColorSwatches(); } catch(e) {}
        try { applyShirtColor(S.shirtColor); } catch(e) {}
        try { syncSuggestedTextColor(); } catch(e) {}
        try { buildSizeButtons(); } catch(e) {}
        try { buildTemplates(); } catch(e) {}
        try { renderSavedGrid(); } catch(e) {}
        loadCanvasFromStorage();
        setupProductDisplay();
        updatePriceLabel();
        updateSelectionActions();
        refreshWorkspaceState();
        loadDesignFromToken();
        loadImagesFromStorage();
        if (S.uploadedImages.length > 0) activateTool('image');
      });
    }

    init();

  }); // end forEach
}());
