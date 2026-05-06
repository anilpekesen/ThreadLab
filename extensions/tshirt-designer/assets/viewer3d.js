import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";

const COLORS = [
  { label: "Beyaz",         hex: "#F5F5F5", aliases: ["beyaz", "white"] },
  { label: "Siyah",         hex: "#1C1C1E", aliases: ["siyah", "black"] },
  { label: "Mavi",          hex: "#2563EB", aliases: ["mavi", "blue"] },
  { label: "Lacivert",      hex: "#1B2A4A", aliases: ["lacivert", "navy"] },
  { label: "Kırmızı",       hex: "#C0392B", aliases: ["kirmizi", "kırmızı", "red"] },
  { label: "Yeşil",         hex: "#27AE60", aliases: ["yesil", "yeşil", "green"] },
  { label: "Gri",           hex: "#7F8C8D", aliases: ["gri", "gray", "grey"] },
  { label: "Kahverengi",    hex: "#8B5A2B", aliases: ["kahverengi", "brown"] },
  { label: "Bronz",         hex: "#CD7F32", aliases: ["bronz", "bronze"] },
  { label: "Altın",         hex: "#D4AF37", aliases: ["altin", "altın", "gold"] },
  { label: "Rose gold",     hex: "#B76E79", aliases: ["rose gold", "rosegold"] },
  { label: "Gümüş",         hex: "#C0C0C0", aliases: ["gumus", "gümüş", "silver"] },
  { label: "Bordo",         hex: "#922B21", aliases: ["bordo", "burgundy"] },
  { label: "Mor",           hex: "#6C3483", aliases: ["mor", "purple"] },
  { label: "Bej",           hex: "#D4A57F", aliases: ["bej", "beige"] },
  { label: "Sarı",          hex: "#F1C40F", aliases: ["sari", "sarı", "yellow"] },
  { label: "Turuncu",       hex: "#E67E22", aliases: ["turuncu", "orange"] },
  { label: "Pembe",         hex: "#E91E8C", aliases: ["pembe", "pink"] },
  { label: "Clear",         hex: "#F5F5F5", aliases: ["clear", "transparent", "seffaf", "şeffaf"] },
];

const POSITION_MIN = -80;
const POSITION_MAX = 180;
const IMAGE_SCALE_MAX = 500;

class TShirt3DViewer {
  constructor(panel) {
    this.panel     = panel;
    this.canvas    = panel.querySelector("[data-3d-canvas]");
    this.loadingEl = panel.querySelector("[data-3d-loading]");
    this.modelUrl  = panel.dataset.modelUrl || "";
    this.modelJsonUrl = panel.dataset.modelJsonUrl || "";

    this.renderer  = null;
    this.scene     = null;
    this.camera    = null;
    this.controls  = null;
    this.shirtMeshes   = [];
    this.designSurfaces = { front: null, back: null };
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._imageCache = new Map();
    this._editor = this._createEditorOverlay();
    this._interaction = null;
    this._modelBox = null;
    this._frontAxis = "z";
    this._activeSide = "front";
    this._pendingDesign = null;
    this._raf      = null;
    this._ready    = false;
    this._animRunning = false;
    this._color    = normalizeHex(panel.dataset.initialColor || panel.closest(".designer")?.dataset.shirtColor) || "#1C1C1E";
  }

  // ── Setup ───────────────────────────────────────────────────────────────────
  init() {
    if (this._ready) return;
    this._ready = true;
    this._animRunning = true;

    const w = this.panel.clientWidth  || 480;
    const h = this.panel.clientHeight || 520;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this._applySceneBackground();

    // Camera
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 50);
    this.camera.position.set(0, 0.05, 1.3);

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-2, 0.5, -1);
    this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xffffff, 0.4);
    back.position.set(0, -1, -2);
    this.scene.add(back);

    // Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.06;
    this.controls.minPolarAngle   = Math.PI * 0.15;
    this.controls.maxPolarAngle   = Math.PI * 0.85;
    this.controls.minDistance     = 0.5;
    this.controls.maxDistance     = 2.8;
    this.controls.autoRotate      = false;
    this.controls.autoRotateSpeed = 1.2;
    this.controls.target.set(0, 0, 0);

    this.canvas.addEventListener("pointerdown", () => {
      this.controls.autoRotate = false;
    }, { passive: true });

    // Resize observer
    new ResizeObserver(() => this._resize()).observe(this.panel);

    // Load model
    this._loadModel();

    // Animate
    this._animate();
  }

  _createEditorOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "dsgn-3d-editor";
    overlay.hidden = true;

    const imageBox = createEditorBox("image");
    const textBox = createEditorBox("text");
    overlay.appendChild(imageBox);
    overlay.appendChild(textBox);
    this.panel.appendChild(overlay);

    overlay.addEventListener("pointerdown", (event) => this._onEditorPointerDown(event));
    overlay.addEventListener("pointermove", (event) => this._onEditorPointerMove(event));
    overlay.addEventListener("pointerup", (event) => this._onEditorPointerUp(event));
    overlay.addEventListener("pointercancel", (event) => this._onEditorPointerUp(event));
    imageBox.addEventListener("wheel", (event) => this._onEditorWheel(event), { passive: false });
    textBox.addEventListener("wheel", (event) => this._onEditorWheel(event), { passive: false });

    return { overlay, boxes: { image: imageBox, text: textBox } };
  }

  _loadModel() {
    const loader = new GLTFLoader();
    const onLoad = (gltf) => {
      const model = gltf.scene;

      const scaledBox = this._fitModelToView(model);

      // Collect shirt meshes (skip lights / cameras)
      model.traverse((n) => {
        if (!n.isMesh) return;
        if (n.name.toLowerCase().includes("light")) return;
        n.material = this._createShirtMaterial(this._color);
        n.castShadow    = true;
        n.receiveShadow = true;
        this.shirtMeshes.push(n);
      });

      if (!this.shirtMeshes.length) {
        throw new Error("Model içinde mesh bulunamadı");
      }

      this.scene.add(model);
      this.setColor(this._color);

      // Design canvases/textures
      this._buildDesignSurfaces(scaledBox);

      if (this.loadingEl) this.loadingEl.style.display = "none";
    };

    const onProgress = (xhr) => {
      if (this.loadingEl && xhr.total) {
        this.loadingEl.textContent = "Yükleniyor " + Math.round(xhr.loaded / xhr.total * 100) + "%";
      }
    };

    const onError = (err) => {
      console.error("GLB yüklenemedi:", err);
      this._showFallbackModel();
      if (this.loadingEl) {
        this.loadingEl.textContent = "Basit 3D görünüm gösteriliyor";
        window.setTimeout(() => {
          if (this.loadingEl) this.loadingEl.style.display = "none";
        }, 900);
      }
    };

    if (this.modelJsonUrl) {
      if (this.loadingEl) this.loadingEl.textContent = "Model hazırlanıyor...";
      fetch(this.modelJsonUrl)
        .then((response) => {
          if (!response.ok) throw new Error("Model JSON isteği başarısız: " + response.status);
          return response.json();
        })
        .then((payload) => {
          const base64 = payload.data || payload.base64;
          if (!base64) throw new Error("Model JSON içinde base64 veri yok");
          loader.parse(base64ToArrayBuffer(base64), "", onLoad, onError);
        })
        .catch(onError);
      return;
    }

    if (!this.modelUrl) {
      onError(new Error("Model URL tanımlı değil"));
      return;
    }

    loader.load(this.modelUrl, onLoad, onProgress, onError);
  }

  _fitModelToView(model) {
    const box  = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const ctr  = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const scl = maxSize > 0 ? 1.45 / maxSize : 1;

    model.scale.setScalar(scl);
    model.position.set(-ctr.x * scl, -ctr.y * scl, -ctr.z * scl);
    model.updateMatrixWorld(true);

    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledSize = scaledBox.getSize(new THREE.Vector3());
    const scaledCtr = scaledBox.getCenter(new THREE.Vector3());
    const cameraDistance = Math.max(1.45, Math.max(scaledSize.x, scaledSize.y, scaledSize.z) * 1.65);

    this.controls.target.copy(scaledCtr);
    this.camera.position.set(scaledCtr.x, scaledCtr.y + scaledSize.y * 0.04, scaledCtr.z + cameraDistance);
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = cameraDistance * 0.45;
    this.controls.maxDistance = cameraDistance * 2.8;
    this.controls.update();

    return scaledBox;
  }

  _createShirtMaterial(hex) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: 0.72,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  _showFallbackModel() {
    if (this.shirtMeshes.length) return;

    const shape = new THREE.Shape();
    shape.moveTo(-0.31, 0.44);
    shape.lineTo(-0.56, 0.24);
    shape.lineTo(-0.43, 0.02);
    shape.lineTo(-0.31, 0.10);
    shape.lineTo(-0.26, -0.48);
    shape.lineTo(0.26, -0.48);
    shape.lineTo(0.31, 0.10);
    shape.lineTo(0.43, 0.02);
    shape.lineTo(0.56, 0.24);
    shape.lineTo(0.31, 0.44);
    shape.quadraticCurveTo(0.16, 0.34, 0, 0.34);
    shape.quadraticCurveTo(-0.16, 0.34, -0.31, 0.44);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    });
    geometry.center();

    const shirt = new THREE.Mesh(geometry, this._createShirtMaterial(this._color));
    shirt.name = "Fallback_TShirt";
    this.shirtMeshes.push(shirt);

    const model = new THREE.Group();
    model.add(shirt);
    const scaledBox = new THREE.Box3().setFromObject(model);
    this.scene.add(model);
    this._buildDesignSurfaces(scaledBox);
  }

  _buildDesignSurfaces(box) {
    const size = box.getSize(new THREE.Vector3());
    const ctr  = box.getCenter(new THREE.Vector3());
    const frontAxis = size.x <= size.z ? "x" : "z";
    const surfaceOffset = 0.0025;
    const pw = (frontAxis === "x" ? size.z : size.x) * 0.78;
    const ph = size.y * 0.84;
    const projectionDepth = Math.max(frontAxis === "x" ? size.x * 0.45 : size.z * 0.45, 0.035);

    this._modelBox = box.clone();
    this._frontAxis = frontAxis;
    this.designSurfaces.front = this._createDesignSurface("front", pw, ph);
    this.designSurfaces.back = this._createDesignSurface("back", pw, ph);
    this.scene.updateMatrixWorld(true);

    if (frontAxis === "x") {
      this._projectDesignSurface(this.designSurfaces.front, {
        position: new THREE.Vector3(box.max.x + surfaceOffset, ctr.y - size.y * 0.09, ctr.z),
        orientation: new THREE.Euler(0, Math.PI / 2, 0),
        size: new THREE.Vector3(pw, ph, projectionDepth),
      });
      this._projectDesignSurface(this.designSurfaces.back, {
        position: new THREE.Vector3(box.min.x - surfaceOffset, ctr.y - size.y * 0.09, ctr.z),
        orientation: new THREE.Euler(0, -Math.PI / 2, 0),
        size: new THREE.Vector3(pw, ph, projectionDepth),
      });
    } else {
      this._projectDesignSurface(this.designSurfaces.front, {
        position: new THREE.Vector3(ctr.x, ctr.y - size.y * 0.09, box.max.z + surfaceOffset),
        orientation: new THREE.Euler(0, 0, 0),
        size: new THREE.Vector3(pw, ph, projectionDepth),
      });
      this._projectDesignSurface(this.designSurfaces.back, {
        position: new THREE.Vector3(ctr.x, ctr.y - size.y * 0.09, box.min.z - surfaceOffset),
        orientation: new THREE.Euler(0, Math.PI, 0),
        size: new THREE.Vector3(pw, ph, projectionDepth),
      });
    }

    this._focusCameraOnSide(this._activeSide);
    if (this._pendingDesign) this.updateDesign(this._pendingDesign.sides, this._pendingDesign.activeSide);
  }

  _createDesignSurface(side, width, height) {
    const canvas = document.createElement("canvas");
    const textureSize = textureSizeForAspect(width / height);
    canvas.width = textureSize.width;
    canvas.height = textureSize.height;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.FrontSide,
    });

    return {
      canvas,
      texture,
      material,
      meshes: [],
      interactionMesh: null,
      side,
      width,
      height,
      drawToken: 0,
      imageInfo: null,
    };
  }

  _projectDesignSurface(surface, spec) {
    surface.meshes.forEach((mesh) => {
      mesh.geometry.dispose();
      this.scene.remove(mesh);
    });
    surface.meshes = [];

    if (surface.interactionMesh) {
      surface.interactionMesh.geometry.dispose();
      surface.interactionMesh.material.dispose();
      this.scene.remove(surface.interactionMesh);
      surface.interactionMesh = null;
    }

    this.shirtMeshes.forEach((shirtMesh) => {
      const geometry = new DecalGeometry(shirtMesh, spec.position, spec.orientation, spec.size);
      const decal = new THREE.Mesh(geometry, surface.material);
      decal.name = surface.side === "front" ? "Front_Design_Decal" : "Back_Design_Decal";
      decal.renderOrder = 20;
      decal.visible = false;
      surface.meshes.push(decal);
      this.scene.add(decal);
    });

    const interaction = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.size.x, spec.size.y),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    interaction.name = surface.side === "front" ? "Front_Design_EditPlane" : "Back_Design_EditPlane";
    interaction.position.copy(spec.position);
    interaction.rotation.copy(spec.orientation);
    interaction.renderOrder = 40;
    surface.interactionMesh = interaction;
    this.scene.add(interaction);
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  setColor(hex) {
    this._color = normalizeHex(hex) || this._color;
    const col = new THREE.Color(this._color);
    this.shirtMeshes.forEach((m) => m.material.color.set(col));
    this._applySceneBackground();
  }

  updateDesign(sides, activeSide = "front") {
    this._pendingDesign = { sides, activeSide };
    if (activeSide && activeSide !== this._activeSide) {
      this._activeSide = activeSide;
      if (this._modelBox) this._focusCameraOnSide(activeSide);
    }
    if (!this.designSurfaces.front || !this.designSurfaces.back) return;

    this._drawSideToSurface(this.designSurfaces.front, sides.front);
    this._drawSideToSurface(this.designSurfaces.back, sides.back);
    this._updateEditorOverlay();
  }

  _drawSideToSurface(surface, s) {
    const ctx = surface.canvas.getContext("2d");
    const W   = surface.canvas.width;
    const H   = surface.canvas.height;
    const drawToken = surface.drawToken + 1;

    surface.drawToken = drawToken;
    ctx.clearRect(0, 0, W, H);
    surface.meshes.forEach((mesh) => {
      mesh.visible = !!(s.imageDataUrl || s.text);
    });
    if (surface.interactionMesh) surface.interactionMesh.visible = true;

    const flush = () => {
      surface.texture.needsUpdate = true;
      this._updateEditorOverlay();
    };

    const draw = (img = null) => {
      if (surface.drawToken !== drawToken) return;
      ctx.clearRect(0, 0, W, H);
      if (img) {
        surface.imageInfo = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
        drawImage(ctx, img, s, W, H);
      } else {
        surface.imageInfo = null;
      }
      if (s.text) drawText(ctx, s, W, H);
      flush();
    };

    if (s.imageDataUrl) {
      this._loadImage(s.imageDataUrl).then(draw).catch(() => draw(null));
    } else if (s.text) {
      drawText(ctx, s, W, H);
      flush();
    } else {
      surface.imageInfo = null;
      flush();
    }
  }

  _loadImage(src) {
    const cached = this._imageCache.get(src);
    if (cached) return cached.promise;

    const img = new Image();
    const entry = {
      img,
      promise: new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
      }),
    };
    this._imageCache.set(src, entry);
    img.src = src;
    return entry.promise;
  }

  _activeSurface() {
    return this.designSurfaces[this._activeSide];
  }

  _activeSideState() {
    return this._pendingDesign?.sides?.[this._activeSide] || null;
  }

  _canEditKind(s, kind) {
    if (!s) return false;
    if (kind === "image") return !!s.imageDataUrl;
    if (kind === "text") return !!s.text;
    return false;
  }

  _onEditorPointerDown(event) {
    const box = event.target.closest("[data-edit-box]");
    if (!box) return;

    const s = this._activeSideState();
    const kind = box.dataset.kind;
    if (!this._canEditKind(s, kind)) return;

    const hit = this._pointerToSurfacePercent(event.clientX, event.clientY) || {
      x: kind === "image" ? (s.imageX ?? 50) : (s.textX ?? 50),
      y: kind === "image" ? (s.imageY ?? 44) : (s.textY ?? 78),
    };

    event.preventDefault();
    event.stopPropagation();

    const handle = event.target.closest("[data-3d-handle]")?.getAttribute("data-3d-handle") || "";
    this.controls.autoRotate = false;
    this.controls.enabled = false;
    box.classList.add("dragging");

    this._interaction = {
      pointerId: event.pointerId,
      type: handle ? "resize" : "drag",
      handle,
      kind,
      startHit: hit,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startImageX: s.imageX ?? 50,
      startImageY: s.imageY ?? 44,
      startImageScale: s.imageScale ?? 72,
      startTextX: s.textX ?? 50,
      startTextY: s.textY ?? 78,
      startFontSize: s.fontSize ?? 30,
      box,
    };

    try { this._editor.overlay.setPointerCapture(event.pointerId); } catch (err) {}
  }

  _onEditorPointerMove(event) {
    const interaction = this._interaction;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    if (interaction.type === "drag") {
      const hit = this._pointerToSurfacePercent(event.clientX, event.clientY);
      const delta = hit
        ? { x: hit.x - interaction.startHit.x, y: hit.y - interaction.startHit.y }
        : this._screenDeltaPercent(event.clientX - interaction.startClientX, event.clientY - interaction.startClientY);
      if (interaction.kind === "image") {
        this._emitTransformChange({
          imageX: clamp(interaction.startImageX + delta.x, POSITION_MIN, POSITION_MAX),
          imageY: clamp(interaction.startImageY + delta.y, POSITION_MIN, POSITION_MAX),
        });
      } else {
        this._emitTransformChange({
          textX: clamp(interaction.startTextX + delta.x, POSITION_MIN, POSITION_MAX),
          textY: clamp(interaction.startTextY + delta.y, POSITION_MIN, POSITION_MAX),
        });
      }
      return;
    }

    const dirX = interaction.handle.includes("w") ? -1 : 1;
    const dirY = interaction.handle.includes("n") ? -1 : 1;
    const delta = ((event.clientX - interaction.startClientX) * dirX + (event.clientY - interaction.startClientY) * dirY) / 2;

    if (interaction.kind === "image") {
      this._emitTransformChange({
        imageScale: clamp(interaction.startImageScale + delta * 0.34, 10, IMAGE_SCALE_MAX),
      });
    } else {
      this._emitTransformChange({
        fontSize: clamp(interaction.startFontSize + delta * 0.12, 10, 96),
      });
    }
  }

  _onEditorPointerUp(event) {
    if (!this._interaction || this._interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    this._interaction = null;
    this.controls.enabled = true;
    event.currentTarget.querySelectorAll(".dsgn-3d-edit-box").forEach((box) => box.classList.remove("dragging"));
    try { this._editor.overlay.releasePointerCapture(event.pointerId); } catch (err) {}
  }

  _onEditorWheel(event) {
    const s = this._activeSideState();
    const box = event.target.closest("[data-edit-box]");
    const kind = box?.dataset.kind;
    if (!this._canEditKind(s, kind)) return;

    event.preventDefault();
    event.stopPropagation();
    this.controls.autoRotate = false;
    const step = event.deltaY > 0 ? -5 : 5;

    if (kind === "image") {
      this._emitTransformChange({ imageScale: clamp((s.imageScale ?? 72) + step, 10, IMAGE_SCALE_MAX) });
    } else {
      this._emitTransformChange({ fontSize: clamp((s.fontSize ?? 30) + step * 0.45, 10, 96) });
    }
  }

  _emitTransformChange(patch) {
    const s = this._activeSideState();
    if (s) Object.assign(s, patch);
    this.panel.closest(".designer")?.dispatchEvent(new CustomEvent("bikafa3dTransformChanged", {
      bubbles: true,
      detail: { side: this._activeSide, patch },
    }));
  }

  _pointerToSurfacePercent(clientX, clientY) {
    const surface = this._activeSurface();
    if (!surface?.interactionMesh || !this.camera) return null;

    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);

    const hits = this._raycaster.intersectObject(surface.interactionMesh, false);
    if (!hits.length) return null;

    surface.interactionMesh.updateMatrixWorld(true);
    const local = surface.interactionMesh.worldToLocal(hits[0].point.clone());
    return {
      x: local.x / surface.width * 100 + 50,
      y: 50 - local.y / surface.height * 100,
    };
  }

  _screenDeltaPercent(dx, dy) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.width ? dx / rect.width * 100 : 0,
      y: rect.height ? dy / rect.height * 100 : 0,
    };
  }

  _updateEditorOverlay() {
    if (!this._editor || !this.camera) return;

    const surface = this._activeSurface();
    const s = this._activeSideState();
    const hasImageBox = this._updateEditorBox("image", surface, s);
    const hasTextBox = this._updateEditorBox("text", surface, s);
    this._editor.overlay.hidden = !(hasImageBox || hasTextBox);
  }

  _updateEditorBox(kind, surface, s) {
    const box = this._editor.boxes[kind];
    if (!box) return false;

    const rect = this._editableScreenRect(surface, s, kind);
    if (!rect) {
      box.hidden = true;
      return false;
    }

    box.hidden = false;
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    return true;
  }

  _editableScreenRect(surface, s, kind) {
    if (!surface?.interactionMesh || !this._canEditKind(s, kind)) return null;
    if (!this._surfaceFacesCamera(surface)) return null;

    const W = surface.canvas.width;
    const H = surface.canvas.height;
    let box;

    if (kind === "image") {
      const imageInfo = surface.imageInfo || cachedImageInfo(this._imageCache.get(s.imageDataUrl)?.img);
      box = imageCanvasBox(s, W, H, imageInfo);
    } else {
      box = textCanvasBox(s, W, H);
    }

    if (!box || box.width <= 0 || box.height <= 0) return null;

    const points = rotatedCanvasCorners(box).map((point) => this._canvasPointToScreen(surface, point.x, point.y));
    if (points.some((point) => !point || point.z < -1 || point.z > 1)) return null;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    if (right - left < 8 || bottom - top < 8) return null;
    if (right < 0 || bottom < 0 || left > this.panel.clientWidth || top > this.panel.clientHeight) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  _surfaceFacesCamera(surface) {
    if (!surface?.interactionMesh || !this.camera) return false;
    surface.interactionMesh.updateMatrixWorld(true);

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(surface.interactionMesh.getWorldQuaternion(new THREE.Quaternion()));
    const position = surface.interactionMesh.getWorldPosition(new THREE.Vector3());
    const toCamera = this.camera.position.clone().sub(position).normalize();
    return normal.dot(toCamera) > 0.12;
  }

  _canvasPointToScreen(surface, x, y) {
    if (!surface?.interactionMesh) return null;

    surface.interactionMesh.updateMatrixWorld(true);
    const local = new THREE.Vector3(
      (x / surface.canvas.width - 0.5) * surface.width,
      (0.5 - y / surface.canvas.height) * surface.height,
      0
    );
    const world = surface.interactionMesh.localToWorld(local);
    world.project(this.camera);

    return {
      x: (world.x * 0.5 + 0.5) * this.panel.clientWidth,
      y: (-world.y * 0.5 + 0.5) * this.panel.clientHeight,
      z: world.z,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────────
  _resize() {
    const w = this.panel.clientWidth;
    const h = this.panel.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _focusCameraOnSide(side = "front") {
    if (!this._modelBox) return;
    const box = this._modelBox;
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const frontAxis = this._frontAxis;
    const cameraDistance = Math.max(1.45, Math.max(size.x, size.y, size.z) * 1.65);
    const dir = side === "back" ? -1 : 1;

    this.controls.target.copy(ctr);
    if (frontAxis === "x") {
      this.camera.position.set(ctr.x + cameraDistance * dir, ctr.y + size.y * 0.04, ctr.z);
    } else {
      this.camera.position.set(ctr.x, ctr.y + size.y * 0.04, ctr.z + cameraDistance * dir);
    }
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = cameraDistance * 0.45;
    this.controls.maxDistance = cameraDistance * 2.8;
    this.controls.update();
  }

  _applySceneBackground() {
    const bg = backgroundForShirt(this._color);
    if (this.scene) this.scene.background = new THREE.Color(bg);
    this.panel.style.background = bg;
  }

  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    this.controls?.update();
    this._updateEditorOverlay();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._animRunning = false;
    this.renderer?.dispose();
  }
}

// ── Canvas helpers ───────────────────────────────────────────────────────────
function createEditorBox(kind) {
  const box = document.createElement("div");
  box.className = `dsgn-3d-edit-box ${kind}`;
  box.dataset.editBox = "";
  box.dataset.kind = kind;
  box.hidden = true;

  ["nw", "ne", "sw", "se"].forEach((handle) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dsgn-3d-handle ${handle}`;
    btn.setAttribute("data-3d-handle", handle);
    btn.setAttribute("aria-label", "Yeniden boyutlandır");
    box.appendChild(btn);
  });

  return box;
}

function textureSizeForAspect(aspect) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const max = 1024;
  const min = 512;

  if (safeAspect >= 1) {
    return { width: max, height: Math.max(min, Math.round(max / safeAspect)) };
  }

  return { width: Math.max(min, Math.round(max * safeAspect)), height: max };
}

function drawImage(ctx, img, s, W, H) {
  const box = imageCanvasBox(s, W, H, {
    width: img.naturalWidth || img.width || 1,
    height: img.naturalHeight || img.height || 1,
  });

  ctx.save();
  ctx.translate(box.x, box.y);
  if (box.rotation) ctx.rotate(box.rotation * Math.PI / 180);
  ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
  ctx.drawImage(img, -box.width / 2, -box.height / 2, box.width, box.height);
  ctx.restore();
}

function imageCanvasBox(s, W, H, imageInfo) {
  const ratio = imageInfo?.width ? (imageInfo.height || imageInfo.width) / imageInfo.width : 1;
  const width = W * ((s.imageScale ?? 72) / 100);
  return {
    x: W * ((s.imageX ?? 50) / 100),
    y: H * ((s.imageY ?? 44) / 100),
    width,
    height: width * ratio,
    rotation: s.imageRotate ?? 0,
  };
}

function textCanvasBox(s, W, H) {
  const text = String(s.text || "");
  if (!text) return null;

  const fs = (s.fontSize ?? 30) * (W / 480);
  const lines = Math.max(1, text.split(/\n/).length);
  const longest = text.split(/\n/).reduce((max, line) => Math.max(max, line.length), 1);
  const width = clamp(longest * fs * 0.56 + fs, W * 0.12, W * 0.94);

  return {
    x: W * ((s.textX ?? 50) / 100),
    y: H * ((s.textY ?? 78) / 100),
    width,
    height: fs * 1.25 * lines,
    rotation: 0,
  };
}

function rotatedCanvasCorners(box) {
  const rad = (box.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = box.width / 2;
  const hh = box.height / 2;

  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((point) => ({
    x: box.x + point.x * cos - point.y * sin,
    y: box.y + point.x * sin + point.y * cos,
  }));
}

function cachedImageInfo(img) {
  if (!img) return null;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  return width && height ? { width, height } : null;
}

// ── Text helper ──────────────────────────────────────────────────────────────
function drawText(ctx, s, W, H) {
  const fs = (s.fontSize ?? 30) * (W / 480);
  ctx.font        = `${s.bold ? "800" : "400"} ${fs}px ${s.fontFamily || "Arial,sans-serif"}`;
  ctx.fillStyle   = s.textColor || "#111";
  ctx.textAlign   = s.textAlign || "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = s.letterSpacing ? s.letterSpacing + "px" : "0px";
  ctx.fillText(s.text, W * ((s.textX ?? 50) / 100), H * ((s.textY ?? 78) / 100));
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function base64ToArrayBuffer(base64) {
  const clean = base64.includes(",") ? base64.split(",").pop() : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function normalizeHex(hex) {
  if (!hex) return "";
  const value = String(hex).trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return "#" + value.slice(1).split("").map((ch) => ch + ch).join("").toUpperCase();
  }
  return "";
}

function sameHex(a, b) {
  return normalizeHex(a) === normalizeHex(b);
}

function normalizeText(text) {
  return String(text || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function colorFromText(text) {
  const directHex = normalizeHex(String(text || "").match(/#[0-9a-f]{3,6}/i)?.[0]);
  if (directHex) return directHex;

  const normalized = normalizeText(text);
  if (!normalized) return "";

  for (const color of COLORS) {
    if (color.aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      return color.hex;
    }
  }

  return "";
}

function colorChoiceFromValue(value) {
  const rawValue = value && typeof value === "object"
    ? (value.name || value.value || value.label || "")
    : value;
  const label = String(rawValue || "").trim();
  if (!label) return null;

  const directHex = normalizeHex(label);
  if (directHex) return { label, hex: directHex, warning: "" };

  const hex = colorFromText(label);
  if (hex) return { label, hex, warning: colorWarningForLabel(label) };

  return {
    label,
    hex: fallbackColorForLabel(label),
    warning: "Seçtiğiniz renk 3D modelde birebir yoktur; temsili gösteriliyor.",
  };
}

function productColorChoices(root) {
  let options = [];
  try { options = JSON.parse(root?.dataset.productOptions || "[]"); } catch (e) {}

  const colorOption = (Array.isArray(options) ? options : []).find((option) => {
    const name = normalizeText(option?.name);
    return name === "renk" || name === "color" || name.includes("renk") || name.includes("color");
  });

  const values = Array.isArray(colorOption?.values) ? colorOption.values : [];
  const choices = values
    .map((value) => colorChoiceFromValue(value))
    .filter(Boolean);

  return choices.length ? choices : COLORS;
}

function fallbackColorForLabel(label) {
  let hash = 0;
  const text = normalizeText(label);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 62, 52);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)]
    .map((value) => Math.round(255 * value).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function colorWarningForLabel(label) {
  const normalized = normalizeText(label);
  const approximateNames = ["clear", "gold", "rose gold", "rosegold", "silver", "bronze"];
  return approximateNames.some((name) => normalized.includes(normalizeText(name)))
    ? "Seçtiğiniz renk 3D modelde birebir yoktur; temsili gösteriliyor."
    : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setColorWarning(root, message) {
  const warning = root?.querySelector("[data-color-warning]");
  if (!warning) return;
  warning.textContent = message || "";
  warning.classList.toggle("visible", !!message);
}

function colorFromVariantPayload(payload) {
  if (!payload) return "";
  const variant = payload.variant || payload.selectedVariant || payload.currentVariant || payload;
  const parts = [
    variant.title,
    variant.public_title,
    variant.option1,
    variant.option2,
    variant.option3,
    ...(Array.isArray(variant.options) ? variant.options : []),
  ];
  return colorFromText(parts.filter(Boolean).join(" "));
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function backgroundForShirt(hex) {
  const safeHex = normalizeHex(hex) || "#1C1C1E";
  return relativeLuminance(safeHex) < 0.36 ? "#F3F4F6" : "#1C1C1E";
}

function setRootShirtColor(root, hex) {
  const safeHex = normalizeHex(hex);
  if (!root || !safeHex) return;

  root.dataset.shirtColor = safeHex;
  root.querySelectorAll("[data-3d-panel]").forEach((panel) => {
    panel._viewer3d?.setColor(safeHex);
  });

  root.querySelectorAll("[data-color-swatches]").forEach((wrap) => {
    wrap.querySelectorAll("[data-color]").forEach((btn) => {
      btn.classList.toggle("active", sameHex(btn.dataset.color, safeHex));
    });
  });
}

function setAllDesignersShirtColor(hex) {
  document.querySelectorAll(".designer").forEach((root) => setRootShirtColor(root, hex));
}

function labelTextForInput(input) {
  const parts = [input.value, input.dataset.value, input.getAttribute("aria-label")];
  if (input.id) {
    const label = document.querySelector(`label[for="${escapeSelector(input.id)}"]`);
    if (label) parts.push(label.textContent);
  }
  const closestLabel = input.closest("label");
  if (closestLabel) parts.push(closestLabel.textContent);
  return parts.filter(Boolean).join(" ");
}

function escapeSelector(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function selectedProductOptionText() {
  const selectors = [
    'form[action*="/cart/add"] input:checked',
    'form[action*="/cart/add"] select',
    "variant-radios input:checked",
    "variant-selects select",
    "product-form input:checked",
    "product-form select",
  ];
  const parts = [];

  document.querySelectorAll(selectors.join(",")).forEach((el) => {
    if (el.closest(".designer")) return;
    if (el.matches("select")) {
      parts.push(el.value);
      if (el.selectedOptions) {
        Array.from(el.selectedOptions).forEach((option) => parts.push(option.textContent));
      }
      return;
    }
    parts.push(labelTextForInput(el));
  });

  return parts.filter(Boolean).join(" ");
}

function syncProductSelectedColor() {
  const hex = colorFromText(selectedProductOptionText());
  if (hex) setAllDesignersShirtColor(hex);
}

let productColorSyncBound = false;

function bindProductColorSync() {
  if (productColorSyncBound) return;
  productColorSyncBound = true;

  const delayedSync = () => window.setTimeout(syncProductSelectedColor, 0);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".designer")) return;
    if (target.matches("input, select")) delayedSync();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button, label, [role='option'], [data-value]")
      : null;
    if (!target || target.closest(".designer")) return;
    const hex = colorFromText([
      target.textContent,
      target.getAttribute("aria-label"),
      target.getAttribute("title"),
      target.getAttribute("data-value"),
    ].filter(Boolean).join(" "));
    if (hex) window.setTimeout(() => setAllDesignersShirtColor(hex), 0);
  });

  ["variant:change", "variant-change", "product:variant-change"].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      const hex = colorFromVariantPayload(event.detail);
      if (hex) setAllDesignersShirtColor(hex);
      else delayedSync();
    });
  });

  syncProductSelectedColor();
}

// ── Bootstrap: run when 3D panel becomes visible ─────────────────────────────
function bootstrap(scope = document) {
  scope.querySelectorAll("[data-3d-panel]").forEach((panel) => {
    if (panel._viewer3d) return;
    const viewer = new TShirt3DViewer(panel);
    panel._viewer3d = viewer;

    // Build color swatches
    const designerRoot = panel.closest(".designer");
    const swatchWrap = designerRoot?.querySelector("[data-color-swatches]");
    if (swatchWrap) {
      const colorChoices = productColorChoices(designerRoot);
      swatchWrap.innerHTML = colorChoices.map((c) =>
        `<button class="dsgn-swatch${sameHex(c.hex, viewer._color) ? " active" : ""}"
           data-color="${c.hex}"
           data-color-warning="${escapeHtml(c.warning || "")}"
           style="background:${c.hex}"
           title="${escapeHtml(c.label)}"
           aria-label="${escapeHtml(c.label)}">
         </button>`
      ).join("");

      const activeSwatch = swatchWrap.querySelector(".dsgn-swatch.active");
      setColorWarning(designerRoot, activeSwatch?.dataset.colorWarning || "");

      swatchWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-color]");
        if (!btn) return;
        swatchWrap.querySelectorAll(".dsgn-swatch").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const root = panel.closest(".designer");
        setColorWarning(root, btn.dataset.colorWarning || "");
        if (root) setRootShirtColor(root, btn.dataset.color);
        else viewer.setColor(btn.dataset.color);
      });
    }

    // Listen for design changes
    const root = panel.closest(".designer");
    if (root) {
      root.addEventListener("bikafaDesignChanged", (e) => {
        viewer.updateDesign(e.detail.sides, e.detail.activeSide);
      });
    }
  });

  // Init viewers that are already visible
  scope.querySelectorAll("[data-3d-panel]").forEach((panel) => {
    if (panel.offsetParent !== null) {
      panel._viewer3d?.init();
    }
  });
}

// ── View toggle ──────────────────────────────────────────────────────────────
function bindViewToggles(scope = document) {
  scope.querySelectorAll("[data-view-toggle]").forEach((btn) => {
    if (btn._viewer3dToggleBound) return;
    btn._viewer3dToggleBound = true;

    btn.addEventListener("click", () => {
      const view     = btn.dataset.viewToggle;
      const designer = btn.closest(".designer");
      const view2d   = designer?.querySelector(".dsgn-2d-view");
      const view3d   = designer?.querySelector(".dsgn-3d-view");
      const allBtns  = designer?.querySelectorAll("[data-view-toggle]");

      allBtns?.forEach((b) => b.classList.toggle("active", b === btn));

      if (view === "3d") {
        if (view2d) view2d.style.display = "none";
        if (view3d) view3d.style.display = "flex";
        // Init on first open
        const panel = view3d?.querySelector("[data-3d-panel]");
        if (panel?._viewer3d && !panel._viewer3d._animRunning) {
          panel._viewer3d.init();
        }
      } else {
        if (view2d) view2d.style.display = "";
        if (view3d) view3d.style.display = "none";
      }
    });
  });
}

function init3D(scope = document) {
  bootstrap(scope);
  bindViewToggles(scope);
  bindProductColorSync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init3D(), { once: true });
} else {
  init3D();
}

document.addEventListener("shopify:section:load", (event) => {
  init3D(event.target);
});
