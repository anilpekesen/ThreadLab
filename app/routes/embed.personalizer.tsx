import { type LoaderFunctionArgs } from "@remix-run/node";
import { getPersonalizerTemplatePublic } from "~/models/personalizer.server";

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

  const appUrl = process.env.SHOPIFY_APP_URL ?? url.origin;
  const isTr = locale !== "en";

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
    requiredField: isTr ? "Bu alan zorunludur" : "This field is required",
    previewNote: isTr ? "Yapay zeka dönüşümü birkaç saniye sürebilir." : "AI transformation may take a few seconds.",
    error: isTr ? "Hata oluştu. Lütfen tekrar deneyin." : "An error occurred. Please try again.",
  };

  const textFieldsJson = JSON.stringify(template.text_fields);

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${t.title} — ${template.name}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#111827;min-height:100vh}
    .container{max-width:540px;margin:0 auto;padding:16px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .subtitle{font-size:13px;color:#6b7280;margin-bottom:20px}
    .card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);margin-bottom:16px}
    .label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
    input[type=text],input[type=email],textarea{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;outline:none}
    input[type=text]:focus,textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
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
  </style>
</head>
<body>
<div class="container">
  <div class="card">
    <h1>${template.name}</h1>
    ${template.description ? `<p class="subtitle">${template.description.replace(/</g, "&lt;")}</p>` : ""}

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

      <button class="btn btn-primary" id="previewBtn" onclick="doPreview()" ${!variantId ? "" : ""}>
        ${t.preview}
      </button>
      <p class="note">${t.previewNote}</p>
    </div>

    <!-- Step 2: Preview + Add to Cart -->
    <div id="step2" hidden>
      <div id="errorMsg2" class="error-msg" hidden></div>
      <img id="previewImg" class="preview-img" />
      <div style="height:14px"></div>
      <button class="btn btn-secondary" onclick="goBack()">${t.back}</button>
      ${variantId ? `<button class="btn btn-success" id="addToCartBtn" onclick="doAddToCart()">${t.addToCart}</button>` : ""}
    </div>
  </div>
</div>

<script>
(function() {
  var APP_URL = ${JSON.stringify(appUrl)};
  var TEMPLATE_ID = ${JSON.stringify(templateId)};
  var VARIANT_ID = ${JSON.stringify(variantId)};
  var SHOP = ${JSON.stringify(shop)};
  var TEXT_FIELDS = ${textFieldsJson};

  var photoFile = null;
  var transformedPhotoUrl = null;
  var state = { step: 1 };

  // Build text input fields
  var container = document.getElementById('textFieldsContainer');
  TEXT_FIELDS.forEach(function(f) {
    var div = document.createElement('div');
    div.className = 'field-row';
    div.innerHTML =
      '<label class="label" for="tf_' + f.id + '">' + escHtml(f.label) + '</label>' +
      '<input type="text" id="tf_' + f.id + '" placeholder="' + escHtml(f.placeholder) + '" maxlength="' + f.max_length + '" oninput="updateCharCount(this,' + f.max_length + ')">' +
      '<div class="char-count" id="cc_' + f.id + '">0 / ' + f.max_length + '</div>';
    container.appendChild(div);
  });

  // Photo upload
  var input = document.getElementById('photoInput');
  input.addEventListener('change', function() {
    if (input.files && input.files[0]) {
      photoFile = input.files[0];
      var thumb = document.getElementById('photoThumb');
      var label = document.getElementById('uploadLabel');
      thumb.src = URL.createObjectURL(photoFile);
      thumb.hidden = false;
      label.textContent = photoFile.name;
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
    TEXT_FIELDS.forEach(function(f) {
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
        document.getElementById('previewImg').src = data.previewUrl;
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
        TEXT_FIELDS.forEach(function(f) {
          if (textValues[f.id]) properties[f.label] = textValues[f.id];
        });
        properties['_personalizer_template'] = TEMPLATE_ID;
        properties['_design_token'] = designToken;
        properties['_print_file'] = data.printUrl;

        // Notify parent window (e.g. tisorts.com) to add to cart
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
          btn.innerHTML = '✓ ${isTr ? "Sepete Eklendi" : "Added to Cart"}';
          btn.style.background = '#059669';
        } else if (VARIANT_ID && SHOP) {
          // Standalone: use embed cart API
          fetch(APP_URL + '/api/embed/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shop: SHOP,
              variantId: VARIANT_ID,
              quantity: 1,
              designToken: designToken,
              properties: properties,
            }),
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
          btn.innerHTML = '✓ Done';
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
