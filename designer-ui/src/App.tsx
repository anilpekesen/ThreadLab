import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { AnimatePresence, motion } from 'motion/react';
import {
  Undo2, Redo2, Image as ImageIcon, Type, Layers, X, ZoomIn, ZoomOut,
  MousePointer2, Move, Trash2, AlignLeft, AlignCenter, AlignRight,
  LayoutGrid, Save, Bookmark, ShoppingBag,
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

const TABS: { id: Exclude<Tab, null>; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'image', label: 'Görsel', Icon: ImageIcon },
  { id: 'text', label: 'Metin', Icon: Type },
  { id: 'layers', label: 'Katmanlar', Icon: Layers },
  { id: 'templates', label: 'Şablonlar', Icon: LayoutGrid },
  { id: 'saved', label: 'Kayıtlar', Icon: Bookmark },
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

  const [activeTab, setActiveTab] = useState<Tab>('image');
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [objState, setObjState] = useState<ObjectState | null>(null);
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState<fabric.Object[]>([]);

  useEffect(() => {
    const cfg = readConfig();
    setConfig(cfg);
    if (cfg.variants?.length) {
      const first = cfg.variants.find((v) => v.available);
      setSelectedSize(first?.option2 ?? cfg.variants[0]?.option2 ?? '');
    }
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
  };

  const handleAddText = (text: string, opts: Record<string, unknown>) => {
    activeCanvas.current?.addText(text, opts);
    syncLayers();
  };

  const handleApplyTemplate = (tpl: Template) => {
    const cv = activeSide === 'front' ? frontCanvasRef.current?.canvas : backCanvasRef.current?.canvas;
    if (!cv) return;
    tpl.build(cv);
    cv.renderAll();
    syncLayers();
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
    syncLayers();
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

  const handleTabToggle = (id: Exclude<Tab, null>) => {
    setActiveTab((prev) => (prev === id ? null : id));
    if (id === 'layers') syncLayers();
  };

  const panelTitle =
    activeTab === 'image' ? 'Medya Ekle'
    : activeTab === 'text' ? 'Yazı Ekle'
    : activeTab === 'layers' ? 'Katmanlar'
    : activeTab === 'templates' ? 'Hazır Şablonlar'
    : 'Kayıtlı Tasarımlar';

  return (
    <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top,#ffffff_0%,#f3f4f6_52%,#e5e7eb_100%)] font-sans text-gray-900">
      <div className="mx-auto flex h-full max-w-[1480px] flex-col px-3 py-3 sm:px-5 sm:py-5">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/70 bg-white/88 shadow-[0_22px_90px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">Canlı Tasarım</p>
                <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                  {config?.productTitle ?? 'Tişört Tasarım'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => activeCanvas.current?.undo()}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Geri al"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => activeCanvas.current?.redo()}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="İleri al"
              >
                <Redo2 className="h-4 w-4" />
              </button>
              <button
                onClick={handleSave}
                className="hidden items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200 sm:inline-flex"
              >
                <Save className="h-4 w-4" />
                Kaydet
              </button>
              <button
                onClick={() => window.parent.postMessage({ type: 'DESIGNER_CLOSE' }, '*')}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-500"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex shrink-0 gap-2 border-b border-slate-100 bg-white/80 px-3 py-2.5 sm:px-4">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => handleTabToggle(id)}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-[11px] font-bold transition-all sm:text-xs',
                  activeTab === id
                    ? 'bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                )}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)]">
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-5 sm:px-6 sm:py-6">
              <div className="absolute inset-x-5 top-4 hidden h-32 rounded-[36px] bg-[radial-gradient(circle_at_top,#dbeafe_0%,rgba(219,234,254,0.3)_38%,rgba(248,250,252,0)_72%)] sm:block" />

              <div className="relative flex h-full w-full items-center justify-center">
                <div className="absolute right-0 top-1/2 z-30 hidden -translate-y-1/2 lg:flex lg:flex-col lg:gap-4">
                  <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white/90 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                    <button className="flex w-[74px] flex-col items-center gap-1 border-b border-slate-100 bg-blue-50 px-3 py-3 text-blue-600">
                      <MousePointer2 className="h-5 w-5" />
                      <span className="text-[10px] font-black uppercase tracking-wide">Seçim</span>
                    </button>
                    <button className="flex w-[74px] flex-col items-center gap-1 px-3 py-3 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700">
                      <Move className="h-5 w-5" />
                      <span className="text-[10px] font-black uppercase tracking-wide">Gezinme</span>
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/90 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                    <button
                      onClick={() => setZoom((z) => Math.min(200, z + 10))}
                      className="flex h-12 w-16 items-center justify-center border-b border-slate-100 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </button>
                    <div className="bg-slate-50 px-3 py-2 text-center text-[11px] font-black text-slate-700">
                      {zoom}%
                    </div>
                    <button
                      onClick={() => setZoom((z) => Math.max(50, z - 10))}
                      className="flex h-12 w-16 items-center justify-center text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      <ZoomOut className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex h-full w-full items-center justify-center">
                  <div className={activeSide === 'front' ? 'block' : 'hidden'}>
                    <CanvasArea ref={frontCanvasRef} side="front" zoom={zoom} onObjectSelected={handleObjectSelected} />
                  </div>
                  <div className={activeSide === 'back' ? 'block' : 'hidden'}>
                    <CanvasArea ref={backCanvasRef} side="back" zoom={zoom} onObjectSelected={handleObjectSelected} />
                  </div>
                </div>

                <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-3 rounded-[26px] border border-white/70 bg-white/88 p-2 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                  {([
                    { side: 'front' as const, label: 'Ön', image: config?.frontImage, hasDesign: frontHasDesign },
                    { side: 'back' as const, label: 'Arka', image: config?.backImage, hasDesign: backHasDesign },
                  ]).map(({ side, label, image, hasDesign }) => (
                    <button
                      key={side}
                      onClick={() => setActiveSide(side)}
                      className={cn(
                        'flex w-[78px] flex-col gap-1 rounded-[20px] border-2 p-1.5 text-left transition-all',
                        activeSide === side
                          ? 'scale-[1.03] border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-transparent bg-transparent opacity-70 hover:opacity-100',
                      )}
                    >
                      <div className="h-20 overflow-hidden rounded-2xl bg-slate-100">
                        {image ? (
                          <img src={image} alt={label} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">
                            {label}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <span className={cn('text-[10px] font-black uppercase tracking-wide', activeSide === side ? 'text-blue-600' : 'text-slate-500')}>
                          {label}
                        </span>
                        <span className={cn('h-2 w-2 rounded-full', hasDesign ? 'bg-emerald-500' : 'bg-slate-200')} />
                      </div>
                    </button>
                  ))}
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
                  transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                  className="absolute bottom-0 left-0 z-50 w-full overflow-hidden rounded-t-[34px] border-t border-slate-100 bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.12)]"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">Araç Paneli</p>
                      <h3 className="text-lg font-bold text-slate-900">{panelTitle}</h3>
                    </div>
                    <button
                      onClick={() => setActiveTab(null)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="max-h-[52vh] overflow-y-auto px-5 py-5 sm:px-6">
                    {activeTab === 'image' && (
                      <ImagePanel onAddImage={handleAddImage} onRemoveBg={handleRemoveBg} />
                    )}
                    {activeTab === 'text' && (
                      <TextPanel onAddText={handleAddText} />
                    )}
                    {activeTab === 'layers' && (
                      <div className="space-y-3">
                        {layers.length === 0 ? (
                          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 text-center text-slate-400">
                            <Layers className="mb-3 h-12 w-12 opacity-20" />
                            <p className="text-sm font-semibold">Henüz katman yok</p>
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
                                'flex items-center justify-between rounded-[22px] border-2 p-3 transition-all',
                                activeCanvas.current?.canvas?.getActiveObject() === obj
                                  ? 'border-blue-300 bg-blue-50/80'
                                  : 'border-slate-100 bg-white hover:border-slate-200',
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                                  {(obj.type === 'text' || obj.type === 'i-text')
                                    ? <Type className="h-5 w-5 text-slate-400" />
                                    : <ImageIcon className="h-5 w-5 text-slate-400" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-800">
                                    {(obj.type === 'text' || obj.type === 'i-text')
                                      ? ((obj as fabric.Text).text ?? '').substring(0, 20)
                                      : `Görsel ${layers.length - i}`}
                                  </p>
                                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                    Katman {layers.length - i}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  activeCanvas.current?.canvas?.remove(obj);
                                  activeCanvas.current?.canvas?.renderAll();
                                  syncLayers();
                                }}
                                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
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
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.96 }}
                  className="absolute bottom-[106px] left-1/2 z-[60] -translate-x-1/2 px-3"
                >
                  <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-[28px] border border-white/60 bg-white/92 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)] backdrop-blur-xl">
                    {objState?.type === 'text' ? (
                      <>
                        <label className="relative flex flex-col items-center gap-1 rounded-2xl px-3 py-2 transition-colors hover:bg-slate-50">
                          <div
                            className="h-5 w-5 rounded-full border border-slate-200 shadow-inner"
                            style={{ backgroundColor: objState.color ?? '#111827' }}
                          />
                          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Renk</span>
                          <input
                            type="color"
                            value={objState.color ?? '#111827'}
                            onChange={(e) => updateTextProp({ color: e.target.value })}
                            className="absolute inset-0 opacity-0"
                          />
                        </label>

                        <div className="flex items-center gap-1 rounded-2xl bg-slate-50 px-2 py-2">
                          <button
                            onClick={() => updateTextProp({ fontSize: Math.max(8, (objState.fontSize ?? 32) - 2) })}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                          >
                            −
                          </button>
                          <span className="w-10 text-center text-sm font-black text-slate-800">{objState.fontSize ?? 32}</span>
                          <button
                            onClick={() => updateTextProp({ fontSize: (objState.fontSize ?? 32) + 2 })}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-1 rounded-2xl bg-slate-50 p-1">
                          {([
                            { align: 'left' as const, Icon: AlignLeft },
                            { align: 'center' as const, Icon: AlignCenter },
                            { align: 'right' as const, Icon: AlignRight },
                          ]).map(({ align, Icon }) => (
                            <button
                              key={align}
                              onClick={() => updateTextProp({ textAlign: align })}
                              className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                                objState.textAlign === align ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => updateTextProp({ isBold: !objState.isBold })}
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black transition-colors',
                            objState.isBold ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                          )}
                        >
                          B
                        </button>

                        <button
                          onClick={deleteSelected}
                          className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="text-[10px] font-black uppercase tracking-wide">Kaldır</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={centerSelectedObject}
                          className="flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-blue-600"
                        >
                          <Move className="h-5 w-5" />
                          <span className="text-[10px] font-black uppercase tracking-wide">Ortala</span>
                        </button>

                        <button
                          onClick={deleteSelected}
                          className="flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-5 w-5" />
                          <span className="text-[10px] font-black uppercase tracking-wide">Kaldır</span>
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <footer className="shrink-0 border-t border-slate-100 bg-white/92 px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="flex flex-wrap gap-2">
                  {(['single', 'double'] as const).map((value) => (
                    <button
                      key={value}
                      onClick={() => setPrintSide(value)}
                      className={cn(
                        'rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors',
                        printSide === value
                          ? 'bg-blue-600 text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)]'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800',
                      )}
                    >
                      {value === 'single' ? 'Tek Yüz' : 'Çift Yüz'}
                    </button>
                  ))}
                </div>

                {sizes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <button
                        key={size!}
                        onClick={() => setSelectedSize(size!)}
                        className={cn(
                          'flex h-10 min-w-10 items-center justify-center rounded-2xl px-3 text-xs font-black transition-colors',
                          selectedSize === size
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800',
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center justify-between rounded-[24px] bg-slate-100 px-3 py-2 sm:min-w-[150px]">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Adet</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-base font-black text-slate-700 transition-colors hover:bg-slate-200"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-black text-slate-900">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-base font-black text-slate-700 transition-colors hover:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-[26px] bg-slate-900 px-4 py-3 text-white shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
                  <div className="min-w-[92px]">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Toplam</p>
                    <p className="text-lg font-black">{formattedPrice || 'Fiyat yok'}</p>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    className="rounded-[18px] bg-blue-600 px-5 py-3 text-sm font-black transition-colors hover:bg-blue-700"
                  >
                    Sepete Ekle
                  </button>
                </div>
              </div>
            </div>
          </footer>

          <div className="hidden">
            <PropertiesPanel selectedObject={selectedObj} onChanged={() => activeCanvas.current?.canvas?.renderAll()} />
          </div>
        </div>
      </div>
    </div>
  );
}
