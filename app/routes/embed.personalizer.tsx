import { type LoaderFunctionArgs } from "@remix-run/node";
import { getPersonalizerTemplateByProduct, getPersonalizerTemplatePublic, listPersonalizerFrames } from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId") ?? "";
  const productId  = url.searchParams.get("productId") ?? "";
  const variantId  = url.searchParams.get("variantId") ?? "";
  const shop       = url.searchParams.get("shop") ?? "";
  const locale     = url.searchParams.get("locale") ?? "tr";
  const normalizedLocale = locale.toLowerCase().startsWith("en") ? "en" : "tr";
  const isTr = normalizedLocale === "tr";

  const t = {
    title: isTr ? "Kişiselleştir" : "Personalize",
    uploadPhoto: isTr ? "Fotoğraf Yükle" : "Upload Photo",
    uploadHint: isTr ? "JPG veya PNG, max 10MB" : "JPG or PNG, max 10MB",
    preview: isTr ? "Önizle" : "Preview",
    loading: isTr ? "İşleniyor..." : "Processing...",
    addToCart: isTr ? "Sepete Ekle" : "Add to Cart",
    addingToCart: isTr ? "Ekleniyor..." : "Adding...",
    back: isTr ? "Geri" : "Back",
    previewNote: isTr ? "Yapay zeka dönüşümü birkaç saniye sürebilir." : "AI transformation may take a few seconds.",
    error: isTr ? "Hata oluştu. Lütfen tekrar deneyin." : "An error occurred. Please try again.",
    notFound: isTr ? "Şablon bulunamadı veya aktif değil." : "Template was not found or is not active.",
    previewPlaceholder: isTr ? "Fotoğrafı yükleyip önizleme alınca tüm çerçeveler burada görünecek." : "Upload a photo and preview to see all frames here.",
    previewEmpty: isTr ? "Önizleme burada görünecek." : "Preview will appear here.",
    photoRequired: isTr ? "Lütfen bir fotoğraf yükleyin." : "Please upload a photo.",
    addedToCart: isTr ? "Sepete Eklendi" : "Added to Cart",
    done: isTr ? "Tamamlandı" : "Done",
    frame: isTr ? "Çerçeve" : "Frame",
    previous: isTr ? "Önceki" : "Previous",
    next: isTr ? "Sonraki" : "Next",
  };

  const escapeHtml = (value: string) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const localizeDescription = (value: string) => {
    if (isTr) return value;
    if (value.includes("Müşteri tek fotoğraf")) {
      return "Customers enter one photo and text; all frame options are previewed at the same time.";
    }
    return value;
  };

  const localizeFrameName = (value: string) => {
    if (isTr) return value;
    return String(value || "")
      .replace(/Çerçeve/g, "Frame")
      .replace(/çerçeve/g, "frame")
      .replace(/Ekran Resmi/g, "Screenshot");
  };

  const localizeTextField = <T extends { id: string; label: string; placeholder: string }>(field: T): T => {
    if (isTr) return field;
    if (field.id === "name") {
      return { ...field, label: "Names", placeholder: "Enter names" };
    }
    if (field.id === "note") {
      return { ...field, label: "Short Text", placeholder: "Enter your short text" };
    }
    return field;
  };

  const template = templateId
    ? await getPersonalizerTemplatePublic(templateId)
    : shop && productId
      ? await getPersonalizerTemplateByProduct(shop, productId)
      : null;
  if (!template) {
    return new Response(t.notFound, { status: 404 });
  }

  const resolvedTemplateId = template.id;
  const frames = await listPersonalizerFrames(resolvedTemplateId);

  const appUrl = process.env.SHOPIFY_APP_URL ?? url.origin;
  const hasVariant = Boolean(variantId && variantId !== "VARIANT_ID" && variantId !== "undefined" && variantId !== "null");

  const textFieldsJson = JSON.stringify(template.text_fields.map(localizeTextField));
  const framesJson = JSON.stringify(frames.map(f => ({
    id: f.id,
    name: localizeFrameName(f.name),
    mockup_url: f.mockup_url,
    text_fields: (f.text_fields ?? []).map(localizeTextField),
  })));
  const allTextFields = new Map<string, (typeof template.text_fields)[number]>();
  for (const field of template.text_fields.map(localizeTextField)) allTextFields.set(field.id, field);
  for (const frame of frames) {
    for (const field of frame.text_fields ?? []) {
      if (!allTextFields.has(field.id)) allTextFields.set(field.id, localizeTextField(field));
    }
  }
  const allTextFieldsJson = JSON.stringify([...allTextFields.values()]);
  const hasFrames = frames.length > 0;
  const templateDescription = localizeDescription(template.description);

  const html = `<!DOCTYPE html>
<html lang="${normalizedLocale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${t.title} — ${template.name}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f6f7f8;color:#111827;min-height:100vh}
    .container{max-width:1120px;margin:0 auto;padding:16px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .subtitle{font-size:13px;color:#6b7280;margin-bottom:20px}
    .product-shell{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr);gap:20px;align-items:start}
    .media-panel,.controls-panel{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px}
    .media-panel{position:sticky;top:12px}
    .live-preview{width:100%;aspect-ratio:1;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
    .live-preview img{width:100%;height:100%;object-fit:contain;display:block}
    .preview-placeholder{font-size:13px;color:#6b7280;text-align:center;padding:20px}
    .slide-title{position:absolute;left:12px;right:12px;bottom:12px;background:rgba(17,24,39,.78);color:#fff;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .slide-btn{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:999px;border:1px solid rgba(17,24,39,.18);background:rgba(255,255,255,.92);color:#111827;font-size:22px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .slide-btn:hover{background:#fff}
    .slide-btn.prev{left:10px}
    .slide-btn.next{right:10px}
    .thumb-strip{display:flex;gap:10px;margin-top:12px;overflow-x:auto;padding-bottom:4px}
    .thumb-card{border:2px solid transparent;border-radius:8px;overflow:hidden;background:#fff;min-width:92px;cursor:pointer}
    .thumb-card.active{border-color:#6366f1}
    .thumb-card img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
    .thumb-card span{display:block;font-size:11px;font-weight:600;color:#4b5563;padding:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mobile-title{display:none}
    .desktop-title{display:block}
    .label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    input[type=text]{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;outline:none}
    input[type=text]:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
    .upload-zone{border:2px dashed #d1d5db;border-radius:12px;padding:28px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s}
    .upload-zone:hover,.upload-zone.drag{border-color:#6366f1;background:#f0f0ff}
    .upload-zone p{color:#6b7280;font-size:14px;margin-top:8px}
    .upload-zone .icon{font-size:36px}
    .thumb{width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid #e5e7eb;margin-top:8px}
    .btn{display:block;width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:opacity .2s}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .btn-primary{background:#6366f1;color:#fff}
    .btn-primary:hover:not(:disabled){background:#4f46e5}
    .btn-secondary{background:#f3f4f6;color:#374151;margin-bottom:10px}
    .btn-success{background:#059669;color:#fff}
    .btn-success:hover:not(:disabled){background:#047857}
    .preview-img{width:100%;border-radius:12px;border:1px solid #e5e7eb}
    .error-msg{background:#fef2f2;color:#dc2626;border-radius:8px;padding:12px;font-size:13px;margin-bottom:12px}
    .note{font-size:12px;color:#6b7280;margin-top:8px;text-align:center}
    .spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:8px}
    @keyframes spin{to{transform:rotate(360deg)}}
    .field-row{margin-bottom:14px}
    .char-count{font-size:11px;color:#9ca3af;text-align:right;margin-top:3px}
    [hidden]{display:none!important}

    @media(max-width:820px){
      .container{padding:10px}
      .product-shell{grid-template-columns:1fr;gap:12px}
      .media-panel{position:static}
      .controls-panel{padding:16px}
      .desktop-title{display:none}
      .mobile-title{display:block}
    }
  </style>
</head>
<body>
<div class="container">
  <div class="product-shell">
    <div class="mobile-title">
      <h1>${escapeHtml(template.name)}</h1>
      ${templateDescription ? `<p class="subtitle">${escapeHtml(templateDescription)}</p>` : ""}
    </div>
    <div class="media-panel">
      <div id="liveFramePreview" class="live-preview">
        <div class="preview-placeholder">${t.previewPlaceholder}</div>
      </div>
      <div class="thumb-strip" id="frameThumbs"></div>
    </div>
    <div class="controls-panel">
      <div class="desktop-title">
        <h1>${escapeHtml(template.name)}</h1>
        ${templateDescription ? `<p class="subtitle">${escapeHtml(templateDescription)}</p>` : ""}
      </div>

    <!-- Step 1: Photo + Text -->
    <div id="step1">
      <div class="field-row">
        <label class="label">${t.uploadPhoto}</label>
        <div class="upload-zone" id="uploadZone" onclick="document.getElementById('photoInput').click()">
          <div class="icon">📷</div>
          <p id="uploadLabel">${t.uploadHint}</p>
          <img id="photoThumb" class="thumb" hidden />
        </div>
        <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp" hidden />
      </div>

      <div id="textFieldsContainer"></div>

      <div id="errorMsg1" class="error-msg" hidden></div>

      <button class="btn btn-primary" id="previewBtn" onclick="doPreview()">
        ${t.preview}
      </button>
      <p class="note">${t.previewNote}</p>
    </div>

    <!-- Step 2: Preview + Add to Cart -->
    <div id="step2" hidden>
      <div id="errorMsg2" class="error-msg" hidden></div>
      <div style="height:14px"></div>
      <button class="btn btn-secondary" onclick="goBack()">${t.back}</button>
      ${hasVariant ? `<button class="btn btn-success" id="addToCartBtn" onclick="doAddToCart()">${t.addToCart}</button>` : ""}
    </div>
  </div>
  </div>
</div>

<script>
(function() {
  var APP_URL = ${JSON.stringify(appUrl)};
  var TEMPLATE_ID = ${JSON.stringify(resolvedTemplateId)};
  var VARIANT_ID = ${JSON.stringify(variantId)};
  var SHOP = ${JSON.stringify(shop)};
  var LOCALE = ${JSON.stringify(normalizedLocale)};
  var TEMPLATE_TEXT_FIELDS = ${textFieldsJson};
  var ALL_TEXT_FIELDS = ${allTextFieldsJson};
  var FRAMES = ${framesJson};
  var HAS_FRAMES = ${hasFrames ? "true" : "false"};

  var photoFile = null;
  var transformedPhotoUrl = null;
  var activeTextFields = ALL_TEXT_FIELDS.length ? ALL_TEXT_FIELDS : TEMPLATE_TEXT_FIELDS;
  var galleryItems = [];
  var galleryIndex = 0;

  renderInitialFrameGrid();

  // ── Build text input fields ──────────────────────────────────────────────
  function getActiveTextFields() {
    return ALL_TEXT_FIELDS.length ? ALL_TEXT_FIELDS : TEMPLATE_TEXT_FIELDS;
  }

  function renderTextFields() {
    activeTextFields = getActiveTextFields();
    var container = document.getElementById('textFieldsContainer');
    container.innerHTML = '';
    activeTextFields.forEach(function(f) {
      var div = document.createElement('div');
      div.className = 'field-row';
      div.innerHTML =
        '<label class="label" for="tf_' + f.id + '">' + escHtml(f.label) + '</label>' +
        '<input type="text" id="tf_' + f.id + '" placeholder="' + escHtml(f.placeholder || '') + '" maxlength="' + (f.max_length || 40) + '" oninput="updateCharCount(this,' + (f.max_length || 40) + ')">' +
        '<div class="char-count" id="cc_' + f.id + '">0 / ' + (f.max_length || 40) + '</div>';
      container.appendChild(div);
    });
  }
  renderTextFields();

  // ── Photo upload ─────────────────────────────────────────────────────────
  var input = document.getElementById('photoInput');
  input.addEventListener('change', function() {
    if (input.files && input.files[0]) {
      photoFile = input.files[0];
      var thumb = document.getElementById('photoThumb');
      thumb.src = URL.createObjectURL(photoFile);
      thumb.hidden = false;
      document.getElementById('uploadLabel').textContent = photoFile.name;
    }
  });

  var zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('drag');
    if (e.dataTransfer.files[0]) {
      photoFile = e.dataTransfer.files[0];
      var thumb = document.getElementById('photoThumb');
      thumb.src = URL.createObjectURL(photoFile);
      thumb.hidden = false;
      document.getElementById('uploadLabel').textContent = photoFile.name;
    }
  });

  window.updateCharCount = function(el, max) {
    var cc = document.getElementById('cc_' + el.id.replace('tf_', ''));
    if (cc) cc.textContent = el.value.length + ' / ' + max;
  };

  window.doPreview = function() {
    var errEl = document.getElementById('errorMsg1');
    errEl.hidden = true;

    if (!photoFile) {
      errEl.textContent = ${JSON.stringify(t.photoRequired)};
      errEl.hidden = false;
      return;
    }

    var textValues = {};
    activeTextFields = getActiveTextFields();
    activeTextFields.forEach(function(f) {
      var el = document.getElementById('tf_' + f.id);
      textValues[f.id] = el ? el.value.trim() : '';
    });

    var btn = document.getElementById('previewBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>${t.loading}';

    var fd = new FormData();
    fd.append('templateId', TEMPLATE_ID);
    fd.append('locale', LOCALE);
    fd.append('photo', photoFile);
    fd.append('textValues', JSON.stringify(textValues));

    fetch(APP_URL + '/api/personalizer/preview', { method: 'POST', body: fd })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        btn.disabled = false;
        btn.innerHTML = ${JSON.stringify(t.preview)};
        if (data.error) {
          errEl.textContent = data.error;
          errEl.hidden = false;
          return;
        }
        transformedPhotoUrl = data.transformedPhotoUrl;
        window._previewTextValues = textValues;
        window._previewItems = data.previews || (data.previewUrl ? [{ frameId: data.frameId || null, previewUrl: data.previewUrl }] : []);
        renderPreviewGrid(window._previewItems);
        document.getElementById('step1').hidden = true;
        document.getElementById('step2').hidden = false;
      })
      .catch(function() {
        btn.disabled = false;
        btn.innerHTML = ${JSON.stringify(t.preview)};
        errEl.textContent = ${JSON.stringify(t.error)};
        errEl.hidden = false;
      });
  };

  window.goBack = function() {
    document.getElementById('step1').hidden = false;
    document.getElementById('step2').hidden = true;
  };

  window.doAddToCart = function() {
    var errEl = document.getElementById('errorMsg2');
    errEl.hidden = true;
    var btn = document.getElementById('addToCartBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>${t.addingToCart}';

    var body = {
      templateId: TEMPLATE_ID,
      locale: LOCALE,
      transformedPhotoUrl: transformedPhotoUrl,
      textValues: window._previewTextValues || {},
    };

    fetch(APP_URL + '/api/personalizer/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          errEl.textContent = data.error;
          errEl.hidden = false;
          btn.disabled = false;
          btn.innerHTML = ${JSON.stringify(t.addToCart)};
          return;
        }

        var designToken = data.designToken;
        var textValues = window._previewTextValues || {};
        var properties = {};
        activeTextFields = getActiveTextFields();
        activeTextFields.forEach(function(f) {
          if (textValues[f.id]) properties[f.label] = textValues[f.id];
        });
        properties['_personalizer_template'] = TEMPLATE_ID;
        properties['_design_token'] = designToken;
        properties['_print_file'] = data.printUrl;
        if (data.printUrls && data.printUrls.length) {
          properties['_print_files'] = data.printUrls.map(function(p) { return p.printUrl; }).join(',');
        }

        var cartMsg = {
          type: 'PERSONALIZER_ADD_TO_CART',
          variantId: VARIANT_ID,
          quantity: 1,
          designToken: designToken,
          properties: properties,
        };

        if (window.parent !== window) {
          window.parent.postMessage(cartMsg, '*');
          btn.disabled = false;
          btn.innerHTML = '&#10003; ${t.addedToCart}';
          btn.style.background = '#059669';
        } else if (VARIANT_ID && SHOP) {
          fetch(APP_URL + '/api/embed/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop: SHOP, variantId: VARIANT_ID, quantity: 1, designToken: designToken, properties: properties }),
          })
            .then(function(r) { return r.json(); })
            .then(function(cartData) {
              if (cartData.checkoutUrl) {
                window.location.href = cartData.checkoutUrl;
              } else {
                errEl.textContent = cartData.error || ${JSON.stringify(t.error)};
                errEl.hidden = false;
                btn.disabled = false;
                btn.innerHTML = ${JSON.stringify(t.addToCart)};
              }
            })
            .catch(function() {
              errEl.textContent = ${JSON.stringify(t.error)};
              errEl.hidden = false;
              btn.disabled = false;
              btn.innerHTML = ${JSON.stringify(t.addToCart)};
            });
        } else {
          btn.disabled = false;
          btn.innerHTML = '&#10003; ${t.done}';
        }
      })
      .catch(function() {
        errEl.textContent = ${JSON.stringify(t.error)};
        errEl.hidden = false;
        btn.disabled = false;
        btn.innerHTML = ${JSON.stringify(t.addToCart)};
      });
  };

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function updateLivePreview() {
    var box = document.getElementById('liveFramePreview');
    if (!box) return;
    if (FRAMES.length && FRAMES[0].mockup_url) {
      renderPreviewGrid([{ frameId: FRAMES[0].id, frameName: FRAMES[0].name, previewUrl: FRAMES[0].mockup_url }]);
    } else {
      box.innerHTML = '<div class="preview-placeholder">' + ${JSON.stringify(t.previewEmpty)} + '</div>';
      renderFrameThumbs([]);
    }
  }

  function renderFrameThumbs(items) {
    var box = document.getElementById('frameThumbs');
    if (!box) return;
    box.innerHTML = '';
    (items || galleryItems || []).forEach(function(galleryItem, idx) {
      var frame = FRAMES.find(function(f) { return f.id === galleryItem.frameId; });
      var title = (frame && frame.name) || galleryItem.frameName || (${JSON.stringify(t.frame)} + ' ' + (idx + 1));
      var thumb = document.createElement('div');
      thumb.className = 'thumb-card' + (idx === galleryIndex ? ' active' : '');
      thumb.onclick = function() { window.plGoSlide(idx); };
      thumb.innerHTML =
        (galleryItem.previewUrl ? '<img src="' + escHtml(galleryItem.previewUrl) + '" alt="' + escHtml(title) + '">' : '') +
        '<span>' + escHtml(title) + '</span>';
      box.appendChild(thumb);
    });
  }

  function renderPreviewGrid(items) {
    galleryItems = (items || []).filter(function(item) { return item && item.previewUrl; });
    galleryIndex = 0;
    renderCurrentSlide();
  }

  function renderCurrentSlide() {
    var box = document.getElementById('liveFramePreview');
    if (!box) return;
    if (!galleryItems.length) {
      updateLivePreview();
      return;
    }
    if (galleryIndex < 0) galleryIndex = 0;
    if (galleryIndex >= galleryItems.length) galleryIndex = galleryItems.length - 1;
    var item = galleryItems[galleryIndex];
    var frame = FRAMES.find(function(f) { return f.id === item.frameId; });
    var title = (frame && frame.name) || item.frameName || (${JSON.stringify(t.frame)} + ' ' + (galleryIndex + 1));
    var showControls = galleryItems.length > 1;
    box.innerHTML =
      (showControls ? '<button class="slide-btn prev" type="button" aria-label="${t.previous}" onclick="window.plPrevSlide()">‹</button>' : '') +
      '<img src="' + escHtml(item.previewUrl) + '" alt="' + escHtml(title) + '">' +
      '<div class="slide-title">' + escHtml(title) + '</div>' +
      (showControls ? '<button class="slide-btn next" type="button" aria-label="${t.next}" onclick="window.plNextSlide()">›</button>' : '');
    renderFrameThumbs(galleryItems);
  }

  window.plPrevSlide = function() {
    if (!galleryItems.length) return;
    galleryIndex = (galleryIndex - 1 + galleryItems.length) % galleryItems.length;
    renderCurrentSlide();
  };

  window.plNextSlide = function() {
    if (!galleryItems.length) return;
    galleryIndex = (galleryIndex + 1) % galleryItems.length;
    renderCurrentSlide();
  };

  window.plGoSlide = function(idx) {
    if (!galleryItems.length) return;
    galleryIndex = Math.max(0, Math.min(Number(idx) || 0, galleryItems.length - 1));
    renderCurrentSlide();
  }

  function renderInitialFrameGrid() {
    var initialItems = FRAMES
      .filter(function(frame) { return frame.mockup_url; })
      .map(function(frame) {
        return { frameId: frame.id, frameName: frame.name, previewUrl: frame.mockup_url };
      });
    if (initialItems.length) {
      renderPreviewGrid(initialItems);
    } else {
      updateLivePreview();
    }
  }

  // Notify parent page about iframe height changes.
  function notifyHeight() {
    var h = document.documentElement.scrollHeight;
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'PERSONALIZER_RESIZE', height: h }, '*');
    }
  }
  notifyHeight();
  window.addEventListener('resize', notifyHeight);
  var _origGoBack = window.goBack;
  window.goBack = function() { _origGoBack && _origGoBack(); setTimeout(notifyHeight, 100); };
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
};
