import { fabric } from 'fabric';
import type { FilterPreset } from '@/types';

export function applyFilterPreset(img: fabric.Image, preset: FilterPreset) {
  img.filters = [];

  if (preset === 'grayscale') {
    img.filters.push(new fabric.Image.filters.Grayscale());
  } else if (preset === 'sepia') {
    img.filters.push(new fabric.Image.filters.Sepia());
  } else if (preset === 'invert') {
    img.filters.push(new fabric.Image.filters.Invert());
  } else if (preset === 'vintage') {
    img.filters.push(new fabric.Image.filters.Sepia());
    img.filters.push(new fabric.Image.filters.Brightness({ brightness: -0.1 }));
    img.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.1 }));
    img.filters.push(new fabric.Image.filters.Saturation({ saturation: -0.3 }));
  } else if (preset === 'kodachrome') {
    img.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.15 }));
    img.filters.push(new fabric.Image.filters.Saturation({ saturation: 0.4 }));
    img.filters.push(new fabric.Image.filters.Brightness({ brightness: 0.05 }));
  } else if (preset === 'technicolor') {
    img.filters.push(new fabric.Image.filters.Saturation({ saturation: 0.8 }));
    img.filters.push(new fabric.Image.filters.Contrast({ contrast: 0.2 }));
  } else if (preset === 'polaroid') {
    img.filters.push(new fabric.Image.filters.Saturation({ saturation: -0.2 }));
    img.filters.push(new fabric.Image.filters.Brightness({ brightness: 0.1 }));
    img.filters.push(new fabric.Image.filters.Contrast({ contrast: -0.1 }));
  }

  img.applyFilters();
}

export function applyAdjustments(
  img: fabric.Image,
  brightness: number,
  contrast: number,
  saturation: number,
) {
  const keep = img.filters?.filter(
    (f) =>
      !(f instanceof fabric.Image.filters.Brightness) &&
      !(f instanceof fabric.Image.filters.Contrast) &&
      !(f instanceof fabric.Image.filters.Saturation),
  ) ?? [];

  keep.push(new fabric.Image.filters.Brightness({ brightness: brightness / 100 }));
  keep.push(new fabric.Image.filters.Contrast({ contrast: contrast / 100 }));
  keep.push(new fabric.Image.filters.Saturation({ saturation: saturation / 100 }));

  img.filters = keep;
  img.applyFilters();
}
