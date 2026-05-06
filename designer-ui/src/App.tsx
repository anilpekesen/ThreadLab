import { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { useDesignerStore } from '@/store/designerStore';
import CanvasArea, { type CanvasAreaHandle } from '@/components/canvas/CanvasArea';
import ImagePanel from '@/components/panels/ImagePanel';
import TextPanel from '@/components/panels/TextPanel';
import TemplatesPanel, { type Template } from '@/components/panels/TemplatesPanel';
import SavedPanel from '@/components/panels/SavedPanel';
import PropertiesPanel from '@/components/panels/PropertiesPanel';
import type { DesignerConfig, LeftTab, SavedDesign } from '@/types';
import { generateId } from '@/utils/compress';

// Read config from URL params or window.__DESIGNER_CONFIG__
function readConfig(): DesignerConfig {
  const w = window as typeof window & { __DESIGNER_CONFIG__?: DesignerConfig };
  if (w.__DESIGNER_CONFIG__) return w.__DESIGNER_CONFIG__;
  const p = new URLSearchParams(window.location.search);
  const variantsParam = p.get('variants');
  let variants: DesignerConfig['variants'] = [];
  try {
    variants = variantsParam ? JSON.parse(variantsParam) as DesignerConfig['variants'] : [];
  } catch {
    variants = [];
  }
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

const TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: 'image', label: 'Resim', icon: '🖼' },
  { id: 'text', label: 'Yazı', icon: '✍' },
  { id: 'templates', label: 'Şablonlar', icon: '🎨' },
  { id: 'saved', label: 'Kayıtlar', icon: '💾' },
];

export default function App() {
  const { config, setConfig, activeSide, setActiveSide, activeTab, setActiveTab,
    selectedSize, setSelectedSize, quantity, setQuantity,
    addSavedDesign, printSide, setPrintSide, setIsBgRemoving, isBgRemoving } = useDesignerStore();

  const frontCanvasRef = useRef<CanvasAreaHandle>(null);
  const backCanvasRef = useRef<CanvasAreaHandle>(null);
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);

  useEffect(() => {
    const cfg = readConfig();
    setConfig(cfg);
    if (cfg.variants?.length) {
      const firstAvailable = cfg.variants.find((v) => v.available);
      setSelectedSize(firstAvailable?.option2 ?? cfg.variants[0]?.option2 ?? '');
    }
  }, [setConfig, setSelectedSize]);

  const activeCanvas = activeSide === 'front' ? frontCanvasRef : backCanvasRef;

  const handleObjectSelected = useCallback((obj: fabric.Object | null) => {
    setSelectedObj(obj);
  }, []);

  const handleAddImage = (url: string) => {
    activeCanvas.current?.addImageFromUrl(url);
  };

  const handleAddText = (text: string, opts: Record<string, unknown>) => {
    activeCanvas.current?.addText(text, opts);
  };

  const handleApplyTemplate = (tpl: Template) => {
    const cv = activeSide === 'front'
      ? frontCanvasRef.current?.canvas
      : backCanvasRef.current?.canvas;
    if (!cv) return;
    tpl.build(cv);
    cv.renderAll();
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
  };

  const handleRemoveBg = async (dataUrl: string): Promise<string> => {
    setIsBgRemoving(true);
    try {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      const form = new FormData();
      form.append('image_file', blob, 'image.jpg');
      const apiKey = (window as typeof window & { REMOVE_BG_KEY?: string }).REMOVE_BG_KEY ?? '';
      if (!apiKey) { alert('Remove.bg API key ayarlanmamış'); return ''; }
      const res = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: form,
      });
      if (!res.ok) { alert('Arka plan kaldırma başarısız'); return ''; }
      const resBlob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target!.result as string);
        reader.readAsDataURL(resBlob);
      });
    } finally {
      setIsBgRemoving(false);
    }
  };

  const handleAddToCart = async () => {
    const frontPng = frontCanvasRef.current?.exportPng() ?? '';
    const backPng = backCanvasRef.current?.exportPng() ?? '';
    const frontHasDesign = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
    const backHasDesign = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
    const resolvedSide = frontHasDesign && backHasDesign
      ? 'double'
      : backHasDesign
        ? 'back'
        : 'front';
    const printOption = printOptionForSide(resolvedSide);

    const selectedVariant = config?.variants?.find((v) => (
      (!selectedSize || v.option2 === selectedSize) && v.option3 === printOption
    ));
    const variantId = selectedVariant?.id
      ?? (resolvedSide === 'double' ? config?.doubleVariantId : config?.singleVariantId)
      ?? '';

    if (!variantId) { alert('Lütfen bir beden seçin'); return; }

    const price = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);

    // Post design to backend to get token
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

    // Build cart form properties
    const properties: Record<string, string> = {
      'Ön Tasarım': frontPng ? 'Var' : 'Yok',
      'design_token': token,
      'Ön önizleme': frontPng.slice(0, 200),
    };
    if (resolvedSide === 'back' || resolvedSide === 'double') properties['Arka Tasarım'] = backPng ? 'Var' : 'Yok';

    // postMessage to parent storefront
    window.parent.postMessage({
      type: 'DESIGNER_ADD_TO_CART',
      variantId,
      quantity,
      properties,
      designToken: token,
      price,
    }, '*');
  };

  const frontHasDesign = Boolean(frontCanvasRef.current?.canvas?.getObjects().length);
  const backHasDesign = Boolean(backCanvasRef.current?.canvas?.getObjects().length);
  const resolvedSide = frontHasDesign && backHasDesign ? 'double' : backHasDesign ? 'back' : printSide === 'double' ? 'front' : activeSide;
  const selectedVariant = config?.variants?.find((v) => (
    (!selectedSize || v.option2 === selectedSize) && v.option3 === printOptionForSide(resolvedSide)
  ));
  const price = selectedVariant ? priceToCents(selectedVariant.price) : (resolvedSide === 'double' ? config?.doublePrice : config?.singlePrice);
  const formattedPrice = price
    ? new Intl.NumberFormat(config?.locale ?? 'tr-TR', { style: 'currency', currency: config?.currency ?? 'TRY', maximumFractionDigits: 0 }).format(price / 100)
    : '';

  const sizes = [...new Set(config?.variants?.map((v) => v.option2).filter(Boolean) ?? [])];

  return (
    <div className="flex flex-col h-full bg-surface text-zinc-100" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-panel border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">{config?.productTitle ?? 'Tişört Tasarım'}</h1>
          {/* Front / Back status */}
          <div className="flex gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full border ${activeSide === 'front' ? 'border-accent text-accent' : 'border-border text-zinc-500'}`}>
              {frontCanvasRef.current?.canvas?.getObjects().length ? '✓ Ön' : '○ Ön'}
            </span>
            <span className={`px-2 py-0.5 rounded-full border ${activeSide === 'back' ? 'border-accent text-accent' : 'border-border text-zinc-500'}`}>
              {backCanvasRef.current?.canvas?.getObjects().length ? '✓ Arka' : '○ Arka'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-zinc-700">
            💾 Kaydet
          </button>
          <button
            onClick={() => window.parent.postMessage({ type: 'DESIGNER_CLOSE' }, '*')}
            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-zinc-700"
          >✕ Kapat</button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-64 bg-panel border-r border-border flex flex-col shrink-0">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-xs flex flex-col items-center gap-0.5 transition-colors ${activeTab === tab.id ? 'bg-surface text-accent border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <span className="text-base leading-none">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3">
            {activeTab === 'image' && (
              <ImagePanel onAddImage={handleAddImage} onRemoveBg={handleRemoveBg} />
            )}
            {activeTab === 'text' && (
              <TextPanel onAddText={handleAddText} />
            )}
            {activeTab === 'templates' && (
              <TemplatesPanel onApply={handleApplyTemplate} />
            )}
            {activeTab === 'saved' && (
              <SavedPanel onLoad={handleLoadSaved} />
            )}
          </div>
        </aside>

        {/* Center: canvas */}
        <main className="flex-1 flex flex-col items-center overflow-hidden bg-zinc-900">
          {/* Ön / Arka tabs */}
          <div className="flex gap-0 border-b border-border w-full shrink-0">
            {(['front', 'back'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setActiveSide(s)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeSide === s ? 'bg-panel text-white border-b-2 border-accent' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {s === 'front' ? '◻ Ön Yüz' : '◻ Arka Yüz'}
              </button>
            ))}
          </div>

          <div className="flex-1 flex items-center justify-center p-6 w-full overflow-auto">
            <CanvasArea
              ref={frontCanvasRef}
              side="front"
              onObjectSelected={handleObjectSelected}
            />
            <CanvasArea
              ref={backCanvasRef}
              side="back"
              onObjectSelected={handleObjectSelected}
            />
          </div>
        </main>

        {/* Right panel: properties */}
        <aside className="w-60 bg-panel border-l border-border flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 border-b border-border text-xs text-zinc-400 font-medium">
            Özellikler
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <PropertiesPanel
              selectedObject={selectedObj}
              onChanged={() => activeCanvas.current?.canvas?.renderAll()}
            />
          </div>
        </aside>
      </div>

      {/* Bottom bar */}
      <footer className="bg-panel border-t border-border px-4 py-3 flex items-center gap-4 shrink-0">
        {/* Baskı tarafı */}
        <div className="flex gap-1">
          {(['single', 'double'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPrintSide(v)}
              className={`px-3 py-1.5 rounded text-xs border transition-colors ${printSide === v ? 'bg-accent border-accent' : 'bg-zinc-800 border-border hover:bg-zinc-700'}`}
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
                className={`w-9 h-9 rounded text-xs font-medium border transition-colors ${selectedSize === s ? 'bg-accent border-accent' : 'bg-zinc-800 border-border hover:bg-zinc-700'}`}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Adet */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded bg-zinc-800 border border-border hover:bg-zinc-700 text-sm">-</button>
          <span className="w-8 text-center text-sm">{quantity}</span>
          <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded bg-zinc-800 border border-border hover:bg-zinc-700 text-sm">+</button>
        </div>

        {/* Price + Add to cart */}
        <div className="flex items-center gap-3">
          {formattedPrice && <span className="text-lg font-bold">{formattedPrice}</span>}
          <button
            onClick={handleAddToCart}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-semibold transition-colors"
          >
            🛒 Sepete Ekle
          </button>
        </div>
      </footer>
    </div>
  );
}
