import { fabric } from 'fabric';
import type { PrintAreaConfig, SizeChart } from '@/types';

export interface AreaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Baskı alanını seçilen bedene göre yeniden boyutlandırır.
 *
 * Mockup görseli sabit kalır (tişört her zaman aynı büyüklükte görünür), baskı
 * alanı ölçeklenir. Referans beden, mağaza sahibinin editörde çizdiği kutuya
 * karşılık gelir; daha büyük bedende aynı fiziksel baskı gövdenin daha küçük
 * bir oranını kaplayacağı için kutu küçülür.
 *
 * Ölçek izotropiktir (genişlik bazlı) — tasarımın en/boy oranı bozulmasın diye.
 * Gövde boyu yalnızca dikey konumu (yaka altı offseti) oranlamakta kullanılır.
 *
 * realWidthMm/realHeightMm dokunulmadan geçer: baskının fiziksel ölçüsü,
 * üretim dosyası ve fiyat bandı hesabı bedene göre değişmez.
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

  const scale = reference.widthCm / target.widthCm;
  const offsetScale = reference.heightCm > 0 && target.heightCm > 0
    ? reference.heightCm / target.heightCm
    : scale;
  if (scale === 1 && offsetScale === 1) return area;

  const width = Math.max(1, area.width * scale);
  const height = Math.max(1, area.height * scale);
  const centerX = area.x + area.width / 2;
  const left = centerX - width / 2;
  const top = area.mockupY + (area.y - area.mockupY) * offsetScale;

  // Mockup gövdesinin dışına taşmasın
  const maxTop = area.mockupY + Math.max(0, area.mockupHeight - height);

  return {
    ...area,
    x: left,
    y: Math.min(Math.max(top, area.mockupY), maxTop),
    width,
    height,
  };
}

/**
 * Beden değiştiğinde tasarımı eski baskı alanından yenisine taşır.
 *
 * Objelerin alan içindeki göreli konumu ve boyutu korunur — yani tasarımın
 * fiziksel cm ölçüsü ve fiyat bandı değişmez, sadece ekrandaki büyüklüğü
 * tişörtün bedenine uyar.
 */
export function remapObjectsBetweenAreas(
  canvas: fabric.Canvas,
  from: AreaRect,
  to: AreaRect,
): boolean {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return false;
  const ratio = to.width / from.width;
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
