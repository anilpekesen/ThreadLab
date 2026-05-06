'use strict';

// ── Config ────────────────────────────────────────────────────────────────────

const CFG = {
  currency: 'TRY', locale: 'tr-TR',
  prices: { front: 0, back: 0, double: 0 },
  variantMap: {}, variantPrices: {}, uploadEndpoint: '', productHandle: '',
  canvasW: 210, canvasH: 292,
  views: ['front', 'back'],
  viewNames: ['Ön Yüz', 'Arka Yüz'],
};

const SHIRT_COLORS = [
  { name: 'Beyaz',    hex: '#ffffff' },
  { name: 'Krem',     hex: '#f5f0e8' },
  { name: 'Açık Gri', hex: '#d1d5db' },
  { name: 'Gri',      hex: '#6b7280' },
  { name: 'Siyah',    hex: '#111111' },
  { name: 'Lacivert', hex: '#1e3a5f' },
  { name: 'Mavi',     hex: '#2563eb' },
  { name: 'Yeşil',    hex: '#16a34a' },
  { name: 'Kırmızı',  hex: '#dc2626' },
  { name: 'Bordo',    hex: '#7f1d1d' },
  { name: 'Mor',      hex: '#7c3aed' },
  { name: 'Sarı',     hex: '#f59e0b' },
];

const FILTER_DEFS = [
  { id: 'none',        label: 'Normal',     make: () => [] },
  { id: 'grayscale',   label: 'Gri Ton',    make: () => [new fabric.Image.filters.Grayscale()] },
  { id: 'sepia',       label: 'Sepya',      make: () => [new fabric.Image.filters.Sepia()] },
  { id: 'vintage',     label: 'Vintage',    make: () => [new fabric.Image.filters.Vintage()] },
  { id: 'kodachrome',  label: 'Kodachrome', make: () => [new fabric.Image.filters.Kodachrome()] },
  { id: 'technicolor', label: 'Technicolor',make: () => [new fabric.Image.filters.Technicolor()] },
  { id: 'polaroid',    label: 'Polaroid',   make: () => [new fabric.Image.filters.Polaroid()] },
  { id: 'brownie',     label: 'Brownie',    make: () => [new fabric.Image.filters.Brownie()] },
  { id: 'invert',      label: 'Negatif',    make: () => [new fabric.Image.filters.Invert()] },
];

const TEMPLATE_DESIGNS = [
  {
    name: '100% Orijinal',
    build: (w, h) => [
      new fabric.Text('100%', { left: w/2, top: h/2 - 30, originX:'center', originY:'center',
        fontSize: 38, fontFamily:'Impact', fill:'#111', fontWeight:'bold' }),
      new fabric.Text('ORİJİNAL', { left: w/2, top: h/2 + 18, originX:'center', originY:'center',
        fontSize: 18, fontFamily:'Arial', fill:'#555', letterSpacing: 4 }),
    ],
  },
  {
    name: 'No Fear',
    build: (w, h) => [
      new fabric.Text('NO FEAR', { left: w/2, top: h/2, originX:'center', originY:'center',
        fontSize: 44, fontFamily:'Impact', fill:'#dc2626', fontWeight:'bold' }),
    ],
  },
  {
    name: 'Limited Edition',
    build: (w, h) => [
      new fabric.Text('LIMITED', { left: w/2, top: h/2 - 22, originX:'center', originY:'center',
        fontSize: 22, fontFamily:'Arial', fill:'#111', fontWeight:'bold', letterSpacing: 6 }),
      new fabric.Text('EDITION', { left: w/2, top: h/2 + 8, originX:'center', originY:'center',
        fontSize: 22, fontFamily:'Arial', fill:'#111', fontWeight:'bold', letterSpacing: 6 }),
    ],
  },
  {
    name: 'Minimalist',
    build: (w, h) => [
      new fabric.Rect({ left: w/2, top: h/2 - 10, originX:'center', originY:'center',
        width: 80, height: 3, fill:'#111' }),
      new fabric.Text('MINIMAL', { left: w/2, top: h/2 + 20, originX:'center', originY:'center',
        fontSize: 16, fontFamily:'Verdana', fill:'#111', letterSpacing: 8 }),
    ],
  },
  {
    name: 'Çerçeve',
    build: (w, h) => [
      new fabric.Rect({ left: w/2, top: h/2, originX:'center', originY:'center',
        width: 150, height: 100, fill:'transparent', stroke:'#111', strokeWidth:3 }),
      new fabric.Text('YOUR TEXT', { left: w/2, top: h/2, originX:'center', originY:'center',
        fontSize: 20, fontFamily:'Georgia', fill:'#111' }),
    ],
  },
  {
    name: 'Daire + Yazı',
    build: (w, h) => [
      new fabric.Circle({ left: w/2, top: h/2, originX:'center', originY:'center',
        radius: 55, fill:'transparent', stroke:'#0f766e', strokeWidth:3 }),
      new fabric.Text('TASARIM', { left: w/2, top: h/2, originX:'center', originY:'center',
        fontSize: 20, fontFamily:'Impact', fill:'#0f766e' }),
    ],
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

const S = {
  canvas:      null,
  viewIdx:     0,
  shirtColor:  '#ffffff',
  activeTool:  null,
  activePopup: null,
  saved:    { front: null, back: null },
  history:  { front: [], back: [] },
  redo:     { front: [], back: [] },
  uploadedImages: [],   // {dataUrl, name, size}
  activeFilter: 'none',
  qrCanvas: null,
};

// ── DOM helpers ───────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
let E = {};

function cacheEls() {
  E = {
    shirtBody:      $('shirtBody'),
    printAreaRect:  $('printAreaRect'),
    shirtSvg:       $('shirtSvg'),
    colorSwatches:  $('colorSwatches'),
    fpdPanel:       $('fpdPanel'),
    imageThumbs:    $('imageThumbs'),
    imageInput:     $('imageInput'),
    dropZone:       $('dropZone'),
    addTextInput:   $('addTextInput'),
    fontFamily:     $('fontFamily'),
    textSize:       $('textSize'),
    textSizeVal:    $('textSizeVal'),
    textColor:      $('textColor'),
    boldBtn:        $('boldBtn'),
    italicBtn:      $('italicBtn'),
    underlineBtn:   $('underlineBtn'),
    addTextBtn:     $('addTextBtn'),
    designGrid:     $('designGrid'),
    savedGrid:      $('savedGrid'),
    saveDesignBtn:  $('saveDesignBtn'),
    undoBtn:        $('undoBtn'),
    redoBtn:        $('redoBtn'),
    deleteBtn:      $('deleteBtn'),
    zoomInBtn:      $('zoomInBtn'),
    zoomOutBtn:     $('zoomOutBtn'),
    zoomLabel:      $('zoomLabel'),
    resetBtn:       $('resetBtn'),
    qrBtn:          $('qrBtn'),
    infoBtn:        $('infoBtn'),
    priceLabel:     $('priceLabel'),
    printModeLabel: $('printModeLabel'),
    sizeSelect:     $('sizeSelect'),
    quantityInput:  $('quantityInput'),
    addToCartBtn:   $('addToCartBtn'),
    statusMsg:      $('statusMsg'),
    prevViewBtn:    $('prevViewBtn'),
    nextViewBtn:    $('nextViewBtn'),
    viewLabel:      $('viewLabel'),
    floatTb:        $('floatTb'),
    ftbClose:       $('ftbClose'),
    removeBgBtn:    $('removeBgBtn'),
    popTransform:   $('popTransform'),
    popPosition:    $('popPosition'),
    popAdvanced:    $('popAdvanced'),
    angleSlider:    $('angleSlider'),
    angleVal:       $('angleVal'),
    opacitySlider:  $('opacitySlider'),
    opacityVal:     $('opacityVal'),
    brightnessSlider: $('brightnessSlider'),
    brightnessVal:  $('brightnessVal'),
    contrastSlider: $('contrastSlider'),
    contrastVal:    $('contrastVal'),
    saturationSlider: $('saturationSlider'),
    saturationVal:  $('saturationVal'),
    flipXBtn:       $('flipXBtn'),
    flipYBtn:       $('flipYBtn'),
    rotateCCWBtn:   $('rotateCCWBtn'),
    rotateCWBtn:    $('rotateCWBtn'),
    bringFwdBtn:    $('bringFwdBtn'),
    sendBkBtn:      $('sendBkBtn'),
    filterStrip:    $('filterStrip'),
    qrModal:        $('qrModal'),
    qrModalClose:   $('qrModalClose'),
    qrInput:        $('qrInput'),
    qrPreview:      $('qrPreview'),
    qrAddBtn:       $('qrAddBtn'),
    infoModal:      $('infoModal'),
    infoModalClose: $('infoModalClose'),
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  cacheEls();
  readConfig();
  initCanvas();
  buildColorSwatches();
  buildFilterStrip();
  buildTemplates();
  loadUploadedImages();
  loadSavedDesigns();
  bindEvents();
  updatePrice();
  updateViewLabel();
}

function readConfig() {
  const root = document.querySelector('.fpd');
  if (!root) return;
  const d = root.dataset;
  CFG.uploadEndpoint = d.uploadEndpoint || '';
  CFG.productHandle  = d.productHandle  || '';
  try { CFG.variantMap = JSON.parse(d.variantMap || '{}'); } catch (_) {}
  if (d.singlePrice) CFG.prices.front = CFG.prices.back = +d.singlePrice;
  if (d.doublePrice) CFG.prices.double = +d.doublePrice;

  try {
    const variants = JSON.parse(d.productVariants || '[]');
    if (Array.isArray(variants)) {
      variants.forEach(v => {
        const price = parseVariantPrice(v.price);
        if (v.id && price) CFG.variantPrices[String(v.id)] = price;
        const opts = variantOptions(v);
        const size = detectSize(opts);
        const mode = detectPrintMode(opts);
        if (!size || !mode || !v.id) return;
        CFG.variantMap[size] = CFG.variantMap[size] || {};
        CFG.variantMap[size][mode] = String(v.id);
        if (price) CFG.prices[mode] = price;
      });
    }
  } catch (_) {}
}

// ── Canvas ────────────────────────────────────────────────────────────────────

function initCanvas() {
  S.canvas = new fabric.Canvas('designCanvas', {
    width:  CFG.canvasW, height: CFG.canvasH,
    backgroundColor: null,
    preserveObjectStacking: true,
    selection: true, stopContextMenu: true,
  });
  S.canvas.on('object:added',    onChanged);
  S.canvas.on('object:removed',  onChanged);
  S.canvas.on('object:modified', onChanged);
  S.canvas.on('selection:created', onSelect);
  S.canvas.on('selection:updated', onSelect);
  S.canvas.on('selection:cleared', onDeselect);
  S.canvas.on('object:moving', clampBounds);
  pushHistory();
}

function onChanged() { pushHistory(); updatePrice(); }

// ── History ───────────────────────────────────────────────────────────────────

function pushHistory() {
  const v = curView();
  const snap = JSON.stringify(S.canvas.toJSON());
  S.history[v].push(snap);
  S.redo[v] = [];
  if (S.history[v].length > 60) S.history[v].shift();
  syncHistoryBtns();
}

function undo() {
  const v = curView();
  if (S.history[v].length <= 1) return;
  S.redo[v].push(S.history[v].pop());
  applySnap(S.history[v][S.history[v].length - 1]);
  syncHistoryBtns();
}

function redo() {
  const v = curView();
  if (!S.redo[v].length) return;
  const snap = S.redo[v].pop();
  S.history[v].push(snap);
  applySnap(snap);
  syncHistoryBtns();
}

function applySnap(snap) {
  S.canvas.loadFromJSON(JSON.parse(snap), () => {
    S.canvas.renderAll();
    updatePrice();
  });
}

function syncHistoryBtns() {
  E.undoBtn.disabled = S.history[curView()].length <= 1;
  E.redoBtn.disabled = !S.redo[curView()].length;
}

function curView() { return CFG.views[S.viewIdx]; }

// ── View switching ────────────────────────────────────────────────────────────

function switchView(idx) {
  if (idx === S.viewIdx) return;
  S.saved[curView()] = S.canvas.toJSON();
  S.viewIdx = idx;
  const saved = S.saved[curView()];
  if (saved && (saved.objects || []).length) {
    S.canvas.loadFromJSON(saved, () => S.canvas.renderAll());
  } else {
    S.canvas.clear(); S.canvas.renderAll();
  }
  updateViewLabel();
  syncHistoryBtns();
  updatePrice();
  hideAllPopups();
}

function updateViewLabel() {
  E.viewLabel.textContent = `${S.viewIdx + 1} / ${CFG.views.length}`;
}

// ── Shirt color ───────────────────────────────────────────────────────────────

function buildColorSwatches() {
  SHIRT_COLORS.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'color-swatch';
    btn.title = c.name;
    btn.style.backgroundColor = c.hex;
    if (c.hex === '#ffffff') btn.style.borderColor = '#d1d5db';
    if (c.hex === S.shirtColor) btn.classList.add('active');
    btn.addEventListener('click', () => {
      S.shirtColor = c.hex;
      E.shirtBody.setAttribute('fill', c.hex);
      const dark = isDark(c.hex);
      E.printAreaRect.setAttribute('stroke',
        dark ? 'rgba(255,255,255,0.35)' : 'rgba(15,118,110,0.55)');
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
    });
    E.colorSwatches.appendChild(btn);
  });
}

function isDark(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000 < 140;
}

// ── Tool sidebar ──────────────────────────────────────────────────────────────

function activateTool(tool) {
  const same = S.activeTool === tool;
  S.activeTool = same ? null : tool;
  document.querySelectorAll('.fpd-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === S.activeTool));
  document.querySelectorAll('.fp').forEach(p => p.classList.remove('active'));
  if (S.activeTool) {
    const fp = $(`fp-${S.activeTool}`);
    if (fp) fp.classList.add('active');
    E.fpdPanel.classList.add('open');
  } else {
    E.fpdPanel.classList.remove('open');
  }
}

// ── Image upload ──────────────────────────────────────────────────────────────

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.match(/^image\/(png|jpeg|webp|svg\+xml)$/)) {
      showStatus('Desteklenmeyen format. PNG, JPG, WEBP veya SVG seçin.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      // Add to uploaded images list
      S.uploadedImages.push({ dataUrl, name: file.name, size: file.size });
      addThumbItem(dataUrl, file.name, file.size, S.uploadedImages.length - 1);
      saveUploadedImages();
      // Place on canvas
      placeImageOnCanvas(dataUrl);
    };
    reader.readAsDataURL(file);
  });
}

function addThumbItem(dataUrl, name, size, idx) {
  const item = document.createElement('div');
  item.className = 'fp-thumb-item';
  item.dataset.idx = idx;

  const img = document.createElement('img');
  img.className = 'fp-thumb-img';
  img.src = dataUrl;
  img.alt = name;

  const info = document.createElement('div');
  info.className = 'fp-thumb-info';
  const nameEl = document.createElement('div');
  nameEl.className = 'fp-thumb-name';
  nameEl.textContent = name;
  const sizeEl = document.createElement('div');
  sizeEl.className = 'fp-thumb-size';
  sizeEl.textContent = formatFileSize(size);
  info.appendChild(nameEl);
  info.appendChild(sizeEl);

  const del = document.createElement('button');
  del.className = 'fp-thumb-del';
  del.textContent = '×';
  del.title = 'Listeden Kaldır';
  del.addEventListener('click', e => {
    e.stopPropagation();
    item.remove();
    S.uploadedImages[idx] = null;
    saveUploadedImages();
  });

  item.appendChild(img);
  item.appendChild(info);
  item.appendChild(del);

  // Click to re-place on canvas
  item.addEventListener('click', () => placeImageOnCanvas(dataUrl));

  E.imageThumbs.appendChild(item);
}

function uploadedImagesKey() {
  return 'fpd_uploaded_images_' + (CFG.productHandle || 'global');
}

function saveUploadedImages() {
  try {
    const list = S.uploadedImages
      .filter(Boolean)
      .map(img => ({ dataUrl: img.dataUrl, name: img.name, size: img.size || 0 }));
    localStorage.setItem(uploadedImagesKey(), JSON.stringify(list));
  } catch (_) {
    showStatus('Tarayıcı depolama alanı dolu, yüklenen resimler kaydedilemedi.');
  }
}

function loadUploadedImages() {
  try {
    const list = JSON.parse(localStorage.getItem(uploadedImagesKey()) || '[]');
    if (!Array.isArray(list)) return;
    list.forEach(img => {
      if (!img?.dataUrl || !img?.name) return;
      S.uploadedImages.push({ dataUrl: img.dataUrl, name: img.name, size: img.size || 0 });
      addThumbItem(img.dataUrl, img.name, img.size || 0, S.uploadedImages.length - 1);
    });
  } catch (_) {}
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}

function placeImageOnCanvas(dataUrl) {
  fabric.Image.fromURL(dataUrl, img => {
    const scale = Math.min((CFG.canvasW * 0.8) / img.width, (CFG.canvasH * 0.8) / img.height, 1);
    img.set({ left: CFG.canvasW/2, top: CFG.canvasH/2, originX:'center', originY:'center', scaleX:scale, scaleY:scale });
    S.canvas.add(img);
    S.canvas.setActiveObject(img);
    S.canvas.renderAll();
  });
}

// ── Text ──────────────────────────────────────────────────────────────────────

function addText() {
  const raw = E.addTextInput.value.trim();
  if (!raw) { showStatus('Önce bir yazı girin.'); return; }
  const t = new fabric.IText(raw, {
    left: CFG.canvasW/2, top: CFG.canvasH/2,
    originX:'center', originY:'center',
    fontSize:    +E.textSize.value || 40,
    fontFamily:  E.fontFamily.value || 'Arial',
    fill:        E.textColor.value || '#111111',
    fontWeight:  E.boldBtn.classList.contains('active') ? 'bold' : 'normal',
    fontStyle:   E.italicBtn.classList.contains('active') ? 'italic' : 'normal',
    underline:   E.underlineBtn.classList.contains('active'),
    textAlign:   'center',
  });
  S.canvas.add(t);
  S.canvas.setActiveObject(t);
  S.canvas.renderAll();
  E.addTextInput.value = '';
}

// ── Templates ────────────────────────────────────────────────────────────────

function buildTemplates() {
  TEMPLATE_DESIGNS.forEach((tpl, i) => {
    const card = document.createElement('div');
    card.className = 'design-card';

    const cv = document.createElement('canvas');
    cv.width = 100; cv.height = 100;
    card.appendChild(cv);

    const lbl = document.createElement('span');
    lbl.textContent = tpl.name;
    card.appendChild(lbl);

    // Render preview
    const tmp = new fabric.Canvas(cv, { width:100, height:100, backgroundColor:'#f9fafb' });
    const objs = tpl.build(100, 100);
    objs.forEach(o => tmp.add(o));
    tmp.renderAll();

    card.addEventListener('click', () => applyTemplate(tpl));
    E.designGrid.appendChild(card);
  });
}

function applyTemplate(tpl) {
  S.canvas.clear();
  const objs = tpl.build(CFG.canvasW, CFG.canvasH);
  objs.forEach(o => S.canvas.add(o));
  S.canvas.renderAll();
  S.canvas.fire('object:added');
}

// ── Saved designs ─────────────────────────────────────────────────────────────

function saveCurrentDesign() {
  if (S.canvas.getObjects().length === 0) { showStatus('Tişörtte tasarım yok.'); return; }
  const json   = S.canvas.toJSON();
  const thumb  = S.canvas.toDataURL({ multiplier: 1, format:'png' });
  const designs = loadDesignsFromStorage();
  const id     = Date.now();
  designs.push({ id, json, thumb, date: new Date().toLocaleDateString('tr-TR') });
  localStorage.setItem('fpd_saved_designs', JSON.stringify(designs));
  loadSavedDesigns();
  showStatus('Tasarım kaydedildi.');
}

function loadDesignsFromStorage() {
  try { return JSON.parse(localStorage.getItem('fpd_saved_designs') || '[]'); } catch (_) { return []; }
}

function loadSavedDesigns() {
  E.savedGrid.innerHTML = '';
  const designs = loadDesignsFromStorage();
  if (!designs.length) {
    E.savedGrid.innerHTML = '<p class="fp-hint" style="padding:10px 0">Henüz kayıt yok.</p>';
    return;
  }
  designs.forEach(d => {
    const card = document.createElement('div');
    card.className = 'saved-card';
    const img  = document.createElement('img');
    img.src = d.thumb;
    img.alt = `Tasarım ${d.date}`;
    const lbl = document.createElement('span');
    lbl.textContent = d.date;
    card.appendChild(img);
    card.appendChild(lbl);
    card.addEventListener('click', () => {
      S.canvas.loadFromJSON(d.json, () => { S.canvas.renderAll(); S.canvas.fire('object:added'); });
    });
    E.savedGrid.appendChild(card);
  });
}

// ── Object operations ─────────────────────────────────────────────────────────

function deleteSelected() {
  const obj = S.canvas.getActiveObject();
  if (!obj) return;
  obj.type === 'activeSelection'
    ? obj.forEachObject(o => S.canvas.remove(o))
    : S.canvas.remove(obj);
  S.canvas.discardActiveObject().renderAll();
  hideAllPopups();
}

function clampBounds(e) {
  const o = e.target, br = o.getBoundingRect(true);
  const cw = S.canvas.getWidth(), ch = S.canvas.getHeight();
  if (br.left              < 0)  o.set('left', o.left - br.left);
  if (br.top               < 0)  o.set('top',  o.top  - br.top);
  if (br.left + br.width   > cw) o.set('left', o.left - (br.left + br.width  - cw));
  if (br.top  + br.height  > ch) o.set('top',  o.top  - (br.top  + br.height - ch));
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function applyZoom(d) {
  const n = Math.min(3, Math.max(0.3, +(S.canvas.getZoom() + d).toFixed(2)));
  S.canvas.setZoom(n);
  E.zoomLabel.textContent = `${Math.round(n * 100)}%`;
}

// ── Floating toolbar ──────────────────────────────────────────────────────────

function onSelect() {
  const obj = S.canvas.getActiveObject();
  if (!obj) return;

  // Show/hide Remove Background button (only for images)
  const isImg = obj.type === 'image';
  E.removeBgBtn.style.display = isImg ? '' : 'none';
  E.removeBgBtn.previousElementSibling.style.display = isImg ? '' : 'none';

  positionFloatTb();
  E.floatTb.style.display = 'flex';

  // Sync sliders
  E.angleSlider.value   = Math.round(obj.angle || 0);
  E.angleVal.textContent = Math.round(obj.angle || 0);
  E.opacitySlider.value  = Math.round((obj.opacity ?? 1) * 100);
  E.opacityVal.textContent = Math.round((obj.opacity ?? 1) * 100);
}

function onDeselect() {
  E.floatTb.style.display = 'none';
  hideAllPopups();
}

function positionFloatTb() {
  const obj = S.canvas.getActiveObject();
  if (!obj) return;
  const br      = obj.getBoundingRect();
  const overlay = $('canvasOverlay').getBoundingClientRect();
  const zoom    = S.canvas.getZoom();

  const cx = overlay.left + (br.left + br.width  / 2) * zoom;
  const cy = overlay.top  + (br.top  + br.height) * zoom + 12;

  E.floatTb.style.left = `${Math.round(cx)}px`;
  E.floatTb.style.top  = `${Math.round(Math.min(cy, window.innerHeight - 80))}px`;
}

function showPopup(popup) {
  hideAllPopups();
  // Position popup below floating toolbar
  const tbRect = E.floatTb.getBoundingClientRect();
  popup.style.left = `${Math.round(tbRect.left + tbRect.width/2)}px`;
  popup.style.top  = `${Math.round(tbRect.bottom + 10)}px`;
  popup.style.display = 'block';
  S.activePopup = popup;

  // Mark active button
  document.querySelectorAll('.ftb-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.action && popup.id.includes(b.dataset.action.slice(0,5)));
  });
}

function hideAllPopups() {
  [E.popTransform, E.popPosition, E.popAdvanced].forEach(p => {
    if (p) p.style.display = 'none';
  });
  S.activePopup = null;
  document.querySelectorAll('.ftb-btn').forEach(b => b.classList.remove('active'));
}

// ── Remove Background ─────────────────────────────────────────────────────────

async function removeBackground() {
  const obj = S.canvas.getActiveObject();
  if (!obj || obj.type !== 'image') { showStatus('Arkaplan kaldırmak için bir resim seçin.'); return; }

  showStatus('Arkaplan kaldırılıyor…');

  try {
    const el  = obj.getElement();
    const tmp = document.createElement('canvas');
    tmp.width  = el.naturalWidth  || el.width;
    tmp.height = el.naturalHeight || el.height;
    const ctx  = tmp.getContext('2d');
    ctx.drawImage(el, 0, 0);

    const imgData = ctx.getImageData(0, 0, tmp.width, tmp.height);
    floodRemove(imgData, 0, 0, 40);
    floodRemove(imgData, tmp.width - 1, 0, 40);
    floodRemove(imgData, 0, tmp.height - 1, 40);
    floodRemove(imgData, tmp.width - 1, tmp.height - 1, 40);
    ctx.putImageData(imgData, 0, 0);

    const newUrl = tmp.toDataURL('image/png');
    fabric.Image.fromURL(newUrl, newImg => {
      newImg.set({
        left:    obj.left, top:  obj.top,
        scaleX:  obj.scaleX, scaleY: obj.scaleY,
        angle:   obj.angle, opacity: obj.opacity,
        flipX:   obj.flipX, flipY: obj.flipY,
        originX: obj.originX, originY: obj.originY,
      });
      S.canvas.remove(obj);
      S.canvas.add(newImg);
      S.canvas.setActiveObject(newImg);
      S.canvas.renderAll();
      showStatus('Arkaplan kaldırıldı.');
    });
  } catch (err) {
    showStatus('Arkaplan kaldırılamadı.');
  }
}

function floodRemove(imgData, startX, startY, tolerance) {
  const { width, height, data } = imgData;
  const getIdx = (x, y) => (y * width + x) * 4;

  const si    = getIdx(startX, startY);
  const bgRgb = [data[si], data[si+1], data[si+2]];
  const visited = new Uint8Array(width * height);
  const stack   = [[startX, startY]];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    const vid = cy * width + cx;
    if (visited[vid]) continue;
    visited[vid] = 1;
    const i = vid * 4;
    const diff = Math.abs(data[i]-bgRgb[0]) + Math.abs(data[i+1]-bgRgb[1]) + Math.abs(data[i+2]-bgRgb[2]);
    if (diff > tolerance * 3) continue;
    data[i+3] = 0;
    stack.push([cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]);
  }
}

// ── Image Filters ─────────────────────────────────────────────────────────────

function buildFilterStrip() {
  FILTER_DEFS.forEach(fd => {
    const item = document.createElement('div');
    item.className = 'filter-item' + (fd.id === 'none' ? ' active' : '');
    item.dataset.filterId = fd.id;

    const cv = document.createElement('canvas');
    cv.width = 50; cv.height = 50;
    const span = document.createElement('span');
    span.textContent = fd.label;
    item.appendChild(cv);
    item.appendChild(span);

    item.addEventListener('click', () => {
      applyFilter(fd);
      document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      S.activeFilter = fd.id;
    });
    E.filterStrip.appendChild(item);
  });
}

function renderFilterPreviews() {
  const obj = S.canvas.getActiveObject();
  if (!obj || obj.type !== 'image') return;

  const el  = obj.getElement();
  document.querySelectorAll('.filter-item').forEach((item, i) => {
    const fd  = FILTER_DEFS[i];
    const cv  = item.querySelector('canvas');
    const tmp = document.createElement('canvas');
    tmp.width  = 50; tmp.height = 50;
    const ctx  = tmp.getContext('2d');
    ctx.drawImage(el, 0, 0, 50, 50);

    const tmpFabric = new fabric.StaticCanvas(tmp);
    fabric.Image.fromURL(tmp.toDataURL(), fImg => {
      fImg.filters = fd.make();
      fImg.applyFilters();
      const cv2 = item.querySelector('canvas');
      const ctx2 = cv2.getContext('2d');
      ctx2.clearRect(0, 0, 50, 50);
      ctx2.drawImage(fImg.getElement(), 0, 0, 50, 50);
    });
  });
}

function applyFilter(fd) {
  const obj = S.canvas.getActiveObject();
  if (!obj || obj.type !== 'image') return;
  obj.filters = fd.make();
  // Keep brightness/contrast/saturation on top
  addAdjustmentFilters(obj);
  obj.applyFilters();
  S.canvas.renderAll();
  S.canvas.fire('object:modified');
}

function addAdjustmentFilters(obj) {
  const b = (+E.brightnessSlider.value) / 100;
  const c = (+E.contrastSlider.value)   / 100;
  const sat = (+E.saturationSlider.value) / 100;
  if (b !== 0) obj.filters.push(new fabric.Image.filters.Brightness({ brightness: b }));
  if (c !== 0) obj.filters.push(new fabric.Image.filters.Contrast({ contrast: c }));
  if (sat !== 0) obj.filters.push(new fabric.Image.filters.Saturation({ saturation: sat }));
}

function reapplyAdjustments() {
  const obj = S.canvas.getActiveObject();
  if (!obj || obj.type !== 'image') return;
  // Re-apply current filter + adjustments
  const fd = FILTER_DEFS.find(f => f.id === S.activeFilter) || FILTER_DEFS[0];
  obj.filters = fd.make();
  addAdjustmentFilters(obj);
  obj.applyFilters();
  S.canvas.renderAll();
}

// ── Position alignment ────────────────────────────────────────────────────────

function alignObject(type) {
  const obj = S.canvas.getActiveObject();
  if (!obj) return;
  const w = CFG.canvasW, h = CFG.canvasH;
  const br = obj.getBoundingRect(true);

  switch (type) {
    case 'left':    obj.set({ left: obj.left - br.left }); break;
    case 'right':   obj.set({ left: obj.left + (w - br.left - br.width) }); break;
    case 'centerH': obj.set({ left: w / 2 - br.width / 2 + (obj.left - br.left) }); break;
    case 'top':     obj.set({ top:  obj.top  - br.top }); break;
    case 'bottom':  obj.set({ top:  obj.top  + (h - br.top - br.height) }); break;
    case 'centerV': obj.set({ top:  h / 2 - br.height / 2 + (obj.top - br.top) }); break;
    case 'center':
      obj.set({
        left: w / 2 - br.width / 2 + (obj.left - br.left),
        top:  h / 2 - br.height / 2 + (obj.top  - br.top),
      });
      break;
  }
  S.canvas.renderAll();
  S.canvas.fire('object:modified');
}

// ── QR Code ───────────────────────────────────────────────────────────────────

function generateQRPreview() {
  const text = E.qrInput.value.trim();
  if (!text) return;
  E.qrPreview.innerHTML = '';
  const div = document.createElement('div');
  E.qrPreview.appendChild(div);
  try {
    S.qrCanvas = new QRCode(div, {
      text, width: 160, height: 160,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  } catch (_) {}
}

function addQRToCanvas() {
  const text = E.qrInput.value.trim();
  if (!text) { showStatus('URL veya metin girin.'); return; }

  const canvas = E.qrPreview.querySelector('canvas');
  if (!canvas) { showStatus('Önce QR kodu oluşturun.'); return; }

  const dataUrl = canvas.toDataURL('image/png');
  placeImageOnCanvas(dataUrl);
  closeModal(E.qrModal);
}

// ── Price ─────────────────────────────────────────────────────────────────────

function parseVariantPrice(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v > 999 ? v / 100 : v;
  const n = +String(v).replace(',', '.');
  if (!Number.isFinite(n)) return 0;
  return n > 999 ? n / 100 : n;
}

function variantOptions(v) {
  return Array.isArray(v.options) ? v.options : [v.option1, v.option2, v.option3].filter(Boolean);
}

function normalizeOption(v) {
  return String(v || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function detectSize(opts) {
  const known = ['XXL', 'XL', 'L', 'M', 'S', 'XS'];
  for (const opt of opts) {
    const u = String(opt || '').trim().toUpperCase();
    if (known.includes(u)) return u;
  }
  return '';
}

function detectPrintMode(opts) {
  const text = normalizeOption(opts.join(' / '));
  const hasFront = text.includes('ön') || text.includes('on') || text.includes('front');
  const hasBack = text.includes('arka') || text.includes('back');
  if (hasFront && hasBack) return 'double';
  if (hasBack) return 'back';
  if (hasFront) return 'front';
  return '';
}

function updatePrice() {
  const mode = getPrintMode();
  const vid = getVariantId(mode);
  const price = (vid && CFG.variantPrices[vid]) || CFG.prices[mode] || CFG.prices.front;
  E.priceLabel.textContent     = price ? fmtCur(price) : '';
  E.printModeLabel.textContent = getModeLabel(mode);
}

function getPrintMode() {
  const fCount = objCount('front'), bCount = objCount('back');
  if (fCount && bCount) return 'double';
  if (bCount)           return 'back';
  return 'front';
}

function objCount(view) {
  if (view === curView()) return S.canvas.getObjects().length;
  const saved = S.saved[view];
  return (saved?.objects || []).length;
}

function getModeLabel(m) {
  if (m === 'double') return 'Ön + Arka Baskı';
  if (m === 'back')   return 'Arka Baskı';
  return 'Tek Taraf (Ön)';
}

function getVariantId(mode) {
  const sz = E.sizeSelect?.value || 'M';
  return (CFG.variantMap[sz] || {})[mode] || (CFG.variantMap[sz] || {})['front'] || '';
}

function fmtCur(v) {
  return new Intl.NumberFormat(CFG.locale, { style:'currency', currency:CFG.currency, maximumFractionDigits:0 }).format(v);
}

// ── Cart ──────────────────────────────────────────────────────────────────────

async function addToCart() {
  S.saved[curView()] = S.canvas.toJSON();
  if (!objCount('front') && !objCount('back')) { showStatus('Tasarım ekleyin.'); return; }
  const mode = getPrintMode(), varId = getVariantId(mode);
  if (!varId) { showStatus('Variant ID tanımlı değil.'); return; }

  E.addToCartBtn.disabled    = true;
  E.addToCartBtn.textContent = 'Hazırlanıyor…';

  try {
    const [fu, bu] = await Promise.all([genUpload('front'), genUpload('back')]);
    const qty = Math.max(1, +E.quantityInput.value || 1);
    const res = await fetch('/cart/add.js', {
      method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ items:[{ id:String(varId), quantity:qty, properties:{
        'Baskı Tipi': getModeLabel(mode),
        'Beden':      E.sizeSelect.value,
        'Tişört Rengi': S.shirtColor,
        'Ön Önizleme':  fu || '-',
        'Arka Önizleme': bu || '-',
      }}]}),
    });
    if (!res.ok) { const e = await res.json().catch(()=>{}); throw new Error(e?.description || 'Hata'); }
    window.location.href = '/cart';
  } catch (err) {
    showStatus(err.message || 'Sepete ekleme hatası.');
    E.addToCartBtn.disabled    = false;
    E.addToCartBtn.textContent = 'Sepete Ekle';
  }
}

async function genUpload(view) {
  const json = view === curView() ? S.canvas.toJSON() : S.saved[view];
  if (!json || !(json.objects||[]).length) return '';
  const url = await new Promise(res => {
    const el = document.createElement('canvas');
    const t  = new fabric.Canvas(el, { width:CFG.canvasW, height:CFG.canvasH });
    t.loadFromJSON(json, () => { t.renderAll(); res(t.toDataURL({multiplier:5,format:'png'})); t.dispose(); });
  });
  if (!url || !CFG.uploadEndpoint) return '';
  try {
    const blob = await (await fetch(url)).blob();
    const fd = new FormData(); fd.append('side',`${view}-preview`); fd.append('image',blob,`${view}-preview.png`);
    const r = await fetch(CFG.uploadEndpoint,{method:'POST',body:fd});
    return (await r.json()).url || '';
  } catch (_) { return ''; }
}

// ── Status ────────────────────────────────────────────────────────────────────

let statusTimer = null;
function showStatus(msg) {
  E.statusMsg.textContent = msg;
  E.statusMsg.classList.add('visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => E.statusMsg.classList.remove('visible'), 3500);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(modal) { modal.style.display = 'flex'; }
function closeModal(modal){ modal.style.display = 'none'; }

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {

  // Nav buttons
  document.querySelectorAll('.fpd-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTool(btn.dataset.tool));
  });

  // Image uploads
  E.imageInput.addEventListener('change', e => { handleFiles(e.target.files); e.target.value=''; });
  E.dropZone.querySelector('.fp-browse').addEventListener('click', e => { e.preventDefault(); E.imageInput.click(); });
  E.dropZone.addEventListener('dragover',  e => { e.preventDefault(); E.dropZone.classList.add('drag-over'); });
  E.dropZone.addEventListener('dragleave', ()  => E.dropZone.classList.remove('drag-over'));
  E.dropZone.addEventListener('drop', e => {
    e.preventDefault(); E.dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  // Text
  E.addTextBtn.addEventListener('click', addText);
  E.addTextInput.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') addText(); });
  E.textSize.addEventListener('input', e => { E.textSizeVal.textContent = e.target.value; });
  E.boldBtn.addEventListener('click',      () => E.boldBtn.classList.toggle('active'));
  E.italicBtn.addEventListener('click',    () => E.italicBtn.classList.toggle('active'));
  E.underlineBtn.addEventListener('click', () => E.underlineBtn.classList.toggle('active'));

  // Saved designs
  E.saveDesignBtn.addEventListener('click', saveCurrentDesign);

  // Toolbar: undo/redo/delete/zoom/reset
  E.undoBtn.addEventListener('click', undo);
  E.redoBtn.addEventListener('click', redo);
  E.deleteBtn.addEventListener('click', deleteSelected);
  E.zoomInBtn.addEventListener('click',  () => applyZoom(0.1));
  E.zoomOutBtn.addEventListener('click', () => applyZoom(-0.1));
  E.resetBtn.addEventListener('click', () => {
    S.canvas.clear(); S.canvas.renderAll(); hideAllPopups();
    S.history[curView()] = []; S.redo[curView()] = []; pushHistory();
    updatePrice();
  });

  // View navigation
  E.prevViewBtn.addEventListener('click', () => switchView((S.viewIdx - 1 + CFG.views.length) % CFG.views.length));
  E.nextViewBtn.addEventListener('click', () => switchView((S.viewIdx + 1) % CFG.views.length));

  // Cart
  E.addToCartBtn.addEventListener('click', addToCart);

  // Floating toolbar actions
  document.querySelectorAll('.ftb-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'removebg') { removeBackground(); return; }
      const popMap = { transform: E.popTransform, position: E.popPosition, advanced: E.popAdvanced };
      const pop = popMap[action];
      if (!pop) return;
      if (pop.style.display === 'block') { hideAllPopups(); return; }
      if (action === 'advanced') renderFilterPreviews();
      showPopup(pop);
    });
  });

  E.ftbClose.addEventListener('click', () => {
    S.canvas.discardActiveObject().renderAll();
    E.floatTb.style.display = 'none';
    hideAllPopups();
  });

  // Transform popup
  E.angleSlider.addEventListener('input', e => {
    E.angleVal.textContent = e.target.value;
    const obj = S.canvas.getActiveObject();
    if (obj) { obj.set('angle', +e.target.value); S.canvas.renderAll(); }
  });
  E.angleSlider.addEventListener('change', () => S.canvas.fire('object:modified'));

  E.opacitySlider.addEventListener('input', e => {
    E.opacityVal.textContent = e.target.value;
    const obj = S.canvas.getActiveObject();
    if (obj) { obj.set('opacity', +e.target.value / 100); S.canvas.renderAll(); }
  });
  E.opacitySlider.addEventListener('change', () => S.canvas.fire('object:modified'));

  E.flipXBtn.addEventListener('click', () => { const o=S.canvas.getActiveObject(); if(o){ o.set('flipX',!o.flipX); S.canvas.renderAll(); S.canvas.fire('object:modified'); }});
  E.flipYBtn.addEventListener('click', () => { const o=S.canvas.getActiveObject(); if(o){ o.set('flipY',!o.flipY); S.canvas.renderAll(); S.canvas.fire('object:modified'); }});
  E.rotateCWBtn.addEventListener('click',  () => { const o=S.canvas.getActiveObject(); if(o){ o.set('angle',(o.angle||0)+90); S.canvas.renderAll(); S.canvas.fire('object:modified'); }});
  E.rotateCCWBtn.addEventListener('click', () => { const o=S.canvas.getActiveObject(); if(o){ o.set('angle',(o.angle||0)-90); S.canvas.renderAll(); S.canvas.fire('object:modified'); }});

  // Position popup
  document.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', () => alignObject(btn.dataset.align));
  });
  E.bringFwdBtn.addEventListener('click', () => { const o=S.canvas.getActiveObject(); if(o) S.canvas.bringForward(o).renderAll(); });
  E.sendBkBtn.addEventListener('click',   () => { const o=S.canvas.getActiveObject(); if(o) S.canvas.sendBackwards(o).renderAll(); });

  // Advanced Editing sliders
  [
    [E.brightnessSlider, E.brightnessVal],
    [E.contrastSlider,   E.contrastVal],
    [E.saturationSlider, E.saturationVal],
  ].forEach(([slider, lbl]) => {
    slider.addEventListener('input',  e => { lbl.textContent = e.target.value; reapplyAdjustments(); });
    slider.addEventListener('change', ()  => S.canvas.fire('object:modified'));
  });

  // QR
  E.qrBtn.addEventListener('click',      () => { generateQRPreview(); openModal(E.qrModal); });
  E.qrModalClose.addEventListener('click',() => closeModal(E.qrModal));
  E.qrInput.addEventListener('input',    generateQRPreview);
  E.qrAddBtn.addEventListener('click',   addQRToCanvas);
  E.qrModal.addEventListener('click',    e => { if (e.target === E.qrModal) closeModal(E.qrModal); });

  // Info
  E.infoBtn.addEventListener('click',        () => openModal(E.infoModal));
  E.infoModalClose.addEventListener('click', () => closeModal(E.infoModal));
  E.infoModal.addEventListener('click',      e => { if (e.target === E.infoModal) closeModal(E.infoModal); });

  // Close popups on outside click
  document.addEventListener('pointerdown', e => {
    if (S.activePopup && !S.activePopup.contains(e.target) && !E.floatTb.contains(e.target)) {
      hideAllPopups();
    }
  });

  // Reposition floating toolbar on canvas object move
  S.canvas.on('object:moving', positionFloatTb);
  S.canvas.on('object:scaling', positionFloatTb);
  S.canvas.on('object:rotating', positionFloatTb);

  // Keyboard
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const editing = S.canvas.getActiveObject()?.isEditing;
    if (!typing && !editing) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    }
    if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey||e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) { e.preventDefault(); redo(); }
    if ((e.ctrlKey||e.metaKey) && e.key === '+') { e.preventDefault(); applyZoom(0.1); }
    if ((e.ctrlKey||e.metaKey) && e.key === '-') { e.preventDefault(); applyZoom(-0.1); }
    if (e.key === 'Escape') { hideAllPopups(); S.canvas.discardActiveObject().renderAll(); }
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
