import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { AnimatePresence, motion } from 'motion/react';
import {
  Undo2, Redo2, Eye, Image as ImageIcon, Type, Layers,
  X, ZoomIn, ZoomOut, MousePointer2, Move, Trash2,
  AlignCenter, ChevronDown, Maximize2, Scissors, Droplets,
  CircleDashed, RefreshCw, Unlock, Bookmark, LayoutGrid, Save,
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
  { id: 'image',     label: 'Görsel',    Icon: ImageIcon },
  { id: 'text',      label: 'Metin',     Icon: Type },
  { id: 'layers',    label: 'Katmanlar', Icon: Layers },
  { id: 'templates', label: 'Şablonlar', Icon: LayoutGrid },
  { id: 'saved',     label: 'Kayıtlar',  Icon: Bookmark },
];

interface ObjectState {
  type: 'text' | 'image';
  color?: string;
  fontSize?: number;
  isBold?: boolean;
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
  const backCanvasRef  = useRef<CanvasAreaHandle>(null);

  const [activeTab, setActiveTab]     = useState<Tab>(null);
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [objState, setObjState]       = useState<ObjectState | null>(null);
  const [zoom, setZoom]               = useState(100);
  const [layers, setLayers]           = useState<fabric.Object[]>([]);

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
    if (!obj) { setObjState(null); return; }
    if (obj.type === 'text' || obj.type === 'i-text') {
      const t = obj as fabric.Text;
      setObjState({ type: 'text', color: t.fill as string, fontSize: t.fontSize, isBold: t.fontWeight === 'bold' });
    } else {
      setObjState({ type: 'image' });
    }
    syncLayers();
  }, [syncLayers]);

  const handleAddImage = (url: string) => { activeCanvas.current?.addImageFromUrl(url); syncLayers(); };
  const handleAddText  = (text: string, opts: Record<string, unknown>) => { activeCanvas.current?.addText(text, opts); syncLayers(); };

  const handleApplyTemplate = (tpl: Template) => {
    const cv = activeSide === 'front' ? frontCanvasRef.current?.canvas : backCanvasRef.current?.canvas;
    if (!cv) return;
    tpl.build(cv);
    cv.renderAll();
    syncLayers();
  };

  const handleSave = () => {
    const frontJson  = frontCanvasRef.current?.saveDesign() ?? '';
    const backJson   = backCanvasRef.current?.saveDesign() ?? '';
    const thumbnail  = frontCanvasRef.current?.exportPng(0.5) ?? '';
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
      const blob   = await fetch(dataUrl).then((r) => r.blob());
      const form   = new FormData();
      form.append('image_file', blob, 'image.jpg');
      const apiKey = (window as typeof window & { REMOVE_BG_KEY?: string }).REMOVE_BG_KEY ?? '';
      if (!apiKey) { alert('Remove.bg API key ayarlanmamış'); return ''; }
      const res    = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': apiKey }, body: form });
      if (!res.ok) { alert('Arka plan kaldırma başarısız'); return ''; }
      const blob2  = await res.blob();
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
    const frontPng      = frontCanvasRef.current?.exportPng() ?? '';
    const backPng       = backCanvasRef.current?.exportPng() ?? '';
    const frontHas      = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
    const backHas       = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
    const resolvedSide  = frontHas && backHas ? 'double' : backHas ? 'back' : 'front';
    const printOption   = printOptionForSide(resolvedSide);
    const selectedVariant = config?.variants?.find((v) => (!selectedSize || v.option2 === selectedSize) && v.option3 === printOption);
    const variantId     = selectedVariant?.id ?? (resolvedSide === 'double' ? config?.doubleVariantId : config?.singleVariantId) ?? '';
    if (!variantId) { alert('Lütfen bir beden seçin'); return; }
    const price         = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);
    const designRes     = await fetch('/api/storefront/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: config?.productHandle, designJson: { front: frontCanvasRef.current?.saveDesign(), back: backCanvasRef.current?.saveDesign() }, previewUrl: frontPng }) }).then((r) => r.json());
    const token         = designRes.token ?? '';
    const properties: Record<string, string> = { 'Ön Tasarım': frontPng ? 'Var' : 'Yok', 'design_token': token, 'Ön önizleme': frontPng.slice(0, 200) };
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
    setObjState((prev) => prev ? { ...prev, ...props } : null);
    cv.renderAll();
  };

  const frontHasDesign = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
  const backHasDesign  = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
  const resolvedSide   = frontHasDesign && backHasDesign ? 'double' : backHasDesign ? 'back' : printSide === 'double' ? 'front' : activeSide;
  const selectedVariant = config?.variants?.find((v) => (!selectedSize || v.option2 === selectedSize) && v.option3 === printOptionForSide(resolvedSide));
  const price          = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);
  const formattedPrice = price ? new Intl.NumberFormat(config?.locale ?? 'tr-TR', { style: 'currency', currency: config?.currency ?? 'TRY', maximumFractionDigits: 0 }).format(price / 100) : '';
  const sizes          = [...new Set(config?.variants?.map((v) => v.option2).filter(Boolean) ?? [])];

  const handleTabToggle = (id: Exclude<Tab, null>) => {
    setActiveTab((prev) => (prev === id ? null : id));
    if (id === 'layers') syncLayers();
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans text-gray-900 select-none overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white z-50 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 truncate max-w-[140px]">
            {config?.productTitle ?? 'Tişört Tasarım'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => activeCanvas.current?.undo()}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-400">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={() => activeCanvas.current?.redo()}
            className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-400">
            <Redo2 className="w-4 h-4" />
          </button>
          <button onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-semibold transition-colors">
            <Save className="w-3.5 h-3.5" /> Kaydet
          </button>
          <button
            onClick={() => window.parent.postMessage({ type: 'DESIGNER_CLOSE' }, '*')}
            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-gray-100 bg-white shrink-0 z-40">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => handleTabToggle(id)}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-all border-b-2',
              activeTab === id
                ? 'text-blue-600 border-blue-600 bg-blue-50/40'
                : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50',
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Canvas + T-shirt ── */}
      <div className="flex-1 relative flex flex-col items-center bg-[#F9FAFB] overflow-hidden">

        <div className="flex-1 w-full flex items-center justify-center p-4 relative">

          {/* Canvas instances — both always mounted, CSS switches visibility */}
          <div className={activeSide === 'front' ? 'block' : 'hidden'}>
            <CanvasArea ref={frontCanvasRef} side="front" onObjectSelected={handleObjectSelected} />
          </div>
          <div className={activeSide === 'back' ? 'block' : 'hidden'}>
            <CanvasArea ref={backCanvasRef}  side="back"  onObjectSelected={handleObjectSelected} />
          </div>

          {/* Thumbnail side switcher (bottom-centre of canvas area) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-1.5 bg-white/90 backdrop-blur shadow-lg rounded-2xl border border-gray-100 z-30">
            {(['front', 'back'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSide(s)}
                className={cn(
                  'px-4 py-1.5 rounded-xl text-xs font-bold transition-all',
                  activeSide === s
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                {s === 'front' ? 'Ön' : 'Arka'}
                {(s === 'front' ? frontCanvasRef : backCanvasRef).current?.canvas?.getObjects().length
                  ? ' ✓' : ''}
              </button>
            ))}
          </div>

          {/* Right toolbar: zoom + tools */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-30">
            <div className="flex flex-col bg-white shadow-lg rounded-2xl border border-gray-100 overflow-hidden">
              <button className="p-2.5 bg-blue-50 text-blue-600 border-b border-gray-100">
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button className="p-2.5 hover:bg-gray-50 text-gray-400">
                <Move className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col bg-white shadow-lg rounded-2xl border border-gray-100 overflow-hidden">
              <button onClick={() => setZoom((z) => Math.min(200, z + 10))}
                className="p-2.5 hover:bg-gray-50 text-gray-400 border-b border-gray-100">
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="py-1.5 text-center text-[10px] font-black text-gray-600 bg-gray-50">
                {zoom}%
              </div>
              <button onClick={() => setZoom((z) => Math.max(50, z - 10))}
                className="p-2.5 hover:bg-gray-50 text-gray-400">
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Bottom sliding panel ── */}
        <AnimatePresence>
          {activeTab && (
            <motion.div
              key={activeTab}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute bottom-0 left-0 w-full bg-white shadow-[0_-8px_32px_rgba(0,0,0,0.1)] rounded-t-[28px] border-t border-gray-100 z-50 overflow-hidden"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
                <h3 className="font-bold text-base text-gray-800">
                  {activeTab === 'image' ? 'Görsel Ekle' : activeTab === 'text' ? 'Metin Ekle' : activeTab === 'layers' ? 'Katmanlar' : activeTab === 'templates' ? 'Şablonlar' : 'Kaydedilen Tasarımlar'}
                </h3>
                <button onClick={() => setActiveTab(null)}
                  className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 max-h-[52vh] overflow-y-auto">
                {activeTab === 'image' && (
                  <ImagePanel onAddImage={handleAddImage} onRemoveBg={handleRemoveBg} />
                )}
                {activeTab === 'text' && (
                  <TextPanel onAddText={handleAddText} />
                )}
                {activeTab === 'layers' && (
                  <div className="space-y-2">
                    {layers.length === 0 ? (
                      <div className="py-10 text-center text-gray-400">
                        <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p className="text-sm font-medium">Henüz katman yok</p>
                      </div>
                    ) : (
                      [...layers].reverse().map((obj, i) => (
                        <div
                          key={i}
                          onClick={() => { activeCanvas.current?.canvas?.setActiveObject(obj); activeCanvas.current?.canvas?.renderAll(); handleObjectSelected(obj); }}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all',
                            activeCanvas.current?.canvas?.getActiveObject() === obj
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-gray-100 hover:border-gray-200',
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                              {(obj.type === 'text' || obj.type === 'i-text')
                                ? <Type className="w-4 h-4 text-gray-400" />
                                : <ImageIcon className="w-4 h-4 text-gray-400" />}
                            </div>
                            <span className="text-sm font-semibold text-gray-700">
                              {(obj.type === 'text' || obj.type === 'i-text')
                                ? ((obj as fabric.Text).text ?? '').substring(0, 18)
                                : `Görsel ${layers.length - i}`}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); activeCanvas.current?.canvas?.remove(obj); activeCanvas.current?.canvas?.renderAll(); syncLayers(); }}
                            className="p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
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

        {/* ── Floating selected-object controls ── */}
        <AnimatePresence>
          {selectedObj && !activeTab && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[60]"
            >
              <div className="flex bg-white/95 backdrop-blur-xl shadow-2xl rounded-[24px] border border-white/50 p-1.5 items-center gap-0.5">
                {objState?.type === 'text' ? (
                  <>
                    <label className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl cursor-pointer relative">
                      <div className="w-5 h-5 rounded-full border border-gray-200 shadow-inner" style={{ backgroundColor: objState.color ?? '#000' }} />
                      <span className="text-[9px] font-bold text-gray-500">Renk</span>
                      <input type="color" value={objState.color ?? '#000000'} onChange={(e) => updateTextProp({ color: e.target.value })} className="absolute opacity-0 w-0 h-0" />
                    </label>
                    <div className="w-px h-8 bg-gray-100 mx-0.5" />
                    <div className="flex items-center gap-1 px-2">
                      <button onClick={() => updateTextProp({ fontSize: Math.max(8, (objState.fontSize ?? 30) - 2) })} className="p-1 hover:bg-gray-100 rounded text-gray-500 text-sm font-bold">−</button>
                      <span className="w-8 text-center text-xs font-bold text-gray-700">{objState.fontSize ?? 30}</span>
                      <button onClick={() => updateTextProp({ fontSize: (objState.fontSize ?? 30) + 2 })} className="p-1 hover:bg-gray-100 rounded text-gray-500 text-sm font-bold">+</button>
                    </div>
                    <div className="w-px h-8 bg-gray-100 mx-0.5" />
                    <button
                      onClick={() => updateTextProp({ isBold: !objState.isBold })}
                      className={cn('px-3 py-2 rounded-xl text-sm font-black transition-colors', objState.isBold ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50')}
                    >B</button>
                    <div className="w-px h-8 bg-gray-100 mx-0.5" />
                    <button onClick={deleteSelected} className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-red-50 rounded-xl group">
                      <Trash2 className="w-4 h-4 text-red-400 group-hover:text-red-500" />
                      <span className="text-[9px] font-bold text-red-400">Kaldır</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl group">
                      <Maximize2 className="w-4 h-4 text-gray-500 group-hover:text-blue-500" />
                      <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Ortala</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl group">
                      <Scissors className="w-4 h-4 text-gray-500 group-hover:text-blue-500" />
                      <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Kırp</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl group">
                      <Droplets className="w-4 h-4 text-gray-500 group-hover:text-blue-500" />
                      <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Arkaplan K.</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl group">
                      <CircleDashed className="w-4 h-4 text-gray-500" />
                      <span className="text-[9px] font-bold text-gray-500">Renk Kapla</span>
                    </button>
                    <button className="flex flex-col items-center gap-1 px-3 py-2 hover:bg-gray-50 rounded-xl group">
                      <RefreshCw className="w-4 h-4 text-gray-500" />
                      <span className="text-[9px] font-bold text-gray-500">Kontür</span>
                    </button>
                    <div className="w-px h-8 bg-gray-100 mx-0.5" />
                    <button onClick={deleteSelected} className="p-2.5 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-xl transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom bar ── */}
      <footer className="bg-white border-t border-gray-100 px-4 py-2.5 flex items-center gap-3 shrink-0 flex-wrap">
        {/* Baskı tarafı */}
        <div className="flex gap-1">
          {(['single', 'double'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPrintSide(v)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                printSide === v ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
              )}
            >
              {v === 'single' ? 'Tek Yüz' : 'Çift Yüz'}
            </button>
          ))}
        </div>

        {/* Beden */}
        {sizes.length > 0 && (
          <div className="flex gap-1">
            {sizes.map((s) => (
              <button
                key={s!}
                onClick={() => setSelectedSize(s!)}
                className={cn(
                  'w-8 h-8 rounded-lg text-xs font-bold border transition-colors',
                  selectedSize === s ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
                )}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Adet */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">−</button>
          <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold">+</button>
        </div>

        {/* Fiyat + Sepete Ekle */}
        <div className="flex items-center gap-2">
          {formattedPrice && <span className="text-base font-black text-gray-900">{formattedPrice}</span>}
          <button
            onClick={handleAddToCart}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
          >
            Sepete Ekle
          </button>
        </div>
      </footer>

      {/* Hidden: properties panel (keep for compatibility) */}
      <div className="hidden">
        <PropertiesPanel selectedObject={selectedObj} onChanged={() => activeCanvas.current?.canvas?.renderAll()} />
      </div>
    </div>
  );
}
