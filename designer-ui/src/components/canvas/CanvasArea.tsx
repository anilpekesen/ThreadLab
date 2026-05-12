import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import { useDesignerStore } from '@/store/designerStore';
import type { PrintAreaConfig, Side } from '@/types';

const PRINT_W = 480;
const PRINT_H = 580;

export interface CanvasAreaHandle {
  addImageFromUrl: (url: string) => void;
  addText: (text: string, opts?: Partial<fabric.ITextOptions>) => void;
  cloneSelected: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
  getActiveObject: () => fabric.Object | null;
  exportPng: (multiplier?: number) => string;
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
  onObjectSelected: (obj: fabric.Object | null) => void;
  onDesignChange: (side: Side) => void;
}

const HISTORY_LIMIT = 50;

function isImageObject(obj: fabric.Object | null | undefined): obj is fabric.Image {
  return obj?.type === 'image';
}

function lockImageProportions(obj: fabric.Object | null | undefined) {
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
  cv.getObjects().forEach(lockImageProportions);
}

function hasLiveContext(cv: fabric.Canvas) {
  const runtimeCanvas = cv as fabric.Canvas & { contextContainer?: CanvasRenderingContext2D | null };
  return Boolean(cv.getElement()) && Boolean(runtimeCanvas.contextContainer);
}

function toCanvasRect(area: PrintAreaConfig) {
  return {
    left: (area.x / 480) * PRINT_W,
    top: (area.y / 580) * PRINT_H,
    width: (area.width / 480) * PRINT_W,
    height: (area.height / 580) * PRINT_H,
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

const CanvasArea = forwardRef<CanvasAreaHandle, Props>(({ side, zoom, printArea, onObjectSelected, onDesignChange }, ref) => {
  const hostEl = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const isRestoringRef = useRef(false);

  const { config, activeSide } = useDesignerStore();
  const [bgLoaded, setBgLoaded] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = () => {
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  };

  const constrainTarget = useCallback((target: fabric.Object | null | undefined) => {
    const cv = canvasRef.current;
    if (!cv || !target) return false;
    const changed = constrainObjectToArea(target, toCanvasRect(printArea));
    if (changed && hasLiveContext(cv)) {
      cv.renderAll();
    }
    return changed;
  }, [printArea]);

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
    hostEl.current.innerHTML = '';
    hostEl.current.appendChild(canvasNode);

    const cv = new fabric.Canvas(canvasNode, {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      width: PRINT_W,
      height: PRINT_H,
    });
    canvasRef.current = cv;

    cv.on('object:added', (e) => {
      lockImageProportions(e.target);
      constrainTarget(e.target);
      pushHistory(cv);
      onDesignChange(side);
    });
    cv.on('object:modified', (e) => {
      constrainTarget(e.target);
      pushHistory(cv);
      onObjectSelected(cv.getActiveObject() ?? null);
      onDesignChange(side);
    });
    cv.on('object:scaling', (e) => keepImageUniform(e.target));
    cv.on('object:removed', () => {
      pushHistory(cv);
      onDesignChange(side);
    });
    cv.on('object:moving', (e) => {
      constrainTarget(e.target);
      onObjectSelected(cv.getActiveObject() ?? null);
      onDesignChange(side);
    });
    cv.on('object:scaling', (e) => {
      constrainTarget(e.target);
      onObjectSelected(cv.getActiveObject() ?? null);
      onDesignChange(side);
    });
    cv.on('object:rotating', (e) => {
      constrainTarget(e.target);
      onObjectSelected(cv.getActiveObject() ?? null);
      onDesignChange(side);
    });
    cv.on('selection:created', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:updated', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:cleared', () => onObjectSelected(null));

    pushHistory(cv);

    return () => {
      try { cv.dispose(); } catch { /* ignore disposal errors */ }
      canvasRef.current = null;
      try { if (hostEl.current) hostEl.current.innerHTML = ''; } catch { /* ignore */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constrainTarget, onDesignChange, onObjectSelected, pushHistory, side]);

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
      onDesignChange(side);
      return () => {
        cancelled = true;
      };
    }
    setBgLoaded(false);
    fabric.Image.fromURL(imgSrc, (img) => {
      if (!canRender()) return;
      const scale = Math.min(PRINT_W / (img.width ?? 1), PRINT_H / (img.height ?? 1));
      img.scale(scale);
      img.set({
        left: (PRINT_W - scale * (img.width ?? 0)) / 2,
        top: (PRINT_H - scale * (img.height ?? 0)) / 2,
      });
      try {
        cv.setBackgroundImage(img, () => {
          if (!canRender()) return;
          try { cv.renderAll(); } catch { /* canvas disposed */ }
          setBgLoaded(true);
          onDesignChange(side);
        });
      } catch {
        setBgLoaded(true);
        onDesignChange(side);
      }
    }, { crossOrigin: 'anonymous' });
    return () => {
      cancelled = true;
    };
  }, [config, onDesignChange, side]);

  const addImageFromUrl = useCallback((url: string) => {
    const cv = canvasRef.current;
    if (!cv) return;
    fabric.Image.fromURL(url, (img) => {
      if (canvasRef.current !== cv || !hasLiveContext(cv)) return;
      const areaRect = toCanvasRect(printArea);
      const maxW = areaRect.width * 0.78;
      const maxH = areaRect.height * 0.78;
      const scale = Math.min(maxW / (img.width ?? 1), maxH / (img.height ?? 1), 1);
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
      cv.renderAll();
    }, { crossOrigin: 'anonymous' });
  }, [printArea]);

  const addText = useCallback((text: string, opts: Partial<fabric.ITextOptions> = {}) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const areaRect = toCanvasRect(printArea);
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
    constrainObjectToArea(txt, areaRect);
    cv.add(txt);
    cv.setActiveObject(txt);
    cv.renderAll();
  }, [printArea]);

  const deleteSelected = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getActiveObjects().forEach((o) => cv.remove(o));
    cv.discardActiveObject();
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
      constrainObjectToArea(cloned, toCanvasRect(printArea));
      cv.add(cloned);
      cv.setActiveObject(cloned);
      cv.renderAll();
      onObjectSelected(cloned);
    });
  }, [onObjectSelected, printArea]);

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

  const exportPng = useCallback((multiplier = 3) => {
    return canvasRef.current?.toDataURL({ format: 'png', multiplier }) ?? '';
  }, []);

  const saveDesign = useCallback(() => {
    return canvasRef.current ? JSON.stringify(canvasRef.current.toJSON(['id'])) : '';
  }, []);

  const loadDesign = useCallback((json: string) => {
    const cv = canvasRef.current;
    if (!cv || !json) return;
    isRestoringRef.current = true;
    cv.loadFromJSON(json, () => {
      normalizeCanvasImages(cv);
      constrainCanvasObjects(cv, toCanvasRect(printArea));
      cv.renderAll();
      isRestoringRef.current = false;
      pushHistory(cv);
      onDesignChange(side);
    });
  }, [onDesignChange, printArea, pushHistory, side]);

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
      onObjectSelected(cv.getActiveObject() ?? null);
      onDesignChange(side);
    }
  }, [onDesignChange, onObjectSelected, printArea, side]);

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
            {/* Size label */}
            <div className="pointer-events-none absolute left-1/2 top-[14px] z-20 -translate-x-1/2 rounded-full bg-white/92 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-sky-500 shadow-sm">
              {Math.round(printArea.realWidthMm / 10)} × {Math.round(printArea.realHeightMm / 10)} CM
            </div>
            {/* Print area overlay — same coordinate space as fabric canvas */}
            <div
              className="pointer-events-none absolute z-10 rounded-[14px] border-2 border-dashed border-sky-400 bg-sky-100/20"
              style={{
                left: areaRect.left,
                top: areaRect.top,
                width: areaRect.width,
                height: areaRect.height,
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
