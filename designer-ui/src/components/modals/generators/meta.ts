import type { GeneratorKind } from './types';

/** Tasarımcıdaki düğme ve kart metinleri, türe göre */
export const GENERATOR_UI: Record<GeneratorKind, {
  titleTr: string; titleEn: string;
  ctaTr: string; ctaEn: string;
  editTr: string; editEn: string;
  hintTr: string; hintEn: string;
}> = {
  song: {
    titleTr: 'Şarkı tasarımın', titleEn: 'Your song design',
    ctaTr: 'Şarkını ekle', ctaEn: 'Add your song',
    editTr: 'Şarkıyı düzenle', editEn: 'Edit song',
    hintTr: 'Şarkını ve fotoğrafını seç; Spotify kodlu tasarım tişörte yerleşsin.', hintEn: 'Pick your song and photo; the Spotify-code design goes on the shirt.',
  },
  monogram: {
    titleTr: 'Monogramın', titleEn: 'Your monogram',
    ctaTr: 'Monogramını oluştur', ctaEn: 'Create your monogram',
    editTr: 'Monogramı düzenle', editEn: 'Edit monogram',
    hintTr: 'Baş harflerini yaz, çerçeve ve yazı tipi seç.', hintEn: 'Type your initials, pick a frame and font.',
  },
  starmap: {
    titleTr: 'Yıldız haritan', titleEn: 'Your star map',
    ctaTr: 'Yıldız haritanı oluştur', ctaEn: 'Create your star map',
    editTr: 'Haritayı düzenle', editEn: 'Edit star map',
    hintTr: 'Tarihi, saati ve şehri seç; o anın gökyüzü çizilsin.', hintEn: 'Pick the date, time and city; that moment\'s sky is drawn.',
  },
  citymap: {
    titleTr: 'Şehir haritan', titleEn: 'Your city map',
    ctaTr: 'Haritanı oluştur', ctaEn: 'Create your map',
    editTr: 'Haritayı düzenle', editEn: 'Edit map',
    hintTr: 'Şehri seç, başlığını yaz; harita poster gibi çizilsin.', hintEn: 'Pick a city and title; the map is drawn poster-style.',
  },
  birthflower: {
    titleTr: 'Doğum çiçeklerin', titleEn: 'Your birth flowers',
    ctaTr: 'Çiçeklerini oluştur', ctaEn: 'Create your flowers',
    editTr: 'Çiçekleri düzenle', editEn: 'Edit flowers',
    hintTr: 'İsimleri ve doğum aylarını yaz; her birinin çiçeği çizilsin.', hintEn: 'Enter names and birth months; each gets their flower.',
  },
  calendar: {
    titleTr: 'Takvimin', titleEn: 'Your calendar',
    ctaTr: 'Takvimini oluştur', ctaEn: 'Create your calendar',
    editTr: 'Takvimi düzenle', editEn: 'Edit calendar',
    hintTr: 'Özel günü seç; o ayın takvimi günü işaretli çizilsin.', hintEn: 'Pick your special day; that month is drawn with the day marked.',
  },
  wordsearch: {
    titleTr: 'Kelime avın', titleEn: 'Your word search',
    ctaTr: 'Bulmacanı oluştur', ctaEn: 'Create your puzzle',
    editTr: 'Bulmacayı düzenle', editEn: 'Edit puzzle',
    hintTr: 'Kelimelerini yaz; harf tablosuna gizlensin.', hintEn: 'Enter your words; they get hidden in a letter grid.',
  },
  moonphase: {
    titleTr: 'Ay evren', titleEn: 'Your moon phase',
    ctaTr: 'Ay tasarımını oluştur', ctaEn: 'Create your moon design',
    editTr: 'Tasarımı düzenle', editEn: 'Edit design',
    hintTr: 'Tarihi seç; o gecenin ayı çizilsin.', hintEn: 'Pick the date; that night\'s moon is drawn.',
  },
  qrcode: {
    titleTr: 'QR kodun', titleEn: 'Your QR code',
    ctaTr: 'QR kodunu oluştur', ctaEn: 'Create your QR code',
    editTr: 'QR kodu düzenle', editEn: 'Edit QR code',
    hintTr: 'Bağlantını ya da mesajını yaz; okutulabilir QR kod çizilsin.', hintEn: 'Enter your link or message; a scannable QR code is drawn.',
  },
};
