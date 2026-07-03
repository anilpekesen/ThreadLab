import { type LoaderFunctionArgs } from "@remix-run/node";
import { getPersonalizerTemplatePublic, listPersonalizerFrames } from "~/models/personalizer.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const templateId = url.searchParams.get("templateId") ?? "";
  const variantId  = url.searchParams.get("variantId") ?? "";
  const shop       = url.searchParams.get("shop") ?? "";
  const locale     = url.searchParams.get("locale") ?? "tr";

  if (!templateId) {
    return new Response("templateId parametresi gerekli.", { status: 400 });
  }

  const template = await getPersonalizerTemplatePublic(templateId);
  if (!template) {
    return new Response("Şablon bulunamadı veya aktif değil.", { status: 404 });
  }

  const frames = await listPersonalizerFrames(templateId);

  const appUrl = process.env.SHOPIFY_APP_URL ?? url.origin;
  const isTr = locale !== "en";
  const hasVariant = Boolean(variantId && variantId !== "VARIANT_ID" && variantId !== "undefined" && variantId !== "null");

  const t = {
    title: isTr ? "Kişiselleştir" : "Personalize",
    uploadPhoto: isTr ? "Fotoğraf Yükle" : "Upload Photo",
    uploadHint: isTr ? "JPG veya PNG, max 10MB" : "JPG or PNG, max 10MB",
    preview: isTr ? "Önizle" : "Preview",
    loading: isTr ? "İşleniyor..." : "Processing...",
    addToCart: isTr ? "Sepete Ekle" : "Add to Cart",
    addingToCart: isTr ? "Ekleniyor..." : "Adding...",
    step1: isTr ? "Fotoğraf & Metin" : "Photo & Text",
    step2: isTr ? "Önizleme" : "Preview",
    back: isTr ? "Geri" : "Back",
    previewNote: isTr ? "Yapay zeka dönüşümü birkaç saniye sürebilir." : "AI transformation may take a few seconds.",
    error: isTr ? "Hata oluştu. Lütfen tekrar deneyin." : "An error occurred. Please try again.",
    chooseFrame: isTr ? "Çerçeve Seçin" : "Choose Frame",
    chooseFrameHint: isTr ? "Beğendiğiniz çerçeye tıklayın" : "Click on a frame you like",
    continue: isTr ? "Devam Et →" : "Continue →",
    selectedFrame: isTr ? "Seçili" : "Selected",
  };

  const textFieldsJson = JSON.stringify(template.text_fields);
  const framesJson = JSON.stringify(frames.map(f => ({
    id: f.id,
    name: f.name,
    mockup_url: f.mockup_url,
    text_fields: f.text_fields ?? [],
  })));
  const allTextFields = new Map<string, (typeof template.text_fields)[number]>();
  for (const field of template.text_fields) allTextFields.set(field.id, field);
  for (const frame of frames) {
    for (const field of frame.text_fields ?? []) {
      if (!allTextFields.has(field.id)) allTextFields.set(field.id, field);
    }
  }
  const allTextFieldsJson = JSON.stringify([...allTextFields.values()]);
  const hasFrames = frames.length > 0;

  const html = `<!DOCTYPE html>
<html lang="${locale}">
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
    .live-preview{width:100%;aspect-ratio:1;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .live-preview img{width:100%;height:100%;object-fit:contain;display:block}
    .preview-placeholder{font-size:13px;color:#6b7280;text-align:center;padding:20px}
    .preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;width:100%;align-self:stretch;padding:12px;overflow:auto}
    .preview-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden}
    .preview-card img{width:100%;aspect-ratio:1;object-fit:contain;background:#f9fafb;display:block}
    .preview-card-title{font-size:12px;font-weight:600;color:#374151;padding:8px 10px;border-top:1px solid #eef0f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .thumb-strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px;margin-top:12px}
    .thumb-card{border:1px solid #d8dde5;border-radius:8px;overflow:hidden;background:#fff}
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
      <h1>${template.name}</h1>
      ${template.description ? `<p class="subtitle">${template.description.replace(/</g, "&lt;")}</p>` : ""}
    </div>
    <div class="media-panel">
      <div id="liveFramePreview" class="live-preview">
        <div class="preview-placeholder">${isTr ? "Fotoğrafı yükleyip önizleme alınca tüm çerçeveler burada görünecek." : "Upload a photo and preview to see all frames here."}</div>
      </div>
      <div class="thumb-strip" id="frameThumbs"></div>
    </div>
    <div class="controls-panel">
      <div class="desktop-title">
        <h1>${template.name}</h1>
        ${template.description ? `<p class="subtitle">${template.description.replace(/</g, "&lt;")}</p>` : ""}
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
  var TEMPLATE_ID = ${JSON.stringify(templateId)};
  var VARIANT_ID = ${JSON.stringify(variantId)};
  var SHOP = ${JSON.stringify(shop)};
  var TEMPLATE_TEXT_FIELDS = ${textFieldsJson};
  var ALL_TEXT_FIELDS = ${allTextFieldsJson};
  var FRAMES = ${framesJson};
  var HAS_FRAMES = ${hasFrames ? "true" : "false"};

  var photoFile = null;
  var transformedPhotoUrl = null;
  var activeTextFields = ALL_TEXT_FIELDS.length ? ALL_TEXT_FIELDS : TEMPLATE_TEXT_FIELDS;

  renderFrameThumbs();
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
      errEl.textContent = ${JSON.stringify(isTr ? "Lütfen bir fotoğraf yükleyin." : "Please upload a photo.")};
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
          btn.innerHTML = '&#10003; ${isTr ? "Sepete Eklendi" : "Added to Cart"}';
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
          btn.innerHTML = '&#10003; Done';
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

  function setLivePreviewImage(src) {
    var box = document.getElementById('liveFramePreview');
    if (!box) return;
    box.innerHTML = '<img src="' + escHtml(src) + '" alt="">';
  }

  function updateLivePreview() {
    var box = document.getElementById('liveFramePreview');
    if (!box) return;
    if (FRAMES.length && FRAMES[0].mockup_url) {
      setLivePreviewImage(FRAMES[0].mockup_url);
    } else {
      box.innerHTML = '<div class="preview-placeholder">' + ${JSON.stringify(isTr ? "Önizleme burada görünecek." : "Preview will appear here.")} + '</div>';
    }
  }

  function renderFrameThumbs() {
    var box = document.getElementById('frameThumbs');
    if (!box) return;
    box.innerHTML = '';
    FRAMES.forEach(function(frame) {
      var item = document.createElement('div');
      item.className = 'thumb-card';
      item.innerHTML =
        (frame.mockup_url ? '<img src="' + escHtml(frame.mockup_url) + '" alt="' + escHtml(frame.name || '') + '">' : '') +
        '<span>' + escHtml(frame.name || '') + '</span>';
      box.appendChild(item);
    });
  }

  function renderPreviewGrid(items) {
    var box = document.getElementById('liveFramePreview');
    if (!box) return;
    var list = items || [];
    if (!list.length) {
      updateLivePreview();
      return;
    }
    box.innerHTML = '<div class="preview-grid"></div>';
    var grid = box.querySelector('.preview-grid');
    list.forEach(function(item, idx) {
      var frame = FRAMES.find(function(f) { return f.id === item.frameId; });
      var title = item.frameName || (frame && frame.name) || (${JSON.stringify(isTr ? "Çerçeve" : "Frame")} + ' ' + (idx + 1));
      var card = document.createElement('div');
      card.className = 'preview-card';
      card.innerHTML =
        '<img src="' + escHtml(item.previewUrl) + '" alt="' + escHtml(title) + '">' +
        '<div class="preview-card-title">' + escHtml(title) + '</div>';
      grid.appendChild(card);
    });
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

  // iframe auto-resize: parent'a yüksekliği bildir
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
