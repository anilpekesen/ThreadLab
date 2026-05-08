import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import { useDesignerStore } from '@/store/designerStore';
import type { Side } from '@/types';

const PRINT_W = 300;
const PRINT_H = 380;

export interface CanvasAreaHandle {
  addImageFromUrl: (url: string) => void;
  addText: (text: string, opts?: Partial<fabric.ITextOptions>) => void;
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

const CanvasArea = forwardRef<CanvasAreaHandle, Props>(({ side, zoom, onObjectSelected }, ref) => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
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
    if (!canvasEl.current) return;
    const cv = new fabric.Canvas(canvasEl.current, {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      width: PRINT_W,
      height: PRINT_H,
    });
    canvasRef.current = cv;

    cv.on('object:added', (e) => { lockImageProportions(e.target); pushHistory(cv); });
    cv.on('object:modified', () => pushHistory(cv));
    cv.on('object:scaling', (e) => keepImageUniform(e.target));
    cv.on('object:removed', () => pushHistory(cv));
    cv.on('selection:created', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:updated', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:cleared', () => onObjectSelected(null));

    pushHistory(cv);

    return () => {
      cv.dispose();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !config) return;
    const imgSrc = side === 'front' ? config.frontImage : config.backImage;
    if (!imgSrc) {
      cv.setBackgroundImage(null as unknown as fabric.Image, () => {
        cv.renderAll();
      });
      setBgLoaded(true);
      return;
    }
    setBgLoaded(false);
    fabric.Image.fromURL(imgSrc, (img) => {
      img.scaleToWidth(PRINT_W);
      img.scaleToHeight(PRINT_H);
      cv.setBackgroundImage(img, () => {
        cv.renderAll();
        setBgLoaded(true);
      });
    }, { crossOrigin: 'anonymous' });
  }, [config, side]);

  const addImageFromUrl = useCallback((url: string) => {
    const cv = canvasRef.current;
    if (!cv) return;
    fabric.Image.fromURL(url, (img) => {
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
    deleteSelected,
    undo,
    redo,
    getActiveObject: () => canvasRef.current?.getActiveObject() ?? null,
    exportPng,
    loadDesign,
    saveDesign,
    canvas: canvasRef.current,
  }), [addImageFromUrl, addText, deleteSelected, undo, redo, exportPng, loadDesign, saveDesign]);

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
        className="relative mx-auto"
        style={{
          transform: `scale(${zoomScale})`,
          transformOrigin: 'center center',
          transition: 'transform 180ms ease',
        }}
      >
        <div className="rounded-[34px] bg-white/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <div className="group relative overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.12)]">
            <div className="pointer-events-none absolute inset-5 rounded-[20px] border-2 border-dashed border-blue-300/75" />
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-blue-500 shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
              Tasarım Alanı
            </div>

            <div className="relative" style={{ width: PRINT_W, height: PRINT_H }}>
              {!bgLoaded && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[18px] bg-slate-50/95">
                  <span className="text-sm font-semibold text-slate-400">Yükleniyor...</span>
                </div>
              )}
              <div className="overflow-hidden rounded-[18px] shadow-sm">
                <canvas
                  ref={canvasEl}
                  style={{
                    width: `${PRINT_W}px`,
                    height: `${PRINT_H}px`,
                    display: 'block',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
