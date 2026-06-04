export const tr = {
  // Tabs
  tabImage: 'Görsel',
  tabText: 'Metin',
  tabLayers: 'Katmanlar',
  tabTemplates: 'Şablonlar',
  tabSaved: 'Kayıtlı Tasarımlar',

  // Toolbar / object actions
  toolbarCenter: 'Ortala',
  toolbarCopy: 'Kopyala',
  toolbarLayer: 'Katman',
  toolbarFront: 'Öne',
  toolbarBack: 'Arkaya',
  toolbarBgRemove: 'BG Sil',
  toolbarRemove: 'Kaldır',
  toolbarCrop: 'Kırp',

  // Buttons
  btnAddToCart: 'Sepete Ekle',
  btnAddToCartLoading: 'Yükleniyor...',
  btnPreview: 'Mankende Gör',
  btnSave: 'Kaydet',
  btnSaved: 'Kayıtlar',
  btnTemplates: 'Şablonlar',
  btnClose: 'Kapat',
  btnApply: 'Uygula',
  btnCancel: 'İptal',
  btnOk: 'Tamam',
  btnUndo: 'Geri al',
  btnRedo: 'İleri al',

  // Image panel
  uploadImage: 'Görsel Yükle',
  uploadAi: 'Yapay Zeka',
  uploadQr: 'QR Kod',
  imageRemoveBg: 'Arka Planı Kaldır',
  imageRemoving: 'Kaldırılıyor...',
  imageCrop: 'Kırp',

  // Text panel
  textAdd: 'Yazı Ekle',
  textEdit: 'Yazıyı Düzenle',
  textPlaceholder: 'Yazınızı girin...',

  // Canvas / design area
  printAreaLabel: 'baskı alanı',
  frontSurface: 'Ön Cephe',
  backSurface: 'Arka Cephe',
  surfaceOn: 'Ön',
  surfaceBack: 'Arka',

  // Interaction modes
  modeSelection: 'Seçim',
  modeBulk: 'Toplu S.',
  modeNavigation: 'Gezinme',

  // Pricing
  totalLabel: 'Toplam',
  productPrice: 'Ürün fiyatı',
  subtotal: 'Ara toplam',
  frontPrint: 'Ön baskı',
  backPrint: 'Arka baskı',
  bulkDiscount: 'Toplu alım indirimi',

  // Color / size
  colorLabel: 'Renk',
  sizeLabel: 'Beden',
  quantityLabel: 'Adet',
  outOfStock: 'Tükendi',

  // Preview modal
  previewTitle: 'Mankende Görünüm',

  // Crop modal
  cropTitle: 'Görseli Kırp',
  cropApply: 'Kırp',
  cropCancel: 'İptal',

  // Layers
  layerImage: 'Görsel Katmanı',
  layerText: 'Metin:',

  // Errors / toasts
  errorCrop: 'Görsel kırpılamadı',
  errorBgRemove: 'Arka plan kaldırma başarısız',
  errorBgSelected: 'Seçili görselin arka planı kaldırılamadı',
  errorCart: 'Sepete ekleme hatası:',
  errorNoVariant: 'Bu ürün için varyant bulunamadı. Shopify ürün ayarlarını kontrol edin.',
  errorNoSize: 'Lütfen en az bir beden için adet seçin.',
  uploadedLabel: 'Yüklendi',
  croppedLabel: 'Kırpılmış',
  cleanedLabel: 'Temizlenmiş',

  // Min order quantity notice
  minOrderNotice: 'Bu üründen en az',
  minOrderNoticeSuffix: 'adet sipariş vermeniz gerekmektedir.',

  // Size error modal
  sizeErrorTitle: 'Beden seçilmedi',
  sizeErrorDesc: 'Lütfen en az bir beden için adet seçin.',

  // Saved designs
  savedNoDesigns: 'Henüz kayıtlı tasarım yok.',
  savedApply: 'Uygula',

  // Templates
  templatesNone: 'Bu kategoride şablon bulunamadı.',
  templatesAll: 'Tümü',

  // AI generation
  aiGenerate: 'Oluştur',
  aiGenerating: 'Oluşturuluyor...',
  aiPlaceholder: 'Bir görsel tanımlayın...',
  aiStyleLabel: 'Stil',

  // Terms
  termsPrefix: 'Sipariş vererek',
  termsMid: 'Kullanım Koşulları',
  termsSuffix: "'nı kabul etmiş sayılırsınız.",
} as const;

export const en: { [K in keyof typeof tr]: string } = {
  tabImage: 'Images',
  tabText: 'Text',
  tabLayers: 'Layers',
  tabTemplates: 'Templates',
  tabSaved: 'Saved Designs',

  toolbarCenter: 'Center',
  toolbarCopy: 'Copy',
  toolbarLayer: 'Layer',
  toolbarFront: 'Forward',
  toolbarBack: 'Backward',
  toolbarBgRemove: 'Remove BG',
  toolbarRemove: 'Delete',
  toolbarCrop: 'Crop',

  btnAddToCart: 'Add to Cart',
  btnAddToCartLoading: 'Loading...',
  btnPreview: 'View on Model',
  btnSave: 'Save',
  btnSaved: 'Saved',
  btnTemplates: 'Templates',
  btnClose: 'Close',
  btnApply: 'Apply',
  btnCancel: 'Cancel',
  btnOk: 'OK',
  btnUndo: 'Undo',
  btnRedo: 'Redo',

  uploadImage: 'Upload Image',
  uploadAi: 'AI Generate',
  uploadQr: 'QR Code',
  imageRemoveBg: 'Remove Background',
  imageRemoving: 'Removing...',
  imageCrop: 'Crop',

  textAdd: 'Add Text',
  textEdit: 'Edit Text',
  textPlaceholder: 'Enter your text...',

  printAreaLabel: 'print area',
  frontSurface: 'Front',
  backSurface: 'Back',
  surfaceOn: 'Front',
  surfaceBack: 'Back',

  modeSelection: 'Select',
  modeBulk: 'Multi',
  modeNavigation: 'Pan',

  totalLabel: 'Total',
  productPrice: 'Product price',
  subtotal: 'Subtotal',
  frontPrint: 'Front print',
  backPrint: 'Back print',
  bulkDiscount: 'Bulk discount',

  colorLabel: 'Color',
  sizeLabel: 'Size',
  quantityLabel: 'Quantity',
  outOfStock: 'Out of stock',

  previewTitle: 'View on Model',

  cropTitle: 'Crop Image',
  cropApply: 'Crop',
  cropCancel: 'Cancel',

  layerImage: 'Image Layer',
  layerText: 'Text:',

  errorCrop: 'Could not crop image',
  errorBgRemove: 'Background removal failed',
  errorBgSelected: 'Could not remove background from selected image',
  errorCart: 'Add to cart error:',
  errorNoVariant: 'No variant found for this product. Check your Shopify product settings.',
  errorNoSize: 'Please select a quantity for at least one size.',
  uploadedLabel: 'Uploaded',
  croppedLabel: 'Cropped',
  cleanedLabel: 'Cleaned',

  minOrderNotice: 'A minimum of',
  minOrderNoticeSuffix: 'items is required for this product.',

  sizeErrorTitle: 'No size selected',
  sizeErrorDesc: 'Please select a quantity for at least one size.',

  savedNoDesigns: 'No saved designs yet.',
  savedApply: 'Apply',

  templatesNone: 'No templates found in this category.',
  templatesAll: 'All',

  aiGenerate: 'Generate',
  aiGenerating: 'Generating...',
  aiPlaceholder: 'Describe an image...',
  aiStyleLabel: 'Style',

  termsPrefix: 'By placing an order you agree to our',
  termsMid: 'Terms of Service',
  termsSuffix: '.',
};

export type I18nKey = keyof typeof tr;

type I18nDict = { [K in I18nKey]: string };

export function useDesignerI18n(locale: string | undefined): { t: I18nDict; isTurkish: boolean } {
  const isTurkish = !locale || locale.startsWith('tr');
  const t: I18nDict = isTurkish ? (tr as I18nDict) : en;
  return { t, isTurkish };
}
