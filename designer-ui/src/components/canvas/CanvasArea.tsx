import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import { useDesignerStore } from '@/store/designerStore';
import type { PrintAreaConfig, Side } from '@/types';

const PRINT_W = 480;
const PRINT_H = 580;
const CONTROL_ICON_SIZE = 32;
const DELETE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ef4444' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E";
const CLONE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='13' height='13' rx='2' ry='2'%3E%3C/rect%3E%3Cpath d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'%3E%3C/path%3E%3C/svg%3E";
const ROTATE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'%3E%3C/path%3E%3Cpolyline points='21 3 21 8 16 8'%3E%3C/polyline%3E%3C/svg%3E";
const RESIZE_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cpolyline points='9 21 3 21 3 15'%3E%3C/polyline%3E%3Cline x1='21' y1='3' x2='14' y2='10'%3E%3C/line%3E%3Cline x1='3' y1='21' x2='10' y2='14'%3E%3C/line%3E%3C/svg%3E";

const controlIcons = {
  delete: createControlImage(DELETE_ICON),
  clone: createControlImage(CLONE_ICON),
  rotate: createControlImage(ROTATE_ICON),
  resize: createControlImage(RESIZE_ICON),
};

export interface CanvasAreaHandle {
  addImageFromUrl: (url: string) => void;
  addText: (text: string, opts?: Partial<fabric.ITextOptions>) => void;
  cloneSelected: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  getActiveObject: () => fabric.Object | null;
  exportPng: (multiplier?: number, cleanBg?: boolean) => string;
  loadDesign: (json: string) => void;
  saveDesign: () => string;
  getCanvas: () => fabric.Canvas | null;
  /** @deprecated use getCanvas() */
  canvas: fabric.Canvas | null;
}

interface Props {
  side: Side;
  zoom: number;
  printArea: PrintAreaConfig;
  allowPageScroll?: boolean;
  onObjectSelected: (obj: fabric.Object | null) => void;
  onDesignChange: (side: Side) => void;
}

const HISTORY_LIMIT = 50;

function isImageObject(obj: fabric.Object | null | undefined): obj is fabric.Image {
  return obj?.type === 'image';
}

function createControlImage(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

function renderControlIcon(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  fabricObject: fabric.Object,
  img: HTMLImageElement,
) {
  const size = CONTROL_ICON_SIZE;
  ctx.save();
  ctx.translate(left, top);
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  const iconSize = size * 0.52;
  if (img.complete) {
    ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
  } else {
    img.onload = () => fabricObject.canvas?.requestRenderAll();
  }
  ctx.restore();
}

function cloneFabricObject(target: fabric.Object) {
  target.clone((cloned: fabric.Object) => {
    cloned.set({
      left: (cloned.left ?? 0) + 24,
      top: (cloned.top ?? 0) + 24,
    });
    applyObjectInteractionPreset(cloned);
    lockImageProportions(cloned);
    target.canvas?.add(cloned);
    target.canvas?.setActiveObject(cloned);
    target.canvas?.requestRenderAll();
  });
}

function clearCanvasTopLayer(cv: fabric.Canvas) {
  const runtimeCanvas = cv as fabric.Canvas & {
    clearContext?: (ctx: CanvasRenderingContext2D) => void;
    contextTop?: CanvasRenderingContext2D | null;
  };
  if (runtimeCanvas.clearContext && runtimeCanvas.contextTop) {
    runtimeCanvas.clearContext(runtimeCanvas.contextTop);
  }
}

function removeFabricObject(target: fabric.Object) {
  const cv = target.canvas;
  if (!cv) return true;

  cv.discardActiveObject();
  target.set({
    visible: false,
    evented: false,
    selectable: false,
  } as Partial<fabric.Object>);
  target.setCoords();
  cv.remove(target);
  clearCanvasTopLayer(cv);
  cv.renderAll();

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      if (!hasLiveContext(cv)) return;
      clearCanvasTopLayer(cv);
      cv.renderAll();
    });
  }

  return true;
}

function buildObjectControls() {
  const runtimeControls = (fabric as typeof fabric & {
    controlsUtils?: Record<string, fabric.Control['actionHandler']>;
  }).controlsUtils;
  const defaultControls = (fabric.Object.prototype.controls ?? {}) as Record<string, fabric.Control>;
  const rotateAction = runtimeControls?.rotationWithSnapping ?? defaultControls.mtr?.actionHandler;
  const scaleAction = runtimeControls?.scalingEqually ?? defaultControls.br?.actionHandler;
  const controls = {
    ...defaultControls,
  } as Record<string, fabric.Control>;

  controls.tl = new fabric.Control({
    x: -0.5,
    y: -0.5,
    cursorStyle: 'pointer',
    mouseUpHandler: (_eventData, transform) => {
      return removeFabricObject(transform.target);
    },
    render: (ctx, left, top, styleOverride, object) => renderControlIcon(ctx, left, top, styleOverride, object, controlIcons.delete),
  });

  controls.tr = new fabric.Control({
    x: 0.5,
    y: -0.5,
    cursorStyle: 'pointer',
    mouseUpHandler: (_eventData, transform) => {
      cloneFabricObject(transform.target);
      return true;
    },
    render: (ctx, left, top, styleOverride, object) => renderControlIcon(ctx, left, top, styleOverride, object, controlIcons.clone),
  });

  controls.bl = new fabric.Control({
    x: -0.5,
    y: 0.5,
    cursorStyle: 'crosshair',
    ...(rotateAction ? { actionHandler: rotateAction } : {}),
    actionName: 'rotate',
    render: (ctx, left, top, styleOverride, object) => renderControlIcon(ctx, left, top, styleOverride, object, controlIcons.rotate),
  } as Partial<fabric.Control>);

  controls.br = new fabric.Control({
    x: 0.5,
    y: 0.5,
    cursorStyle: 'nwse-resize',
    ...(scaleAction ? { actionHandler: scaleAction } : {}),
    actionName: 'scale',
    render: (ctx, left, top, styleOverride, object) => renderControlIcon(ctx, left, top, styleOverride, object, controlIcons.resize),
  } as Partial<fabric.Control>);

  ['mt', 'mb', 'ml', 'mr', 'mtr'].forEach((key) => {
    if (controls[key]) controls[key].visible = false;
  });

  return controls;
}

function applyObjectInteractionPreset(obj: fabric.Object | null | undefined) {
  if (!obj) return;
  obj.controls = buildObjectControls();
  obj.set({
    cornerSize: CONTROL_ICON_SIZE,
    touchCornerSize: 44,
    padding: 12,
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStyle: 'circle',
    cornerStrokeColor: '#cbd5e1',
    borderColor: '#3b82f6',
    borderDashArray: [4, 4],
    borderScaleFactor: 2.2,
  } as Partial<fabric.Object>);
}

function lockImageProportions(obj: fabric.Object | null | undefined) {
  applyObjectInteractionPreset(obj);
  if (!isImageObject(obj)) return;
  obj.set({
    lockUniScaling: true,
    lockScalingFlip: true,
  } as Partial<fabric.Image>);
  const withControls = obj as fabric.Object & {
    setControlsVisibility?: (controls: Record<string, boolean>) => void;
  };
  withControls.setControlsVisibility?.({
    mt: false,
    mb: false,
    ml: false,
    mr: false,
  });
}

function keepImageUniform(obj: fabric.Object | null | undefined) {
  if (!isImageObject(obj)) return;
  const scale = Math.max(Math.abs(obj.scaleX ?? 1), Math.abs(obj.scaleY ?? 1));
  obj.set({
    scaleX: (obj.scaleX ?? 1) < 0 ? -scale : scale,
    scaleY: (obj.scaleY ?? 1) < 0 ? -scale : scale,
  });
  obj.setCoords();
}

function normalizeCanvasImages(cv: fabric.Canvas) {
  cv.getObjects().forEach((obj) => {
    applyObjectInteractionPreset(obj);
    lockImageProportions(obj);
  });
}

function hasLiveContext(cv: fabric.Canvas) {
  const runtimeCanvas = cv as fabric.Canvas & { contextContainer?: CanvasRenderingContext2D | null };
  return Boolean(cv.getElement()) && Boolean(runtimeCanvas.contextContainer);
}

function setCanvasTouchAction(cv: fabric.Canvas, action: 'none' | 'pan-y') {
  const runtimeCanvas = cv as fabric.Canvas & {
    upperCanvasEl?: HTMLCanvasElement;
    lowerCanvasEl?: HTMLCanvasElement;
  };
  runtimeCanvas.upperCanvasEl?.style.setProperty('touch-action', action);
  runtimeCanvas.lowerCanvasEl?.style.setProperty('touch-action', action);
}

function toCanvasRect(area: PrintAreaConfig) {
  return {
    left: (area.x / 480) * PRINT_W,
    top: (area.y / 580) * PRINT_H,
    width: (area.width / 480) * PRINT_W,
    height: (area.height / 580) * PRINT_H,
  };
}

function toMockupRect(area: PrintAreaConfig) {
  return {
    left: (area.mockupX / 480) * PRINT_W,
    top: (area.mockupY / 580) * PRINT_H,
    width: (area.mockupWidth / 480) * PRINT_W,
    height: (area.mockupHeight / 580) * PRINT_H,
  };
}

function scaleObjectToFitArea(obj: fabric.Object, areaRect: ReturnType<typeof toCanvasRect>) {
  let changed = false;
  let bounds = obj.getBoundingRect(true, true);
  if (bounds.width > areaRect.width || bounds.height > areaRect.height) {
    const ratio = Math.min(areaRect.width / Math.max(bounds.width, 1), areaRect.height / Math.max(bounds.height, 1));
    obj.set({
      scaleX: (obj.scaleX ?? 1) * ratio,
      scaleY: (obj.scaleY ?? 1) * ratio,
    });
    keepImageUniform(obj);
    obj.setCoords();
    bounds = obj.getBoundingRect(true, true);
    changed = true;
  }
  return { changed, bounds };
}

function constrainObjectToArea(obj: fabric.Object, areaRect: ReturnType<typeof toCanvasRect>) {
  const scaled = scaleObjectToFitArea(obj, areaRect);
  const bounds = scaled.bounds;
  let deltaX = 0;
  let deltaY = 0;

  if (bounds.left < areaRect.left) {
    deltaX = areaRect.left - bounds.left;
  } else if (bounds.left + bounds.width > areaRect.left + areaRect.width) {
    deltaX = areaRect.left + areaRect.width - (bounds.left + bounds.width);
  }

  if (bounds.top < areaRect.top) {
    deltaY = areaRect.top - bounds.top;
  } else if (bounds.top + bounds.height > areaRect.top + areaRect.height) {
    deltaY = areaRect.top + areaRect.height - (bounds.top + bounds.height);
  }

  if (deltaX || deltaY) {
    obj.set({
      left: (obj.left ?? 0) + deltaX,
      top: (obj.top ?? 0) + deltaY,
    });
    obj.setCoords();
    return true;
  }

  return scaled.changed;
}

function constrainCanvasObjects(cv: fabric.Canvas, areaRect: ReturnType<typeof toCanvasRect>) {
  let changed = false;
  cv.getObjects().forEach((obj) => {
    changed = constrainObjectToArea(obj, areaRect) || changed;
  });
  return changed;
}

// Proxy R2 images through our server to avoid CORS issues with Fabric.js
function proxyCrossOriginUrl(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.hostname === 'assets.printlabapp.com') {
      return `/api/img-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch { /* ignore */ }
  return url;
}

function proxyJsonUrls(json: string): string {
  return json.replace(/"src":"(https?:\/\/assets\.printlabapp\.com\/[^"]+)"/g,
    (_, src) => `"src":"/api/img-proxy?url=${encodeURIComponent(src)}"`);
}

function unproxyJsonUrls(json: string): string {
  return json.replace(/"src":"\/api\/img-proxy\?url=([^"]+)"/g,
    (_, encoded) => `"src":"${decodeURIComponent(encoded)}"`);
}

const CanvasArea = forwardRef<CanvasAreaHandle, Props>(({ side, zoom, printArea, allowPageScroll = false, onObjectSelected, onDesignChange }, ref) => {
  const hostEl = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const printAreaRef = useRef(printArea);
  const onObjectSelectedRef = useRef(onObjectSelected);
  const onDesignChangeRef = useRef(onDesignChange);

  const { config, activeSide } = useDesignerStore();
  const [bgLoaded, setBgLoaded] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = () => {
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  useEffect(() => {
    printAreaRef.current = printArea;
  }, [printArea]);

  useEffect(() => {
    onObjectSelectedRef.current = onObjectSelected;
  }, [onObjectSelected]);

  useEffect(() => {
    onDesignChangeRef.current = onDesignChange;
  }, [onDesignChange]);

  const constrainTarget = useCallback((target: fabric.Object | null | undefined) => {
    const cv = canvasRef.current;
    if (!cv || !target) return false;
    const changed = constrainObjectToArea(target, toCanvasRect(printAreaRef.current));
    if (changed && hasLiveContext(cv)) {
      cv.renderAll();
    }
    return changed;
  }, []);

  const pushHistory = useCallback((cv: fabric.Canvas) => {
    if (isRestoringRef.current) return;
    const json = JSON.stringify(cv.toJSON(['id']));
    const list = historyRef.current.slice(0, historyIdxRef.current + 1);
    list.push(json);
    if (list.length > HISTORY_LIMIT) list.shift();
    historyRef.current = list;
    historyIdxRef.current = list.length - 1;
    updateHistoryState();
  }, []);

  useEffect(() => {
    if (!hostEl.current) return;
    const canvasNode = document.createElement('canvas');
    canvasNode.style.width = `${PRINT_W}px`;
    canvasNode.style.height = `${PRINT_H}px`;
    canvasNode.style.display = 'block';
    canvasNode.style.touchAction = allowPageScroll ? 'pan-y' : 'none';
    hostEl.current.innerHTML = '';
    hostEl.current.appendChild(canvasNode);

    const cv = new fabric.Canvas(canvasNode, {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      width: PRINT_W,
      height: PRINT_H,
      allowTouchScrolling: allowPageScroll,
      selection: false,
      targetFindTolerance: 14,
    });
    canvasRef.current = cv;

    const runtimeCanvas = cv as fabric.Canvas & {
      upperCanvasEl?: HTMLCanvasElement;
      lowerCanvasEl?: HTMLCanvasElement;
    };

    hostEl.current.style.touchAction = allowPageScroll ? 'pan-y' : 'none';
    hostEl.current.style.webkitUserSelect = 'none';
    setCanvasTouchAction(cv, allowPageScroll ? 'pan-y' : 'none');
    runtimeCanvas.upperCanvasEl?.style.setProperty('-webkit-user-select', 'none');
    runtimeCanvas.lowerCanvasEl?.style.setProperty('-webkit-user-select', 'none');
    cv.on('mouse:down', (e) => {
      if (e.target) onObjectSelectedRef.current(e.target);
    });
    cv.on('object:added', (e) => {
      lockImageProportions(e.target);
      constrainTarget(e.target);
      pushHistory(cv);
      onDesignChangeRef.current(side);
    });
    cv.on('object:modified', (e) => {
      constrainTarget(e.target);
      pushHistory(cv);
      onObjectSelectedRef.current(cv.getActiveObject() ?? null);
      onDesignChangeRef.current(side);
    });
    cv.on('object:removed', () => {
      pushHistory(cv);
      onDesignChangeRef.current(side);
    });
    cv.on('object:moving', (e) => {
      constrainTarget(e.target);
      cv.requestRenderAll();
    });
    cv.on('object:scaling', (e) => {
      keepImageUniform(e.target);
      constrainTarget(e.target);
      cv.requestRenderAll();
    });
    cv.on('object:rotating', (e) => {
      constrainTarget(e.target);
      cv.requestRenderAll();
    });
    cv.on('selection:created', (e) => onObjectSelectedRef.current(cv.getActiveObject() ?? e.selected?.[0] ?? null));
    cv.on('selection:updated', (e) => onObjectSelectedRef.current(cv.getActiveObject() ?? e.selected?.[0] ?? null));
    cv.on('selection:cleared', () => onObjectSelectedRef.current(null));

    pushHistory(cv);

    return () => {
      try { cv.dispose(); } catch { /* ignore disposal errors */ }
      canvasRef.current = null;
      try { if (hostEl.current) hostEl.current.innerHTML = ''; } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constrainTarget, pushHistory, side]);

  useEffect(() => {
    const cv = canvasRef.current;
    const host = hostEl.current;
    if (!cv || !host) return;
    const runtimeCanvas = cv as fabric.Canvas & { allowTouchScrolling?: boolean };
    runtimeCanvas.allowTouchScrolling = allowPageScroll;
    host.style.touchAction = allowPageScroll ? 'pan-y' : 'none';
    const canvasEl = cv.getElement();
    if (canvasEl) canvasEl.style.touchAction = allowPageScroll ? 'pan-y' : 'none';
    setCanvasTouchAction(cv, allowPageScroll ? 'pan-y' : 'none');
  }, [allowPageScroll]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !config) return;
    let cancelled = false;
    const imgSrc = side === 'front' ? config.frontImage : config.backImage;

    const canRender = () => !cancelled && canvasRef.current === cv && hasLiveContext(cv);

    if (!imgSrc) {
      cv.setBackgroundImage(null as unknown as fabric.Image, () => {
        if (!canRender()) return;
        cv.renderAll();
      });
      setBgLoaded(true);
      onDesignChangeRef.current(side);
      return () => {
        cancelled = true;
      };
    }
    setBgLoaded(false);
    fabric.Image.fromURL(imgSrc, (img) => {
      if (!canRender()) return;
      const scale = Math.max(PRINT_W / (img.width ?? 1), PRINT_H / (img.height ?? 1));
      img.scale(scale);
      img.set({
        left: PRINT_W / 2,
        top: PRINT_H / 2,
        originX: 'center',
        originY: 'center',
      });
      try {
        cv.setBackgroundImage(img, () => {
          if (!canRender()) return;
          try { cv.renderAll(); } catch { /* canvas disposed */ }
          setBgLoaded(true);
          onDesignChangeRef.current(side);
        });
      } catch {
        setBgLoaded(true);
        onDesignChangeRef.current(side);
      }
    }, { crossOrigin: 'anonymous' });
    return () => {
      cancelled = true;
    };
  }, [config, side]);

  const addImageFromUrl = useCallback((url: string) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const loadUrl = proxyCrossOriginUrl(url);
    fabric.Image.fromURL(loadUrl, (img) => {
      if (canvasRef.current !== cv || !hasLiveContext(cv)) return;
      const areaRect = toCanvasRect(printAreaRef.current);
      const maxW = areaRect.width * 0.72;
      const maxH = areaRect.height * 0.72;
      // No upper cap of 1 — small SVGs also scale up to fill the target area
      const scale = Math.min(maxW / (img.width ?? 200), maxH / (img.height ?? 200));
      img.scale(scale);
      img.set({
        left: areaRect.left + areaRect.width / 2,
        top: areaRect.top + areaRect.height / 2,
        originX: 'center',
        originY: 'center',
      });
      lockImageProportions(img);
      constrainObjectToArea(img, areaRect);
      cv.add(img);
      cv.setActiveObject(img);
      onObjectSelectedRef.current(img);
      cv.renderAll();
    }, { crossOrigin: 'anonymous' });
  }, []);

  const addText = useCallback((text: string, opts: Partial<fabric.ITextOptions> = {}) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const areaRect = toCanvasRect(printAreaRef.current);
    const txt = new fabric.IText(text, {
      left: areaRect.left + areaRect.width / 2,
      top: areaRect.top + areaRect.height / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter',
      fontSize: 36,
      fill: '#111827',
      ...opts,
    });
    applyObjectInteractionPreset(txt);
    constrainObjectToArea(txt, areaRect);
    cv.add(txt);
    cv.setActiveObject(txt);
    onObjectSelectedRef.current(txt);
    cv.renderAll();
  }, []);

  const deleteSelected = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getActiveObjects().forEach((o) => removeFabricObject(o));
    cv.discardActiveObject();
    clearCanvasTopLayer(cv);
    cv.renderAll();
  }, []);

  const cloneSelected = useCallback(() => {
    const cv = canvasRef.current;
    const obj = cv?.getActiveObject();
    if (!cv || !obj) return;
    obj.clone((cloned: fabric.Object) => {
      cloned.set({
        left: (obj.left ?? 0) + 18,
        top: (obj.top ?? 0) + 18,
      });
      lockImageProportions(cloned);
      constrainObjectToArea(cloned, toCanvasRect(printAreaRef.current));
      cv.add(cloned);
      cv.setActiveObject(cloned);
      cv.renderAll();
      onObjectSelectedRef.current(cloned);
    });
  }, []);

  const undo = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    isRestoringRef.current = true;
    cv.loadFromJSON(historyRef.current[historyIdxRef.current], () => {
      normalizeCanvasImages(cv);
      cv.renderAll();
      isRestoringRef.current = false;
      updateHistoryState();
    });
  }, []);

  const redo = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    isRestoringRef.current = true;
    cv.loadFromJSON(historyRef.current[historyIdxRef.current], () => {
      normalizeCanvasImages(cv);
      cv.renderAll();
      isRestoringRef.current = false;
      updateHistoryState();
    });
  }, []);

  const exportPng = useCallback((multiplier = 3, cleanBg = false) => {
    const cv = canvasRef.current;
    if (!cv) return '';
    if (!cleanBg) {
      return cv.toDataURL({ format: 'png', multiplier }) ?? '';
    }
    // Export without the t-shirt mockup background (artwork-only for print/DTF)
    const bg = cv.backgroundImage as fabric.Image | undefined;
    if (bg) {
      cv.backgroundImage = undefined as unknown as fabric.Image;
      cv.renderAll();
    }
    const dataUrl = cv.toDataURL({ format: 'png', multiplier });
    if (bg) {
      cv.backgroundImage = bg;
      cv.renderAll();
    }
    return dataUrl;
  }, []);

  const saveDesign = useCallback(() => {
    if (!canvasRef.current) return '';
    const json = JSON.stringify(canvasRef.current.toJSON(['id']));
    return unproxyJsonUrls(json);
  }, []);

  const loadDesign = useCallback((json: string) => {
    const cv = canvasRef.current;
    if (!cv || !json) return;
    isRestoringRef.current = true;
    const proxied = proxyJsonUrls(json);
    cv.loadFromJSON(proxied, () => {
      normalizeCanvasImages(cv);
      constrainCanvasObjects(cv, toCanvasRect(printAreaRef.current));
      cv.renderAll();
      isRestoringRef.current = false;
      pushHistory(cv);
      onDesignChangeRef.current(side);
    });
  }, [pushHistory, side]);

  useImperativeHandle(ref, () => ({
    addImageFromUrl,
    addText,
    cloneSelected,
    deleteSelected,
    undo,
    redo,
    getActiveObject: () => canvasRef.current?.getActiveObject() ?? null,
    exportPng,
    loadDesign,
    saveDesign,
    getCanvas: () => canvasRef.current,
    canvas: canvasRef.current,
  }), [addImageFromUrl, addText, cloneSelected, deleteSelected, undo, redo, exportPng, loadDesign, saveDesign]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const changed = constrainCanvasObjects(cv, toCanvasRect(printArea));
    if (changed) {
      cv.renderAll();
      onObjectSelectedRef.current(cv.getActiveObject() ?? null);
      onDesignChangeRef.current(side);
    }
  }, [printArea, side]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, undo, redo]);

  const isActive = side === activeSide;
  const zoomScale = zoom / 100;
  const areaRect = toCanvasRect(printArea);
  const mockupRect = toMockupRect(printArea);

  void canUndo;
  void canRedo;

  return (
    <div className={`flex h-full items-center justify-center ${isActive ? '' : 'hidden'}`}>
      <div
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: 'center center',
          transition: 'transform 180ms ease',
        }}
      >
        <div className="rounded-[30px] border border-white/80 bg-white/80 p-2 shadow-[0_18px_40px_rgba(148,163,184,0.28)] backdrop-blur">
          {/* Fixed size = canvas size so overlay coordinates align perfectly */}
          <div
            className="relative overflow-hidden rounded-[24px] bg-white"
            style={{ width: PRINT_W, height: PRINT_H }}
          >
            <div
              className="pointer-events-none absolute z-10 rounded-[14px] border-2 border-dashed"
              style={{
                left: areaRect.left,
                top: areaRect.top,
                width: areaRect.width,
                height: areaRect.height,
                borderColor: 'rgba(14, 165, 233, 0.22)',
              }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 z-20 md:hidden"
              style={{ height: areaRect.top, touchAction: 'pan-y' }}
            />
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 md:hidden"
              style={{ top: areaRect.top + areaRect.height, touchAction: 'pan-y' }}
            />
            <div
              className="pointer-events-none absolute left-0 z-20 md:hidden"
              style={{ top: areaRect.top, width: areaRect.left, height: areaRect.height, touchAction: 'pan-y' }}
            />
            <div
              className="pointer-events-none absolute right-0 z-20 md:hidden"
              style={{
                top: areaRect.top,
                left: areaRect.left + areaRect.width,
                height: areaRect.height,
                touchAction: 'pan-y',
              }}
            />
            {/* Loading overlay */}
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-slate-50/92 transition-opacity duration-200"
              style={{ opacity: bgLoaded ? 0 : 1, pointerEvents: bgLoaded ? 'none' : 'auto' }}
            >
              <span className="text-sm text-gray-400">Yükleniyor...</span>
            </div>
            {/* Canvas host — fabric injects its canvas here, starts at 0,0 */}
            <div ref={hostEl} />
          </div>
        </div>
      </div>
    </div>
  );
});

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
