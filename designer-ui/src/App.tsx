import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fabric } from 'fabric';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bookmark,
  ChevronDown,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Menu,
  MousePointer2,
  Move,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Scissors,
  ShoppingBag,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import CanvasArea, { type CanvasAreaHandle } from '@/components/canvas/CanvasArea';
import ImagePanel from '@/components/panels/ImagePanel';
import TextPanel from '@/components/panels/TextPanel';
import TemplatesPanel, { type Template } from '@/components/panels/TemplatesPanel';
import SavedPanel from '@/components/panels/SavedPanel';
import type { DesignerConfig, SavedDesign } from '@/types';
import { generateId } from '@/utils/compress';

type Tab = 'image' | 'text' | 'layers' | 'templates' | 'saved' | null;

type InteractionMode = 'selection' | 'navigation';

interface ObjectState {
  type: 'text' | 'image';
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

const MAIN_TABS: { id: 'image' | 'text' | 'layers'; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'image', label: 'Görsel', Icon: ImageIcon },
  { id: 'text', label: 'Metin', Icon: Type },
  { id: 'layers', label: 'Katmanlar', Icon: Layers },
];

const TOOLBAR_FONTS = ['Inter', 'Roboto', 'Arial', 'Montserrat', 'Playfair Display', 'Oswald'];

function readConfig(): DesignerConfig {
  const w = window as typeof window & { __DESIGNER_CONFIG__?: DesignerConfig };
  if (w.__DESIGNER_CONFIG__) return w.__DESIGNER_CONFIG__;
  const p = new URLSearchParams(window.location.search);
  let variants: DesignerConfig['variants'] = [];
  try { variants = JSON.parse(p.get('variants') ?? '[]') as DesignerConfig['variants']; } catch { variants = []; }
  return {
    productHandle: p.get('handle') ?? '',
    productTitle: p.get('title') ?? 'Tişört',
    frontImage: p.get('front') ?? '',
    backImage: p.get('back') ?? '',
    shirtColor: p.get('color') ?? '#1C1C1E',
    variants,
    currency: p.get('currency') ?? 'TRY',
    locale: p.get('locale') ?? 'tr-TR',
    uploadEndpoint: p.get('upload') ?? '/apps/tshirt-designer/upload',
    singleVariantId: p.get('singleVariantId') ?? '',
    doubleVariantId: p.get('doubleVariantId') ?? '',
    singlePrice: Number(p.get('singlePrice') ?? 0),
    doublePrice: Number(p.get('doublePrice') ?? 0),
  };
}

function applyConfig(
  cfg: DesignerConfig,
  setConfig: (config: DesignerConfig) => void,
  setSelectedSize: (size: string) => void,
) {
  setConfig(cfg);
  if (cfg.variants?.length) {
    const first = cfg.variants.find((v) => v.available);
    setSelectedSize(first?.option2 ?? cfg.variants[0]?.option2 ?? '');
  }
}

function priceToCents(price: string | number | undefined): number {
  if (typeof price === 'number') return price;
  if (!price) return 0;
  if (/^\d+$/.test(price)) return Number(price);
  return Math.round(Number(price) * 100);
}

function printOptionForSide(side: 'front' | 'back' | 'double') {
  if (side === 'double') return 'Ön + Arka Baskı';
  return side === 'back' ? 'Arka Baskı' : 'Ön Baskı';
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function App() {
  const {
    config, setConfig,
    activeSide, setActiveSide,
    selectedSize, setSelectedSize,
    quantity, setQuantity,
    addSavedDesign, printSide, setPrintSide,
    setIsBgRemoving,
  } = useDesignerStore();

  const frontCanvasRef = useRef<CanvasAreaHandle>(null);
  const backCanvasRef = useRef<CanvasAreaHandle>(null);

  const [activeTab, setActiveTab] = useState<Tab>(null);
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [objState, setObjState] = useState<ObjectState | null>(null);
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState<fabric.Object[]>([]);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('selection');
  const [sceneOffset, setSceneOffset] = useState({ x: 0, y: 0 });
  const [isDraggingScene, setIsDraggingScene] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState({ front: '', back: '' });
  const [textDraft, setTextDraft] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);

  const getActiveCanvasHandle = useCallback(() => (
    activeSide === 'front' ? frontCanvasRef.current : backCanvasRef.current
  ), [activeSide]);

  const syncLayers = useCallback(() => {
    const cv = getActiveCanvasHandle()?.canvas;
    setLayers(cv ? [...cv.getObjects()] : []);
  }, [getActiveCanvasHandle]);

  const updateToolbarPosition = useCallback((obj: fabric.Object | null) => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv || !obj) {
      setToolbarPos(null);
      return;
    }
    const canvasEl = cv.getElement();
    if (!canvasEl) {
      setToolbarPos(null);
      return;
    }
    const bounds = obj.getBoundingRect();
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = rect.width / cv.getWidth();
    const scaleY = rect.height / cv.getHeight();
    const centerX = rect.left + (bounds.left + bounds.width / 2) * scaleX;
    const aboveY = rect.top + bounds.top * scaleY - 86;
    const belowY = rect.top + (bounds.top + bounds.height) * scaleY + 20;
    setToolbarPos({
      x: centerX,
      y: aboveY > 20 ? aboveY : belowY,
    });
  }, [getActiveCanvasHandle]);

  useEffect(() => {
    applyConfig(readConfig(), setConfig, setSelectedSize);
  }, [setConfig, setSelectedSize]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.type !== 'DESIGNER_INIT' || !payload.config) return;
      applyConfig(payload.config as DesignerConfig, setConfig, setSelectedSize);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setConfig, setSelectedSize]);

  useEffect(() => {
    syncLayers();
  }, [activeSide, syncLayers]);

  useEffect(() => {
    if (!selectedObj) return;
    const onResize = () => updateToolbarPosition(selectedObj);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [selectedObj, updateToolbarPosition]);

  const handleObjectSelected = useCallback((obj: fabric.Object | null) => {
    setSelectedObj(obj);
    if (!obj) {
      setObjState(null);
      setToolbarPos(null);
      syncLayers();
      return;
    }
    if (obj.type === 'text' || obj.type === 'i-text') {
      const text = obj as fabric.Text;
      setObjState({
        type: 'text',
        color: typeof text.fill === 'string' ? text.fill : '#111827',
        fontSize: text.fontSize ?? 40,
        fontFamily: text.fontFamily ?? 'Inter',
        isBold: text.fontWeight === 'bold',
        isItalic: text.fontStyle === 'italic',
        textAlign: (text.textAlign as 'left' | 'center' | 'right') ?? 'center',
      });
    } else {
      setObjState({ type: 'image' });
    }
    updateToolbarPosition(obj);
    syncLayers();
  }, [syncLayers, updateToolbarPosition]);

  const handleAddImage = (url: string) => {
    getActiveCanvasHandle()?.addImageFromUrl(url);
    syncLayers();
    setActiveTab(null);
  };

  const handleSubmitText = () => {
    const value = textDraft.trim();
    const cv = getActiveCanvasHandle()?.canvas;
    if (!value || !cv) return;
    if (isEditingText && selectedObj && (selectedObj.type === 'text' || selectedObj.type === 'i-text')) {
      const text = selectedObj as fabric.Text;
      text.set('text', value);
      text.setCoords();
      cv.fire('object:modified', { target: text });
      cv.renderAll();
      handleObjectSelected(text);
    } else {
      getActiveCanvasHandle()?.addText(value, {
        fontFamily: 'Inter',
        fontSize: 40,
        fill: '#111827',
        textAlign: 'center',
      });
    }
    setTextDraft('');
    setIsEditingText(false);
    syncLayers();
    setActiveTab(null);
  };

  const handleApplyTemplate = (tpl: Template) => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv) return;
    tpl.build(cv);
    cv.renderAll();
    syncLayers();
    setActiveTab(null);
  };

  const handleSave = () => {
    const frontJson = frontCanvasRef.current?.saveDesign() ?? '';
    const backJson = backCanvasRef.current?.saveDesign() ?? '';
    const thumbnail = frontCanvasRef.current?.exportPng(0.5) ?? '';
    const name = `Tasarım ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    const design: SavedDesign = { id: generateId(), name, thumbnail, frontJson, backJson, createdAt: Date.now() };
    addSavedDesign(design);
    setActiveTab('saved');
  };

  const handleLoadSaved = (frontJson: string, backJson: string) => {
    frontCanvasRef.current?.loadDesign(frontJson);
    backCanvasRef.current?.loadDesign(backJson);
    setActiveSide('front');
    setActiveTab(null);
    window.setTimeout(syncLayers, 0);
  };

  const handleRemoveBg = async (dataUrl: string): Promise<string> => {
    setIsBgRemoving(true);
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const form = new FormData();
      form.append('image_file', blob, 'image.jpg');
      const apiKey = (window as typeof window & { REMOVE_BG_KEY?: string }).REMOVE_BG_KEY ?? '';
      if (!apiKey) {
        alert('Remove.bg API key ayarlanmamış');
        return '';
      }
      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: form,
      });
      if (!res.ok) {
        alert('Arka plan kaldırma başarısız');
        return '';
      }
      const blob2 = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob2);
      });
    } finally {
      setIsBgRemoving(false);
    }
  };

  const handlePreview = () => {
    setPreviewImages({
      front: frontCanvasRef.current?.exportPng(2) ?? '',
      back: backCanvasRef.current?.exportPng(2) ?? '',
    });
    setShowPreview(true);
  };

  const handleAddToCart = async () => {
    const frontPng = frontCanvasRef.current?.exportPng() ?? '';
    const backPng = backCanvasRef.current?.exportPng() ?? '';
    const frontHas = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
    const backHas = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
    const resolvedSide = frontHas && backHas ? 'double' : backHas ? 'back' : 'front';
    const printOption = printOptionForSide(resolvedSide);
    const selectedVariant = config?.variants?.find((v) => (!selectedSize || v.option2 === selectedSize) && v.option3 === printOption);
    const variantId = selectedVariant?.id ?? (resolvedSide === 'double' ? config?.doubleVariantId : config?.singleVariantId) ?? '';
    if (!variantId) {
      alert('Lütfen bir beden seçin');
      return;
    }
    const price = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);
    const designRes = await fetch('/api/storefront/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: config?.productHandle,
        designJson: {
          front: frontCanvasRef.current?.saveDesign(),
          back: backCanvasRef.current?.saveDesign(),
        },
        previewUrl: frontPng,
      }),
    }).then((r) => r.json());
    const token = designRes.token ?? '';
    const properties: Record<string, string> = {
      'Ön Tasarım': frontPng ? 'Var' : 'Yok',
      design_token: token,
      'Ön önizleme': frontPng.slice(0, 200),
    };
    if (resolvedSide !== 'front') properties['Arka Tasarım'] = backPng ? 'Var' : 'Yok';
    window.parent.postMessage({ type: 'DESIGNER_ADD_TO_CART', variantId, quantity, properties, designToken: token, price }, '*');
  };

  const deleteSelected = () => {
    getActiveCanvasHandle()?.deleteSelected();
    setSelectedObj(null);
    setObjState(null);
    setToolbarPos(null);
    syncLayers();
  };

  const duplicateSelected = () => {
    getActiveCanvasHandle()?.cloneSelected();
    syncLayers();
  };

  const updateTextProp = (props: Partial<ObjectState>) => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv || !selectedObj || (selectedObj.type !== 'text' && selectedObj.type !== 'i-text')) return;
    const text = selectedObj as fabric.Text;
    if (props.color !== undefined) text.set('fill', props.color);
    if (props.fontSize !== undefined) text.set('fontSize', props.fontSize);
    if (props.fontFamily !== undefined) text.set('fontFamily', props.fontFamily);
    if (props.textAlign !== undefined) text.set('textAlign', props.textAlign);
    if (props.isBold !== undefined) text.set('fontWeight', props.isBold ? 'bold' : 'normal');
    if (props.isItalic !== undefined) text.set('fontStyle', props.isItalic ? 'italic' : 'normal');
    text.setCoords();
    setObjState((prev) => (prev ? { ...prev, ...props } : null));
    cv.fire('object:modified', { target: text });
    cv.renderAll();
    updateToolbarPosition(text);
  };

  const centerSelectedObject = () => {
    const cv = getActiveCanvasHandle()?.canvas;
    const obj = cv?.getActiveObject();
    if (!cv || !obj) return;
    obj.set({
      left: cv.getWidth() / 2,
      top: cv.getHeight() / 2,
      originX: 'center',
      originY: 'center',
    });
    obj.setCoords();
    cv.fire('object:modified', { target: obj });
    cv.renderAll();
    handleObjectSelected(obj);
  };

  const toggleLayerOrder = () => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv || !selectedObj) return;
    const objects = cv.getObjects();
    const currentIndex = objects.indexOf(selectedObj);
    if (currentIndex === objects.length - 1) cv.sendToBack(selectedObj);
    else cv.bringToFront(selectedObj);
    cv.fire('object:modified', { target: selectedObj });
    cv.renderAll();
    syncLayers();
    handleObjectSelected(selectedObj);
  };

  const editText = () => {
    if (!selectedObj || (selectedObj.type !== 'text' && selectedObj.type !== 'i-text')) return;
    setTextDraft((selectedObj as fabric.Text).text ?? '');
    setIsEditingText(true);
    setActiveTab('text');
  };

  const alignHorizontal = (alignment: 'left' | 'center' | 'right') => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv || !selectedObj) return;
    if (selectedObj.type === 'text' || selectedObj.type === 'i-text') {
      updateTextProp({ textAlign: alignment });
    }
    if (alignment === 'left') {
      selectedObj.set({
        left: selectedObj.getScaledWidth() / 2 + 6,
        originX: 'center',
      });
    } else if (alignment === 'center') {
      selectedObj.set({
        left: cv.getWidth() / 2,
        originX: 'center',
      });
    } else {
      selectedObj.set({
        left: cv.getWidth() - selectedObj.getScaledWidth() / 2 - 6,
        originX: 'center',
      });
    }
    selectedObj.setCoords();
    cv.fire('object:modified', { target: selectedObj });
    cv.renderAll();
    handleObjectSelected(selectedObj);
  };

  const selectAllLayers = () => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv) return;
    const objects = cv.getObjects();
    if (!objects.length) return;
    cv.discardActiveObject();
    const selection = new fabric.ActiveSelection(objects, { canvas: cv });
    cv.setActiveObject(selection);
    cv.renderAll();
    setInteractionMode('selection');
    cv.selection = true;
    handleObjectSelected(selection);
  };

  const resetViewport = () => {
    setZoom(100);
    setSceneOffset({ x: 0, y: 0 });
  };

  const handleSceneMouseDown = (e: React.MouseEvent) => {
    if (interactionMode !== 'navigation') return;
    setIsDraggingScene(true);
    setDragStart({
      x: e.clientX - sceneOffset.x,
      y: e.clientY - sceneOffset.y,
    });
  };

  const handleSceneMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingScene || interactionMode !== 'navigation') return;
    setSceneOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleSceneMouseUp = () => {
    setIsDraggingScene(false);
  };

  const handleLayerDragStart = (index: number) => {
    setDraggedLayerIndex(index);
  };

  const handleLayerDrop = (index: number) => {
    const cv = getActiveCanvasHandle()?.canvas;
    if (!cv || draggedLayerIndex === null) return;
    const objects = cv.getObjects();
    const sourceIndex = objects.length - 1 - draggedLayerIndex;
    const targetIndex = objects.length - 1 - index;
    const sourceObject = objects[sourceIndex];
    if (sourceObject) {
      cv.moveTo(sourceObject, targetIndex);
      cv.renderAll();
      syncLayers();
    }
    setDraggedLayerIndex(null);
  };

  const frontHasDesign = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
  const backHasDesign = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
  const resolvedSide = frontHasDesign && backHasDesign ? 'double' : backHasDesign ? 'back' : printSide === 'double' ? 'front' : activeSide;
  const selectedVariant = config?.variants?.find((v) => (!selectedSize || v.option2 === selectedSize) && v.option3 === printOptionForSide(resolvedSide));
  const price = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);
  const formattedPrice = price
    ? new Intl.NumberFormat(config?.locale ?? 'tr-TR', {
        style: 'currency',
        currency: config?.currency ?? 'TRY',
        maximumFractionDigits: 0,
      }).format(price / 100)
    : '';

  const sizes = useMemo(
    () => [...new Set(config?.variants?.map((v) => v.option2).filter(Boolean) ?? [])],
    [config?.variants],
  );

  const reversedLayers = [...layers].reverse();

  return (
    <div className="flex h-full items-center justify-center bg-[#f3f4f6] p-0 text-gray-900 sm:p-6">
      <div className="flex h-full min-h-0 w-full max-w-[820px] flex-1 flex-col overflow-hidden bg-white shadow-none sm:max-h-[920px] sm:flex-none sm:rounded-[32px] sm:shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2.5 md:px-4 md:py-3">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors hover:bg-gray-50 md:px-3 md:text-sm">
              <Menu className="h-5 w-5 text-gray-600" />
              <span className="hidden md:inline">Yardım</span>
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-0.5 md:gap-1">
              <button
                onClick={() => getActiveCanvasHandle()?.undo()}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-50 md:p-2"
                title="Geri al"
              >
                <Undo2 className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <button
                onClick={() => getActiveCanvasHandle()?.redo()}
                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-50 md:p-2"
                title="İleri al"
              >
                <Redo2 className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            </div>
            <button
              onClick={handlePreview}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 md:bg-gray-50 md:px-4 md:py-2 md:text-sm md:text-gray-700 md:hover:bg-gray-100"
            >
              <Eye className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span>Önizleme</span>
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F9FAFB]">
          <div className="relative z-40 flex w-full border-b border-gray-100 bg-white">
            {MAIN_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveTab(activeTab === id ? null : id);
                  if (id !== 'text') {
                    setIsEditingText(false);
                    setTextDraft('');
                  }
                }}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition-all',
                  activeTab === id ? 'border-blue-600 bg-blue-50/30 text-blue-600' : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                )}
              >
                <Icon className="h-6 w-6" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 md:p-8"
            onMouseMove={handleSceneMouseMove}
            onMouseUp={handleSceneMouseUp}
            onMouseLeave={handleSceneMouseUp}
          >
            <div
              onMouseDown={handleSceneMouseDown}
              className="relative"
              style={{
                transform: `translate(${sceneOffset.x}px, ${sceneOffset.y}px)`,
                transition: isDraggingScene ? 'none' : 'transform 0.15s ease-out',
                cursor: interactionMode === 'navigation' ? (isDraggingScene ? 'grabbing' : 'grab') : 'default',
              }}
            >
              <div className="relative rounded-3xl bg-white/40 p-2 shadow-inner backdrop-blur-sm md:p-4">
                <div className={activeSide === 'front' ? 'block' : 'hidden'}>
                  <CanvasArea ref={frontCanvasRef} side="front" zoom={zoom} onObjectSelected={handleObjectSelected} />
                </div>
                <div className={activeSide === 'back' ? 'block' : 'hidden'}>
                  <CanvasArea ref={backCanvasRef} side="back" zoom={zoom} onObjectSelected={handleObjectSelected} />
                </div>

                <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-2xl border border-white/50 bg-white/90 p-1.5 shadow-xl backdrop-blur md:bottom-6 md:gap-3 md:p-2">
                  {([
                    { side: 'front' as const, label: 'Ön', image: config?.frontImage, hasDesign: frontHasDesign },
                    { side: 'back' as const, label: 'Arka', image: config?.backImage, hasDesign: backHasDesign },
                  ]).map(({ side, label, image, hasDesign }) => (
                    <div key={side} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveSide(side)}
                        className={cn(
                          'h-20 w-16 overflow-hidden rounded-lg border-2 p-0.5 transition-all',
                          activeSide === side ? 'scale-105 border-blue-500 shadow-md' : 'border-transparent opacity-60 hover:opacity-100',
                        )}
                      >
                        {image ? (
                          <img src={image} className="h-full w-full rounded object-cover" alt={label} />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-400">{label}</div>
                        )}
                      </button>
                      <span className={cn('text-[10px] font-bold uppercase', activeSide === side ? 'text-blue-600' : 'text-gray-400')}>
                        {label}
                      </span>
                      {hasDesign && <span className="sr-only">tasarım var</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="absolute bottom-24 right-4 z-30 flex scale-95 flex-col gap-2 origin-right md:right-6 md:top-1/2 md:-translate-y-1/2 md:scale-100 md:gap-3">
              <div className="flex w-16 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-20">
                <button
                  onClick={() => {
                    setInteractionMode('selection');
                    const cv = getActiveCanvasHandle()?.canvas;
                    if (cv) {
                      cv.selection = true;
                      cv.renderAll();
                    }
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center rounded-t-2xl border-b border-gray-100 p-2.5 transition-colors md:p-3',
                    interactionMode === 'selection' ? 'bg-blue-50/50 text-blue-600' : 'text-gray-400 hover:bg-gray-50',
                  )}
                >
                  <MousePointer2 className="h-5 w-5" />
                  <span className="mt-1 block text-[7px] font-bold uppercase tracking-tighter md:text-[9px]">Seçim</span>
                </button>
                <button
                  onClick={selectAllLayers}
                  className="flex w-full flex-col items-center justify-center border-b border-gray-100 p-2.5 text-gray-500 transition-colors hover:bg-gray-50 md:p-3"
                >
                  <LayoutGrid className="h-5 w-5" />
                  <span className="mt-1 block text-center text-[7px] font-bold uppercase tracking-tighter md:text-[9px]">Toplu S.</span>
                </button>
                <button
                  onClick={() => {
                    setInteractionMode('navigation');
                    const cv = getActiveCanvasHandle()?.canvas;
                    if (cv) {
                      cv.discardActiveObject();
                      cv.selection = false;
                      cv.renderAll();
                    }
                    setSelectedObj(null);
                    setObjState(null);
                    setToolbarPos(null);
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center rounded-b-2xl p-2.5 transition-colors md:p-3',
                    interactionMode === 'navigation' ? 'bg-blue-50/50 text-blue-600' : 'text-gray-400 hover:bg-gray-50',
                  )}
                >
                  <Move className="h-5 w-5" />
                  <span className="mt-1 block text-center text-[7px] font-bold uppercase tracking-tighter md:text-[9px]">Gezinme</span>
                </button>
              </div>

              <div className="flex w-16 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-20">
                <button
                  onClick={() => setZoom((value) => Math.min(300, value + 20))}
                  className="flex w-full justify-center rounded-t-2xl border-b border-gray-100 p-2.5 text-gray-400 transition-colors hover:bg-gray-50 md:p-3"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <button
                  onClick={resetViewport}
                  className="w-full select-none bg-gray-50 py-2 text-center text-[9px] font-black text-gray-600 transition-colors hover:bg-gray-100 md:py-3 md:text-[11px]"
                  title="Sıfırla"
                >
                  {zoom}%
                </button>
                <button
                  onClick={() => setZoom((value) => Math.max(20, value - 20))}
                  className="flex w-full justify-center rounded-b-2xl p-2.5 text-gray-400 transition-colors hover:bg-gray-50 md:p-3"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {activeTab && (
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 left-0 z-50 w-full overflow-hidden rounded-t-[32px] border-t border-gray-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
              >
                <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3 md:px-6 md:py-4">
                  <h3 className="text-base font-bold text-gray-800 md:text-lg">
                    {activeTab === 'image' ? 'Medya Ekle' : activeTab === 'text' ? 'Yazı Ekle' : activeTab === 'layers' ? 'Katmanlar' : activeTab === 'templates' ? 'Şablonlar' : 'Kayıtlı Tasarımlar'}
                  </h3>
                  <button
                    onClick={() => {
                      setActiveTab(null);
                      setIsEditingText(false);
                      setTextDraft('');
                    }}
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-5 w-5 md:h-6 md:w-6" />
                  </button>
                </div>

                <div className="max-h-[54vh] overflow-y-auto p-6">
                  {activeTab === 'image' && (
                    <ImagePanel onAddImage={handleAddImage} onRemoveBg={handleRemoveBg} />
                  )}

                  {activeTab === 'text' && (
                    <TextPanel
                      value={textDraft}
                      onChange={setTextDraft}
                      onSubmit={handleSubmitText}
                      isEditing={isEditingText}
                    />
                  )}

                  {activeTab === 'layers' && (
                    <div className="space-y-3 pr-2">
                      {reversedLayers.length === 0 ? (
                        <div className="py-12 text-center text-gray-400">
                          <Layers className="mx-auto mb-3 h-12 w-12 opacity-20" />
                          <p className="font-medium">Henüz katman eklenmemiş</p>
                        </div>
                      ) : (
                        reversedLayers.map((obj, index) => {
                          const isText = obj.type === 'text' || obj.type === 'i-text';
                          const activeObject = getActiveCanvasHandle()?.canvas?.getActiveObject();
                          return (
                            <div
                              key={index}
                              draggable
                              onDragStart={() => handleLayerDragStart(index)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleLayerDrop(index)}
                              onClick={() => {
                                const cv = getActiveCanvasHandle()?.canvas;
                                if (!cv) return;
                                cv.setActiveObject(obj);
                                cv.renderAll();
                                handleObjectSelected(obj);
                              }}
                              className={cn(
                                'flex cursor-pointer items-center justify-between rounded-2xl border-2 bg-white p-3 transition-all',
                                activeObject === obj ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-100 hover:border-gray-200',
                                draggedLayerIndex === index && 'border-dashed border-blue-400 opacity-50',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="text-gray-300">
                                  <Menu className="h-4 w-4" />
                                </div>
                                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                                  {isText ? <Type className="h-5 w-5 text-gray-400" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}
                                </div>
                                <div>
                                  <p className="max-w-[150px] truncate text-sm font-bold text-gray-700">
                                    {isText ? `Metin: ${((obj as fabric.Text).text ?? '').trim()}` : 'Görsel Katmanı'}
                                  </p>
                                  <span className="text-[10px] font-black uppercase text-gray-400">Katman {reversedLayers.length - index}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cv = getActiveCanvasHandle()?.canvas;
                                  if (!cv) return;
                                  cv.remove(obj);
                                  cv.renderAll();
                                  syncLayers();
                                }}
                                className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {activeTab === 'templates' && (
                    <TemplatesPanel onApply={handleApplyTemplate} />
                  )}

                  {activeTab === 'saved' && (
                    <SavedPanel onLoad={handleLoadSaved} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedObj && toolbarPos && !activeTab && !showPreview && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 5 }}
                transition={{ type: 'spring', damping: 25, stiffness: 400, mass: 0.6 }}
                className="fixed z-[100] flex items-center justify-center"
                style={{ left: toolbarPos.x, top: toolbarPos.y, transform: 'translateX(-50%)' }}
              >
                <div className="pointer-events-auto flex max-w-[95vw] items-center gap-0.5 overflow-x-auto rounded-[20px] border border-white/50 bg-white/95 p-1 shadow-[0_10px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl no-scrollbar md:max-w-none md:gap-1 md:rounded-[28px] md:p-2">
                  {objState?.type === 'text' ? (
                    <>
                      <label className="relative flex shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl border-r border-gray-100 px-2 py-1.5 hover:bg-gray-50/50 md:gap-1 md:px-3 md:py-2">
                        <div className="h-5 w-5 rounded-full border border-gray-200 shadow-inner md:h-6 md:w-6" style={{ backgroundColor: objState.color }} />
                        <span className="text-[9px] font-bold text-gray-500 md:text-[10px]">Renk</span>
                        <input
                          type="color"
                          value={objState.color ?? '#111827'}
                          onChange={(e) => updateTextProp({ color: e.target.value })}
                          className="absolute inset-0 opacity-0"
                        />
                      </label>

                      <button
                        onClick={editText}
                        className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border-r border-gray-100 px-2 py-1.5 transition-colors hover:bg-gray-50/50 md:gap-1 md:px-3 md:py-2"
                      >
                        <Scissors className="h-4 w-4 text-gray-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-gray-500 md:text-[10px]">Düzenle</span>
                      </button>

                      <div className="flex shrink-0 items-center gap-1 border-r border-gray-100 px-2 md:gap-2 md:px-3">
                        <div className="flex flex-col items-center gap-0.5 md:gap-1">
                          <input
                            type="number"
                            min={8}
                            max={120}
                            value={objState.fontSize ?? 40}
                            onChange={(e) => updateTextProp({ fontSize: Number(e.target.value) || 40 })}
                            className="w-10 rounded-lg border bg-gray-50 py-0.5 text-center text-xs font-bold md:w-12 md:py-1 md:text-sm"
                          />
                          <span className="text-[9px] font-bold text-gray-400 md:text-[10px]">Boyut</span>
                        </div>
                      </div>

                      <div className="group relative flex shrink-0 items-center border-r border-gray-100 px-2 md:px-3">
                        <select
                          value={objState.fontFamily ?? 'Inter'}
                          onChange={(e) => updateTextProp({ fontFamily: e.target.value })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          {TOOLBAR_FONTS.map((font) => (
                            <option key={font} value={font}>{font}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 rounded-xl bg-gray-50 px-2 py-1.5 text-[11px] font-bold text-gray-700 transition-colors group-hover:bg-gray-100 md:px-3 md:py-2 md:text-sm">
                          <span className="max-w-[40px] truncate md:max-w-[60px]">{objState.fontFamily ?? 'Inter'}</span>
                          <ChevronDown className="h-3 w-3 text-gray-400" />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5 border-r border-gray-100 px-1 md:gap-1 md:px-2">
                        <button
                          onClick={() => updateTextProp({ isBold: !objState.isBold })}
                          className={cn('rounded-lg p-1.5 transition-colors md:p-2', objState.isBold ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50')}
                        >
                          <span className="text-sm font-black md:text-base">B</span>
                        </button>
                        <button
                          onClick={() => updateTextProp({ isItalic: !objState.isItalic })}
                          className={cn('rounded-lg p-1.5 transition-colors md:p-2', objState.isItalic ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50')}
                        >
                          <span className="text-sm font-bold italic md:text-base">I</span>
                        </button>

                        <div className="flex rounded-lg bg-gray-50 p-0.5">
                          <button
                            onClick={() => alignHorizontal('left')}
                            className={cn('rounded p-1 transition-colors md:p-1.5', objState.textAlign === 'left' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                          >
                            <AlignLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </button>
                          <button
                            onClick={() => alignHorizontal('center')}
                            className={cn('rounded p-1 transition-colors md:p-1.5', objState.textAlign === 'center' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                          >
                            <AlignCenter className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </button>
                          <button
                            onClick={() => alignHorizontal('right')}
                            className={cn('rounded p-1 transition-colors md:p-1.5', objState.textAlign === 'right' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                          >
                            <AlignRight className="h-3.5 w-3.5 md:h-4 md:w-4" />
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={centerSelectedObject}
                        className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors hover:bg-gray-50 md:gap-1 md:px-4 md:py-2"
                      >
                        <Sparkles className="h-4 w-4 text-gray-500 group-hover:text-blue-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500 md:text-[10px]">Ortala</span>
                      </button>

                      <button
                        onClick={toggleLayerOrder}
                        className="group ml-1 flex min-w-[70px] shrink-0 flex-col items-center gap-0.5 rounded-xl border-x border-gray-100 px-3 py-1.5 transition-colors hover:bg-gray-50 md:ml-2 md:gap-1 md:px-4 md:py-2"
                      >
                        <Layers className="h-4 w-4 text-gray-500 group-hover:text-blue-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold uppercase text-gray-500 group-hover:text-blue-500 md:text-[10px]">
                          {(() => {
                            const objects = getActiveCanvasHandle()?.canvas?.getObjects() ?? [];
                            return objects.indexOf(selectedObj) === objects.length - 1 ? 'Arkaya' : 'Öne';
                          })()}
                        </span>
                      </button>

                      <button
                        onClick={deleteSelected}
                        className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-red-50 md:gap-1 md:px-3 md:py-2"
                      >
                        <Trash2 className="h-4 w-4 text-red-400 group-hover:text-red-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-red-400 group-hover:text-red-500 md:text-[10px]">Kaldır</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={centerSelectedObject}
                        className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors hover:bg-gray-50 md:gap-1 md:px-4 md:py-2"
                      >
                        <Sparkles className="h-4 w-4 text-gray-500 group-hover:text-blue-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500 md:text-[10px]">Ortala</span>
                      </button>
                      <button
                        onClick={duplicateSelected}
                        className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl border-x border-gray-100 px-3 py-1.5 transition-colors hover:bg-gray-50 md:gap-1 md:px-4 md:py-2"
                      >
                        <Plus className="h-4 w-4 text-gray-500 group-hover:text-blue-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500 md:text-[10px]">Kopyala</span>
                      </button>
                      <button
                        onClick={toggleLayerOrder}
                        className="group flex min-w-[70px] shrink-0 flex-col items-center gap-0.5 rounded-xl border-r border-gray-100 px-3 py-1.5 transition-colors hover:bg-gray-50 md:gap-1 md:px-4 md:py-2"
                      >
                        <Layers className="h-4 w-4 text-gray-500 group-hover:text-blue-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold uppercase text-gray-500 group-hover:text-blue-500 md:text-[10px]">
                          {(() => {
                            const objects = getActiveCanvasHandle()?.canvas?.getObjects() ?? [];
                            return objects.indexOf(selectedObj) === objects.length - 1 ? 'Arkaya' : 'Öne';
                          })()}
                        </span>
                      </button>
                      <button
                        onClick={deleteSelected}
                        className="group flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors hover:bg-red-50 md:gap-1 md:px-4 md:py-2"
                      >
                        <Trash2 className="h-4 w-4 text-red-400 group-hover:text-red-500 md:h-5 md:w-5" />
                        <span className="text-[9px] font-bold text-red-400 group-hover:text-red-500 md:text-[10px]">Kaldır</span>
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                onClick={() => setShowPreview(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-gray-100 px-8 py-6">
                    <h3 className="text-xl font-black">Tasarım Önizleme</h3>
                    <button onClick={() => setShowPreview(false)} className="rounded-full p-2 transition-colors hover:bg-gray-100">
                      <X className="h-6 w-6 text-gray-500" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                      <div className="flex flex-col gap-4">
                        <span className="text-center text-sm font-black uppercase tracking-widest text-gray-400">Ön Cephe</span>
                        <div className="relative aspect-[5/6] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
                          {previewImages.front ? (
                            <img src={previewImages.front} className="absolute inset-0 h-full w-full object-cover" alt="Ön tasarım" />
                          ) : config?.frontImage ? (
                            <img src={config.frontImage} className="absolute inset-0 h-full w-full object-cover" alt="Ön mockup" />
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col gap-4">
                        <span className="text-center text-sm font-black uppercase tracking-widest text-gray-400">Arka Cephe</span>
                        <div className="relative aspect-[5/6] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
                          {previewImages.back ? (
                            <img src={previewImages.back} className="absolute inset-0 h-full w-full object-cover" alt="Arka tasarım" />
                          ) : config?.backImage ? (
                            <img src={config.backImage} className="absolute inset-0 h-full w-full object-cover" alt="Arka mockup" />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end border-t border-gray-100 bg-white p-6">
                    <button
                      onClick={() => setShowPreview(false)}
                      className="rounded-xl bg-blue-600 px-8 py-3 font-black text-white shadow-lg shadow-blue-500/30 transition-colors hover:bg-blue-700"
                    >
                      Kapat
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="border-t border-gray-100 bg-white px-4 py-2.5 md:px-6 md:py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {(['single', 'double'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setPrintSide(value)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                      printSide === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100',
                    )}
                  >
                    {value === 'single' ? 'Tek Yüz' : 'Çift Yüz'}
                  </button>
                ))}
              </div>

              {sizes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sizes.map((size) => (
                    <button
                      key={size!}
                      onClick={() => setSelectedSize(size!)}
                      className={cn(
                        'h-8 rounded-lg border px-3 text-xs font-bold transition-colors',
                        selectedSize === size ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100',
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="h-8 w-8 rounded-lg bg-gray-100 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200">−</button>
                <span className="w-8 text-center text-sm font-semibold">{quantity}</span>
                <button type="button" onClick={() => setQuantity(quantity + 1)} className="h-8 w-8 rounded-lg bg-gray-100 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-200">+</button>
              </div>

              <button
                onClick={() => setActiveTab('templates')}
                className="hidden rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 lg:inline-flex"
              >
                Şablonlar
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Kayıtlar
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Save className="h-3.5 w-3.5" />
                Kaydet
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              {formattedPrice && <span className="text-base font-black text-gray-900">{formattedPrice}</span>}
              <button
                onClick={handleAddToCart}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              >
                <ShoppingBag className="h-4 w-4" />
                Sepete Ekle
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
