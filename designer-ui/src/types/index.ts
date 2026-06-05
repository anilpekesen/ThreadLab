export type Side = 'front' | 'back';
export type LeftTab = 'image' | 'text' | 'templates' | 'saved';
export type SurfaceMode = 'front_back' | 'front_only';

export interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: string;
  available: boolean;
  featured_image?: { src: string } | null;
}

export interface DesignerConfig {
  productId: string;
  productHandle: string;
  productTitle: string;
  frontImage: string;
  backImage: string;
  shirtColor: string;
  variants: ShopifyVariant[];
  selectedVariant?: ShopifyVariant | null;
  optionNames: string[];
  currency: string;
  locale: string;
  uploadEndpoint: string;
  shop: string;
  singleVariantId: string;
  doubleVariantId: string;
  singlePrice: number;
  doublePrice: number;
}

export interface PricingBand {
  key: string;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxAreaCm2: number | null;
  label: string;
  surcharge: number;
}

export interface VolumeDiscountTier {
  key: string;
  minQuantity: number;
  percentage: number;
}

export interface PrintAreaConfig {
  side: Side;
  mockupX: number;
  mockupY: number;
  mockupWidth: number;
  mockupHeight: number;
  mockupImageUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  realWidthMm: number;
  realHeightMm: number;
}

export interface PersonalizationConfig {
  surfaceMode: SurfaceMode;
  printAreas: Record<Side, PrintAreaConfig>;
  pricingBands: Record<Side, PricingBand[]>;
  volumeDiscounts: VolumeDiscountTier[];
  surchargeVariantId: string;
  removeBgAvailable: boolean;
  variantMockups?: Record<string, { front?: string; back?: string }>;
  termsUrl?: string;
  minOrderQuantity?: number;
}

export interface UploadedImage {
  id: string;
  dataUrl: string;
  serverUrl?: string;
  name: string;
  addedAt: number;
}

export interface ShopTemplate {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
}

export interface SavedDesign {
  id: string;
  name: string;
  thumbnail: string;
  frontJson: string;
  backJson: string;
  createdAt: number;
}

export const GOOGLE_FONTS = [
  'Montserrat', 'Bebas Neue', 'Space Grotesk', 'Shrikhand', 'Oswald',
  'Graduate', 'Alfa Slab One', 'Playfair Display', 'Cinzel Decorative',
  'Pacifico', 'Permanent Marker',
  'Anton', 'Dancing Script', 'Lobster', 'Nunito', 'Open Sans',
  'Poppins', 'Press Start 2P', 'Raleway', 'Righteous', 'Rock Salt',
  'Roboto Condensed', 'Russo One', 'Satisfy', 'Special Elite', 'Teko',
  'Ubuntu', 'Arial', 'Georgia', 'Impact',
];

export const FILTER_PRESETS = [
  { id: 'original', label: 'Orijinal' },
  { id: 'grayscale', label: 'Gri' },
  { id: 'sepia', label: 'Sepya' },
  { id: 'invert', label: 'Ters' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'kodachrome', label: 'Kodachrome' },
  { id: 'technicolor', label: 'Technicolor' },
  { id: 'polaroid', label: 'Polaroid' },
] as const;

export type FilterPreset = typeof FILTER_PRESETS[number]['id'];
