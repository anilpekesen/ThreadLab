import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { AnimatePresence, motion } from 'motion/react';
import {
  Menu,
  Undo2,
  Redo2,
  Eye,
  Image as ImageIcon,
  Type,
  Layers,
  X,
  Upload,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Move,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
  Plus,
  LayoutGrid,
  Save,
  Bookmark,
  ShoppingBag,
  Sparkles,
  Scissors,
  Droplets,
  CircleDashed,
  RefreshCw,
  Maximize2,
  Unlock,
} from 'lucide-react';
import { useDesignerStore } from '@/store/designerStore';
import CanvasArea, { type CanvasAreaHandle } from '@/components/canvas/CanvasArea';
import ImagePanel from '@/components/panels/ImagePanel';
import TextPanel from '@/components/panels/TextPanel';
import TemplatesPanel, { type Template } from '@/components/panels/TemplatesPanel';
import SavedPanel from '@/components/panels/SavedPanel';
import PropertiesPanel from '@/components/panels/PropertiesPanel';
import type { DesignerConfig, SavedDesign } from '@/types';
import { generateId } from '@/utils/compress';

type Tab = 'image' | 'text' | 'layers' | 'templates' | 'saved' | null;

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

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

const MAIN_TABS: { id: 'image' | 'text' | 'layers'; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'image', label: 'Görsel', Icon: ImageIcon },
  { id: 'text', label: 'Metin', Icon: Type },
  { id: 'layers', label: 'Katmanlar', Icon: Layers },
];

interface ObjectState {
  type: 'text' | 'image';
  color?: string;
  fontSize?: number;
  isBold?: boolean;
  textAlign?: 'left' | 'center' | 'right';
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

  const activeCanvas = activeSide === 'front' ? frontCanvasRef : backCanvasRef;

  const syncLayers = useCallback(() => {
    const cv = activeCanvas.current?.canvas;
    setLayers(cv ? [...cv.getObjects()] : []);
  }, [activeCanvas]);

  const handleObjectSelected = useCallback((obj: fabric.Object | null) => {
    setSelectedObj(obj);
    if (!obj) {
      setObjState(null);
      return;
    }
    if (obj.type === 'text' || obj.type === 'i-text') {
      const t = obj as fabric.Text;
      setObjState({
        type: 'text',
        color: t.fill as string,
        fontSize: t.fontSize,
        isBold: t.fontWeight === 'bold',
        textAlign: (t.textAlign as 'left' | 'center' | 'right') ?? 'center',
      });
    } else {
      setObjState({ type: 'image' });
    }
    syncLayers();
  }, [syncLayers]);

  const handleAddImage = (url: string) => {
    activeCanvas.current?.addImageFromUrl(url);
    syncLayers();
    setActiveTab(null);
  };

  const handleAddText = (text: string, opts: Record<string, unknown>) => {
    activeCanvas.current?.addText(text, opts);
    syncLayers();
    setActiveTab(null);
  };

  const handleApplyTemplate = (tpl: Template) => {
    const cv = activeSide === 'front' ? frontCanvasRef.current?.canvas : backCanvasRef.current?.canvas;
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
        reader.onload = (e) => resolve(e.target!.result as string);
        reader.readAsDataURL(blob2);
      });
    } finally {
      setIsBgRemoving(false);
    }
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
    if (!selectedObj) return;
    activeCanvas.current?.canvas?.remove(selectedObj);
    activeCanvas.current?.canvas?.discardActiveObject();
    activeCanvas.current?.canvas?.renderAll();
    setSelectedObj(null);
    setObjState(null);
    syncLayers();
  };

  const updateTextProp = (props: Partial<ObjectState>) => {
    const cv = activeCanvas.current?.canvas;
    if (!cv || !selectedObj || (selectedObj.type !== 'text' && selectedObj.type !== 'i-text')) return;
    const t = selectedObj as fabric.Text;
    if (props.color !== undefined) t.set('fill', props.color);
    if (props.fontSize !== undefined) t.set('fontSize', props.fontSize);
    if (props.isBold !== undefined) t.set('fontWeight', props.isBold ? 'bold' : 'normal');
    if (props.textAlign !== undefined) t.set('textAlign', props.textAlign);
    setObjState((prev) => prev ? { ...prev, ...props } : null);
    cv.renderAll();
  };

  const centerSelectedObject = () => {
    const cv = activeCanvas.current?.canvas;
    const obj = cv?.getActiveObject();
    if (!cv || !obj) return;
    obj.set({
      left: cv.getWidth() / 2,
      top: cv.getHeight() / 2,
      originX: 'center',
      originY: 'center',
    });
    obj.setCoords();
    cv.renderAll();
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
  const sizes = [...new Set(config?.variants?.map((v) => v.option2).filter(Boolean) ?? [])];

  const panelTitle =
    activeTab === 'image' ? 'Medya Ekle'
    : activeTab === 'text' ? 'Yazı Ekle'
    : activeTab === 'layers' ? 'Katmanlar'
    : activeTab === 'templates' ? 'Şablonlar'
    : 'Kayıtlı Tasarımlar';

  return (
    <div className="flex h-full flex-col bg-[#f3f4f6] font-sans text-gray-900">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-white shadow-none sm:m-4 sm:rounded-[28px] sm:shadow-2xl sm:shadow-slate-200/70">
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 z-50">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50">
              <Menu className="h-5 w-5 text-gray-600" />
              <span>Yardım</span>
            </button>
            <div className="hidden text-sm font-semibold text-gray-700 lg:block">
              {config?.productTitle ?? 'Tişört Tasarım Uygulaması'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => activeCanvas.current?.undo()}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50"
            >
              <Undo2 className="h-5 w-5" />
            </button>
            <button
              onClick={() => activeCanvas.current?.redo()}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50"
            >
              <Redo2 className="h-5 w-5" />
            </button>
            <button onClick={() => setActiveTab('templates')} className="hidden rounded-lg bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 lg:inline-flex">Şablonlar</button>
            <button onClick={() => setActiveTab('saved')} className="hidden rounded-lg bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 lg:inline-flex">Kayıtlar</button>
            <button onClick={handleSave} className="hidden items-center gap-2 rounded-lg bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100 lg:inline-flex">
              <Save className="h-4 w-4" />
              <span>Kaydet</span>
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100">
              <Eye className="h-4 w-4" />
              <span>Önizleme</span>
            </button>
            <button
              onClick={() => window.parent.postMessage({ type: 'DESIGNER_CLOSE' }, '*')}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-hidden bg-[#F9FAFB]">
          <div className="relative z-40 flex w-full border-b border-gray-100 bg-white">
            {MAIN_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(activeTab === id ? null : id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition-all',
                  activeTab === id
                    ? 'border-blue-600 bg-blue-50/30 text-blue-600'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                )}
              >
                <Icon className="h-6 w-6" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="relative flex w-full min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
            <div className="relative group rounded-3xl bg-white/40 p-4 shadow-inner backdrop-blur-sm">
              <div className={activeSide === 'front' ? 'block' : 'hidden'}>
                <CanvasArea ref={frontCanvasRef} side="front" zoom={zoom} onObjectSelected={handleObjectSelected} />
              </div>
              <div className={activeSide === 'back' ? 'block' : 'hidden'}>
                <CanvasArea ref={backCanvasRef} side="back" zoom={zoom} onObjectSelected={handleObjectSelected} />
              </div>

              <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 gap-3 rounded-2xl border border-white/50 bg-white/90 p-2 shadow-xl backdrop-blur">
                {([
                  { side: 'front' as const, label: 'Ön', image: config?.frontImage, active: activeSide === 'front', hasDesign: frontHasDesign },
                  { side: 'back' as const, label: 'Arka', image: config?.backImage, active: activeSide === 'back', hasDesign: backHasDesign },
                ]).map(({ side, label, image, active, hasDesign }) => (
                  <button
                    key={side}
                    onClick={() => setActiveSide(side)}
                    className={cn(
                      'w-16 rounded-lg border-2 p-0.5 transition-all',
                      active ? 'scale-105 border-blue-500 shadow-md' : 'border-transparent opacity-60 hover:opacity-100',
                    )}
                  >
                    <div className="h-20 overflow-hidden rounded bg-gray-100">
                      {image ? (
                        <img src={image} className="h-full w-full object-cover" alt={label} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] font-bold text-gray-400">
                          {label}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <span className="text-[10px] font-bold text-gray-600">{label}</span>
                      {hasDesign && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-3 sm:right-6 sm:flex">
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                <button className="border-b border-gray-100 bg-blue-50/50 p-3 text-blue-600 transition-colors hover:bg-blue-50">
                  <MousePointer2 className="mx-auto h-5 w-5" />
                  <span className="mt-1 block text-[8px] font-bold uppercase">Seçim</span>
                </button>
                <button className="p-3 text-gray-500 transition-colors hover:bg-gray-50">
                  <Move className="mx-auto h-5 w-5" />
                  <span className="mt-1 block text-[8px] font-bold uppercase">Gezinme</span>
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
                <button
                  onClick={() => setZoom((z) => Math.min(200, z + 10))}
                  className="border-b border-gray-100 p-3 text-gray-400 transition-colors hover:bg-gray-50"
                >
                  <ZoomIn className="h-5 w-5" />
                </button>
                <div className="select-none bg-gray-50 py-2 text-center text-[10px] font-black text-gray-600">
                  {zoom}%
                </div>
                <button
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className="p-3 text-gray-400 transition-colors hover:bg-gray-50"
                >
                  <ZoomOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {activeTab && (
              <motion.div
                key={activeTab}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 left-0 z-50 w-full overflow-hidden rounded-t-[32px] border-t border-gray-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
              >
                <div className="flex items-center justify-between border-b border-gray-50 px-6 py-4">
                  <h3 className="text-lg font-bold text-gray-800">{panelTitle}</h3>
                  <button
                    onClick={() => setActiveTab(null)}
                    className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="max-h-[52vh] overflow-y-auto p-6">
                  {activeTab === 'image' && (
                    <ImagePanel onAddImage={handleAddImage} onRemoveBg={handleRemoveBg} />
                  )}
                  {activeTab === 'text' && (
                    <TextPanel onAddText={handleAddText} />
                  )}
                  {activeTab === 'layers' && (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {layers.length === 0 ? (
                        <div className="py-12 text-center text-gray-400">
                          <Layers className="mx-auto mb-3 h-12 w-12 opacity-20" />
                          <p className="font-medium">Henüz katman eklenmemiş</p>
                        </div>
                      ) : (
                        [...layers].reverse().map((obj, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              activeCanvas.current?.canvas?.setActiveObject(obj);
                              activeCanvas.current?.canvas?.renderAll();
                              handleObjectSelected(obj);
                            }}
                            className={cn(
                              'flex cursor-pointer items-center justify-between rounded-2xl border-2 p-3 transition-all',
                              activeCanvas.current?.canvas?.getActiveObject() === obj
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-gray-100 hover:border-gray-200',
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                                {(obj.type === 'text' || obj.type === 'i-text')
                                  ? <Type className="h-5 w-5 text-gray-400" />
                                  : <ImageIcon className="h-5 w-5 text-gray-400" />}
                              </div>
                              <div>
                                <p className="text-sm font-bold capitalize text-gray-700">
                                  {(obj.type === 'text' || obj.type === 'i-text')
                                    ? ((obj as fabric.Text).text ?? '').substring(0, 15)
                                    : 'Görsel Katmanı'}
                                </p>
                                <span className="text-[10px] font-black uppercase text-gray-400">Katman {layers.length - i}</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                activeCanvas.current?.canvas?.remove(obj);
                                activeCanvas.current?.canvas?.renderAll();
                                syncLayers();
                              }}
                              className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))
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
            {selectedObj && !activeTab && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-10 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 px-3"
              >
                <div className="flex flex-wrap items-center gap-1 rounded-[28px] border border-white/50 bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
                  {objState?.type === 'text' ? (
                    <>
                      <label className="relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border-r border-gray-100 px-3 py-2 hover:bg-gray-50/50">
                        <div className="h-6 w-6 rounded-full border border-gray-200 shadow-inner" style={{ backgroundColor: objState.color }} />
                        <span className="text-[10px] font-bold text-gray-500">Renk</span>
                        <input
                          type="color"
                          value={objState.color ?? '#111827'}
                          onChange={(e) => updateTextProp({ color: e.target.value })}
                          className="absolute inset-0 opacity-0"
                        />
                      </label>

                      <div className="flex items-center gap-2 border-r border-gray-100 px-3">
                        <input
                          type="number"
                          min={8}
                          max={120}
                          value={objState.fontSize ?? 30}
                          onChange={(e) => updateTextProp({ fontSize: Number(e.target.value) || 30 })}
                          className="w-14 rounded-lg border bg-gray-50 py-1 text-center text-sm font-bold text-gray-700"
                        />
                      </div>

                      <div className="flex items-center px-3 border-r border-gray-100">
                        <div className="flex items-center gap-1 rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700">
                          <span>Roboto</span>
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>

                      <div className="flex items-center gap-1 border-r border-gray-100 px-2">
                        {([
                          { key: 'left' as const, Icon: AlignLeft },
                          { key: 'center' as const, Icon: AlignCenter },
                          { key: 'right' as const, Icon: AlignRight },
                        ]).map(({ key, Icon }) => (
                          <button
                            key={key}
                            onClick={() => updateTextProp({ textAlign: key })}
                            className={cn(
                              'rounded-lg p-2 transition-colors',
                              objState.textAlign === key ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50',
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        ))}
                        <button
                          onClick={() => updateTextProp({ isBold: !objState.isBold })}
                          className={cn(
                            'rounded-lg p-2 transition-colors',
                            objState.isBold ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50',
                          )}
                        >
                          <span className="text-lg font-black">B</span>
                        </button>
                        <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-50">
                          <Maximize2 className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-50">
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>

                      <button
                        onClick={deleteSelected}
                        className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Kaldır</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={centerSelectedObject} className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-500">
                        <Sparkles className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Ortala</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 rounded-xl border-x border-gray-50 px-4 py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-500">
                        <Scissors className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Düzenle</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-blue-500">
                        <Droplets className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Arkaplan K.</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 rounded-xl border-x border-gray-50 px-4 py-2 text-gray-500 transition-colors hover:bg-gray-50">
                        <CircleDashed className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Renk Kapla</span>
                      </button>
                      <button className="flex flex-col items-center gap-1 rounded-xl px-4 py-2 text-gray-500 transition-colors hover:bg-gray-50">
                        <RefreshCw className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Kontür Ver</span>
                      </button>
                      <button className="ml-2 flex flex-col items-center gap-1 rounded-2xl border border-gray-200 bg-gray-100 px-3 py-5 text-gray-600 transition-colors hover:bg-gray-200">
                        <Unlock className="h-5 w-5" />
                        <span className="text-[10px] font-bold">Dönüştür</span>
                      </button>
                      <button onClick={deleteSelected} className="ml-2 rounded-full p-3 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500">
                        <X className="h-7 w-7" />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="border-t border-gray-100 bg-white px-4 py-2.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

              <div className="flex items-center gap-1 ml-auto lg:ml-0">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="h-7 w-7 rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200">−</button>
                <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="h-7 w-7 rounded-lg bg-gray-100 text-sm font-bold text-gray-600 hover:bg-gray-200">+</button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {formattedPrice && <span className="text-base font-black text-gray-900">{formattedPrice}</span>}
              <button
                onClick={() => setActiveTab('saved')}
                className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 lg:hidden"
              >
                <Bookmark className="h-4 w-4" />
                Kayıtlar
              </button>
              <button
                onClick={handleAddToCart}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
              >
                Sepete Ekle
              </button>
            </div>
          </div>
        </footer>

        <div className="hidden">
          <PropertiesPanel selectedObject={selectedObj} onChanged={() => activeCanvas.current?.canvas?.renderAll()} />
        </div>
      </div>
    </div>
  );
}
