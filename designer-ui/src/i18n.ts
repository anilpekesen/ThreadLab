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
  btnPreview: 'Önizleme',
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
  previewTitle: 'Önizleme',

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

// Designer UI her zaman Türkçe kalır
export const en: { [K in keyof typeof tr]: string } = { ...tr };

export type I18nKey = keyof typeof tr;

type I18nDict = { [K in I18nKey]: string };

export function useDesignerI18n(locale: string | undefined): { t: I18nDict; isTurkish: boolean } {
  const isTurkish = !locale || locale.startsWith('tr');
  const t: I18nDict = isTurkish ? (tr as I18nDict) : en;
  return { t, isTurkish };
}
