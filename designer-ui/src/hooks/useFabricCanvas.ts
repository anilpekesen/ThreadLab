import { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import type { Side } from '@/types';
import { useDesignerStore } from '@/store/designerStore';

const HISTORY_LIMIT = 50;

export interface FabricCanvasHandle {
  canvas: fabric.Canvas | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  deleteSelected: () => void;
  getActiveObject: () => fabric.Object | null;
  addImageFromUrl: (url: string) => void;
  addText: (text: string, opts?: Partial<fabric.ITextOptions>) => void;
  saveDesign: () => string;
  loadDesign: (json: string) => void;
  exportPng: () => string;
}

export function useFabricCanvas(
  canvasEl: React.RefObject<HTMLCanvasElement>,
  side: Side,
  onObjectSelected: (obj: fabric.Object | null) => void,
): FabricCanvasHandle {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const historyRef = useRef<string[]>([]);
  const historyIdxRef = useRef<number>(-1);
  const isRestoringRef = useRef(false);
  const setCanvasJson = useDesignerStore((s) => s.setCanvasJson);

  const pushHistory = useCallback(() => {
    if (isRestoringRef.current || !canvasRef.current) return;
    const json = JSON.stringify(canvasRef.current.toJSON(['id']));
    const list = historyRef.current.slice(0, historyIdxRef.current + 1);
    list.push(json);
    if (list.length > HISTORY_LIMIT) list.shift();
    historyRef.current = list;
    historyIdxRef.current = list.length - 1;
    setCanvasJson(side, json);
  }, [side, setCanvasJson]);

  useEffect(() => {
    if (!canvasEl.current) return;
    const cv = new fabric.Canvas(canvasEl.current, {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      enableRetinaScaling: true,
    });
    canvasRef.current = cv;
    pushHistory();

    cv.on('object:added', pushHistory);
    cv.on('object:modified', pushHistory);
    cv.on('object:removed', pushHistory);
    cv.on('selection:created', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:updated', (e) => onObjectSelected(e.selected?.[0] ?? null));
    cv.on('selection:cleared', () => onObjectSelected(null));

    return () => { cv.dispose(); canvasRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0 || !canvasRef.current) return;
    historyIdxRef.current--;
    isRestoringRef.current = true;
    canvasRef.current.loadFromJSON(
      historyRef.current[historyIdxRef.current],
      () => { canvasRef.current?.renderAll(); isRestoringRef.current = false; },
    );
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1 || !canvasRef.current) return;
    historyIdxRef.current++;
    isRestoringRef.current = true;
    canvasRef.current.loadFromJSON(
      historyRef.current[historyIdxRef.current],
      () => { canvasRef.current?.renderAll(); isRestoringRef.current = false; },
    );
  }, []);

  const deleteSelected = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const active = cv.getActiveObjects();
    active.forEach((o) => cv.remove(o));
    cv.discardActiveObject();
    cv.renderAll();
  }, []);

  const addImageFromUrl = useCallback((url: string) => {
    const cv = canvasRef.current;
    if (!cv) return;
    fabric.Image.fromURL(url, (img) => {
      const maxW = cv.width! * 0.6;
      const maxH = cv.height! * 0.6;
      const scale = Math.min(maxW / img.width!, maxH / img.height!, 1);
      img.scale(scale);
      img.set({ left: cv.width! / 2, top: cv.height! / 2, originX: 'center', originY: 'center' });
      (img as fabric.Image & { id?: string }).id = `img_${Date.now()}`;
      cv.add(img);
      cv.setActiveObject(img);
      cv.renderAll();
    }, { crossOrigin: 'anonymous' });
  }, []);

  const addText = useCallback((text: string, opts: Partial<fabric.ITextOptions> = {}) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const txt = new fabric.IText(text, {
      left: cv.width! / 2,
      top: cv.height! / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Poppins',
      fontSize: 36,
      fill: '#ffffff',
      ...opts,
    });
    (txt as fabric.IText & { id?: string }).id = `txt_${Date.now()}`;
    cv.add(txt);
    cv.setActiveObject(txt);
    cv.renderAll();
  }, []);

  const saveDesign = useCallback(() => {
    if (!canvasRef.current) return '';
    return JSON.stringify(canvasRef.current.toJSON(['id']));
  }, []);

  const loadDesign = useCallback((json: string) => {
    const cv = canvasRef.current;
    if (!cv || !json) return;
    isRestoringRef.current = true;
    cv.loadFromJSON(json, () => { cv.renderAll(); isRestoringRef.current = false; pushHistory(); });
  }, [pushHistory]);

  const exportPng = useCallback(() => {
    if (!canvasRef.current) return '';
    return canvasRef.current.toDataURL({ format: 'png', multiplier: 3 });
  }, []);

  return {
    canvas: canvasRef.current,
    undo,
    redo,
    canUndo: historyIdxRef.current > 0,
    canRedo: historyIdxRef.current < historyRef.current.length - 1,
    deleteSelected,
    getActiveObject: () => canvasRef.current?.getActiveObject() ?? null,
    addImageFromUrl,
    addText,
    saveDesign,
    loadDesign,
    exportPng,
  };
}
