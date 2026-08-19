import { fabric } from 'fabric';
import type { PrintAreaConfig, SizeChart } from '@/types';

export interface AreaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Yerleşim alanının FİZİKSEL ölçüsünü seçilen bedene göre ayarlar.
 *
 * Mavi kutu mockup üzerinde sabit kalır: gövdenin kullanılabilir yüzeyini
 * temsil eder ve mockup her bedende aynı büyüklükte görünür. Değişen, o
 * kutunun kaç santime denk geldiğidir — 2XL gövdesi S'den geniş olduğu için
 * aynı kutu daha çok santim demektir.
 *
 * Maksimum tasarım ölçüsü (realWidthMm) dokunulmadan geçer; o baskı makinesinin
 * sınırı, bedene bağlı değil. Sonuç olarak aynı 28 cm'lik baskı, 2XL'de
 * gövdenin daha küçük bir oranını kaplar ve tasarımcıda da öyle görünür.
 *
 * Önceki sürüm bunun tersini yapıyordu: kutuyu büyük bedende küçültüyor, mm'yi
 * sabit tutuyordu. Bu, "yerleşim alanı" kavramını bozuyordu — mağaza sahibi
 * gövdenin tamamını kapsayacak şekilde çizdiği kutunun 2XL'de içeri
 * kaçtığını görüyordu.
 *
 * Girilen mm değeri REFERANS bedene aittir; diğer bedenler gövde eni oranıyla
 * türetilir. Böylece mağaza sahibinin kalibrasyonu korunur — kutunun gövdenin
 * tamamını kaplaması gerekmez.
 */
export function scaleAreaForSize(
  area: PrintAreaConfig,
  chart: SizeChart | undefined | null,
  size: string | null | undefined,
): PrintAreaConfig {
  if (!chart || !size || !Array.isArray(chart.entries) || chart.entries.length === 0) return area;

  const reference = chart.entries.find((entry) => entry.size === chart.referenceSize) ?? chart.entries[0];
  const target = chart.entries.find((entry) => entry.size === size);
  if (!reference || !target) return area;
  if (!(reference.widthCm > 0) || !(target.widthCm > 0)) return area;

  const widthRatio = target.widthCm / reference.widthCm;
  const heightRatio = reference.heightCm > 0 && target.heightCm > 0
    ? target.heightCm / reference.heightCm
    : widthRatio;
  if (widthRatio === 1 && heightRatio === 1) return area;

  const placementWidthMm = (area.placementWidthMm || area.realWidthMm) * widthRatio;
  const placementHeightMm = (area.placementHeightMm || area.realHeightMm) * heightRatio;

  return {
    ...area,
    placementWidthMm,
    placementHeightMm,
    // Baskı makinesinin sınırı bedene bağlı değil; yerleşim alanını aşamaz.
    realWidthMm: Math.min(area.realWidthMm, placementWidthMm),
    realHeightMm: Math.min(area.realHeightMm, placementHeightMm),
  };
}

/**
 * Beden değiştiğinde tasarımı eski baskı alanından yenisine taşır.
 *
 * Objelerin alan içindeki göreli konumu korunur. Boyut ölçeği dışarıdan
 * verilebilir: beden değişiminde kutu sabit kaldığı için piksel oranı 1'dir,
 * ama tasarımın fiziksel cm ölçüsünün sabit kalması için nesneler yerleşim
 * alanının mm oranıyla ters yönde ölçeklenmelidir.
 */
export function remapObjectsBetweenAreas(
  canvas: fabric.Canvas,
  from: AreaRect,
  to: AreaRect,
  objectScale?: number,
): boolean {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return false;
  const ratio = objectScale ?? (to.width / from.width);
  const objects = canvas.getObjects();
  if (objects.length === 0) return false;
  if (Math.abs(ratio - 1) < 0.0001 && Math.abs(to.left - from.left) < 0.01 && Math.abs(to.top - from.top) < 0.01) {
    return false;
  }

  for (const obj of objects) {
    const center = obj.getCenterPoint();
    const relX = (center.x - from.left) / from.width;
    const relY = (center.y - from.top) / from.height;

    obj.set({
      scaleX: (obj.scaleX ?? 1) * ratio,
      scaleY: (obj.scaleY ?? 1) * ratio,
    });
    obj.setPositionByOrigin(
      new fabric.Point(to.left + relX * to.width, to.top + relY * to.height),
      'center',
      'center',
    );
    obj.setCoords();
  }

  canvas.requestRenderAll();
  return true;
}
