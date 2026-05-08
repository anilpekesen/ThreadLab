import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import { useDesignerStore } from '@/store/designerStore';
import type { Side } from '@/types';

const PRINT_W = 300;
const PRINT_H = 380;

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
  canvas: fabric.Canvas | null;
}

interface Props {
  side: Side;
  zoom: number;
  onObjectSelected: (obj: fabric.Object | null) => void;
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

const CanvasArea = forwardRef<CanvasAreaHandle, Props>(({ side, zoom, onObjectSelected }, ref) => {
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

    cv.on('object:added', (e) => { lockImageProportions(e.target); pushHistory(cv); });
    cv.on('object:modified', () => {
      pushHistory(cv);
      onObjectSelected(cv.getActiveObject() ?? null);
    });
    cv.on('object:scaling', (e) => keepImageUniform(e.target));
    cv.on('object:removed', () => pushHistory(cv));
    cv.on('object:moving', () => onObjectSelected(cv.getActiveObject() ?? null));
    cv.on('object:scaling', () => onObjectSelected(cv.getActiveObject() ?? null));
    cv.on('object:rotating', () => onObjectSelected(cv.getActiveObject() ?? null));
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
  }, []);

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
      return () => {
        cancelled = true;
      };
    }
    setBgLoaded(false);
    fabric.Image.fromURL(imgSrc, (img) => {
      if (!canRender()) return;
      img.scaleToWidth(PRINT_W);
      img.scaleToHeight(PRINT_H);
      try {
        cv.setBackgroundImage(img, () => {
          if (!canRender()) return;
          try { cv.renderAll(); } catch { /* canvas disposed */ }
          setBgLoaded(true);
        });
      } catch {
        setBgLoaded(true);
      }
    }, { crossOrigin: 'anonymous' });
    return () => {
      cancelled = true;
    };
  }, [config, side]);

  const addImageFromUrl = useCallback((url: string) => {
    const cv = canvasRef.current;
    if (!cv) return;
    fabric.Image.fromURL(url, (img) => {
      if (canvasRef.current !== cv || !hasLiveContext(cv)) return;
      const maxW = PRINT_W * 0.7;
      const maxH = PRINT_H * 0.7;
      const scale = Math.min(maxW / (img.width ?? 1), maxH / (img.height ?? 1), 1);
      img.scale(scale);
      img.set({ left: PRINT_W / 2, top: PRINT_H / 2, originX: 'center', originY: 'center' });
      lockImageProportions(img);
      cv.add(img);
      cv.setActiveObject(img);
      cv.renderAll();
    }, { crossOrigin: 'anonymous' });
  }, []);

  const addText = useCallback((text: string, opts: Partial<fabric.ITextOptions> = {}) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const txt = new fabric.IText(text, {
      left: PRINT_W / 2,
      top: PRINT_H / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter',
      fontSize: 36,
      fill: '#111827',
      ...opts,
    });
    cv.add(txt);
    cv.setActiveObject(txt);
    cv.renderAll();
  }, []);

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
      cv.add(cloned);
      cv.setActiveObject(cloned);
      cv.renderAll();
      onObjectSelected(cloned);
    });
  }, [onObjectSelected]);

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
      cv.renderAll();
      isRestoringRef.current = false;
      pushHistory(cv);
    });
  }, [pushHistory]);

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
    canvas: canvasRef.current,
  }), [addImageFromUrl, addText, cloneSelected, deleteSelected, undo, redo, exportPng, loadDesign, saveDesign]);

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

  void canUndo;
  void canRedo;

  return (
    <div className={`flex h-full items-center justify-center ${isActive ? '' : 'hidden'}`}>
      <div
        className="relative"
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: 'center center',
          transition: 'transform 180ms ease',
        }}
      >
        <div className="rounded-[30px] border border-white/80 bg-white/80 p-2 shadow-[0_18px_40px_rgba(148,163,184,0.28)] backdrop-blur">
          <div className="group relative overflow-hidden rounded-[24px] bg-white">
            <div className="pointer-events-none absolute left-1/2 top-[22px] z-20 -translate-x-1/2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] text-sky-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              TASARIM ALANI
            </div>
            <div className="pointer-events-none absolute left-1/2 top-[38px] z-10 h-[230px] w-[180px] -translate-x-1/2 rounded-[18px] border border-dashed border-sky-300/80 bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]" />
            <div className="relative flex items-center justify-center">
              <div
                className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-slate-50/92 transition-opacity duration-200"
                style={{ opacity: bgLoaded ? 0 : 1, pointerEvents: bgLoaded ? 'none' : 'auto' }}
              >
                <span className="text-sm text-gray-400">Yükleniyor...</span>
              </div>
              <div ref={hostEl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
