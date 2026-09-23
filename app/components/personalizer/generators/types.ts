/**
 * Üretici ayar bileşenlerinin ortak sözleşmesi. Bileşen yalnızca ayarı
 * düzenler; kaydetme formuna katılım, önizleme ve gizli alan
 * `GeneratorSettings` sarmalayıcısında.
 */
export interface GeneratorSettingsProps<C> {
  value: C;
  onChange: (next: C) => void;
}
