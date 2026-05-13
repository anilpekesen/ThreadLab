import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fabric } from 'fabric';
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
import type { DesignerConfig, PersonalizationConfig, PricingBand, PrintAreaConfig, SavedDesign, Side, SurfaceMode } from '@/types';
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

interface CartItemPayload {
  variantId: string;
  quantity: number;
  size?: string;
  properties?: Record<string, string>;
}

const MAIN_TABS: { id: 'image' | 'text' | 'layers'; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'image', label: 'Görsel', Icon: ImageIcon },
  { id: 'text', label: 'Metin', Icon: Type },
  { id: 'layers', label: 'Katmanlar', Icon: Layers },
];

const TOOLBAR_FONTS = ['Inter', 'Roboto', 'Arial', 'Montserrat', 'Playfair Display', 'Oswald'];
const TEXT_COLOR_SWATCHES = ['#111827', '#ffffff', '#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#ec4899', '#7c3aed'];
const CANVAS_W = 480;
const CANVAS_H = 580;
const COLOR_HEX_MAP: Record<string, string> = {
  beyaz: '#ffffff',
  white: '#ffffff',
  siyah: '#111111',
  black: '#111111',
  lacivert: '#1e3a5f',
  navy: '#1e3a5f',
  mavi: '#2563eb',
  blue: '#2563eb',
  kirmizi: '#dc2626',
  kırmızı: '#dc2626',
  red: '#dc2626',
  yesil: '#16a34a',
  yeşil: '#16a34a',
  green: '#16a34a',
  sari: '#f59e0b',
  sarı: '#f59e0b',
  yellow: '#f59e0b',
  gri: '#6b7280',
  gray: '#6b7280',
  grey: '#6b7280',
  bordo: '#7f1d1d',
  burgundy: '#7f1d1d',
  pembe: '#ec4899',
  pink: '#ec4899',
  mor: '#7c3aed',
  purple: '#7c3aed',
  turuncu: '#f97316',
  orange: '#f97316',
  bej: '#d6b889',
  beige: '#d6b889',
};

interface SideMetrics {
  widthCm: number;
  heightCm: number;
  areaCm2: number;
  objectCount: number;
}

interface SidePricing {
  hasContent: boolean;
  metrics: SideMetrics;
  band: PricingBand;
  surcharge: number;
  surchargeUnitAmount: number;
  subtotal: number;
}

interface PricingSummary {
  totalQuantity: number;
  baseUnitPrice: number;
  baseSubtotal: number;
  total: number;
  front: SidePricing;
  back: SidePricing;
}

const DEFAULT_PRINT_AREAS: Record<Side, PrintAreaConfig> = {
  front: {
    side: 'front',
    mockupX: 76,
    mockupY: 28,
    mockupWidth: 328,
    mockupHeight: 524,
    x: 139,
    y: 157,
    width: 202,
    height: 325,
    realWidthMm: 280,
    realHeightMm: 450,
  },
  back: {
    side: 'back',
    mockupX: 76,
    mockupY: 28,
    mockupWidth: 328,
    mockupHeight: 524,
    x: 139,
    y: 157,
    width: 202,
    height: 325,
    realWidthMm: 280,
    realHeightMm: 450,
  },
};

const DEFAULT_PRICING_BANDS: PricingBand[] = [
  { key: '10x15', maxWidthCm: 10, maxHeightCm: 15, maxAreaCm2: 150, label: '10 x 15 cm', surcharge: 60 },
  { key: '21x29', maxWidthCm: 21, maxHeightCm: 29, maxAreaCm2: 609, label: '21 x 29 cm', surcharge: 120 },
  { key: '29x42', maxWidthCm: 29, maxHeightCm: 42, maxAreaCm2: 1218, label: '29 x 42 cm', surcharge: 180 },
];

function defaultPersonalization(): PersonalizationConfig {
  return {
    surfaceMode: 'front_back',
    printAreas: DEFAULT_PRINT_AREAS,
    pricingBands: {
      front: DEFAULT_PRICING_BANDS,
      back: DEFAULT_PRICING_BANDS,
    },
    surchargeVariantId: '',
  };
}

function readConfig(): DesignerConfig {
  const w = window as typeof window & { __DESIGNER_CONFIG__?: DesignerConfig };
  if (w.__DESIGNER_CONFIG__) return w.__DESIGNER_CONFIG__;
  const p = new URLSearchParams(window.location.search);
  let variants: DesignerConfig['variants'] = [];
  try { variants = JSON.parse(p.get('variants') ?? '[]') as DesignerConfig['variants']; } catch { variants = []; }
  return {
    productId: p.get('productId') ?? '',
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

function applyConfig(cfg: DesignerConfig, setConfig: (config: DesignerConfig) => void) {
  setConfig(cfg);
}

function priceToCents(price: string | number | undefined): number {
  if (typeof price === 'number') return price;
  if (!price) return 0;
  if (/^\d+$/.test(price)) return Number(price);
  return Math.round(Number(price) * 100);
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function surchargeToCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function formatMetricSize(metrics: SideMetrics) {
  return `${roundMetric(metrics.widthCm)} x ${roundMetric(metrics.heightCm)} cm`;
}

function emptyBand(): PricingBand {
  return {
    key: 'empty',
    maxWidthCm: null,
    maxHeightCm: null,
    maxAreaCm2: null,
    label: 'Alan yok',
    surcharge: 0,
  };
}

function normalizeBand(band: Partial<PricingBand> | null | undefined, index: number): PricingBand {
  const maxWidthCm = band?.maxWidthCm == null ? null : Number(band.maxWidthCm);
  const maxHeightCm = band?.maxHeightCm == null ? null : Number(band.maxHeightCm);
  const maxAreaCm2 = band?.maxAreaCm2 == null
    ? (maxWidthCm != null && maxHeightCm != null ? maxWidthCm * maxHeightCm : null)
    : Number(band.maxAreaCm2);
  return {
    key: String(band?.key || `${maxWidthCm ?? 'max'}x${maxHeightCm ?? 'max'}-${index}`),
    maxWidthCm,
    maxHeightCm,
    maxAreaCm2,
    label: String(band?.label || `${maxWidthCm ?? '?'} x ${maxHeightCm ?? '?'}`),
    surcharge: Number(band?.surcharge || 0),
  };
}

function normalizePrintArea(side: Side, area: Partial<PrintAreaConfig> | null | undefined): PrintAreaConfig {
  const fallback = DEFAULT_PRINT_AREAS[side];
  return {
    side,
    mockupX: Number(area?.mockupX ?? fallback.mockupX),
    mockupY: Number(area?.mockupY ?? fallback.mockupY),
    mockupWidth: Number(area?.mockupWidth ?? fallback.mockupWidth),
    mockupHeight: Number(area?.mockupHeight ?? fallback.mockupHeight),
    x: Number(area?.x ?? fallback.x),
    y: Number(area?.y ?? fallback.y),
    width: Number(area?.width ?? fallback.width),
    height: Number(area?.height ?? fallback.height),
    realWidthMm: Number(area?.realWidthMm ?? fallback.realWidthMm),
    realHeightMm: Number(area?.realHeightMm ?? fallback.realHeightMm),
  };
}

function normalizePersonalizationPayload(payload: unknown): PersonalizationConfig {
  const source = payload as {
    settings?: { surfaceMode?: SurfaceMode; pricingBands?: Record<Side, PricingBand[]>; surchargeVariantId?: string };
    printAreas?: PrintAreaConfig[];
    product?: { surfaceMode?: SurfaceMode };
  } | null;
  const base = defaultPersonalization();
  const surfaceMode = source?.settings?.surfaceMode || source?.product?.surfaceMode || base.surfaceMode;
  const areaMap = new Map<Side, PrintAreaConfig>();
  (source?.printAreas ?? []).forEach((area) => {
    if (!area?.side) return;
    areaMap.set(area.side, normalizePrintArea(area.side, area));
  });
  const pricingBands = {
    front: (source?.settings?.pricingBands?.front ?? base.pricingBands.front).map((band, index) => normalizeBand(band, index)),
    back: (source?.settings?.pricingBands?.back ?? base.pricingBands.back).map((band, index) => normalizeBand(band, index)),
  };
  return {
    surfaceMode,
    printAreas: {
      front: areaMap.get('front') ?? base.printAreas.front,
      back: areaMap.get('back') ?? base.printAreas.back,
    },
    pricingBands,
    surchargeVariantId: String(source?.settings?.surchargeVariantId || ''),
  };
}

function canvasRectForArea(area: PrintAreaConfig) {
  return {
    left: (area.x / 480) * CANVAS_W,
    top: (area.y / 580) * CANVAS_H,
    width: (area.width / 480) * CANVAS_W,
    height: (area.height / 580) * CANVAS_H,
  };
}

function metricsFromObjects(objects: fabric.Object[], area: PrintAreaConfig): SideMetrics {
  const bounds = objects
    .map((obj) => obj.getBoundingRect(true, true))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!bounds.length) return { widthCm: 0, heightCm: 0, areaCm2: 0, objectCount: 0 };

  const left = Math.min(...bounds.map((rect) => rect.left));
  const top = Math.min(...bounds.map((rect) => rect.top));
  const right = Math.max(...bounds.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...bounds.map((rect) => rect.top + rect.height));
  const unionWidth = right - left;
  const unionHeight = bottom - top;
  const areaRect = canvasRectForArea(area);
  const widthCm = unionWidth * ((area.realWidthMm / 10) / Math.max(areaRect.width, 1));
  const heightCm = unionHeight * ((area.realHeightMm / 10) / Math.max(areaRect.height, 1));
  return {
    widthCm: roundMetric(widthCm),
    heightCm: roundMetric(heightCm),
    areaCm2: roundMetric(widthCm * heightCm),
    objectCount: objects.length,
  };
}

function pricingBandForMetrics(bands: PricingBand[], metrics: SideMetrics): PricingBand {
  for (const band of bands) {
    const hasDimensions = band.maxWidthCm != null && band.maxHeightCm != null;
    if (hasDimensions && metrics.widthCm <= Number(band.maxWidthCm) && metrics.heightCm <= Number(band.maxHeightCm)) return band;
    if (!hasDimensions && (band.maxAreaCm2 == null || metrics.areaCm2 <= Number(band.maxAreaCm2))) return band;
  }
  return bands[bands.length - 1] ?? emptyBand();
}

function summarizeSidePricing(sideLabel: string, pricing: SidePricing) {
  if (!pricing.hasContent) return `${sideLabel}: tasarım yok`;
  return `${sideLabel}: ${formatMetricSize(pricing.metrics)} · ${pricing.band.label}`;
}

function normalizeColorKey(value: string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function colorHexForLabel(value: string) {
  return COLOR_HEX_MAP[normalizeColorKey(value)] ?? '#d1d5db';
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const CANVAS_STATE_KEY = 'bkf_canvas_state';

function canvasStorageKey(productKey: string) {
  return `${CANVAS_STATE_KEY}:${productKey}`;
}

function readStoredCanvasState(productKey: string) {
  if (typeof window === 'undefined' || !productKey) return null;
  try {
    const raw = localStorage.getItem(canvasStorageKey(productKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { frontJson?: string; backJson?: string };
    return {
      frontJson: parsed.frontJson ?? '',
      backJson: parsed.backJson ?? '',
    };
  } catch {
    return null;
  }
}

function writeStoredCanvasState(productKey: string, value: { frontJson: string; backJson: string }) {
  if (typeof window === 'undefined' || !productKey) return;
  try {
    localStorage.setItem(canvasStorageKey(productKey), JSON.stringify(value));
  } catch {
    /* ignore quota/storage errors */
  }
}

function getAutoZoom() {
  if (typeof window === 'undefined') return 100;
  const w = window.innerWidth;
  if (w >= 860) return 100;
  // Mobile: canvas area is full-width; 488 = PRINT_W (480) + card padding (8)
  const usable = w - 32; // subtract p-4 padding on each side
  return Math.max(50, Math.min(100, Math.floor(usable / 488 * 100)));
}

export default function App() {
  const {
    config, setConfig,
    activeSide, setActiveSide,
    sizeQuantities, setSizeQuantity,
    addSavedDesign,
    setIsBgRemoving,
    canvasState, setCanvasJson,
  } = useDesignerStore();

  const frontCanvasRef = useRef<CanvasAreaHandle>(null);
  const backCanvasRef = useRef<CanvasAreaHandle>(null);
  const configRef = useRef(config);
  const restoredCanvasRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>(null);
  const [selectedObj, setSelectedObj] = useState<fabric.Object | null>(null);
  const [objState, setObjState] = useState<ObjectState | null>(null);
  const [zoom, setZoom] = useState(getAutoZoom);
  const [layers, setLayers] = useState<fabric.Object[]>([]);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('selection');
  const [sceneOffset, setSceneOffset] = useState({ x: 0, y: 0 });
  const [isDraggingScene, setIsDraggingScene] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [showTextColorPalette, setShowTextColorPalette] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState({ front: '', back: '' });
  const [sidePreviews, setSidePreviews] = useState({ front: '', back: '' });
  const [textDraft, setTextDraft] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationConfig>(defaultPersonalization);
  const [canvasRevisions, setCanvasRevisions] = useState({ front: 0, back: 0 });
  const [selectedColor, setSelectedColor] = useState('');

  const getCanvasHandle = useCallback((side: Side) => (
    side === 'front' ? frontCanvasRef.current : backCanvasRef.current
  ), []);

  const productCanvasKey = useMemo(
    () => config?.productHandle || config?.productId || '',
    [config?.productHandle, config?.productId],
  );

  const getActiveCanvasHandle = useCallback(() => (
    getCanvasHandle(activeSide)
  ), [activeSide, getCanvasHandle]);

  const syncLayers = useCallback(() => {
    const cv = getActiveCanvasHandle()?.getCanvas();
    setLayers(cv ? [...cv.getObjects()] : []);
  }, [getActiveCanvasHandle]);

  const updateToolbarPosition = useCallback((obj: fabric.Object | null) => {
    const cv = getActiveCanvasHandle()?.getCanvas();
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
    applyConfig(readConfig(), setConfig);
  }, [setConfig]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.type !== 'DESIGNER_INIT' || !payload.config) return;
      applyConfig(payload.config as DesignerConfig, setConfig);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setConfig]);

  useEffect(() => {
    if (!config?.productHandle && !config?.productId) {
      setPersonalization(defaultPersonalization());
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (config?.productHandle) params.set('handle', config.productHandle);
    if (config?.productId) params.set('productId', config.productId);
    fetch(`/api/designer-config?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        setPersonalization(payload ? normalizePersonalizationPayload(payload) : defaultPersonalization());
      })
      .catch(() => {
        if (!cancelled) setPersonalization(defaultPersonalization());
      });
    return () => {
      cancelled = true;
    };
  }, [config?.productHandle, config?.productId]);

  useEffect(() => {
    if (personalization.surfaceMode === 'front_only' && activeSide !== 'front') {
      setActiveSide('front');
    }
  }, [activeSide, personalization.surfaceMode, setActiveSide]);

  useEffect(() => {
    const firstColor = config?.variants?.find((variant) => variant.option1)?.option1 ?? '';
    if (firstColor && !selectedColor) setSelectedColor(firstColor);
  }, [config?.variants, selectedColor]);

  useEffect(() => {
    syncLayers();
  }, [activeSide, syncLayers]);

  useEffect(() => {
    restoredCanvasRef.current = null;
    setCanvasJson('front', '');
    setCanvasJson('back', '');
  }, [productCanvasKey]);

  useEffect(() => {
    if (!productCanvasKey || restoredCanvasRef.current === productCanvasKey) return;
    if (!frontCanvasRef.current) return;
    if (personalization.surfaceMode !== 'front_only' && !backCanvasRef.current) return;
    const stored = readStoredCanvasState(productCanvasKey);
    if (!stored) {
      restoredCanvasRef.current = productCanvasKey;
      return;
    }
    if (stored.frontJson) {
      frontCanvasRef.current.loadDesign(stored.frontJson);
      setCanvasJson('front', stored.frontJson);
    }
    if (personalization.surfaceMode !== 'front_only' && stored.backJson) {
      backCanvasRef.current?.loadDesign(stored.backJson);
      setCanvasJson('back', stored.backJson);
    }
    restoredCanvasRef.current = productCanvasKey;
    window.setTimeout(syncLayers, 0);
  }, [personalization.surfaceMode, productCanvasKey, setCanvasJson, syncLayers]);

  useEffect(() => {
    const cv = getActiveCanvasHandle()?.getCanvas();
    cv?.discardActiveObject();
    cv?.renderAll();
    setSelectedObj(null);
    setObjState(null);
    setToolbarPos(null);
    setShowTextColorPalette(false);
  }, [activeSide, getActiveCanvasHandle]);

  useEffect(() => {
    if (!selectedObj) return;
    const onResize = () => updateToolbarPosition(selectedObj);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [selectedObj, updateToolbarPosition]);

  const handleDesignChange = useCallback((side: Side) => {
    const nextJson = getCanvasHandle(side)?.saveDesign() ?? '';
    const nextState = {
      ...canvasState,
      [`${side}Json`]: nextJson,
    } as typeof canvasState;
    setCanvasJson(side, nextJson);
    if (productCanvasKey) writeStoredCanvasState(productCanvasKey, nextState);
    setCanvasRevisions((prev) => ({ ...prev, [side]: prev[side] + 1 }));
    window.setTimeout(() => {
      const png = getCanvasHandle(side)?.exportPng(0.35) ?? '';
      setSidePreviews((prev) => ({ ...prev, [side]: png }));
    }, 0);
    if (side === activeSide) syncLayers();
  }, [activeSide, canvasState, getCanvasHandle, productCanvasKey, setCanvasJson, syncLayers]);

  const handleObjectSelected = useCallback((obj: fabric.Object | null) => {
    setSelectedObj(obj);
    if (!obj) {
      setObjState(null);
      setToolbarPos(null);
      setShowTextColorPalette(false);
      syncLayers();
      return;
    }
    setActiveTab(null);
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
    const cv = getActiveCanvasHandle()?.getCanvas();
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
    const cv = getActiveCanvasHandle()?.getCanvas();
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
    const selectedSizes = sizes.filter((size) => (sizeQuantities[size!] ?? 0) > 0);

    const cartItems: CartItemPayload[] = selectedSizes
      .map((size) => {
        const variantId = String(baseVariantForSize(size!)?.id ?? config?.singleVariantId ?? config?.doubleVariantId ?? '');
        return { variantId, quantity: sizeQuantities[size!] ?? 0, size: size ?? undefined };
      })
      .filter((item) => item.variantId);

    if (cartItems.length === 0) {
      alert('Lütfen en az bir beden için adet seçin');
      return;
    }

    const designRes = await fetch('/api/storefront/designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: config?.productId || config?.productHandle,
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
      'Toplam adet': String(totalQuantity),
      'Tişört birim fiyatı': formatMoney(pricingSummary.baseUnitPrice),
      'Tişört ara toplamı': formatMoney(pricingSummary.baseSubtotal),
      'Toplam fiyat': formatMoney(pricingSummary.total),
      'Ön önizleme': frontPng.slice(0, 200),
    };
    if (resolvedSide !== 'front') properties['Arka Tasarım'] = backPng ? 'Var' : 'Yok';
    if (pricingSummary.front.hasContent) {
      properties['Ön ölçü'] = formatMetricSize(pricingSummary.front.metrics);
      properties['Ön alan'] = `${roundMetric(pricingSummary.front.metrics.areaCm2)} cm²`;
      properties['Ön alan fiyatı'] = formatMoney(pricingSummary.front.surcharge);
      properties['Ön fiyat bandı'] = pricingSummary.front.band.label;
    }
    if (pricingSummary.back.hasContent) {
      properties['Arka ölçü'] = formatMetricSize(pricingSummary.back.metrics);
      properties['Arka alan'] = `${roundMetric(pricingSummary.back.metrics.areaCm2)} cm²`;
      properties['Arka alan fiyatı'] = formatMoney(pricingSummary.back.surcharge);
      properties['Arka fiyat bandı'] = pricingSummary.back.band.label;
    }

    if (personalization.surchargeVariantId) {
      if (pricingSummary.front.hasContent && pricingSummary.front.surchargeUnitAmount > 0) {
        const quantity = Math.round(pricingSummary.front.surchargeUnitAmount * totalQuantity);
        if (quantity > 0) {
          cartItems.push({
            variantId: personalization.surchargeVariantId,
            quantity,
            properties: {
              ...properties,
              '_design_role': 'surcharge',
              'Ürün tipi': 'Ön baskı ek ücreti',
              'Baskı yüzü': 'Ön',
              'Baskı ölçü': formatMetricSize(pricingSummary.front.metrics),
              'Baskı alanı': `${roundMetric(pricingSummary.front.metrics.areaCm2)} cm²`,
              'Fiyat bandı': pricingSummary.front.band.label,
              'Ek ücret / adet': formatMoney(pricingSummary.front.surcharge),
            },
          });
        }
      }

      if (pricingSummary.back.hasContent && pricingSummary.back.surchargeUnitAmount > 0) {
        const quantity = Math.round(pricingSummary.back.surchargeUnitAmount * totalQuantity);
        if (quantity > 0) {
          cartItems.push({
            variantId: personalization.surchargeVariantId,
            quantity,
            properties: {
              ...properties,
              '_design_role': 'surcharge',
              'Ürün tipi': 'Arka baskı ek ücreti',
              'Baskı yüzü': 'Arka',
              'Baskı ölçü': formatMetricSize(pricingSummary.back.metrics),
              'Baskı alanı': `${roundMetric(pricingSummary.back.metrics.areaCm2)} cm²`,
              'Fiyat bandı': pricingSummary.back.band.label,
              'Ek ücret / adet': formatMoney(pricingSummary.back.surcharge),
            },
          });
        }
      }
    }

    window.parent.postMessage({ type: 'DESIGNER_ADD_TO_CART', items: cartItems, properties, designToken: token }, '*');
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
    const cv = getActiveCanvasHandle()?.getCanvas();
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
    const cv = getActiveCanvasHandle()?.getCanvas();
    const obj = cv?.getActiveObject();
    if (!cv || !obj) return;
    const areaRect = canvasRectForArea(personalization.printAreas[activeSide]);
    const bounds = obj.getBoundingRect(true, true);
    const deltaX = areaRect.left + (areaRect.width / 2) - (bounds.left + bounds.width / 2);
    const deltaY = areaRect.top + (areaRect.height / 2) - (bounds.top + bounds.height / 2);
    obj.set({
      left: (obj.left ?? 0) + deltaX,
      top: (obj.top ?? 0) + deltaY,
    });
    obj.setCoords();
    cv.fire('object:modified', { target: obj });
    cv.renderAll();
    handleObjectSelected(obj);
  };

  const toggleLayerOrder = () => {
    const cv = getActiveCanvasHandle()?.getCanvas();
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
    const cv = getActiveCanvasHandle()?.getCanvas();
    if (!cv || !selectedObj) return;
    const areaRect = canvasRectForArea(personalization.printAreas[activeSide]);
    const bounds = selectedObj.getBoundingRect(true, true);
    const padding = 6;
    if (selectedObj.type === 'text' || selectedObj.type === 'i-text') {
      updateTextProp({ textAlign: alignment });
    }
    if (alignment === 'left') {
      selectedObj.set({
        left: (selectedObj.left ?? 0) + (areaRect.left + padding - bounds.left),
      });
    } else if (alignment === 'center') {
      selectedObj.set({
        left: (selectedObj.left ?? 0) + (areaRect.left + (areaRect.width / 2) - (bounds.left + bounds.width / 2)),
      });
    } else {
      selectedObj.set({
        left: (selectedObj.left ?? 0) + ((areaRect.left + areaRect.width - padding) - (bounds.left + bounds.width)),
      });
    }
    selectedObj.setCoords();
    cv.fire('object:modified', { target: selectedObj });
    cv.renderAll();
    handleObjectSelected(selectedObj);
  };

  const selectAllLayers = () => {
    const cv = getActiveCanvasHandle()?.getCanvas();
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

  useEffect(() => {
    let prevWidth = window.innerWidth;
    const onResize = () => {
      const w = window.innerWidth;
      if (w !== prevWidth) {
        prevWidth = w;
        setZoom(getAutoZoom());
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resetViewport = () => {
    setZoom(getAutoZoom());
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
    const cv = getActiveCanvasHandle()?.getCanvas();
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

  const surfaceMode = personalization.surfaceMode;
  const availableSides = surfaceMode === 'front_only' ? (['front'] as const) : (['front', 'back'] as const);

  const frontObjects = useMemo(
    () => frontCanvasRef.current?.getCanvas()?.getObjects() ?? [],
    [canvasRevisions.front],
  );
  const backObjects = useMemo(
    () => backCanvasRef.current?.getCanvas()?.getObjects() ?? [],
    [canvasRevisions.back],
  );

  const frontMetrics = useMemo(
    () => metricsFromObjects(frontObjects, personalization.printAreas.front),
    [frontObjects, personalization.printAreas.front],
  );
  const backMetrics = useMemo(
    () => metricsFromObjects(backObjects, personalization.printAreas.back),
    [backObjects, personalization.printAreas.back],
  );

  const frontHasDesign = frontMetrics.objectCount > 0;
  const backHasDesign = surfaceMode === 'front_only' ? false : backMetrics.objectCount > 0;
  const resolvedSide = frontHasDesign && backHasDesign ? 'double' : backHasDesign ? 'back' : frontHasDesign ? 'front' : activeSide;

  const sizes = useMemo(
    () => [...new Set(config?.variants?.map((v) => v.option2).filter(Boolean) ?? [])],
    [config?.variants],
  );

  const colorOptions = useMemo(
    () => [...new Set(config?.variants?.map((v) => v.option1).filter(Boolean) ?? [])],
    [config?.variants],
  );

  useEffect(() => {
    if (!colorOptions.length) return;
    if (!selectedColor || !colorOptions.includes(selectedColor)) {
      setSelectedColor(colorOptions[0] ?? '');
    }
  }, [colorOptions, selectedColor]);

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => {
    if (!selectedColor) return;
    const cfg = configRef.current;
    if (!cfg?.variants?.length) return;

    let newFront = '';
    let newBack = '';

    for (const v of cfg.variants) {
      if (v.option1 !== selectedColor || !v.featured_image?.src) continue;
      const opt3 = (v.option3 ?? '').toLowerCase();
      const img = v.featured_image.src;
      const isFront = (opt3.includes('ön') || opt3.includes('on') || opt3.includes('front')) && !opt3.includes('arka') && !opt3.includes('back');
      const isBack = opt3.includes('arka') || opt3.includes('back');
      const isBoth = (opt3.includes('ön') || opt3.includes('on')) && (opt3.includes('arka') || opt3.includes('back'));
      if ((isFront || isBoth) && !newFront) newFront = img;
      if ((isBack || isBoth) && !newBack) newBack = img;
    }

    // Eğer option3 yoksa, rengin herhangi bir variantının görselini kullan
    if (!newFront && !newBack) {
      const any = cfg.variants.find((v) => v.option1 === selectedColor && v.featured_image?.src);
      if (any?.featured_image?.src) { newFront = any.featured_image.src; newBack = any.featured_image.src; }
    }

    if (!newFront && !newBack) return;
    setConfig({
      ...cfg,
      frontImage: newFront || cfg.frontImage,
      backImage: newBack || cfg.backImage,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColor]);

  const baseVariantForSize = useCallback((size: string) => {
    const allVariants = (config?.variants ?? [])
      .filter((variant) => variant.option2 === size)
      .sort((a, b) => priceToCents(a.price) - priceToCents(b.price));
    const variants = selectedColor
      ? allVariants.filter((variant) => variant.option1 === selectedColor)
      : allVariants;
    const pool = variants.length ? variants : allVariants;
    return pool[0] ?? null;
  }, [config?.variants, selectedColor]);

  const baseUnitPrice = useMemo(() => {
    const firstSize = sizes[0];
    const baseVariant = firstSize ? baseVariantForSize(firstSize) : null;
    const fallback = priceToCents(config?.singlePrice ?? 0) || priceToCents(config?.doublePrice ?? 0);
    return baseVariant ? priceToCents(baseVariant.price) : fallback;
  }, [baseVariantForSize, config?.doublePrice, config?.singlePrice, sizes]);

  const totalQuantity = useMemo(
    () => Object.values(sizeQuantities).reduce((sum, q) => sum + q, 0),
    [sizeQuantities],
  );

  const baseSubtotal = useMemo(() => {
    return sizes.reduce((sum, size) => {
      const qty = sizeQuantities[size!] ?? 0;
      if (qty === 0) return sum;
      const variant = baseVariantForSize(size!);
      const unitPrice = variant ? priceToCents(variant.price) : baseUnitPrice;
      return sum + unitPrice * qty;
    }, 0);
  }, [baseUnitPrice, baseVariantForSize, sizeQuantities, sizes]);

  const pricingSummary = useMemo<PricingSummary>(() => {
    const frontBand = pricingBandForMetrics(personalization.pricingBands.front, frontMetrics);
    const backBand = pricingBandForMetrics(personalization.pricingBands.back, backMetrics);
    const frontSurchargeUnitAmount = frontHasDesign ? Number(frontBand.surcharge || 0) : 0;
    const backSurchargeUnitAmount = backHasDesign ? Number(backBand.surcharge || 0) : 0;
    const frontSurcharge = surchargeToCents(frontSurchargeUnitAmount);
    const backSurcharge = surchargeToCents(backSurchargeUnitAmount);
    return {
      totalQuantity,
      baseUnitPrice,
      baseSubtotal,
      total: baseSubtotal + (frontSurcharge + backSurcharge) * totalQuantity,
      front: {
        hasContent: frontHasDesign,
        metrics: frontMetrics,
        band: frontBand,
        surcharge: frontSurcharge,
        surchargeUnitAmount: frontSurchargeUnitAmount,
        subtotal: frontSurcharge * totalQuantity,
      },
      back: {
        hasContent: backHasDesign,
        metrics: backMetrics,
        band: backBand,
        surcharge: backSurcharge,
        surchargeUnitAmount: backSurchargeUnitAmount,
        subtotal: backSurcharge * totalQuantity,
      },
    };
  }, [
    backHasDesign,
    backMetrics,
    baseSubtotal,
    baseUnitPrice,
    frontHasDesign,
    frontMetrics,
    personalization.pricingBands.back,
    personalization.pricingBands.front,
    totalQuantity,
  ]);

  const formatMoney = useCallback((amountInCents: number) => (
    new Intl.NumberFormat(config?.locale ?? 'tr-TR', {
      style: 'currency',
      currency: config?.currency ?? 'TRY',
      maximumFractionDigits: 0,
    }).format(amountInCents / 100)
  ), [config?.currency, config?.locale]);

  const formattedPrice = pricingSummary.total > 0
    ? formatMoney(pricingSummary.total)
    : '';

  const activePrintArea = personalization.printAreas[activeSide];
  const activeAreaSummary = `${Math.round(activePrintArea.realWidthMm / 10)} x ${Math.round(activePrintArea.realHeightMm / 10)} cm`;
  const activeAreaCoordsSummary = `X:${Math.round(activePrintArea.x)} Y:${Math.round(activePrintArea.y)} · Kutu ${Math.round(activePrintArea.width)} x ${Math.round(activePrintArea.height)}`;
  const pricingNarrative = surfaceMode === 'front_only'
    ? summarizeSidePricing('Ön', pricingSummary.front)
    : `${summarizeSidePricing('Ön', pricingSummary.front)} | ${summarizeSidePricing('Arka', pricingSummary.back)}`;

  const reversedLayers = [...layers].reverse();
  const dockToolbar = zoom < 100 || (typeof window !== 'undefined' && window.innerWidth < 860);

  return (
    <div className="flex h-full min-h-screen items-stretch justify-center bg-[#eef2f7] text-gray-900">
      <div className="flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white shadow-none layout:flex-row layout:justify-center">
        <div className="flex min-h-0 w-full flex-col layout:min-w-0 layout:w-auto layout:flex-[0_1_980px] xl:flex-[0_1_1040px]">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 lg:hidden"
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
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-24 pt-3 md:p-4"
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
                  <CanvasArea
                    ref={frontCanvasRef}
                    side="front"
                    zoom={zoom}
                    printArea={personalization.printAreas.front}
                    onObjectSelected={handleObjectSelected}
                    onDesignChange={handleDesignChange}
                  />
                </div>
                {surfaceMode !== 'front_only' && (
                  <div className={activeSide === 'back' ? 'block' : 'hidden'}>
                    <CanvasArea
                      ref={backCanvasRef}
                      side="back"
                      zoom={zoom}
                      printArea={personalization.printAreas.back}
                      onObjectSelected={handleObjectSelected}
                      onDesignChange={handleDesignChange}
                    />
                  </div>
                )}

                <div className="absolute left-4 top-4 z-30 rounded-2xl border border-white/60 bg-white/92 px-3 py-2 shadow-lg backdrop-blur md:left-6 md:top-6 lg:hidden">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">Tasarım Alanı</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{activeAreaSummary}</p>
                  <p className="mt-1 text-[10px] font-semibold text-gray-500">{activeAreaCoordsSummary}</p>
                </div>

                <div className="absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 gap-1.5 rounded-2xl border border-white/50 bg-white/90 p-1.5 shadow-xl backdrop-blur md:bottom-6 md:gap-3 md:p-2">
                  {availableSides.map((side) => {
                    const label = side === 'front' ? 'Ön' : 'Arka';
                    const image = sidePreviews[side] || (side === 'front' ? config?.frontImage : config?.backImage);
                    const hasDesign = side === 'front' ? frontHasDesign : backHasDesign;
                    return (
                    <div key={side} className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setActiveSide(side)}
                        className={cn(
                          'h-16 w-12 overflow-hidden rounded-lg border-2 p-0.5 transition-all md:h-20 md:w-16',
                          activeSide === side ? 'scale-105 border-blue-500 shadow-md' : 'border-transparent opacity-60 hover:opacity-100',
                        )}
                      >
                        {image ? (
                          <img src={image} className="h-full w-full rounded object-cover" alt={label} />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded bg-gray-100 text-[10px] font-bold text-gray-400">{label}</div>
                        )}
                      </button>
                      <span className={cn('text-[9px] font-bold uppercase md:text-[10px]', activeSide === side ? 'text-blue-600' : 'text-gray-400')}>
                        {label}
                      </span>
                      {hasDesign && <span className="sr-only">tasarım var</span>}
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="absolute bottom-24 right-2 z-30 flex scale-[0.8] flex-col gap-1.5 origin-right md:right-5 md:top-1/2 md:-translate-y-1/2 md:scale-90 md:gap-2">
              <div className="flex w-14 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-16">
                <button
                  onClick={() => {
                    setInteractionMode('selection');
                    const cv = getActiveCanvasHandle()?.getCanvas();
                    if (cv) {
                      cv.selection = true;
                      cv.renderAll();
                    }
                  }}
                  className={cn(
                    'flex w-full flex-col items-center justify-center rounded-t-2xl border-b border-gray-100 p-2 transition-colors md:p-2.5',
                    interactionMode === 'selection' ? 'bg-blue-50/50 text-blue-600' : 'text-gray-400 hover:bg-gray-50',
                  )}
                >
                  <MousePointer2 className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                  <span className="mt-1 block text-[6px] font-bold uppercase tracking-tighter md:text-[8px]">Seçim</span>
                </button>
                <button
                  onClick={selectAllLayers}
                  className="flex w-full flex-col items-center justify-center border-b border-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-50 md:p-2.5"
                >
                  <LayoutGrid className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                  <span className="mt-1 block text-center text-[6px] font-bold uppercase tracking-tighter md:text-[8px]">Toplu S.</span>
                </button>
                <button
                  onClick={() => {
                    setInteractionMode('navigation');
                    const cv = getActiveCanvasHandle()?.getCanvas();
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
                    'flex w-full flex-col items-center justify-center rounded-b-2xl p-2 transition-colors md:p-2.5',
                    interactionMode === 'navigation' ? 'bg-blue-50/50 text-blue-600' : 'text-gray-400 hover:bg-gray-50',
                  )}
                >
                  <Move className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                  <span className="mt-1 block text-center text-[6px] font-bold uppercase tracking-tighter md:text-[8px]">Gezinme</span>
                </button>
              </div>

              <div className="flex w-14 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-16">
                <button
                  onClick={() => setZoom((value) => Math.min(300, value + 20))}
                  className="flex w-full justify-center rounded-t-2xl border-b border-gray-100 p-2 text-gray-400 transition-colors hover:bg-gray-50 md:p-2.5"
                >
                  <ZoomIn className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                </button>
                <button
                  onClick={resetViewport}
                  className="w-full select-none bg-gray-50 py-1.5 text-center text-[8px] font-black text-gray-600 transition-colors hover:bg-gray-100 md:py-2.5 md:text-[10px]"
                  title="Sıfırla"
                >
                  {zoom}%
                </button>
                <button
                  onClick={() => setZoom((value) => Math.max(20, value - 20))}
                  className="flex w-full justify-center rounded-b-2xl p-2 text-gray-400 transition-colors hover:bg-gray-50 md:p-2.5"
                >
                  <ZoomOut className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                </button>
              </div>
            </div>
          </div>

          {activeTab && (
            <div className="absolute bottom-0 left-0 z-50 w-full overflow-hidden rounded-t-[32px] border-t border-gray-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
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
                          const activeObject = getActiveCanvasHandle()?.getCanvas()?.getActiveObject();
                          return (
                            <div
                              key={index}
                              draggable
                              onDragStart={() => handleLayerDragStart(index)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleLayerDrop(index)}
                              onClick={() => {
                                const cv = getActiveCanvasHandle()?.getCanvas();
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
                                  const cv = getActiveCanvasHandle()?.getCanvas();
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
            </div>
          )}

          {selectedObj && (toolbarPos || dockToolbar) && (!activeTab || dockToolbar) && !showPreview && (
            <div
              className="fixed z-[100] flex items-center justify-center"
              style={dockToolbar
                ? { left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', transform: 'translateX(-50%)' }
                : { left: toolbarPos?.x ?? 0, top: toolbarPos?.y ?? 0, transform: 'translateX(-50%)' }}
            >
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                {objState?.type === 'text' && showTextColorPalette && (
                  <div className="flex max-w-[92vw] flex-wrap items-center justify-center gap-2 rounded-[18px] border border-white/60 bg-white/96 px-3 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                    {TEXT_COLOR_SWATCHES.map((color) => {
                      const isActive = (objState.color ?? '#111827').toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateTextProp({ color })}
                          className={cn(
                            'h-8 w-8 rounded-full border-2 transition-transform hover:scale-105',
                            isActive ? 'border-blue-500 shadow-md' : 'border-white shadow-sm',
                          )}
                          style={{ backgroundColor: color }}
                          aria-label={`Renk ${color}`}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="pointer-events-auto flex max-w-[95vw] items-center gap-0.5 overflow-x-auto rounded-[20px] border border-white/50 bg-white/95 p-1 shadow-[0_10px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl no-scrollbar md:max-w-none md:gap-1 md:rounded-[28px] md:p-2">
                  {objState?.type === 'text' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowTextColorPalette((prev) => !prev)}
                        className={cn(
                          'relative flex shrink-0 flex-col items-center gap-0.5 rounded-xl border-r border-gray-100 px-2 py-1.5 transition-colors hover:bg-gray-50/50 md:gap-1 md:px-3 md:py-2',
                          showTextColorPalette ? 'bg-blue-50/70' : '',
                        )}
                      >
                        <div className="h-5 w-5 rounded-full border border-gray-200 shadow-inner md:h-6 md:w-6" style={{ backgroundColor: objState.color }} />
                        <span className="text-[9px] font-bold text-gray-500 md:text-[10px]">Renk</span>
                      </button>

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
                            const objects = getActiveCanvasHandle()?.getCanvas()?.getObjects() ?? [];
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
                            const objects = getActiveCanvasHandle()?.getCanvas()?.getObjects() ?? [];
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
                </div>
            </div>
          )}

          {showPreview && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setShowPreview(false)}
            >
              <div
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
                    <div className={cn('grid grid-cols-1 gap-8', surfaceMode === 'front_only' ? 'md:grid-cols-1' : 'md:grid-cols-2')}>
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

                      {surfaceMode !== 'front_only' && (
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
                      )}
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
              </div>
            </div>
          )}
        </div>

        <footer className="hidden">
          <div className="space-y-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">Tasarım Alanı</p>
                  <p className="mt-1 text-sm font-bold text-gray-900">{activeAreaSummary}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Toplam</p>
                  <p className="mt-1 text-lg font-black text-gray-900">{formattedPrice || formatMoney(0)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed text-gray-600">{pricingNarrative}</p>
            </div>

            {colorOptions.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Renk Varyantları</p>
                  {selectedColor && <span className="text-xs font-bold text-gray-600">{selectedColor}</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color!}
                      type="button"
                      onClick={() => setSelectedColor(color!)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-colors',
                        selectedColor === color ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                        style={{ backgroundColor: colorHexForLabel(color!) }}
                      />
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {sizes.map((size) => {
                  const qty = sizeQuantities[size!] ?? 0;
                  return (
                    <div
                      key={size!}
                      className={cn(
                        'rounded-2xl border p-2 text-center transition-colors',
                        qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50',
                      )}
                    >
                      <p className={cn('text-xs font-black', qty > 0 ? 'text-blue-700' : 'text-gray-600')}>{size}</p>
                      <div className="mt-2 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSizeQuantity(size!, qty - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-sm font-bold text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700"
                        >−</button>
                        <span className={cn('w-5 text-center text-sm font-black tabular-nums', qty > 0 ? 'text-blue-700' : 'text-gray-400')}>{qty}</span>
                        <button
                          type="button"
                          onClick={() => setSizeQuantity(size!, qty + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-sm font-bold text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-700"
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setActiveTab('templates')}
                className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                Şablonlar
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Kayıtlar
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Save className="h-3.5 w-3.5" />
                Kaydet
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              Sepete Ekle{totalQuantity > 0 ? ` (${totalQuantity})` : ''}
            </button>
          </div>
        </footer>
        </div>

        {/* RIGHT: Commerce sidebar — right on desktop, below on mobile */}
        <div className="flex w-full flex-none flex-col overflow-y-auto border-t border-gray-100 bg-white layout:w-[300px] layout:min-w-[300px] layout:border-l layout:border-t-0 lg:w-[340px] lg:min-w-[340px] xl:w-[380px] xl:min-w-[380px]">
          {config?.productTitle && (
            <div className="border-b border-gray-100 px-3 py-3">
              <h2 className="text-xs font-bold leading-snug text-gray-900">{config.productTitle}</h2>
            </div>
          )}

          {/* TASARIM ALANI — always first */}
          <div className="border-b border-gray-100 px-3 py-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-500">Tasarım Alanı</p>
                  <p className="mt-0.5 text-sm font-black text-gray-900">{activeAreaSummary}</p>
                  <p className="mt-1 text-[10px] font-semibold text-gray-500">{activeAreaCoordsSummary}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">Toplam</p>
                  <p className="mt-0.5 text-xl font-black text-gray-900">{formattedPrice || formatMoney(0)}</p>
                </div>
              </div>

              {/* Front / Back design status badges */}
              <div className="mt-2 flex gap-1.5">
                <div className={cn(
                  'flex flex-1 items-center gap-1 rounded-lg px-2 py-1.5',
                  frontHasDesign ? 'bg-emerald-50 text-emerald-700' : 'bg-white/70 text-gray-400',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full flex-none', frontHasDesign ? 'bg-emerald-500' : 'bg-gray-300')} />
                  <span className="text-[10px] font-bold">Ön</span>
                  <span className="ml-auto text-[9px] font-semibold">
                    {frontHasDesign ? formatMoney(pricingSummary.front.subtotal) : 'yok'}
                  </span>
                </div>
                {surfaceMode !== 'front_only' && (
                  <div className={cn(
                    'flex flex-1 items-center gap-1 rounded-lg px-2 py-1.5',
                    backHasDesign ? 'bg-emerald-50 text-emerald-700' : 'bg-white/70 text-gray-400',
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full flex-none', backHasDesign ? 'bg-emerald-500' : 'bg-gray-300')} />
                    <span className="text-[10px] font-bold">Arka</span>
                    <span className="ml-auto text-[9px] font-semibold">
                      {backHasDesign ? formatMoney(pricingSummary.back.subtotal) : 'yok'}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1 rounded-xl bg-white/80 p-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-gray-500">Ürün fiyatı</span>
                  <strong className="font-black text-gray-900">{formatMoney(pricingSummary.baseUnitPrice)}</strong>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-gray-500">Ara toplam</span>
                  <strong className="font-black text-gray-900">{formatMoney(pricingSummary.baseSubtotal)}</strong>
                </div>
                {pricingSummary.front.hasContent && (
                  <div className="flex items-start justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-gray-500">Ön baskı</span>
                    <strong className="font-black text-gray-900">{formatMoney(pricingSummary.front.subtotal)}</strong>
                  </div>
                )}
                {pricingSummary.back.hasContent && (
                  <div className="flex items-start justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-gray-500">Arka baskı</span>
                    <strong className="font-black text-gray-900">{formatMoney(pricingSummary.back.subtotal)}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {colorOptions.length > 0 && (
            <div className="border-b border-gray-100 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Renk</p>
                {selectedColor && <span className="text-[10px] font-bold text-gray-600">{selectedColor}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {colorOptions.map((color) => (
                  <button
                    key={color!}
                    type="button"
                    onClick={() => setSelectedColor(color!)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-[10px] font-bold transition-colors',
                      selectedColor === color ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ backgroundColor: colorHexForLabel(color!) }}
                    />
                    {color}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sizes.length > 0 ? (
            <div className="border-b border-gray-100 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Beden</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black text-gray-500">{totalQuantity} adet</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {sizes.map((size) => {
                  const qty = sizeQuantities[size!] ?? 0;
                  return (
                    <div
                      key={size!}
                      className={cn(
                        'flex flex-col items-center rounded-xl border-2 p-1.5 transition-colors',
                        qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50',
                      )}
                    >
                      <span className={cn('text-[10px] font-bold', qty > 0 ? 'text-blue-700' : 'text-gray-600')}>{size}</span>
                      <div className="mt-1 flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setSizeQuantity(size!, qty - 1)}
                          className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-xs font-bold text-gray-400 shadow-sm hover:bg-gray-100"
                        >−</button>
                        <span className={cn('w-4 text-center text-xs font-bold tabular-nums', qty > 0 ? 'text-blue-700' : 'text-gray-400')}>{qty}</span>
                        <button
                          type="button"
                          onClick={() => setSizeQuantity(size!, qty + 1)}
                          className="flex h-5 w-5 items-center justify-center rounded-md bg-white text-xs font-bold text-gray-400 shadow-sm hover:bg-gray-100"
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border-b border-gray-100" />
          )}

          <div className="border-b border-gray-100 px-3 py-2">
            <button
              onClick={handlePreview}
              className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-2 py-2 text-[10px] font-bold text-gray-700 transition-colors hover:bg-gray-200"
            >
              <Eye className="h-3.5 w-3.5" />
              Önizleme
            </button>
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveTab('templates')}
                className="flex-1 rounded-lg bg-gray-100 px-2 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                Şablonlar
              </button>
              <button
                onClick={handleSave}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Save className="h-3 w-3" />
                Kaydet
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gray-100 px-2 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Bookmark className="h-3 w-3" />
                Kayıtlar
              </button>
            </div>
          </div>

          <div className="px-3 py-3">
            <button
              onClick={handleAddToCart}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              Sepete Ekle{totalQuantity > 0 ? ` (${totalQuantity})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
