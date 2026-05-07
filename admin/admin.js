// ── State ────────────────────────────────────────────────────────────────────────
const state = {
  section: "dashboard",
  selectedProductId: null,
  selectedProductTitle: "",
  editorProductId: null,
  editorSide: "front",
  printAreas: [],
  selectedAreaId: null,
  drawMode: false,
  drawStart: null,
  drawRect: null,
  dragArea: null,
  dragOffset: null,
};

// ── Init ─────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  loadSection("dashboard");
});

function setupNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadSection(btn.dataset.section);
    });
  });
}

function loadSection(name) {
  state.section = name;
  document.querySelectorAll(".section").forEach((s) => s.classList.add("hidden"));
  document.getElementById(`section-${name}`)?.classList.remove("hidden");

  if (name === "dashboard") loadDashboard();
  if (name === "products") loadProducts();
  if (name === "print-area") initPrintAreaEditor();
  if (name === "orders") loadOrders();
}

// ── Dashboard ────────────────────────────────────────────────────────────────────
async function loadDashboard() {
  document.getElementById("refresh-dashboard").addEventListener("click", loadDashboard, { once: true });
  const data = await api("/api/admin/dashboard");
  if (!data) return;

  document.getElementById("stat-total").textContent = data.total;
  document.getElementById("stat-today").textContent = data.today;
  document.getElementById("stat-pending").textContent = data.pendingProduction;

  const topEl = document.getElementById("top-products-list");
  if (data.topProducts.length === 0) {
    topEl.innerHTML = `<div class="empty-state small"><p>No orders yet</p></div>`;
  } else {
    topEl.innerHTML = `<div class="mini-list">${
      data.topProducts.map((p) => `<div class="mini-list-item"><span class="label">${esc(p.name)}</span><span class="count">${p.count}</span></div>`).join("")
    }</div>`;
  }

  const recentEl = document.getElementById("recent-orders-list");
  if (data.recentOrders.length === 0) {
    recentEl.innerHTML = `<div class="empty-state small"><p>No orders yet</p></div>`;
  } else {
    recentEl.innerHTML = `<div class="mini-list">${
      data.recentOrders.map((o) => `
        <div class="mini-order-item">
          <span class="mini-order-number">${esc(o.orderNumber)}</span>
          <div class="mini-order-info">
            <div class="product">${esc(o.productName)}</div>
            <div class="customer">${esc(o.customerName)}</div>
          </div>
          ${statusBadge(o.productionStatus)}
        </div>`).join("")
    }</div>`;
  }
}

// ── Products ─────────────────────────────────────────────────────────────────────
async function loadProducts() {
  const products = await api("/api/admin/products");
  if (!products) return;

  const listEl = document.getElementById("product-list");
  listEl.innerHTML = products.map((p) => `
    <div class="product-item ${p.id === state.selectedProductId ? "selected" : ""}" data-id="${esc(p.id)}" data-title="${esc(p.title)}">
      <div class="product-item-info">
        <h3>${esc(p.title)}</h3>
        <span>${esc(p.handle || "")} · ${esc(p.productType || "apparel")} · ${p.variants} variant${p.variants !== 1 ? "s" : ""}</span>
      </div>
      <span class="status-badge ${p.isActive ? "active" : "inactive"}">${p.isActive ? "Active" : "Off"}</span>
    </div>`).join("");

  listEl.querySelectorAll(".product-item").forEach((item) => {
    item.addEventListener("click", () => {
      state.selectedProductId = item.dataset.id;
      state.selectedProductTitle = item.dataset.title;
      listEl.querySelectorAll(".product-item").forEach((i) => i.classList.remove("selected"));
      item.classList.add("selected");
      loadProductSettings(item.dataset.id, item.dataset.title);
    });
  });

  if (state.selectedProductId) {
    loadProductSettings(state.selectedProductId, state.selectedProductTitle);
  }
}

async function loadProductSettings(productId, title) {
  const settings = await api(`/api/admin/products/${productId}/personalization`);
  if (!settings) return;

  const card = document.getElementById("product-settings-card");
  card.innerHTML = `
    <h2 class="card-title">${esc(title)}</h2>
    <div class="settings-form">
      <div class="form-section">
        <div class="form-section-title">Catalog</div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Product Handle</label>
            <input type="text" id="s-product-handle" value="${escAttr(settings.productHandle || "")}" placeholder="tisort">
          </div>
          <div class="form-group">
            <label>Product Type</label>
            <select id="s-product-type">
              ${[
                ["apparel", "Apparel"],
                ["bag", "Bag"],
                ["mug", "Mug"],
              ].map(([value, label]) => `<option value="${value}" ${settings.productType === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Surface Mode</label>
          <select id="s-surface-mode">
            <option value="front_back" ${settings.surfaceMode === "front_back" ? "selected" : ""}>Front + Back</option>
            <option value="front_only" ${settings.surfaceMode === "front_only" ? "selected" : ""}>Front Only</option>
          </select>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">General</div>
        <div class="toggle-row">
          <div><label>Personalization Active</label><span class="sublabel">Enable customers to personalize this product</span></div>
          <label class="toggle"><input type="checkbox" id="s-active" ${settings.isActive ? "checked" : ""}><span class="toggle-track"></span></label>
        </div>
        <div class="toggle-row">
          <div><label>Image Upload</label><span class="sublabel">Allow customers to upload images</span></div>
          <label class="toggle"><input type="checkbox" id="s-image-upload" ${settings.imageUpload ? "checked" : ""}><span class="toggle-track"></span></label>
        </div>
        <div class="toggle-row">
          <div><label>Text Addition</label><span class="sublabel">Allow customers to add text</span></div>
          <label class="toggle"><input type="checkbox" id="s-text-upload" ${settings.textUpload ? "checked" : ""}><span class="toggle-track"></span></label>
        </div>
        <div class="toggle-row">
          <div><label>Require Preview Approval</label><span class="sublabel">Customer must confirm design before checkout</span></div>
          <label class="toggle"><input type="checkbox" id="s-require-approval" ${settings.requireApproval ? "checked" : ""}><span class="toggle-track"></span></label>
        </div>
        <div class="toggle-row">
          <div><label>Background Removal</label><span class="sublabel">Offer auto background removal option</span></div>
          <label class="toggle"><input type="checkbox" id="s-remove-bg" ${settings.removeBg ? "checked" : ""}><span class="toggle-track"></span></label>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">File Requirements</div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Max File Size (MB)</label>
            <input type="number" id="s-max-size" value="${settings.maxFileSize}" min="1" max="50">
          </div>
          <div class="form-group">
            <label>Min Resolution (px)</label>
            <input type="number" id="s-min-res" value="${settings.minResolution}" min="100" max="10000">
          </div>
        </div>
        <div class="form-group">
          <label>Allowed File Types</label>
          <div class="checkbox-group">
            ${["PNG", "JPG", "SVG", "PDF"].map((t) => `
              <label class="checkbox-item">
                <input type="checkbox" class="allowed-type" value="${t}" ${settings.allowedTypes?.includes(t) ? "checked" : ""}> ${t}
              </label>`).join("")}
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Print Output</div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Print File Format</label>
            <select id="s-print-format">
              ${["PNG", "PDF", "SVG"].map((f) => `<option value="${f}" ${settings.printFormat === f ? "selected" : ""}>${f}</option>`).join("")}
            </select>
          </div>
          <div class="form-group">
            <label>Print DPI</label>
            <input type="number" id="s-dpi" value="${settings.printDpi}" min="72" max="600">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Front Width (cm)</label>
            <input type="number" id="s-front-width" value="${settings.frontPrintWidthCm || 0}" min="1" step="0.1">
          </div>
          <div class="form-group">
            <label>Front Height (cm)</label>
            <input type="number" id="s-front-height" value="${settings.frontPrintHeightCm || 0}" min="1" step="0.1">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label>Back Width (cm)</label>
            <input type="number" id="s-back-width" value="${settings.backPrintWidthCm || 0}" min="1" step="0.1">
          </div>
          <div class="form-group">
            <label>Back Height (cm)</label>
            <input type="number" id="s-back-height" value="${settings.backPrintHeightCm || 0}" min="1" step="0.1">
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Pricing</div>
        <div class="form-group">
          <label>Pricing Bands JSON</label>
          <textarea id="s-pricing-bands" rows="12">${esc(JSON.stringify(settings.pricingBands || { front: [], back: [] }, null, 2))}</textarea>
        </div>
        <div class="form-group">
          <label>Surcharge Variant Map JSON</label>
          <textarea id="s-surcharge-map" rows="8">${esc(JSON.stringify(settings.surchargeVariantMap || { front: {}, back: {} }, null, 2))}</textarea>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
        <button class="btn btn-ghost" id="open-editor-btn">Open Print Area Editor →</button>
      </div>
    </div>`;

  document.getElementById("save-settings-btn").addEventListener("click", () => saveProductSettings(productId));
  document.getElementById("open-editor-btn").addEventListener("click", () => {
    state.editorProductId = productId;
    document.querySelector('.nav-item[data-section="print-area"]').click();
  });
}

async function saveProductSettings(productId) {
  const allowedTypes = [...document.querySelectorAll(".allowed-type:checked")].map((c) => c.value);
  const pricingBands = parseJsonField("s-pricing-bands", "Pricing Bands JSON");
  if (!pricingBands) return;
  const surchargeVariantMap = parseJsonField("s-surcharge-map", "Surcharge Variant Map JSON");
  if (!surchargeVariantMap) return;
  const payload = {
    productHandle: document.getElementById("s-product-handle").value.trim(),
    productType: document.getElementById("s-product-type").value,
    surfaceMode: document.getElementById("s-surface-mode").value,
    isActive: document.getElementById("s-active").checked,
    imageUpload: document.getElementById("s-image-upload").checked,
    textUpload: document.getElementById("s-text-upload").checked,
    requireApproval: document.getElementById("s-require-approval").checked,
    removeBg: document.getElementById("s-remove-bg").checked,
    maxFileSize: Number(document.getElementById("s-max-size").value),
    minResolution: Number(document.getElementById("s-min-res").value),
    allowedTypes,
    printFormat: document.getElementById("s-print-format").value,
    printDpi: Number(document.getElementById("s-dpi").value),
    frontPrintWidthCm: Number(document.getElementById("s-front-width").value),
    frontPrintHeightCm: Number(document.getElementById("s-front-height").value),
    backPrintWidthCm: Number(document.getElementById("s-back-width").value),
    backPrintHeightCm: Number(document.getElementById("s-back-height").value),
    pricingBands,
    surchargeVariantMap,
  };

  const result = await api(`/api/admin/products/${productId}/personalization`, "POST", payload);
  if (result) {
    toast("Settings saved", "success");
    loadProducts();
  }
}

function parseJsonField(id, label) {
  const el = document.getElementById(id);
  if (!el) return null;
  try {
    return JSON.parse(el.value || "{}");
  } catch (err) {
    toast(`${label} geçerli JSON değil`, "error");
    el.focus();
    return null;
  }
}

// ── Print Area Editor ─────────────────────────────────────────────────────────────
async function initPrintAreaEditor() {
  const select = document.getElementById("editor-product-select");
  const products = await api("/api/admin/products");
  if (!products) return;

  select.innerHTML = `<option value="">— Select product —</option>` +
    products.map((p) => `<option value="${esc(p.id)}">${esc(p.title)}</option>`).join("");

  if (state.editorProductId) select.value = state.editorProductId;

  select.onchange = () => {
    state.editorProductId = select.value || null;
    state.selectedAreaId = null;
    loadEditorAreas();
  };

  document.querySelectorAll(".side-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".side-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.editorSide = btn.dataset.side;
      renderCanvas();
      renderAreaList();
    });
  });

  document.getElementById("add-area-btn").addEventListener("click", () => {
    state.drawMode = true;
    state.selectedAreaId = null;
    document.getElementById("area-form-card").style.display = "none";
    renderCanvas();
    renderAreaList();
    const canvas = document.getElementById("print-area-canvas");
    canvas.style.cursor = "crosshair";
    toast("Drag on canvas to draw print area");
  });

  document.getElementById("save-area-btn").addEventListener("click", saveArea);
  document.getElementById("delete-area-btn").addEventListener("click", deleteArea);
  document.getElementById("cancel-area-btn").addEventListener("click", () => {
    state.selectedAreaId = null;
    state.drawMode = false;
    document.getElementById("area-form-card").style.display = "none";
    renderCanvas();
    renderAreaList();
  });

  // Sync form inputs → canvas
  ["area-x", "area-y", "area-width", "area-height", "area-safe-margin", "area-bleed"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      if (state.selectedAreaId || state.drawRect) syncFormToState();
    });
  });

  setupCanvasEvents();
  loadEditorAreas();
}

async function loadEditorAreas() {
  const addBtn = document.getElementById("add-area-btn");
  addBtn.disabled = !state.editorProductId;

  const hint = document.getElementById("canvas-hint");
  if (!state.editorProductId) {
    hint.classList.remove("hidden");
    state.printAreas = [];
    renderCanvas();
    renderAreaList();
    return;
  }
  hint.classList.add("hidden");

  const areas = await api(`/api/admin/print-areas?productId=${state.editorProductId}`);
  state.printAreas = areas || [];
  renderCanvas();
  renderAreaList();
}

function renderAreaList() {
  const list = document.getElementById("print-area-list");
  const filtered = state.printAreas.filter((a) => a.side === state.editorSide);

  document.getElementById("area-count").textContent = state.printAreas.length;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state small"><p>No areas on this side</p></div>`;
    return;
  }

  list.innerHTML = filtered.map((area) => `
    <div class="print-area-item ${area.id === state.selectedAreaId ? "selected" : ""}" data-id="${esc(area.id)}">
      <div class="print-area-item-info">
        <div class="area-name">${esc(area.name)}</div>
        <div class="area-meta">${area.width}×${area.height}px · ${area.realWidthMm}×${area.realHeightMm}mm · ${area.dpi}dpi</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
    </div>`).join("");

  list.querySelectorAll(".print-area-item").forEach((item) => {
    item.addEventListener("click", () => selectArea(item.dataset.id));
  });
}

function selectArea(id) {
  state.selectedAreaId = id;
  state.drawMode = false;
  state.drawRect = null;
  const area = state.printAreas.find((a) => a.id === id);
  if (!area) return;
  fillForm(area);
  document.getElementById("area-form-card").style.display = "block";
  document.getElementById("area-form-title").textContent = "Edit Area";
  document.getElementById("delete-area-btn").style.display = "";
  renderCanvas();
  renderAreaList();
}

function fillForm(area) {
  document.getElementById("area-name").value = area.name;
  document.getElementById("area-x").value = area.x;
  document.getElementById("area-y").value = area.y;
  document.getElementById("area-width").value = area.width;
  document.getElementById("area-height").value = area.height;
  document.getElementById("area-real-width").value = area.realWidthMm;
  document.getElementById("area-real-height").value = area.realHeightMm;
  document.getElementById("area-safe-margin").value = area.safeMargin;
  document.getElementById("area-bleed").value = area.bleedMargin;
  document.getElementById("area-dpi").value = area.dpi;
}

function syncFormToState() {
  const rect = {
    x: Number(document.getElementById("area-x").value),
    y: Number(document.getElementById("area-y").value),
    width: Number(document.getElementById("area-width").value),
    height: Number(document.getElementById("area-height").value),
  };
  if (state.selectedAreaId) {
    const area = state.printAreas.find((a) => a.id === state.selectedAreaId);
    if (area) Object.assign(area, rect);
  } else if (state.drawRect) {
    Object.assign(state.drawRect, rect);
  }
  renderCanvas();
}

async function saveArea() {
  const payload = {
    productId: state.editorProductId,
    side: state.editorSide,
    name: document.getElementById("area-name").value || "Print Area",
    x: Number(document.getElementById("area-x").value),
    y: Number(document.getElementById("area-y").value),
    width: Number(document.getElementById("area-width").value),
    height: Number(document.getElementById("area-height").value),
    realWidthMm: Number(document.getElementById("area-real-width").value),
    realHeightMm: Number(document.getElementById("area-real-height").value),
    safeMargin: Number(document.getElementById("area-safe-margin").value),
    bleedMargin: Number(document.getElementById("area-bleed").value),
    dpi: Number(document.getElementById("area-dpi").value),
  };

  let result;
  if (state.selectedAreaId) {
    result = await api(`/api/admin/print-areas/${state.selectedAreaId}`, "PUT", payload);
  } else {
    result = await api("/api/admin/print-areas", "POST", payload);
  }

  if (result) {
    toast("Area saved", "success");
    state.drawMode = false;
    state.drawRect = null;
    await loadEditorAreas();
    state.selectedAreaId = result.id;
    selectArea(result.id);
  }
}

async function deleteArea() {
  if (!state.selectedAreaId) return;
  if (!confirm("Delete this print area?")) return;
  await api(`/api/admin/print-areas/${state.selectedAreaId}`, "DELETE");
  state.selectedAreaId = null;
  state.drawRect = null;
  document.getElementById("area-form-card").style.display = "none";
  toast("Area deleted");
  loadEditorAreas();
}

// ── Canvas drawing ────────────────────────────────────────────────────────────────
function setupCanvasEvents() {
  const canvas = document.getElementById("print-area-canvas");
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  canvas.addEventListener("mousedown", (e) => {
    const pos = getPos(e);
    if (state.drawMode) {
      state.drawStart = pos;
      state.drawRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
      return;
    }
    // Check if clicking on existing area
    const area = getAreaAtPoint(pos.x, pos.y);
    if (area) {
      state.dragArea = area;
      state.dragOffset = { x: pos.x - area.x, y: pos.y - area.y };
      selectArea(area.id);
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const pos = getPos(e);
    if (state.drawMode && state.drawStart) {
      state.drawRect = normalizeRect(state.drawStart, pos);
      updateFormFromRect(state.drawRect);
      renderCanvas();
      return;
    }
    if (state.dragArea) {
      state.dragArea.x = pos.x - state.dragOffset.x;
      state.dragArea.y = pos.y - state.dragOffset.y;
      updateFormFromRect(state.dragArea);
      renderCanvas();
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (state.drawMode && state.drawRect && state.drawRect.width > 10 && state.drawRect.height > 10) {
      state.drawMode = false;
      canvas.style.cursor = "default";
      document.getElementById("area-form-card").style.display = "block";
      document.getElementById("area-form-title").textContent = "New Area";
      document.getElementById("delete-area-btn").style.display = "none";
      fillForm({ name: "Print Area", ...state.drawRect, realWidthMm: 200, realHeightMm: 250, safeMargin: 10, bleedMargin: 5, dpi: 300 });
      renderCanvas();
    } else if (state.drawMode) {
      state.drawRect = null;
      state.drawStart = null;
    }
    state.dragArea = null;
  });

  canvas.addEventListener("mouseleave", () => { state.dragArea = null; });
}

function getAreaAtPoint(x, y) {
  return state.printAreas.filter((a) => a.side === state.editorSide).find(
    (a) => x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height
  );
}

function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function updateFormFromRect(rect) {
  document.getElementById("area-x").value = Math.round(rect.x);
  document.getElementById("area-y").value = Math.round(rect.y);
  document.getElementById("area-width").value = Math.round(rect.width);
  document.getElementById("area-height").value = Math.round(rect.height);
}

function renderCanvas() {
  const canvas = document.getElementById("print-area-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawShirtBackground(ctx, canvas.width, canvas.height, state.editorSide);

  const visibleAreas = state.printAreas.filter((a) => a.side === state.editorSide);

  for (const area of visibleAreas) {
    const isSelected = area.id === state.selectedAreaId;
    drawPrintArea(ctx, area, isSelected);
  }

  if (state.drawRect) {
    drawPrintArea(ctx, state.drawRect, true, true);
  }
}

function drawShirtBackground(ctx, w, h) {
  const s = Math.min(w / 500, h / 600);
  ctx.save();
  ctx.scale(s, s);

  // Background
  ctx.fillStyle = "#f6f6f7";
  ctx.fillRect(0, 0, 500, 600);

  // Shirt body
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#c9cccf";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(145, 55);
  ctx.lineTo(190, 100);
  ctx.lineTo(310, 100);
  ctx.lineTo(355, 55);
  ctx.lineTo(460, 140);
  ctx.lineTo(405, 255);
  ctx.lineTo(355, 230);
  ctx.lineTo(355, 535);
  ctx.lineTo(145, 535);
  ctx.lineTo(145, 230);
  ctx.lineTo(95, 255);
  ctx.lineTo(40, 140);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Collar
  ctx.strokeStyle = "#e1e3e5";
  ctx.lineWidth = 20;
  ctx.beginPath();
  ctx.arc(250, 68, 55, 0, Math.PI);
  ctx.stroke();

  // Side label
  ctx.fillStyle = "#8c9196";
  ctx.font = "700 22px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.editorSide === "front" ? "FRONT" : "BACK", 250, 160);

  ctx.restore();
}

function drawPrintArea(ctx, area, isSelected, isNew = false) {
  const canvas = document.getElementById("print-area-canvas");
  const s = Math.min(canvas.width / 500, canvas.height / 600);

  ctx.save();
  ctx.scale(s, s);

  const safe = area.safeMargin || 0;
  const bleed = area.bleedMargin || 0;

  // Bleed zone
  if (bleed > 0) {
    ctx.fillStyle = "rgba(0,100,210,0.07)";
    ctx.strokeStyle = "rgba(0,100,210,0.4)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(area.x - bleed, area.y - bleed, area.width + bleed * 2, area.height + bleed * 2);
    ctx.setLineDash([]);
  }

  // Main area
  ctx.fillStyle = isSelected ? "rgba(227,115,24,0.15)" : "rgba(0,128,96,0.12)";
  ctx.fillRect(area.x, area.y, area.width, area.height);

  ctx.strokeStyle = isSelected ? "#e37318" : "#008060";
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  ctx.strokeRect(area.x, area.y, area.width, area.height);

  // Safe zone
  if (safe > 0 && area.width > safe * 2 && area.height > safe * 2) {
    ctx.strokeStyle = isSelected ? "rgba(227,115,24,0.5)" : "rgba(0,128,96,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(area.x + safe, area.y + safe, area.width - safe * 2, area.height - safe * 2);
    ctx.setLineDash([]);
  }

  // Label
  if (!isNew && area.name) {
    ctx.fillStyle = isSelected ? "#e37318" : "#008060";
    ctx.font = `bold 13px -apple-system, sans-serif`;
    ctx.textAlign = "left";
    const labelY = area.y > 20 ? area.y - 5 : area.y + 16;
    ctx.fillText(area.name, area.x + 2, labelY);
  }

  // Drag handles on selected
  if (isSelected) {
    ctx.fillStyle = "#e37318";
    [[area.x, area.y], [area.x + area.width, area.y], [area.x, area.y + area.height], [area.x + area.width, area.y + area.height]].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}

// ── Orders ────────────────────────────────────────────────────────────────────────
async function loadOrders() {
  document.getElementById("order-status-filter").onchange = () => loadOrders();
  const filter = document.getElementById("order-status-filter").value;
  const url = filter ? `/api/admin/orders?status=${filter}` : "/api/admin/orders";
  const orders = await api(url);
  if (!orders) return;

  const tbody = document.getElementById("orders-tbody");
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No orders found</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map((o) => `
    <tr>
      <td><span class="order-number">${esc(o.orderNumber)}</span></td>
      <td>${esc(o.productName)}</td>
      <td>
        <div class="customer-info">
          <div class="name">${esc(o.customerName)}</div>
          <div class="email">${esc(o.customerEmail)}</div>
        </div>
      </td>
      <td>${formatDate(o.createdAt)}</td>
      <td>
        ${o.previewUrl
          ? `<img src="${esc(o.previewUrl)}" class="preview-thumb" alt="preview">`
          : `<div class="preview-placeholder">No img</div>`}
        ${o.backPreviewUrl ? `<img src="${esc(o.backPreviewUrl)}" class="preview-thumb" alt="back preview">` : ""}
      </td>
      <td>
        ${renderProductionLinks(o)}
      </td>
      <td>
        ${renderDesignActions(o)}
      </td>
      <td>
        <select class="status-select ${o.productionStatus}" data-id="${esc(o.id)}" onchange="updateOrderStatus(this)">
          <option value="pending" ${o.productionStatus === "pending" ? "selected" : ""}>Pending</option>
          <option value="preparing" ${o.productionStatus === "preparing" ? "selected" : ""}>Preparing</option>
          <option value="printed" ${o.productionStatus === "printed" ? "selected" : ""}>Printed</option>
          <option value="ready" ${o.productionStatus === "ready" ? "selected" : ""}>Ready to Ship</option>
        </select>
      </td>
    </tr>
    <tr class="order-detail-row hidden" id="detail-${esc(o.id)}">
      <td colspan="8">${renderOrderDesignDetail(o)}</td>
    </tr>`).join("");
}

function renderProductionLinks(order) {
  const links = [
    order.productionFileUrl ? `<a href="${esc(order.productionFileUrl)}" class="file-link" target="_blank" rel="noopener" download>Ön dosya</a>` : "",
    order.backProductionFileUrl ? `<a href="${esc(order.backProductionFileUrl)}" class="file-link" target="_blank" rel="noopener" download>Arka dosya</a>` : "",
  ].filter(Boolean);

  if (!links.length) return `<span class="muted-text">Pending</span>`;
  return `<div class="file-links">${links.join("")}</div>`;
}

function renderDesignActions(order) {
  const links = [];
  const downloadUrl = order.design?.downloadUrl || order.designDownloadUrl;
  if (downloadUrl) links.push(`<a href="${esc(downloadUrl)}" class="file-link" target="_blank" rel="noopener" download>Tasarım JSON</a>`);
  if (order.designToken) links.push(`<button type="button" class="btn-link" onclick="toggleOrderDetail('${esc(order.id)}')">Detay</button>`);
  return links.length ? `<div class="file-links">${links.join("")}</div>` : `<span class="muted-text">No design</span>`;
}

function renderOrderDesignDetail(order) {
  const design = order.design;
  if (!design) return `<div class="design-detail"><p class="muted-text">Design data not found for token ${esc(order.designToken || "")}</p></div>`;
  const assets = design.assets || [];
  const sides = design.sides || {};
  return `
    <div class="design-detail">
      <div class="design-detail-head">
        <div>
          <strong>Design token:</strong> <code>${esc(design.token)}</code>
        </div>
        <div class="muted-text">${assets.length} original image${assets.length === 1 ? "" : "s"}</div>
      </div>
      <div class="design-detail-grid">
        ${renderSideDetail("Ön", sides.front, design.previewUrls?.front)}
        ${renderSideDetail("Arka", sides.back, design.previewUrls?.back)}
      </div>
      <div class="asset-list">
        <div class="detail-title">Original Images</div>
        ${assets.length ? assets.map(renderAssetItem).join("") : `<span class="muted-text">No original uploaded image</span>`}
      </div>
    </div>`;
}

function renderSideDetail(label, side, previewUrl) {
  const objects = side?.objects || [];
  return `
    <div class="side-detail">
      <div class="detail-title">${label} Taraf</div>
      ${previewUrl ? `<img src="${esc(previewUrl)}" class="side-preview" alt="${esc(label)} preview">` : ""}
      <div class="muted-text">${side?.imageCount || 0} image · ${side?.textCount || 0} text · ${side?.objectCount || 0} total</div>
      <div class="object-list">
        ${objects.length ? objects.map(renderObjectItem).join("") : `<span class="muted-text">Empty</span>`}
      </div>
    </div>`;
}

function renderObjectItem(obj) {
  if (obj.type === "image") {
    return `<div class="object-item">
      <strong>Image</strong>
      <span>${esc(obj.filename || obj.assetId || "uploaded image")}</span>
      <small>x:${esc(obj.left)} y:${esc(obj.top)} scale:${esc(obj.scaleX)} angle:${esc(obj.angle || 0)}</small>
    </div>`;
  }
  return `<div class="object-item">
    <strong>Text</strong>
    <span>${esc(obj.text || "")}</span>
    <small>${esc(obj.fontFamily || "")} ${esc(obj.fontSize || "")}px · ${esc(obj.fill || "")}</small>
  </div>`;
}

function renderAssetItem(asset) {
  const sizeMb = asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : "";
  return `<div class="asset-item">
    <div>
      <strong>${esc(asset.filename || "image")}</strong>
      <small>${esc(asset.width || 0)}×${esc(asset.height || 0)} · ${esc(asset.mime || "")} ${sizeMb ? `· ${esc(sizeMb)}` : ""}</small>
    </div>
    ${asset.originalUrl ? `<a href="${esc(asset.originalUrl)}" class="file-link" target="_blank" rel="noopener" download>Orijinal indir</a>` : ""}
  </div>`;
}

function toggleOrderDetail(id) {
  document.getElementById(`detail-${id}`)?.classList.toggle("hidden");
}

async function updateOrderStatus(selectEl) {
  const id = selectEl.dataset.id;
  const status = selectEl.value;
  selectEl.className = `status-select ${status}`;
  await api(`/api/admin/orders/${id}/status`, "PUT", { status });
  toast(`Status updated to ${status}`, "success");
}

// ── API helper ─────────────────────────────────────────────────────────────────────
async function api(url, method = "GET", body = null) {
  try {
    const opts = { method, headers: {} };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const res = await fetch(url, opts);
    if (!res.ok) { toast(`Request failed: ${res.status}`, "error"); return null; }
    return await res.json();
  } catch (err) {
    toast(`Network error: ${err.message}`, "error");
    return null;
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  return esc(str);
}

function formatDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status) {
  const labels = { pending: "Pending", preparing: "Preparing", printed: "Printed", ready: "Ready" };
  return `<span class="status-badge ${status}">${labels[status] || status}</span>`;
}

let toastTimer;
function toast(message, type = "") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); }, 2800);
}
