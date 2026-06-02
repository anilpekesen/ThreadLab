import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

function getBgSessionId(): string {
  const key = 'dk_bg_session';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return '';
  }
}
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
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Crop,
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
import type { Template } from '@/components/panels/TemplatesPanel';
import type { DesignerConfig, PersonalizationConfig, PricingBand, PrintAreaConfig, SavedDesign, Side, SurfaceMode, VolumeDiscountTier } from '@/types';
import { generateId } from '@/utils/compress';

const ImagePanel = lazy(() => import('@/components/panels/ImagePanel'));
const TextPanel = lazy(() => import('@/components/panels/TextPanel'));
const TemplatesPanel = lazy(() => import('@/components/panels/TemplatesPanel'));
const SavedPanel = lazy(() => import('@/components/panels/SavedPanel'));

type Tab = 'image' | 'text' | 'layers' | 'templates' | 'saved' | null;

type InteractionMode = 'selection' | 'navigation';
type CanvasSelection = fabric.Object | fabric.ActiveSelection;

interface ObjectState {
  type: 'text' | 'image';
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

interface PrintObjectPricing {
  metrics: SideMetrics;
  band: PricingBand;
  surcharge: number;
  surchargeUnitAmount: number;
  subtotal: number;
}

interface SidePricing {
  hasContent: boolean;
  metrics: SideMetrics;
  band: PricingBand;
  items: PrintObjectPricing[];
  surcharge: number;
  surchargeUnitAmount: number;
  subtotal: number;
}

interface PricingSummary {
  totalQuantity: number;
  baseUnitPrice: number;
  baseSubtotal: number;
  volumeDiscountPercentage: number;
  printDiscountSubtotal: number;
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
    volumeDiscounts: [],
    surchargeVariantId: '',
    removeBgAvailable: false,
    variantMockups: {},
    termsUrl: '',
  };
}

function readConfig(): DesignerConfig {
  const w = window as typeof window & { __DESIGNER_CONFIG__?: DesignerConfig };
  if (w.__DESIGNER_CONFIG__) return w.__DESIGNER_CONFIG__;
  const p = new URLSearchParams(window.location.search);
  let variants: DesignerConfig['variants'] = [];
  let selectedVariant: DesignerConfig['selectedVariant'] = null;
  try { variants = JSON.parse(p.get('variants') ?? '[]') as DesignerConfig['variants']; } catch { variants = []; }
  try { selectedVariant = JSON.parse(p.get('selectedVariant') ?? 'null') as DesignerConfig['selectedVariant']; } catch { selectedVariant = null; }
  return {
    productId: p.get('productId') ?? '',
    productHandle: p.get('handle') ?? '',
    productTitle: p.get('title') ?? 'Tişört',
    frontImage: p.get('front') ?? '',
    backImage: p.get('back') ?? '',
    shirtColor: p.get('color') ?? '#1C1C1E',
    variants,
    selectedVariant,
    optionNames: (p.get('optionNames') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    currency: p.get('currency') ?? 'TRY',
    locale: p.get('locale') ?? 'tr-TR',
    uploadEndpoint: p.get('upload') ?? '/apps/tshirt-designer/upload',
    shop: p.get('shop') ?? '',
    singleVariantId: p.get('singleVariantId') ?? '',
    doubleVariantId: p.get('doubleVariantId') ?? '',
    singlePrice: Number(p.get('singlePrice') ?? 0),
    doublePrice: Number(p.get('doublePrice') ?? 0),
  };
}

function applyConfig(cfg: DesignerConfig, setConfig: (config: DesignerConfig) => void) {
  setConfig(cfg);
}

function detectOptionKeys(optionNames: string[]): { colorKey: 'option1' | 'option2' | 'option3'; sizeKey: 'option1' | 'option2' | 'option3' | null } {
  const COLOR_KEYWORDS = ['renk', 'color', 'colour', 'rengi', 'rang'];
  const SIZE_KEYWORDS = ['beden', 'size', 'boyut', 'ölçü'];
  const keys = ['option1', 'option2', 'option3'] as const;
  let colorIdx = optionNames.findIndex((n) => COLOR_KEYWORDS.some((k) => n.toLowerCase().includes(k)));
  let sizeIdx = optionNames.findIndex((n) => SIZE_KEYWORDS.some((k) => n.toLowerCase().includes(k)));
  // Fallback defaults: color=0, size=1
  if (colorIdx === -1) colorIdx = 0;
  if (sizeIdx === -1) sizeIdx = optionNames.length > 1 ? 1 : -1;
  return {
    colorKey: keys[colorIdx] ?? 'option1',
    sizeKey: sizeIdx >= 0 ? (keys[sizeIdx] ?? null) : null,
  };
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

function normalizeVolumeDiscount(tier: Partial<VolumeDiscountTier> | null | undefined, index: number): VolumeDiscountTier {
  return {
    key: String(tier?.key || `volume-${index}`),
    minQuantity: Math.max(1, Math.floor(Number(tier?.minQuantity || 0))),
    percentage: Math.min(100, Math.max(0, Number(tier?.percentage || 0))),
  };
}

function volumeDiscountForQuantity(tiers: VolumeDiscountTier[], quantity: number): VolumeDiscountTier | null {
  return tiers
    .filter((tier) => tier.minQuantity > 0 && tier.percentage > 0 && quantity >= tier.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;
}

function applyPercentageDiscount(value: number, percentage: number): number {
  if (percentage <= 0) return value;
  return Math.max(0, value * (1 - percentage / 100));
}

function PanelLoading() {
  return (
    <div className="flex min-h-[180px] items-center justify-center text-sm font-medium text-gray-400">
      Yükleniyor...
    </div>
  );
}

function normalizePrintArea(side: Side, area: Partial<PrintAreaConfig> | null | undefined): PrintAreaConfig {
  const fallback = DEFAULT_PRINT_AREAS[side];
  return {
    side,
    mockupX: Number(area?.mockupX ?? fallback.mockupX),
    mockupY: Number(area?.mockupY ?? fallback.mockupY),
    mockupWidth: Number(area?.mockupWidth ?? fallback.mockupWidth),
    mockupHeight: Number(area?.mockupHeight ?? fallback.mockupHeight),
    mockupImageUrl: area?.mockupImageUrl || undefined,
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
    settings?: {
      surfaceMode?: SurfaceMode;
      pricingBands?: Record<Side, PricingBand[]>;
      volumeDiscounts?: VolumeDiscountTier[];
      surchargeVariantId?: string;
      removeBgAvailable?: boolean;
      termsUrl?: string;
    };
    printAreas?: PrintAreaConfig[];
    product?: { surfaceMode?: SurfaceMode };
    variantMockups?: Record<string, { front?: string; back?: string }>;
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
    volumeDiscounts: [],
    surchargeVariantId: String(source?.settings?.surchargeVariantId || ''),
    removeBgAvailable: Boolean(source?.settings?.removeBgAvailable),
    variantMockups: source?.variantMockups ?? {},
    termsUrl: String(source?.settings?.termsUrl || ''),
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

function metricsFromRect(rect: { width: number; height: number }, area: PrintAreaConfig, objectCount: number): SideMetrics {
  const areaRect = canvasRectForArea(area);
  const widthCm = rect.width * ((area.realWidthMm / 10) / Math.max(areaRect.width, 1));
  const heightCm = rect.height * ((area.realHeightMm / 10) / Math.max(areaRect.height, 1));
  return {
    widthCm: roundMetric(widthCm),
    heightCm: roundMetric(heightCm),
    areaCm2: roundMetric(widthCm * heightCm),
    objectCount,
  };
}

function metricsFromObjects(objects: fabric.Object[], area: PrintAreaConfig): SideMetrics {
  const bounds = objects
    .map((obj) => obj.getBoundingRect(true, true))
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!bounds.length) return { widthCm: 0, heightCm: 0, areaCm2: 0, objectCount: 0 };

  const left = Math.min(...bounds.map((rect) => rect.left));
  const right = Math.max(...bounds.map((rect) => rect.left + rect.width));
  const top = Math.min(...bounds.map((rect) => rect.top));
  const bottom = Math.max(...bounds.map((rect) => rect.top + rect.height));
  return metricsFromRect({ width: right - left, height: bottom - top }, area, objects.length);
}

function pricingItemsForObjects(
  objects: fabric.Object[],
  area: PrintAreaConfig,
  bands: PricingBand[],
  totalQuantity: number,
): PrintObjectPricing[] {
  const metrics = metricsFromObjects(objects, area);
  if (!metrics.objectCount || metrics.widthCm <= 0 || metrics.heightCm <= 0) return [];

  const band = pricingBandForMetrics(bands, metrics);
  const surchargeUnitAmount = Number(band.surcharge || 0);
  const surcharge = surchargeToCents(surchargeUnitAmount);
  return [{
    metrics,
    band,
    surcharge,
    surchargeUnitAmount,
    subtotal: surcharge * totalQuantity,
  }];
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
  if (pricing.metrics.objectCount > 1) return `${sideLabel}: ${pricing.metrics.objectCount} öğe · ${formatMetricSize(pricing.metrics)} · ${pricing.band.label}`;
  return `${sideLabel}: ${formatMetricSize(pricing.metrics)} · ${pricing.band.label}`;
}

function normalizeColorKey(value: string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

function colorHexForLabel(value: string) {
  return COLOR_HEX_MAP[normalizeColorKey(value)] ?? '#d1d5db';
}

function colorInputValue(value: string | undefined) {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#111827';
}

function selectedColorFromConfig(config: DesignerConfig | null | undefined): string {
  if (!config) return '';
  const { colorKey } = detectOptionKeys(config.optionNames ?? []);
  const selectedVariantColor = config.selectedVariant?.[colorKey] ?? '';
  if (selectedVariantColor) return String(selectedVariantColor);
  const selectedVariantId = config.selectedVariant?.id ? String(config.selectedVariant.id) : '';
  if (selectedVariantId) {
    const matchingVariantColor = config.variants?.find((variant) => String(variant.id) === selectedVariantId)?.[colorKey] ?? '';
    if (matchingVariantColor) return String(matchingVariantColor);
  }
  return '';
}

function colorMockupFor(
  personalization: PersonalizationConfig,
  color: string,
): { front?: string; back?: string } | undefined {
  if (!color) return undefined;
  const direct = personalization.variantMockups?.[color];
  if (direct?.front || direct?.back) return direct;
  const normalizedColor = normalizeColorKey(color);
  return Object.entries(personalization.variantMockups ?? {}).find(([key, value]) => (
    normalizeColorKey(key) === normalizedColor && Boolean(value?.front || value?.back)
  ))?.[1];
}

function resolveDesignerMockupConfig(
  config: DesignerConfig,
  personalization: PersonalizationConfig,
  selectedColor?: string,
): DesignerConfig {
  const color = selectedColor || selectedColorFromConfig(config);
  const mockup = colorMockupFor(personalization, color);
  if (mockup?.front || mockup?.back) {
    return {
      ...config,
      frontImage: mockup.front || config.frontImage,
      backImage: mockup.back || config.backImage,
    };
  }

  const hasColorMockups = Object.keys(personalization.variantMockups ?? {}).length > 0;
  if (hasColorMockups && color) return config;

  const frontUrl = personalization.printAreas.front.mockupImageUrl;
  const backUrl = personalization.printAreas.back.mockupImageUrl;
  if (!frontUrl && !backUrl) return config;
  return {
    ...config,
    frontImage: frontUrl || config.frontImage,
    backImage: backUrl || config.backImage,
  };
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function isActiveSelection(obj: fabric.Object | null | undefined): obj is fabric.ActiveSelection {
  return Boolean(obj && obj.type === 'activeSelection');
}

function isImageSelection(obj: fabric.Object | null | undefined): obj is fabric.Image {
  return Boolean(obj && obj.type === 'image');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCropRect(rect: CropRect): CropRect {
  const minSize = 0.08;
  const maxX = 1 - minSize;
  const maxY = 1 - minSize;
  const x = clamp(rect.x, 0, maxX);
  const y = clamp(rect.y, 0, maxY);
  const width = clamp(rect.width, minSize, 1 - x);
  const height = clamp(rect.height, minSize, 1 - y);
  return { x, y, width, height };
}

async function cropImageDataUrl(src: string, rect: CropRect): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cropX = Math.round(img.width * rect.x);
      const cropY = Math.round(img.height * rect.y);
      const cropWidth = Math.max(1, Math.round(img.width * rect.width));
      const cropHeight = Math.max(1, Math.round(img.height * rect.height));
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas olusturulamadi'));
        return;
      }
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Gorsel yuklenemedi'));
    img.src = src;
  });
}

function ImageCropModal({
  src,
  initialRect,
  onClose,
  onApply,
}: {
  src: string;
  initialRect: CropRect;
  onClose: () => void;
  onApply: (rect: CropRect) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<CropRect>(initialRect);
  const dragStateRef = useRef<{
    mode: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
    pointerId: number;
    startRect: CropRect;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    setRect(initialRect);
  }, [initialRect]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      const frame = frameRef.current;
      if (!drag || !frame || drag.pointerId !== event.pointerId) return;
      const bounds = frame.getBoundingClientRect();
      const dx = (event.clientX - drag.startX) / Math.max(bounds.width, 1);
      const dy = (event.clientY - drag.startY) / Math.max(bounds.height, 1);
      const minSize = 0.08;

      setRect(() => {
        let next = { ...drag.startRect };
        if (drag.mode === 'move') {
          next.x = clamp(drag.startRect.x + dx, 0, 1 - drag.startRect.width);
          next.y = clamp(drag.startRect.y + dy, 0, 1 - drag.startRect.height);
        }
        if (drag.mode === 'nw') {
          const nextX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - minSize);
          const nextY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - minSize);
          next.width = drag.startRect.width + (drag.startRect.x - nextX);
          next.height = drag.startRect.height + (drag.startRect.y - nextY);
          next.x = nextX;
          next.y = nextY;
        }
        if (drag.mode === 'ne') {
          const maxRight = 1;
          const nextRight = clamp(drag.startRect.x + drag.startRect.width + dx, drag.startRect.x + minSize, maxRight);
          const nextY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - minSize);
          next.width = nextRight - drag.startRect.x;
          next.height = drag.startRect.height + (drag.startRect.y - nextY);
          next.y = nextY;
        }
        if (drag.mode === 'sw') {
          const nextX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - minSize);
          const nextBottom = clamp(drag.startRect.y + drag.startRect.height + dy, drag.startRect.y + minSize, 1);
          next.width = drag.startRect.width + (drag.startRect.x - nextX);
          next.height = nextBottom - drag.startRect.y;
          next.x = nextX;
        }
        if (drag.mode === 'se') {
          const nextRight = clamp(drag.startRect.x + drag.startRect.width + dx, drag.startRect.x + minSize, 1);
          const nextBottom = clamp(drag.startRect.y + drag.startRect.height + dy, drag.startRect.y + minSize, 1);
          next.width = nextRight - drag.startRect.x;
          next.height = nextBottom - drag.startRect.y;
        }
        if (drag.mode === 'n') {
          const nextY = clamp(drag.startRect.y + dy, 0, drag.startRect.y + drag.startRect.height - minSize);
          next.height = drag.startRect.height + (drag.startRect.y - nextY);
          next.y = nextY;
        }
        if (drag.mode === 's') {
          const nextBottom = clamp(drag.startRect.y + drag.startRect.height + dy, drag.startRect.y + minSize, 1);
          next.height = nextBottom - drag.startRect.y;
        }
        if (drag.mode === 'w') {
          const nextX = clamp(drag.startRect.x + dx, 0, drag.startRect.x + drag.startRect.width - minSize);
          next.width = drag.startRect.width + (drag.startRect.x - nextX);
          next.x = nextX;
        }
        if (drag.mode === 'e') {
          const nextRight = clamp(drag.startRect.x + drag.startRect.width + dx, drag.startRect.x + minSize, 1);
          next.width = nextRight - drag.startRect.x;
        }
        return normalizeCropRect(next);
      });
    };

    const stopDrag = (event: PointerEvent) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };
  }, []);

  const beginDrag = useCallback((mode: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se', event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      mode,
      pointerId: event.pointerId,
      startRect: rect,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, [rect]);

  const overlayStyle = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Görseli Kırp</p>
            <p className="mt-1 text-xs text-gray-500">Kutuyu sürükleyip köşelerden daralt.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div
            ref={frameRef}
            className="relative mx-auto aspect-square max-h-[65vh] overflow-hidden rounded-2xl bg-gray-100"
            style={{ touchAction: 'none' }}
          >
            <img src={src} alt="Crop preview" className="h-full w-full object-contain select-none" draggable={false} />
            <div className="pointer-events-none absolute inset-0 bg-black/35" />
            <div
              className="absolute rounded-[20px] border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.18)]"
              style={overlayStyle}
            >
              <div onPointerDown={(event) => beginDrag('move', event)} className="absolute inset-0 cursor-move" />
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="border border-white/30" />
                ))}
              </div>
              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => {
                const positions = {
                  nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
                  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
                  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
                  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
                };
                return (
                  <button
                    key={handle}
                    type="button"
                    onPointerDown={(event) => beginDrag(handle, event)}
                    className={`absolute h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow ${positions[handle]}`}
                  />
                );
              })}
              {([
                ['n', 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize'],
                ['s', 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize'],
                ['w', 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
                ['e', 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
              ] as const).map(([handle, position]) => (
                <button
                  key={handle}
                  type="button"
                  onPointerDown={(event) => beginDrag(handle, event)}
                  className={`absolute h-4 w-4 rounded-full border-2 border-white bg-white shadow ${position}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Vazgeç
          </button>
          <button
            onClick={() => setRect({ x: 0, y: 0, width: 1, height: 1 })}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Sıfırla
          </button>
          <button
            onClick={() => onApply(rect)}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>
  );
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

async function uploadBlob(blob: Blob, side: string): Promise<string | null> {
  try {
    const form = new FormData();
    form.append('image', blob, `${side}.png`);
    form.append('side', side);
    const res = await fetch('/apps/tshirt-designer/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function imageHasTransparentBg(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const W = Math.min(img.naturalWidth, 120);
          const H = Math.min(img.naturalHeight, 120);
          const canvas = document.createElement('canvas');
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(false); return; }
          ctx.drawImage(img, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H).data;
          let transparent = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 32) transparent++;
          }
          resolve(transparent / (W * H) > 0.20);
        } catch { resolve(false); }
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function dataUrlToServerUrl(dataUrl: string, side: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  const blob = await fetch(dataUrl).then((r) => r.blob());
  return (await uploadBlob(blob, side)) ?? dataUrl;
}

function getAutoZoom() {
  if (typeof window === 'undefined') return 100;
  const w = window.innerWidth;
  if (w >= 860) return 100;
  // Mobile: canvas area is full-width; 488 = PRINT_W (480) + card padding (8)
  const usable = w - 32; // subtract p-4 padding on each side
  return Math.max(50, Math.min(100, Math.floor(usable / 488 * 100)));
}

function isTurkishLocale(locale: string | undefined) {
  return (locale ?? 'tr-TR').toLocaleLowerCase('tr-TR').startsWith('tr');
}

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 860;
}

export default function App() {
  const {
    config, setConfig,
    activeSide, setActiveSide,
    sizeQuantities, setSizeQuantity,
    addSavedDesign,
    addUploadedImage,
    setIsBgRemoving,
    isBgRemoving,
    canvasState, setCanvasJson,
  } = useDesignerStore();

  const frontCanvasRef = useRef<CanvasAreaHandle>(null);
  const backCanvasRef = useRef<CanvasAreaHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastTouchY = useRef<number | null>(null);
  const scrollOverlayRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(config);
  const personalizationRef = useRef<PersonalizationConfig>(defaultPersonalization());
  const restoredCanvasRef = useRef<string | null>(null);
  const lastSelectedVariantIdRef = useRef('');

  const [activeTab, setActiveTab] = useState<Tab>(null);
  const [imageActiveSource, setImageActiveSource] = useState<'upload' | 'qr' | 'ai'>('upload');
  const [selectedObj, setSelectedObj] = useState<CanvasSelection | null>(null);
  const [objState, setObjState] = useState<ObjectState | null>(null);
  const [zoom, setZoom] = useState(getAutoZoom);
  const [layers, setLayers] = useState<fabric.Object[]>([]);
  const [isMobileLayout, setIsMobileLayout] = useState(() => isMobileViewport());
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(() => isMobileViewport() ? 'navigation' : 'selection');
  const [sceneOffset, setSceneOffset] = useState({ x: 0, y: 0 });
  const [isDraggingScene, setIsDraggingScene] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [showTextColorPalette, setShowTextColorPalette] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState({ front: '', back: '' });
  const [previewTab, setPreviewTab] = useState<'front' | 'back'>('front');
  const [sidePreviews, setSidePreviews] = useState({ front: '', back: '' });
  const [textDraft, setTextDraft] = useState('');
  const [isEditingText, setIsEditingText] = useState(false);
  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationConfig>(defaultPersonalization);
  const [canvasRevisions, setCanvasRevisions] = useState({ front: 0, back: 0 });
  const [shopTemplates, setShopTemplates] = useState<import('@/types').ShopTemplate[]>([]);
  const [selectedColor, setSelectedColor] = useState('');
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [showSizeErrorModal, setShowSizeErrorModal] = useState(false);
  const [cropModalState, setCropModalState] = useState<{ src: string; rect: CropRect } | null>(null);
  const [noSizeQuantity, setNoSizeQuantity] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'warning' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const designerStartedAtRef = useRef(Date.now());
  const cropTargetRef = useRef<fabric.Image | null>(null);

  const showToast = useCallback((message: string, type: 'error' | 'warning' | 'info' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

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

  const analyticsEndpoint = useMemo(() => {
    const appUrl = config?.uploadEndpoint?.split('/apps/')[0] ?? window.location.origin;
    return `${appUrl}/api/analytics-event`;
  }, [config?.uploadEndpoint]);

  const trackDesignerEvent = useCallback((payload: Record<string, unknown>) => {
    const shop = config?.shop;
    if (!shop) return;
    const body = JSON.stringify({
      shop,
      productId: config?.productId || config?.productHandle || '',
      productName: config?.productTitle || '',
      sessionId: getBgSessionId(),
      ...payload,
    });
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(analyticsEndpoint, blob)) return;
      }
    } catch {
      // fall through to fetch
    }
    fetch(analyticsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [analyticsEndpoint, config?.productHandle, config?.productId, config?.productTitle, config?.shop]);

  const updateToolbarPosition = useCallback((obj: CanvasSelection | null) => {
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
    const aboveY = rect.top + bounds.top * scaleY - 160;
    const belowY = rect.top + (bounds.top + bounds.height) * scaleY + 20;
    setToolbarPos({
      x: centerX,
      y: aboveY > 20 ? aboveY : belowY,
    });
  }, [getActiveCanvasHandle]);

  useEffect(() => {
    applyConfig(readConfig(), setConfig);
  }, [setConfig]);

  // Mağazanın kendi şablonlarını çek
  // Shop domain'i proxy.$.tsx'teki Liquid sayfası postMessage ile gönderir
  useEffect(() => {
    const appUrl = (window as typeof window & { __DESIGNER_CONFIG__?: { uploadEndpoint?: string } })
      .__DESIGNER_CONFIG__?.uploadEndpoint?.split('/apps/')[0]
      ?? window.location.origin;

    const fetchTemplates = (shop: string) => {
      fetch(`${appUrl}/api/shop-templates?shop=${encodeURIComponent(shop)}`)
        .then((r) => r.json())
        .then((data: { templates?: import('@/types').ShopTemplate[] }) => {
          if (Array.isArray(data.templates)) setShopTemplates(data.templates);
        })
        .catch(() => {});
    };

    const handleShopInit = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || payload.type !== 'SHOP_INIT' || !payload.shop) return;
      fetchTemplates(String(payload.shop));
    };
    window.addEventListener('message', handleShopInit);

    // Fallback: URL param (geliştirme ortamı veya doğrudan erişim)
    const shopParam = new URLSearchParams(window.location.search).get('shop');
    if (shopParam && shopParam !== 'null') fetchTemplates(shopParam);

    return () => window.removeEventListener('message', handleShopInit);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
	      const payload = event.data;
	      if (!payload || payload.type !== 'DESIGNER_INIT' || !payload.config) return;
	      const cfg = payload.config as DesignerConfig & { shop?: string };
	      const p = personalizationRef.current;
	      applyConfig(resolveDesignerMockupConfig(cfg, p), setConfig);
      // Shop domain'i DESIGNER_INIT'ten al ve şablonları çek
      if (cfg.shop && cfg.shop !== 'null' && cfg.shop !== '') {
        const appUrl = cfg.uploadEndpoint?.split('/apps/')[0] ?? window.location.origin;
        fetch(`${appUrl}/api/shop-templates?shop=${encodeURIComponent(cfg.shop)}`)
          .then((r) => r.json())
          .then((data: { templates?: import('@/types').ShopTemplate[] }) => {
            if (Array.isArray(data.templates)) setShopTemplates(data.templates);
          })
          .catch(() => {});
      }
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
    if (config?.shop) params.set('shop', config.shop);
    fetch(`/api/designer-config?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (res.status === 404) {
          // Product type deleted or inactive — hide the designer iframe entirely
          window.parent.postMessage({ type: 'DESIGNER_INACTIVE' }, '*');
          document.body.style.display = 'none';
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((payload) => {
        if (cancelled || payload === null) return;
        setPersonalization(normalizePersonalizationPayload(payload));
      })
      .catch(() => {
        if (!cancelled) setPersonalization(defaultPersonalization());
      });
    return () => {
      cancelled = true;
    };
  }, [config?.productHandle, config?.productId]);

	  // Admin mockup'ını yalnızca seçili renk mockup'ı yoksa uygula.
	  useEffect(() => {
	    if (!config) return;
	    const resolved = resolveDesignerMockupConfig(config, personalization, selectedColor);
	    if (resolved.frontImage === config.frontImage && resolved.backImage === config.backImage) return;
	    setConfig(resolved);
	  // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [personalization, selectedColor, config]);

  // Renk değişince o rengin mockup görselini yükle
  useEffect(() => {
    if (!selectedColor || !config) return;
    const mockup = personalization.variantMockups?.[selectedColor];
    if (!mockup?.front && !mockup?.back) return;
    setConfig({
      ...config,
      ...(mockup.front ? { frontImage: mockup.front } : {}),
      ...(mockup.back ? { backImage: mockup.back } : {}),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColor, personalization.variantMockups]);

  useEffect(() => {
    if (personalization.surfaceMode === 'front_only' && activeSide !== 'front') {
      setActiveSide('front');
    }
  }, [activeSide, personalization.surfaceMode, setActiveSide]);

  const { colorKey, sizeKey } = useMemo(
    () => detectOptionKeys(config?.optionNames ?? []),
    [config?.optionNames],
  );

  useEffect(() => {
    const selectedVariantColor = config?.selectedVariant?.[colorKey] ?? '';
    const selectedVariantId = config?.selectedVariant?.id ? String(config.selectedVariant.id) : '';
    const matchingVariantColor = selectedVariantId
      ? config?.variants?.find((variant) => String(variant.id) === selectedVariantId)?.[colorKey] ?? ''
      : '';
    const firstColor = config?.variants?.find((variant) => variant[colorKey])?.[colorKey] ?? '';
    const initialColor = selectedVariantColor || matchingVariantColor || firstColor;

    if (selectedVariantId && selectedVariantId !== lastSelectedVariantIdRef.current) {
      lastSelectedVariantIdRef.current = selectedVariantId;
      if (selectedVariantColor || matchingVariantColor) setSelectedColor(selectedVariantColor || matchingVariantColor);
      return;
    }

    if (initialColor && !selectedColor) setSelectedColor(initialColor);
  }, [config?.selectedVariant, config?.variants, colorKey, selectedColor]);

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

  const handleObjectSelected = useCallback((obj: CanvasSelection | null) => {
    setSelectedObj(obj);
    if (!obj) {
      setObjState(null);
      setToolbarPos(null);
      setShowTextColorPalette(false);
      syncLayers();
      return;
    }
    setActiveTab(null);
    if (isActiveSelection(obj)) {
      setObjState({ type: 'image' });
      updateToolbarPosition(obj);
      syncLayers();
      return;
    }
    if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
      const text = obj as fabric.Text;
      setObjState({
        type: 'text',
        color: typeof text.fill === 'string' ? text.fill : '#6b7280',
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

  const handleAddImage = (url: string, template?: import('@/types').ShopTemplate) => {
    getActiveCanvasHandle()?.addImageFromUrl(url);
    if (template) {
      trackDesignerEvent({
        eventType: 'template_applied',
        templateId: template.id,
        templateName: template.name,
        templateKind: 'shop',
      });
    }
    syncLayers();
    setActiveTab(null);
  };

  const handleSubmitText = () => {
    const value = textDraft.trim();
    const cv = getActiveCanvasHandle()?.getCanvas();
    if (!value || !cv) return;
    if (isEditingText && selectedObj && (selectedObj.type === 'text' || selectedObj.type === 'i-text' || selectedObj.type === 'textbox')) {
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
        fill: '#6b7280',
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
    trackDesignerEvent({
      eventType: 'template_applied',
      templateId: tpl.id,
      templateName: tpl.label,
      templateKind: 'text',
      metadata: { category: tpl.category },
    });
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
    if (!personalization.removeBgAvailable) {
      showToast('Photoroom API key ayarlanmamış', 'error');
      return '';
    }
    setIsBgRemoving(true);
    try {
      const fetchUrl = dataUrl.startsWith('https://assets.printlabapp.com/')
        ? `/api/img-proxy?url=${encodeURIComponent(dataUrl)}`
        : dataUrl;
      const blob = await fetch(fetchUrl).then((r) => r.blob());

      // Arka plan zaten kaldırılmışsa API'ye gönderme
      if (await imageHasTransparentBg(blob)) {
        const serverUrl = await uploadBlob(blob, 'user-upload');
        if (serverUrl) return serverUrl;
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const form = new FormData();
      form.append('image_file', blob, 'design-image.png');
      form.append('productId', config?.productId || '');
      form.append('handle', config?.productHandle || '');
      form.append('session_id', getBgSessionId());
      const shopParam = config?.shop ? `?shop=${encodeURIComponent(config.shop)}` : '';
      const res = await fetch(`/apps/tshirt-designer/remove-background${shopParam}`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null) as { error?: string } | null;
        showToast(error?.error || 'Arka plan kaldırma başarısız', 'error');
        return '';
      }
      const remaining = parseInt(res.headers.get('X-BG-Quota-Remaining') ?? '', 10);
      if (!isNaN(remaining) && remaining <= 2 && remaining > 0) {
        showToast(`⚠️ ${remaining} background removal use left — resets after your next order`, 'warning');
      }
      const blob2 = await res.blob();
      const serverUrl = await uploadBlob(blob2, 'user-upload');
      if (serverUrl) return serverUrl;
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
    setPreviewTab('front');
    setShowPreview(true);
  };

  const handleAddToCart = async () => {
    const frontHas = Boolean(frontCanvasRef.current?.getCanvas()?.getObjects().length);
    const backHas = Boolean(backCanvasRef.current?.getCanvas()?.getObjects().length);
    const resolvedSide = frontHas && backHas ? 'double' : backHas ? 'back' : 'front';
    let cartItems: CartItemPayload[];

    if (sizes.length === 0) {
      // Beden seçeneği olmayan ürünler (kupa, bardak vb.)
      const variantId = String(
        (selectedColor
          ? config?.variants?.find((v) => v[colorKey] === selectedColor)?.id
          : config?.variants?.[0]?.id)
        ?? config?.singleVariantId
        ?? config?.doubleVariantId
        ?? ''
      );
      if (!variantId) {
        showToast('Bu ürün için varyant bulunamadı. Shopify ürün ayarlarını kontrol edin.', 'error');
        return;
      }
      cartItems = [{ variantId, quantity: noSizeQuantity }];
    } else {
      const selectedSizes = sizes.filter((size) => (sizeQuantities[size!] ?? 0) > 0);
      cartItems = selectedSizes
        .map((size) => {
          const variantId = String(baseVariantForSize(size!)?.id ?? config?.singleVariantId ?? config?.doubleVariantId ?? '');
          return { variantId, quantity: sizeQuantities[size!] ?? 0, size: size ?? undefined };
        })
        .filter((item) => item.variantId);
      if (cartItems.length === 0) {
        setShowSizeErrorModal(true);
        return;
      }
    }

    setIsCartLoading(true);
    try {
      // Export canvas: 1x preview + 2x print quality
      const frontPreviewDataUrl = frontHas ? (frontCanvasRef.current?.exportPng(1) ?? '') : '';
      const backPreviewDataUrl = backHas ? (backCanvasRef.current?.exportPng(1) ?? '') : '';
      const frontPrintDataUrl = frontHas ? (frontCanvasRef.current?.exportPng(2, true) ?? '') : '';
      const backPrintDataUrl = backHas ? (backCanvasRef.current?.exportPng(2, true) ?? '') : '';

      // Upload all to server in parallel to get permanent URLs
      const [frontPreviewUrl, backPreviewUrl, frontPrintUrl, backPrintUrl] = await Promise.all([
        frontPreviewDataUrl ? dataUrlToServerUrl(frontPreviewDataUrl, 'front-preview') : Promise.resolve(''),
        backPreviewDataUrl ? dataUrlToServerUrl(backPreviewDataUrl, 'back-preview') : Promise.resolve(''),
        frontPrintDataUrl ? dataUrlToServerUrl(frontPrintDataUrl, 'front-print') : Promise.resolve(''),
        backPrintDataUrl ? dataUrlToServerUrl(backPrintDataUrl, 'back-print') : Promise.resolve(''),
      ]);

      const designRes = await fetch('/api/storefront/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: config?.productId || config?.productHandle,
          productName: config?.productTitle || '',
          shop: config?.shop || '',
          sessionId: getBgSessionId(),
          designJson: {
            front: frontCanvasRef.current?.saveDesign(),
            back: backCanvasRef.current?.saveDesign(),
          },
          frontPreviewUrl,
          backPreviewUrl,
          frontPrintUrl,
          backPrintUrl,
        }),
      }).then((r) => r.json());

      const token = (designRes as { token?: string }).token ?? '';
      trackDesignerEvent({
        eventType: 'cart_add',
        designToken: token,
        valueNumeric: Math.max(1, Math.round((Date.now() - designerStartedAtRef.current) / 1000)),
        metadata: {
          side: resolvedSide,
          quantity: totalQuantity,
          hasFront: frontHas,
          hasBack: backHas,
        },
      });
      const properties: Record<string, string> = {
        'Ön Tasarım': frontHas ? 'Var' : 'Yok',
        design_token: token,
        'Toplam adet': String(totalQuantity),
        'Tişört birim fiyatı': formatMoney(pricingSummary.baseUnitPrice),
        'Tişört ara toplamı': formatMoney(pricingSummary.baseSubtotal),
        'Toplam fiyat': formatMoney(pricingSummary.total),
      };
      if (frontPreviewUrl) properties['_front_preview_url'] = frontPreviewUrl;
      if (backPreviewUrl) properties['_back_preview_url'] = backPreviewUrl;
      if (frontPrintUrl) properties['_front_print_url'] = frontPrintUrl;
      if (backPrintUrl) properties['_back_print_url'] = backPrintUrl;
    if (resolvedSide !== 'front') properties['Arka Tasarım'] = backHas ? 'Var' : 'Yok';
      if (pricingSummary.front.hasContent) {
        properties['Ön öğe sayısı'] = String(pricingSummary.front.metrics.objectCount);
        properties['Ön ölçü'] = formatMetricSize(pricingSummary.front.metrics);
        properties['Ön alan'] = `${roundMetric(pricingSummary.front.metrics.areaCm2)} cm²`;
        properties['Ön alan fiyatı'] = formatMoney(pricingSummary.front.surcharge);
      properties['Ön fiyat bandı'] = pricingSummary.front.band.label;
    }
    if (pricingSummary.back.hasContent) {
      properties['Arka öğe sayısı'] = String(pricingSummary.back.metrics.objectCount);
      properties['Arka ölçü'] = formatMetricSize(pricingSummary.back.metrics);
      properties['Arka alan'] = `${roundMetric(pricingSummary.back.metrics.areaCm2)} cm²`;
        properties['Arka alan fiyatı'] = formatMoney(pricingSummary.back.surcharge);
        properties['Arka fiyat bandı'] = pricingSummary.back.band.label;
      }
      if (pricingSummary.volumeDiscountPercentage > 0) {
        properties['Toplu alım indirimi'] = `%${pricingSummary.volumeDiscountPercentage}`;
        properties['Baskı indirimi'] = formatMoney(pricingSummary.printDiscountSubtotal);
      }

    // Cart Transform splits the line into two children: the t-shirt at its
    // base unit price, and the surcharge variant at the combined front+back
    // per-unit surcharge. The surcharge child is hidden on /cart via CSS
    // (cart-protection.js) and shown on /checkout as a separate line.
    if (personalization.surchargeVariantId) {
      const frontUnitAmt = pricingSummary.front.hasContent ? pricingSummary.front.surchargeUnitAmount : 0;
      const backUnitAmt  = pricingSummary.back.hasContent  ? pricingSummary.back.surchargeUnitAmount  : 0;
      const surchargeUnitTl = frontUnitAmt + backUnitAmt;
      if (surchargeUnitTl > 0) {
        const baseUnitTl = (pricingSummary.baseUnitPrice ?? 0) / 100;
        const surchargeGid = `gid://shopify/ProductVariant/${personalization.surchargeVariantId}`;
        for (const item of cartItems) {
          item.properties = {
            ...(item.properties ?? {}),
            '_design_role': 'pending_expand',
            '_base_unit_price': baseUnitTl.toFixed(2),
            '_surcharge_unit_total': surchargeUnitTl.toFixed(2),
            '_surcharge_variant_gid': surchargeGid,
            ...(frontUnitAmt > 0 ? { '_surcharge_qty_front': frontUnitAmt.toFixed(2) } : {}),
            ...(backUnitAmt  > 0 ? { '_surcharge_qty_back':  backUnitAmt.toFixed(2)  } : {}),
          };
        }
      }
    }

      window.parent.postMessage({ type: 'DESIGNER_ADD_TO_CART', items: cartItems, properties, designToken: token }, '*');
    } catch (err) {
      console.error('Sepete ekleme hatası:', err);
      showToast('Sepete eklenirken bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    } finally {
      setIsCartLoading(false);
    }
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

  const getSelectedImageObject = useCallback(() => {
    const cv = getActiveCanvasHandle()?.getCanvas();
    const active = cv?.getActiveObject() ?? null;
    if (!active || isActiveSelection(active) || !isImageSelection(active)) return null;
    return active;
  }, [getActiveCanvasHandle]);

  const refreshSelectedImage = useCallback((img: fabric.Image) => {
    const cv = getActiveCanvasHandle()?.getCanvas();
    if (!cv) return;
    img.setCoords();
    cv.fire('object:modified', { target: img });
    cv.renderAll();
    handleObjectSelected(img);
    syncLayers();
  }, [getActiveCanvasHandle, syncLayers]);

  const applyUrlToImageObject = useCallback(async (
    selectedImage: fabric.Image,
    url: string,
    targetVisualSize?: { w: number; h: number },
  ): Promise<boolean> => {
    const scaledWidth = targetVisualSize?.w ?? selectedImage.getScaledWidth();
    const scaledHeight = targetVisualSize?.h ?? selectedImage.getScaledHeight();
    const signX = (selectedImage.scaleX ?? 1) < 0 ? -1 : 1;
    const signY = (selectedImage.scaleY ?? 1) < 0 ? -1 : 1;
    const proxiedUrl = url.startsWith('https://assets.printlabapp.com/')
      ? `/api/img-proxy?url=${encodeURIComponent(url)}`
      : url;

    try {
      await new Promise<void>((resolve, reject) => {
        const imgEl = new Image();
        imgEl.crossOrigin = 'anonymous';
        imgEl.onload = () => {
          const nextW = Math.max(1, imgEl.naturalWidth || imgEl.width || 1);
          const nextH = Math.max(1, imgEl.naturalHeight || imgEl.height || 1);
          (selectedImage as unknown as { setElement(el: HTMLImageElement, opts?: unknown): void })
            .setElement(imgEl, { crossOrigin: 'anonymous' });
          selectedImage.set({
            cropX: 0,
            cropY: 0,
            scaleX: (scaledWidth / nextW) * signX,
            scaleY: (scaledHeight / nextH) * signY,
          } as Partial<fabric.Image>);
          resolve();
        };
        imgEl.onerror = () => reject(new Error(`Image failed to load: ${proxiedUrl}`));
        imgEl.src = proxiedUrl;
      });
      refreshSelectedImage(selectedImage);
      return true;
    } catch (err) {
      console.error('[selected-image-update]', err);
      return false;
    }
  }, [refreshSelectedImage]);

  const removeBgFromSelectedImage = useCallback(async () => {
    const selectedImage = getSelectedImageObject();
    if (!selectedImage || isBgRemoving) return;
    try {
      const sourceDataUrl = selectedImage.toDataURL({ format: 'png', multiplier: 2 });
      const cleanedUrl = await handleRemoveBg(sourceDataUrl);
      if (!cleanedUrl) return;
      addUploadedImage({ id: generateId(), dataUrl: cleanedUrl, serverUrl: cleanedUrl, name: 'Temizlenmiş', addedAt: Date.now() });
      await applyUrlToImageObject(selectedImage, cleanedUrl);
    } catch {
      showToast('Seçili görselin arka planı kaldırılamadı', 'error');
    }
  }, [addUploadedImage, applyUrlToImageObject, getSelectedImageObject, handleRemoveBg, isBgRemoving, showToast]);

  const openCropForSelectedImage = useCallback(() => {
    const selectedImage = getSelectedImageObject();
    if (!selectedImage) return;
    cropTargetRef.current = selectedImage;
    const src = selectedImage.toDataURL({ format: 'png', multiplier: 2 });
    setCropModalState({
      src,
      rect: { x: 0, y: 0, width: 1, height: 1 },
    });
  }, [getSelectedImageObject]);

  const applyCropToSelectedImage = useCallback(async (rect: CropRect) => {
    const selectedImage = cropTargetRef.current;
    const state = cropModalState;
    if (!selectedImage || !state) return;
    try {
      const origW = selectedImage.getScaledWidth();
      const origH = selectedImage.getScaledHeight();
      const normalizedRect = normalizeCropRect(rect);
      const croppedDataUrl = await cropImageDataUrl(state.src, normalizedRect);
      const blob = await fetch(croppedDataUrl).then((r) => r.blob());
      const serverUrl = await uploadBlob(blob, 'cropped-image');
      const finalUrl = serverUrl ?? croppedDataUrl;
      addUploadedImage({ id: generateId(), dataUrl: finalUrl, serverUrl: finalUrl, name: 'Kırpılmış', addedAt: Date.now() });
      // Target visual size = original size × crop fraction (prevents stretching)
      await applyUrlToImageObject(selectedImage, finalUrl, {
        w: origW * normalizedRect.width,
        h: origH * normalizedRect.height,
      });
      setCropModalState(null);
      cropTargetRef.current = null;
    } catch {
      showToast('Görsel kırpılamadı', 'error');
    }
  }, [addUploadedImage, applyUrlToImageObject, cropModalState, showToast]);

  const updateTextProp = (props: Partial<ObjectState>) => {
    const cv = getActiveCanvasHandle()?.getCanvas();
    if (!cv || !selectedObj || (selectedObj.type !== 'text' && selectedObj.type !== 'i-text' && selectedObj.type !== 'textbox')) return;
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
    if (!selectedObj || (selectedObj.type !== 'text' && selectedObj.type !== 'i-text' && selectedObj.type !== 'textbox')) return;
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
    if (selectedObj.type === 'text' || selectedObj.type === 'i-text' || selectedObj.type === 'textbox') {
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
    if (window.innerWidth < 860) return; // mobilde wrapper scroll devralır
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
    () => sizeKey
      ? [...new Set(config?.variants?.map((v) => v[sizeKey]).filter(Boolean) ?? [])]
      : [],
    [config?.variants, sizeKey],
  );

  const colorOptions = useMemo(
    () => [...new Set(config?.variants?.map((v) => v[colorKey]).filter(Boolean) ?? [])],
    [config?.variants, colorKey],
  );

  useEffect(() => {
    if (!colorOptions.length) return;
    if (!selectedColor || !colorOptions.includes(selectedColor)) {
      setSelectedColor(colorOptions[0] ?? '');
    }
  }, [colorOptions, selectedColor]);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { personalizationRef.current = personalization; }, [personalization]);

  useEffect(() => {
    if (!selectedColor) return;
    const cfg = configRef.current;
    if (!cfg?.variants?.length) return;

    // Admin'de mockup görselleri atandıysa variant'tan otomatik algılama yapma
    const adminFront = personalization.printAreas.front.mockupImageUrl;
    const adminBack = personalization.printAreas.back.mockupImageUrl;
    if (adminFront || adminBack) return;

    let newFront = '';
    let newBack = '';

    for (const v of cfg.variants) {
      if (v[colorKey] !== selectedColor || !v.featured_image?.src) continue;
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
      const any = cfg.variants.find((v) => v[colorKey] === selectedColor && v.featured_image?.src);
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
      .filter((variant) => sizeKey ? variant[sizeKey] === size : true)
      .sort((a, b) => priceToCents(a.price) - priceToCents(b.price));
    const variants = selectedColor
      ? allVariants.filter((variant) => variant[colorKey] === selectedColor)
      : allVariants;
    const pool = variants.length ? variants : allVariants;
    return pool[0] ?? null;
  }, [config?.variants, selectedColor]);

  const baseUnitPrice = useMemo(() => {
    const firstSize = sizes[0];
    const baseVariant = firstSize ? baseVariantForSize(firstSize) : null;
    if (baseVariant) return priceToCents(baseVariant.price);
    // Beden yoksa: ilk varyant fiyatını kullan (ör. Kupa, Default Title)
    const firstVariant = config?.variants?.[0];
    if (firstVariant?.price) return priceToCents(firstVariant.price);
    return priceToCents(config?.singlePrice ?? 0) || priceToCents(config?.doublePrice ?? 0);
  }, [baseVariantForSize, config?.doublePrice, config?.singlePrice, config?.variants, sizes]);

  const totalQuantity = useMemo(
    () => sizes.length > 0
      ? Object.values(sizeQuantities).reduce((sum, q) => sum + q, 0)
      : noSizeQuantity,
    [sizes, sizeQuantities, noSizeQuantity],
  );

  const baseSubtotal = useMemo(() => {
    if (sizes.length === 0) {
      // Bedensiz ürün (kupa, bez çanta vb.) — noSizeQuantity kullan
      return baseUnitPrice * noSizeQuantity;
    }
    return sizes.reduce((sum, size) => {
      const qty = sizeQuantities[size!] ?? 0;
      if (qty === 0) return sum;
      const variant = baseVariantForSize(size!);
      const unitPrice = variant ? priceToCents(variant.price) : baseUnitPrice;
      return sum + unitPrice * qty;
    }, 0);
  }, [baseUnitPrice, baseVariantForSize, noSizeQuantity, sizeQuantities, sizes]);

  const pricingSummary = useMemo<PricingSummary>(() => {
    const frontItems = frontHasDesign
      ? pricingItemsForObjects(frontObjects, personalization.printAreas.front, personalization.pricingBands.front, totalQuantity)
      : [];
    const backItems = backHasDesign
      ? pricingItemsForObjects(backObjects, personalization.printAreas.back, personalization.pricingBands.back, totalQuantity)
      : [];
    const frontBand = frontItems[0]?.band ?? pricingBandForMetrics(personalization.pricingBands.front, frontMetrics);
    const backBand = backItems[0]?.band ?? pricingBandForMetrics(personalization.pricingBands.back, backMetrics);
    const volumeDiscount = volumeDiscountForQuantity(personalization.volumeDiscounts, totalQuantity);
    const volumeDiscountPercentage = volumeDiscount?.percentage ?? 0;
    const frontRawSurchargeUnitAmount = frontItems.reduce((sum, item) => sum + item.surchargeUnitAmount, 0);
    const backRawSurchargeUnitAmount = backItems.reduce((sum, item) => sum + item.surchargeUnitAmount, 0);
    const frontSurchargeUnitAmount = applyPercentageDiscount(frontRawSurchargeUnitAmount, volumeDiscountPercentage);
    const backSurchargeUnitAmount = applyPercentageDiscount(backRawSurchargeUnitAmount, volumeDiscountPercentage);
    const frontSurcharge = surchargeToCents(frontSurchargeUnitAmount);
    const backSurcharge = surchargeToCents(backSurchargeUnitAmount);
    const printDiscountSubtotal = (
      surchargeToCents(frontRawSurchargeUnitAmount + backRawSurchargeUnitAmount) -
      surchargeToCents(frontSurchargeUnitAmount + backSurchargeUnitAmount)
    ) * totalQuantity;
    return {
      totalQuantity,
      baseUnitPrice,
      baseSubtotal,
      volumeDiscountPercentage,
      printDiscountSubtotal,
      total: baseSubtotal + (frontSurcharge + backSurcharge) * totalQuantity,
      front: {
        hasContent: frontHasDesign,
        metrics: frontMetrics,
        band: frontBand,
        items: frontItems,
        surcharge: frontSurcharge,
        surchargeUnitAmount: frontSurchargeUnitAmount,
        subtotal: frontSurcharge * totalQuantity,
      },
      back: {
        hasContent: backHasDesign,
        metrics: backMetrics,
        band: backBand,
        items: backItems,
        surcharge: backSurcharge,
        surchargeUnitAmount: backSurchargeUnitAmount,
        subtotal: backSurcharge * totalQuantity,
      },
    };
  }, [
    backHasDesign,
    backMetrics,
    backObjects,
    baseSubtotal,
    baseUnitPrice,
    frontHasDesign,
    frontMetrics,
    frontObjects,
    personalization.printAreas.back,
    personalization.printAreas.front,
    personalization.pricingBands.back,
    personalization.pricingBands.front,
    personalization.volumeDiscounts,
    totalQuantity,
  ]);

  const formatMoney = useCallback((amountInCents: number) => (
    new Intl.NumberFormat(config?.locale ?? 'tr-TR', {
      style: 'currency',
      currency: config?.currency ?? 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountInCents / 100)
  ), [config?.currency, config?.locale]);

  const displayBaseSubtotal = totalQuantity > 0 ? pricingSummary.baseSubtotal : pricingSummary.baseUnitPrice;
  const displayFrontSubtotal = totalQuantity > 0 ? pricingSummary.front.subtotal : pricingSummary.front.surcharge;
  const displayBackSubtotal = totalQuantity > 0 ? pricingSummary.back.subtotal : pricingSummary.back.surcharge;
  const displayTotal = totalQuantity > 0
    ? pricingSummary.total
    : pricingSummary.baseUnitPrice + pricingSummary.front.surcharge + pricingSummary.back.surcharge;
  const formattedPrice = formatMoney(displayTotal);

  const activePrintArea = personalization.printAreas[activeSide];
  const activeAreaSummary = `${Math.round(activePrintArea.realWidthMm / 10)} x ${Math.round(activePrintArea.realHeightMm / 10)} cm`;
  const activeAreaCoordsSummary = `X:${Math.round(activePrintArea.x)} Y:${Math.round(activePrintArea.y)} · Kutu ${Math.round(activePrintArea.width)} x ${Math.round(activePrintArea.height)}`;
  const pricingNarrative = surfaceMode === 'front_only'
    ? summarizeSidePricing('Ön', pricingSummary.front)
    : `${summarizeSidePricing('Ön', pricingSummary.front)} | ${summarizeSidePricing('Arka', pricingSummary.back)}`;
  const isTurkish = isTurkishLocale(config?.locale);
  const designAreaTitle = isTurkish ? 'Tasarım Alanı' : 'Design Area';
  const totalLabel = isTurkish ? 'Toplam' : 'Total';

  const reversedLayers = [...layers].reverse();
  const mobileToolbar = zoom < 100 || isMobileLayout;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastMobile = isMobileViewport();

    const syncViewportState = () => {
      const nextMobile = isMobileViewport();
      setIsMobileLayout(nextMobile);
      if (nextMobile !== lastMobile && !nextMobile) {
        setSceneOffset({ x: 0, y: 0 });
        setIsDraggingScene(false);
      }
      if (nextMobile !== lastMobile && nextMobile) {
        setInteractionMode((current) => current === 'selection' ? current : 'navigation');
      }
      lastMobile = nextMobile;
    };

    syncViewportState();
    window.addEventListener('resize', syncViewportState);
    return () => window.removeEventListener('resize', syncViewportState);
  }, []);

  // Panel açıldığında wrapper'ı başa sar (sayfa aşağı kaydırılmışsa panel yarım görünmesin)
  useEffect(() => {
    if (activeTab && wrapperRef.current) {
      wrapperRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeTab]);

  // Scroll overlay: passive touch listener (JSX olmadan — preventDefault uyarısı olmaz)
  useEffect(() => {
    const el = scrollOverlayRef.current;
    if (!el) return;
    let startX = 0, startY = 0, startTime = 0;

    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!wrapperRef.current) return;
      const delta = startY - e.touches[0].clientY;
      wrapperRef.current.scrollTop += delta;
      startY = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      const dt = Date.now() - startTime;
      // Tap (az hareket, kısa süre) → canvas'ta obje var mı bak
      if (dx < 12 && dy < 12 && dt < 300) {
        const cv = getActiveCanvasHandle()?.getCanvas();
        if (!cv) return;
        const target = cv.findTarget({ clientX: t.clientX, clientY: t.clientY } as MouseEvent, false);
        if (target) {
          if (wrapperRef.current) wrapperRef.current.scrollTop = wrapperRef.current.scrollTop;
          setInteractionMode('selection');
          cv.selection = true;
          cv.setActiveObject(target);
          cv.renderAll();
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  });

  // Fabric.js boş canvas tıklaması → gezinme moduna geç
  useEffect(() => {
    if (!isMobileLayout) return;
    const cv = getActiveCanvasHandle()?.getCanvas();
    if (!cv) return;
    const onMouseDown = (e: { target?: fabric.Object | null }) => {
      if (!e.target && interactionMode === 'selection') {
        // Boş alana tıklandı → gezinme moduna geç
        if (wrapperRef.current) wrapperRef.current.scrollTop = wrapperRef.current.scrollTop;
        setInteractionMode('navigation');
        cv.discardActiveObject();
        cv.selection = false;
        cv.renderAll();
        setSelectedObj(null);
        setObjState(null);
      } else if (e.target && interactionMode === 'navigation') {
        // Objeye tıklandı → seçim moduna geç
        if (wrapperRef.current) wrapperRef.current.scrollTop = wrapperRef.current.scrollTop;
        setInteractionMode('selection');
        cv.selection = true;
        cv.setActiveObject(e.target);
        cv.renderAll();
      }
    };
    cv.on('mouse:down', onMouseDown);
    return () => { cv.off('mouse:down', onMouseDown as never); };
  }, [isMobileLayout, interactionMode, getActiveCanvasHandle]);

  return (
    <div className="flex h-full min-h-screen items-stretch justify-center bg-[#eef2f7] text-gray-900">

      {/* Toast notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-xl text-white text-sm font-medium pointer-events-none',
            'animate-[fadeInUp_0.2s_ease-out]',
            toast.type === 'error'   && 'bg-red-500',
            toast.type === 'warning' && 'bg-amber-500',
            toast.type === 'info'    && 'bg-blue-500',
          )}
          style={{ maxWidth: 'calc(100vw - 2rem)' }}
        >
          {toast.type === 'error'   && <span className="text-lg leading-none">✕</span>}
          {toast.type === 'warning' && <span className="text-lg leading-none">⚠</span>}
          {toast.type === 'info'    && <span className="text-lg leading-none">ℹ</span>}
          <span>{toast.message}</span>
        </div>
      )}
      <div ref={wrapperRef} className={cn(
        "flex h-full min-h-0 w-full max-w-none flex-1 flex-col bg-white shadow-none layout:flex-row layout:justify-center layout:overflow-hidden",
        isMobileLayout && interactionMode === 'navigation' ? "overflow-y-auto" : "overflow-hidden",
      )}>
        <div className="flex min-h-0 h-screen w-full flex-col layout:h-full layout:min-w-0 layout:w-auto layout:flex-[0_1_980px] xl:flex-[0_1_1040px]">
        <div className="hidden md:flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2.5 md:px-4 md:py-3">
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

        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-clip layout:overflow-hidden bg-[#F9FAFB]"
          style={isMobileLayout && interactionMode === 'selection' ? { touchAction: 'none' } : undefined}
        >
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
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-clip layout:overflow-hidden px-3 pb-24 pt-3 md:p-4"
            onMouseMove={handleSceneMouseMove}
            onMouseUp={handleSceneMouseUp}
            onMouseLeave={handleSceneMouseUp}
            onClick={(e) => {
              if (!(e.target as Element).closest('canvas') && interactionMode !== 'navigation') {
                setInteractionMode('navigation');
                const cv = getActiveCanvasHandle()?.getCanvas();
                if (cv) { cv.discardActiveObject(); cv.selection = false; cv.renderAll(); }
                setSelectedObj(null);
                setObjState(null);
              }
            }}
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
                    allowPageScroll={isMobileLayout && interactionMode === 'navigation'}
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
                      allowPageScroll={isMobileLayout && interactionMode === 'navigation'}
                      onObjectSelected={handleObjectSelected}
                      onDesignChange={handleDesignChange}
                    />
                  </div>
                )}

                {/* Mobil navigation: canvas üstü şeffaf scroll overlay */}
                {isMobileLayout && interactionMode === 'navigation' && (
                  <div
                    ref={scrollOverlayRef}
                    className="absolute inset-0 z-10"
                    style={{ touchAction: 'pan-y' }}
                  />
                )}

                <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-2xl border border-white/60 bg-white/92 px-3 py-2 shadow-lg backdrop-blur md:left-6 md:top-6 lg:hidden">
                  <p className="mt-1 text-sm font-bold text-gray-900">{activeAreaSummary}</p>
                </div>

                <div className="pointer-events-none absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 gap-1.5 rounded-2xl border border-white/50 bg-white/90 p-1.5 shadow-xl backdrop-blur md:bottom-6 md:gap-3 md:p-2">
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
                          'pointer-events-auto h-16 w-12 overflow-hidden rounded-lg border-2 p-0.5 transition-all md:h-20 md:w-16',
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

            <div className="pointer-events-none absolute bottom-24 right-2 z-30 flex scale-[0.8] flex-col gap-1.5 origin-right md:right-5 md:top-1/2 md:-translate-y-1/2 md:scale-90 md:gap-2">
              <div className="pointer-events-auto flex w-14 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-16">
                <button
                  onClick={() => {
                    // inertia scroll'u durdur — seçim modunda touchstart cancelable olsun
                    if (wrapperRef.current) wrapperRef.current.scrollTop = wrapperRef.current.scrollTop;
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

              <div className="pointer-events-auto flex w-14 flex-col rounded-2xl border border-gray-100 bg-white/95 shadow-xl backdrop-blur-sm md:w-16">
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
            <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => { setActiveTab(null); setIsEditingText(false); setTextDraft(''); }}
            />
            {/* Panel: bottom-sheet on mobile, centered modal on desktop */}
            <div className={cn(
              "fixed z-50 flex min-h-0 flex-col overflow-hidden bg-white",
              "left-0 right-0 bottom-0 top-[max(12px,env(safe-area-inset-top))] rounded-t-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.16)]",
              "md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:w-[500px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-[0_8px_48px_rgba(0,0,0,0.18)]"
            )} style={{ maxHeight: 'min(94svh, 760px)' }}>

                {/* Drag handle — mobile only */}
                <div className="flex shrink-0 justify-center pt-3 pb-1 md:hidden">
                  <div className="h-1 w-10 rounded-full bg-gray-200" />
                </div>

                {/* Header */}
                <div className="shrink-0 border-b border-gray-100">
                  {activeTab === 'image' ? (
                    <div className="flex items-center gap-3 px-4 py-2.5 md:px-5 md:py-3.5">
                      <div className="flex flex-1 gap-1 flex-wrap">
                        {([
                          { id: 'upload', label: 'Görsel Yükle' },
                          { id: 'qr',     label: 'QR Kod' },
                          { id: 'ai',     label: '✦ Yapay Zeka' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() => setImageActiveSource(id)}
                            className={cn(
                              'rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap',
                              imageActiveSource === id
                                ? id === 'ai' ? 'bg-violet-600 text-white' : 'bg-gray-900 text-white'
                                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => { setActiveTab(null); }}
                        className="flex shrink-0 h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-3.5">
                      <p className="text-sm font-semibold text-gray-800">
                        {activeTab === 'text' ? (isEditingText ? 'Yazıyı Düzenle' : 'Yazı Ekle') : activeTab === 'layers' ? 'Katmanlar' : activeTab === 'templates' ? 'Şablonlar' : 'Kayıtlı Tasarımlar'}
                      </p>
                      <button
                        onClick={() => { setActiveTab(null); setIsEditingText(false); setTextDraft(''); }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Scrollable content */}
                <div
                  className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(110px,calc(env(safe-area-inset-bottom)+88px))] pt-4 md:p-6"
                  style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
                >
                  {activeTab === 'image' && (
                    <Suspense fallback={<PanelLoading />}>
                      <ImagePanel
                        onAddImage={handleAddImage}
                        onRemoveBg={handleRemoveBg}
                        canRemoveBg={personalization.removeBgAvailable}
                        activeSource={imageActiveSource}
                        shop={config?.shop}
                        uploadEndpoint={config?.uploadEndpoint}
                        sessionId={getBgSessionId()}
                      />
                    </Suspense>
                  )}

                  {activeTab === 'text' && (
                    <Suspense fallback={<PanelLoading />}>
                      <TextPanel
                        value={textDraft}
                        onChange={setTextDraft}
                        onSubmit={handleSubmitText}
                        isEditing={isEditingText}
                      />
                    </Suspense>
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
                    <Suspense fallback={<PanelLoading />}>
                      <TemplatesPanel
                        onApply={handleApplyTemplate}
                        onAddImage={handleAddImage}
                        shopTemplates={shopTemplates}
                      />
                    </Suspense>
                  )}

                  {activeTab === 'saved' && (
                    <Suspense fallback={<PanelLoading />}>
                      <SavedPanel onLoad={handleLoadSaved} />
                    </Suspense>
                  )}
                </div>
            </div>
            </>
          )}

          {selectedObj && (toolbarPos || mobileToolbar) && !activeTab && !showPreview && !(mobileToolbar && isActiveSelection(selectedObj)) && (
            <div
              className="pointer-events-none fixed z-[100] flex items-center justify-center"
              style={mobileToolbar
                ? {
                    left: 8,
                    right: 8,
                    top: toolbarPos
                      ? `clamp(72px, ${Math.round(toolbarPos.y)}px, calc(100vh - 180px))`
                      : 'calc(50vh - 90px)',
                    transform: 'none',
                  }
                : { left: toolbarPos?.x ?? 0, top: toolbarPos?.y ?? 0, transform: 'translateX(-50%)' }}
            >
                <div className="pointer-events-auto flex flex-col items-center gap-2">
                <div className="pointer-events-auto w-[min(340px,95vw)] rounded-[20px] border border-white/50 bg-white/95 shadow-[0_10px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl">
                  {objState?.type === 'text' ? (
                    <div>
                    <div className="grid grid-cols-5 gap-1 p-2 pb-1">
                      {/* Row 1: Renk | Düzenle | B | I | Kaldır */}
                      <button
                        type="button"
                        onClick={() => setShowTextColorPalette((prev) => !prev)}
                        className={cn('flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-gray-50', showTextColorPalette ? 'bg-blue-50/70' : '')}
                      >
                        <div className="h-5 w-5 rounded-full border border-gray-200 shadow-inner" style={{ backgroundColor: objState.color }} />
                        <span className="text-[9px] font-bold text-gray-500">Renk</span>
                      </button>

                      <button
                        onClick={editText}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-gray-50"
                      >
                        <Pencil className="h-4 w-4 text-gray-500" />
                        <span className="text-[9px] font-bold text-gray-500">Düzenle</span>
                      </button>

                      <button
                        onClick={() => updateTextProp({ isBold: !objState.isBold })}
                        className={cn('flex flex-col items-center justify-center rounded-xl py-2 transition-colors', objState.isBold ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50')}
                      >
                        <span className="text-base font-black leading-none">B</span>
                      </button>

                      <button
                        onClick={() => updateTextProp({ isItalic: !objState.isItalic })}
                        className={cn('flex flex-col items-center justify-center rounded-xl py-2 transition-colors', objState.isItalic ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50')}
                      >
                        <span className="text-base font-bold italic leading-none">I</span>
                      </button>

                      <button
                        onClick={deleteSelected}
                        className="flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                        <span className="text-[9px] font-bold text-red-400">Kaldır</span>
                      </button>

                      {/* Row 2: Boyut | Font (col-span-2) | Ortala | Öne/Arkaya */}
                      <div className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-gray-50 p-1">
                        <input
                          type="number"
                          min={8}
                          max={120}
                          value={objState.fontSize ?? 40}
                          onChange={(e) => updateTextProp({ fontSize: Number(e.target.value) || 40 })}
                          className="w-full rounded-md border-0 bg-transparent text-center text-xs font-bold focus:outline-none"
                        />
                        <span className="text-[9px] font-bold text-gray-400">Boyut</span>
                      </div>

                      <div className="group relative col-span-2 flex items-center justify-center rounded-xl bg-gray-50 p-1">
                        <select
                          value={objState.fontFamily ?? 'Inter'}
                          onChange={(e) => updateTextProp({ fontFamily: e.target.value })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        >
                          {TOOLBAR_FONTS.map((font) => (
                            <option key={font} value={font}>{font}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1 text-[11px] font-bold text-gray-700">
                          <span className="max-w-[52px] truncate">{objState.fontFamily ?? 'Inter'}</span>
                          <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-0.5 rounded-xl bg-gray-50 p-1">
                        <button
                          onClick={() => alignHorizontal('left')}
                          className={cn('rounded p-1 transition-colors', objState.textAlign === 'left' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                        >
                          <AlignLeft className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => alignHorizontal('center')}
                          className={cn('rounded p-1 transition-colors', objState.textAlign === 'center' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                        >
                          <AlignCenter className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => alignHorizontal('right')}
                          className={cn('rounded p-1 transition-colors', objState.textAlign === 'right' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400')}
                        >
                          <AlignRight className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        onClick={centerSelectedObject}
                        className="group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-gray-50"
                      >
                        <Sparkles className="h-4 w-4 text-gray-500 group-hover:text-blue-500" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Ortala</span>
                      </button>

                    </div>

                    {/* Color swatches — inline, below grid, only when showTextColorPalette */}
                    {showTextColorPalette && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-2 pb-2 pt-2">
                        {TEXT_COLOR_SWATCHES.map((color) => {
                          const isActive = (objState.color ?? '#111827').toLowerCase() === color.toLowerCase();
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => updateTextProp({ color })}
                              className={cn('h-6 w-6 rounded-full border-2 transition-transform active:scale-90', isActive ? 'border-blue-500 shadow-md scale-110' : 'border-white shadow-sm')}
                              style={{ backgroundColor: color }}
                            />
                          );
                        })}
                        <label className="flex h-6 cursor-pointer items-center gap-1 rounded-full border border-gray-200 bg-white px-2 text-[10px] font-bold text-gray-500 shadow-sm">
                          Özel
                          <input
                            type="color"
                            value={colorInputValue(objState.color)}
                            onChange={(e) => updateTextProp({ color: e.target.value })}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    )}
                    </div>
                  ) : (
                    <div>
                    <div className="grid grid-cols-5 gap-1 p-2">
                      <button
                        onClick={centerSelectedObject}
                        className="group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-gray-50"
                      >
                        <Sparkles className="h-4 w-4 text-gray-500 group-hover:text-blue-500" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Ortala</span>
                      </button>
                      <button
                        onClick={duplicateSelected}
                        disabled={isActiveSelection(selectedObj)}
                        className={cn(
                          'group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors',
                          isActiveSelection(selectedObj) ? 'cursor-not-allowed opacity-35' : 'hover:bg-gray-50',
                        )}
                      >
                        <Plus className="h-4 w-4 text-gray-500 group-hover:text-blue-500" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">Kopyala</span>
                      </button>
                      <button
                        onClick={toggleLayerOrder}
                        disabled={isActiveSelection(selectedObj)}
                        className={cn(
                          'group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors',
                          isActiveSelection(selectedObj) ? 'cursor-not-allowed opacity-35' : 'hover:bg-gray-50',
                        )}
                      >
                        <Layers className="h-4 w-4 text-gray-500 group-hover:text-blue-500" />
                        <span className="text-[9px] font-bold uppercase text-gray-500 group-hover:text-blue-500">
                          {(() => {
                            const objects = getActiveCanvasHandle()?.getCanvas()?.getObjects() ?? [];
                            if (isActiveSelection(selectedObj)) return 'Grup';
                            return objects.indexOf(selectedObj) === objects.length - 1 ? 'Arkaya' : 'Öne';
                          })()}
                        </span>
                      </button>
                      <button
                        onClick={removeBgFromSelectedImage}
                        disabled={isActiveSelection(selectedObj) || !isImageSelection(selectedObj) || isBgRemoving}
                        title="Arka plan kaldır"
                        className={cn(
                          'group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors',
                          isActiveSelection(selectedObj) || !isImageSelection(selectedObj) || isBgRemoving ? 'cursor-not-allowed opacity-35' : 'hover:bg-gray-50',
                        )}
                      >
                        <Sparkles className="h-4 w-4 text-gray-500 group-hover:text-blue-500" />
                        <span className="text-[9px] font-bold text-gray-500 group-hover:text-blue-500">BG Sil</span>
                      </button>
                      <button
                        onClick={deleteSelected}
                        className="group flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 text-red-400 group-hover:text-red-500" />
                        <span className="text-[9px] font-bold text-red-400 group-hover:text-red-500">Kaldır</span>
                      </button>
                    </div>
                    {!isActiveSelection(selectedObj) && isImageSelection(selectedObj) && (
                      <div className="border-t border-gray-100 px-2 pb-2 pt-1.5">
                        <button
                          onClick={openCropForSelectedImage}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-2 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                        >
                          <Crop className="h-4 w-4" />
                          Kırp
                        </button>
                      </div>
                    )}
                    </div>
                  )}
                </div>
                </div>
            </div>
          )}

          {cropModalState && (
            <ImageCropModal
              src={cropModalState.src}
              initialRect={cropModalState.rect}
              onClose={() => {
                setCropModalState(null);
                cropTargetRef.current = null;
              }}
              onApply={applyCropToSelectedImage}
            />
          )}

          {showSizeErrorModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
              <div className="w-full max-w-xs rounded-2xl bg-white shadow-2xl p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-xl">⚠️</span>
                  <p className="font-bold text-gray-900 text-sm leading-snug">Beden seçilmedi</p>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Lütfen en az bir beden için adet seçin.
                </p>
                {personalization.termsUrl && (
                  <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
                    Sipariş vererek{' '}
                    <a
                      href={personalization.termsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-gray-500"
                    >
                      Kullanım Koşulları
                    </a>
                    'nı kabul etmiş sayılırsınız.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowSizeErrorModal(false)}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors"
                >
                  Tamam
                </button>
              </div>
            </div>
          )}

          {showPreview && (
            <>
              {/* Backdrop */}
              <div
                className="animate-fadeIn fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
                onClick={() => setShowPreview(false)}
              />

              {/* Sheet — bottom sheet on mobile, centered modal on desktop */}
              <div
                className="animate-slideUp fixed bottom-0 left-0 right-0 z-[101] flex max-h-[88svh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[88vh] md:w-full md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:animate-none md:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag handle — mobile cue */}
                <div className="flex flex-none justify-center pb-1 pt-3 md:hidden">
                  <div className="h-1 w-9 rounded-full bg-gray-200" />
                </div>

                {/* Header */}
                <div className="flex flex-none items-center justify-between px-5 py-3 md:border-b md:border-gray-100 md:px-8 md:py-5">
                  <p className="text-[15px] font-bold text-gray-900 md:text-lg">Önizleme</p>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Ön / Arka tab — mobile only, front_back mode */}
                {surfaceMode !== 'front_only' && (
                  <div className="flex flex-none gap-1.5 px-4 pb-2 pt-1 md:hidden">
                    {(['front', 'back'] as const).map((side) => (
                      <button
                        key={side}
                        onClick={() => setPreviewTab(side)}
                        className={cn(
                          'flex-1 rounded-xl py-2 text-sm font-semibold transition-colors',
                          previewTab === side
                            ? 'bg-gray-900 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                        )}
                      >
                        {side === 'front' ? 'Ön Cephe' : 'Arka Cephe'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Content — scrollable */}
                <div
                  className="min-h-0 flex-1 overflow-y-auto"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  <div className={cn(
                    'p-4 pb-2 md:p-8',
                    surfaceMode !== 'front_only' && 'md:grid md:grid-cols-2 md:gap-8',
                  )}>
                    {/* Front */}
                    <div className={cn(
                      'flex flex-col gap-2',
                      surfaceMode !== 'front_only' && previewTab !== 'front' && 'hidden md:flex',
                    )}>
                      <span className="hidden text-center text-xs font-semibold uppercase tracking-widest text-gray-400 md:block">
                        Ön Cephe
                      </span>
                      <div className="relative aspect-[5/6] overflow-hidden rounded-2xl bg-gray-50">
                        {(previewImages.front || config?.frontImage) && (
                          <img
                            src={previewImages.front || config!.frontImage}
                            className="absolute inset-0 h-full w-full object-cover"
                            alt="Ön tasarım"
                          />
                        )}
                      </div>
                    </div>

                    {/* Back */}
                    {surfaceMode !== 'front_only' && (
                      <div className={cn(
                        'flex flex-col gap-2',
                        previewTab !== 'back' && 'hidden md:flex',
                      )}>
                        <span className="hidden text-center text-xs font-semibold uppercase tracking-widest text-gray-400 md:block">
                          Arka Cephe
                        </span>
                        <div className="relative aspect-[5/6] overflow-hidden rounded-2xl bg-gray-50">
                          {(previewImages.back || config?.backImage) && (
                            <img
                              src={previewImages.back || config!.backImage}
                              className="absolute inset-0 h-full w-full object-cover"
                              alt="Arka tasarım"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex-none p-4 pb-[max(16px,env(safe-area-inset-bottom))] md:p-5">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="w-full rounded-xl bg-gray-900 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800 md:w-auto md:px-8"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="hidden">
          <div className="space-y-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{activeAreaSummary}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{totalLabel}</p>
                  <p className="mt-1 text-lg font-black text-gray-900">{formattedPrice}</p>
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

            {sizes.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {sizes.map((size) => {
                  const qty = sizeQuantities[size!] ?? 0;
                  const variant = baseVariantForSize(size!);
                  const inStock = variant?.available !== false;
                  return (
                    <div
                      key={size!}
                      className={cn(
                        'rounded-2xl border p-2 text-center transition-colors',
                        !inStock ? 'border-gray-100 bg-gray-50 opacity-50' :
                        qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50',
                      )}
                    >
                      <p className={cn(
                        'text-xs font-black',
                        !inStock ? 'text-gray-400 line-through' :
                        qty > 0 ? 'text-blue-700' : 'text-gray-600',
                      )}>
                        {size}
                        {!inStock && <span className="ml-1 text-[9px] font-semibold normal-case no-underline" style={{ textDecoration: 'none' }}>Tükendi</span>}
                      </p>
                      {inStock && (
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
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-gray-500">Adet</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNoSizeQuantity(Math.max(1, noSizeQuantity - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200"
                  >−</button>
                  <span className="w-8 text-center text-sm font-black text-gray-700 tabular-nums">{noSizeQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setNoSizeQuantity(noSizeQuantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200"
                  >+</button>
                </div>
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
              disabled={isCartLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <ShoppingBag className="h-4 w-4" />
              {isCartLoading ? 'Yükleniyor...' : `Sepete Ekle${totalQuantity > 0 ? ` (${totalQuantity})` : ''}`}
            </button>
            {personalization.termsUrl && (
              <p className="mt-2 text-center text-[10px] text-gray-400 leading-relaxed">
                Sipariş vererek{' '}
                <a
                  href={personalization.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-gray-500 hover:text-gray-700"
                >
                  Kullanım Koşulları
                </a>
                'nı kabul etmiş sayılırsınız.
              </p>
            )}
          </div>
        </footer>
        </div>

        {/* RIGHT: Commerce sidebar — right on desktop, below on mobile */}
        <div className="flex w-full flex-none flex-col layout:overflow-y-auto border-t border-gray-100 bg-white layout:w-[300px] layout:min-w-[300px] layout:border-l layout:border-t-0 lg:w-[340px] lg:min-w-[340px] xl:w-[380px] xl:min-w-[380px]">
          {config?.productTitle && (
            <div className="border-b border-gray-100 px-3 py-3">
              <p className="text-xs font-bold leading-snug text-gray-900">{config.productTitle}</p>
            </div>
          )}

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
                  const variant = baseVariantForSize(size!);
                  const inStock = variant?.available !== false;
                  return (
                    <div
                      key={size!}
                      className={cn(
                        'flex flex-col items-center rounded-xl border-2 p-1.5 transition-colors',
                        !inStock ? 'border-gray-100 bg-gray-50 opacity-50' :
                        qty > 0 ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50',
                      )}
                    >
                      <span className={cn(
                        'text-[10px] font-bold',
                        !inStock ? 'text-gray-400 line-through' :
                        qty > 0 ? 'text-blue-700' : 'text-gray-600',
                      )}>{size}</span>
                      {!inStock ? (
                        <span className="text-[8px] text-gray-400">Tükendi</span>
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="border-b border-gray-100 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Adet</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNoSizeQuantity(Math.max(1, noSizeQuantity - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200"
                >−</button>
                <span className="w-8 text-center text-sm font-black text-gray-700 tabular-nums">{noSizeQuantity}</span>
                <button
                  type="button"
                  onClick={() => setNoSizeQuantity(noSizeQuantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200"
                >+</button>
              </div>
            </div>
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
              disabled={isCartLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {isCartLoading ? 'Yükleniyor...' : `Sepete Ekle${totalQuantity > 0 ? ` (${totalQuantity})` : ''}`}
            </button>
            {personalization.termsUrl && (
              <p className="mt-2 text-center text-[9px] text-gray-400 leading-relaxed">
                Sipariş vererek{' '}
                <a
                  href={personalization.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-gray-500 hover:text-gray-700"
                >
                  Kullanım Koşulları
                </a>
                'nı kabul etmiş sayılırsınız.
              </p>
            )}
          </div>

          {/* TASARIM ALANI — below add-to-cart */}
          <div className="border-t border-gray-100 px-3 py-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-gray-900">{activeAreaSummary}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">{totalLabel}</p>
                  <p className="mt-0.5 text-xl font-black text-gray-900">{formattedPrice}</p>
                </div>
              </div>
              <div className="mt-2 space-y-1 rounded-xl bg-white/80 p-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-gray-500">Ürün fiyatı</span>
                  <strong className="font-black text-gray-900">{formatMoney(pricingSummary.baseUnitPrice)}</strong>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-gray-500">Ara toplam</span>
                  <strong className="font-black text-gray-900">{formatMoney(displayBaseSubtotal)}</strong>
                </div>
                {pricingSummary.front.hasContent && (
                  <div className="flex items-start justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-gray-500">
                      Ön baskı ({pricingSummary.front.metrics.objectCount} öğe)
                      {pricingSummary.front.band.label && (
                        <span className="ml-1 text-gray-400">· {pricingSummary.front.band.label}</span>
                      )}
                    </span>
                    <strong className="font-black text-gray-900">{formatMoney(displayFrontSubtotal)}</strong>
                  </div>
                )}
                {pricingSummary.back.hasContent && (
                  <div className="flex items-start justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-gray-500">
                      Arka baskı ({pricingSummary.back.metrics.objectCount} öğe)
                      {pricingSummary.back.band.label && (
                        <span className="ml-1 text-gray-400">· {pricingSummary.back.band.label}</span>
                      )}
                    </span>
                    <strong className="font-black text-gray-900">{formatMoney(displayBackSubtotal)}</strong>
                  </div>
                )}
                {pricingSummary.volumeDiscountPercentage > 0 && pricingSummary.printDiscountSubtotal > 0 && (
                  <div className="flex items-start justify-between gap-1 text-[10px]">
                    <span className="font-semibold text-emerald-600">Toplu alım indirimi (%{pricingSummary.volumeDiscountPercentage})</span>
                    <strong className="font-black text-emerald-700">-{formatMoney(pricingSummary.printDiscountSubtotal)}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
