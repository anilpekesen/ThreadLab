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
  onObjectSelected: (obj: fabric.Object | null) => void;
}

const HISTORY_LIMIT = 50;

const CanvasArea = forwardRef<CanvasAreaHandle, Props>(({ side, onObjectSelected }, ref) => {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

    cv.on('object:added', () => pushHistory(cv));
    cv.on('object:modified', () => pushHistory(cv));
    cv.on('object:removed', () => pushHistory(cv));
    cv.on('selection:created', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:updated', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:cleared', () => onObjectSelected(null));

    pushHistory(cv);

    return () => { cv.dispose(); canvasRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load bg image when side or config changes
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !config) return;
    const imgSrc = side === 'front' ? config.frontImage : config.backImage;
    if (!imgSrc) { cv.setBackgroundImage(null as unknown as fabric.Image, () => { cv.renderAll(); }); setBgLoaded(true); return; }
    setBgLoaded(false);
    fabric.Image.fromURL(imgSrc, (img) => {
      img.scaleToWidth(PRINT_W);
      img.scaleToHeight(PRINT_H);
      cv.setBackgroundImage(img, () => { cv.renderAll(); setBgLoaded(true); });
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
      cv.add(img);
      cv.setActiveObject(img);
      cv.renderAll();
    }, { crossOrigin: 'anonymous' });
  }, []);

  const addText = useCallback((text: string, opts: Partial<fabric.ITextOptions> = {}) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const txt = new fabric.IText(text, {
      left: PRINT_W / 2, top: PRINT_H / 2,
      originX: 'center', originY: 'center',
      fontFamily: 'Poppins', fontSize: 36, fill: '#ffffff',
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
    historyIdxRef.current--;
    isRestoringRef.current = true;
    cv.loadFromJSON(historyRef.current[historyIdxRef.current], () => {
      cv.renderAll(); isRestoringRef.current = false; updateHistoryState();
    });
  }, []);

  const redo = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    isRestoringRef.current = true;
    cv.loadFromJSON(historyRef.current[historyIdxRef.current], () => {
      cv.renderAll(); isRestoringRef.current = false; updateHistoryState();
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
    cv.loadFromJSON(json, () => { cv.renderAll(); isRestoringRef.current = false; pushHistory(cv); });
  }, [pushHistory]);

  useImperativeHandle(ref, () => ({
    addImageFromUrl, addText, deleteSelected, undo, redo,
    getActiveObject: () => canvasRef.current?.getActiveObject() ?? null,
    exportPng, loadDesign, saveDesign,
    canvas: canvasRef.current,
  }), [addImageFromUrl, addText, deleteSelected, undo, redo, exportPng, loadDesign, saveDesign]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, undo, redo]);

  const isActive = side === activeSide;

  return (
    <div
      ref={wrapRef}
      className={`flex flex-col items-center justify-center h-full ${isActive ? '' : 'hidden'}`}
    >
      {/* Undo/Redo bar */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="px-3 py-1 rounded bg-panel border border-border text-xs disabled:opacity-30 hover:bg-zinc-700"
          title="Geri Al (Ctrl+Z)"
        >↩ Geri Al</button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="px-3 py-1 rounded bg-panel border border-border text-xs disabled:opacity-30 hover:bg-zinc-700"
          title="İleri Al"
        >↪ İleri Al</button>
        <button
          onClick={deleteSelected}
          className="px-3 py-1 rounded bg-red-900/40 border border-red-800 text-xs hover:bg-red-900/70"
          title="Seçili Sil (Delete)"
        >🗑 Sil</button>
      </div>

      {/* Canvas wrapper with print area indicator */}
      <div className="relative" style={{ width: PRINT_W, height: PRINT_H }}>
        {!bgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-800 rounded-lg">
            <span className="text-zinc-400 text-sm">Yükleniyor...</span>
          </div>
        )}
        <div className="rounded-lg overflow-hidden border-2 border-dashed border-zinc-600">
          <canvas ref={canvasEl} />
        </div>
        {/* Print boundary hint */}
        <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-zinc-500">
          Baskı alanı: {PRINT_W}×{PRINT_H}px
        </div>
      </div>
    </div>
  );
});

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
